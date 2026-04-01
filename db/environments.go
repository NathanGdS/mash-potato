package db

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"mash-potato/encryption"
)

// EnvironmentVariable mirrors a row from the environment_variables table.
// Broken is a transient flag set when the stored value carries an "enc:" prefix
// but decryption fails (wrong key or tampered data). It is never persisted.
type EnvironmentVariable struct {
	ID            int64  `json:"id"`
	EnvironmentID string `json:"environment_id"`
	Key           string `json:"key"`
	Value         string `json:"value"`
	IsSecret      bool   `json:"is_secret"`
	Broken        bool   `json:"broken,omitempty"`
}

// Environment mirrors the environments table row.
type Environment struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	IsGlobal  bool      `json:"is_global"`
	CreatedAt time.Time `json:"created_at"`
}

// InsertEnvironment persists a new (non-global) environment row and returns it.
func InsertEnvironment(id, name string) (Environment, error) {
	now := time.Now().UTC()
	_, err := DB.Exec(
		`INSERT INTO environments (id, name, is_global, created_at) VALUES (?, ?, 0, ?)`,
		id, name, now.Format(time.RFC3339),
	)
	if err != nil {
		return Environment{}, fmt.Errorf("InsertEnvironment: %w", err)
	}
	return Environment{ID: id, Name: name, IsGlobal: false, CreatedAt: now}, nil
}

// UpdateEnvironment updates the name of an existing environment by ID.
func UpdateEnvironment(id, name string) error {
	res, err := DB.Exec(`UPDATE environments SET name = ? WHERE id = ?`, name, id)
	if err != nil {
		return fmt.Errorf("UpdateEnvironment: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("UpdateEnvironment rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("UpdateEnvironment: no environment with id %q", id)
	}
	return nil
}

// DeleteEnvironment removes an environment by ID. Returns an error if the
// environment is the built-in global environment (is_global = 1).
func DeleteEnvironment(id string) error {
	var isGlobal int
	if err := DB.QueryRow(`SELECT is_global FROM environments WHERE id = ?`, id).Scan(&isGlobal); err != nil {
		return fmt.Errorf("DeleteEnvironment: lookup: %w", err)
	}
	if isGlobal == 1 {
		return fmt.Errorf("DeleteEnvironment: cannot delete the built-in Global environment")
	}
	res, err := DB.Exec(`DELETE FROM environments WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("DeleteEnvironment: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("DeleteEnvironment rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("DeleteEnvironment: no environment with id %q", id)
	}
	return nil
}

// ListEnvironments returns all environments ordered by creation time.
// The built-in Global environment (is_global=1) is always returned first.
func ListEnvironments() ([]Environment, error) {
	rows, err := DB.Query(`SELECT id, name, is_global, created_at FROM environments ORDER BY is_global DESC, created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("ListEnvironments: %w", err)
	}
	defer rows.Close()

	var envs []Environment
	for rows.Next() {
		var e Environment
		var createdAtStr string
		var isGlobal int
		if err := rows.Scan(&e.ID, &e.Name, &isGlobal, &createdAtStr); err != nil {
			return nil, fmt.Errorf("ListEnvironments scan: %w", err)
		}
		e.IsGlobal = isGlobal == 1
		e.CreatedAt, err = time.Parse(time.RFC3339, createdAtStr)
		if err != nil {
			e.CreatedAt = time.Time{}
		}
		envs = append(envs, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ListEnvironments rows: %w", err)
	}
	return envs, nil
}

// GetGlobalEnvironmentID returns the id of the built-in global environment.
func GetGlobalEnvironmentID() (string, error) {
	var id string
	err := DB.QueryRow(`SELECT id FROM environments WHERE is_global = 1 LIMIT 1`).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("GetGlobalEnvironmentID: %w", err)
	}
	return id, nil
}

// SetVariable upserts a key-value variable for the given environment.
// If a variable with the same environment_id and key already exists it is updated;
// otherwise a new row is inserted. Returns the resulting EnvironmentVariable.
func SetVariable(environmentID, key, value string, isSecret bool) (EnvironmentVariable, error) {
	// Check if a variable with this key already exists for this environment.
	var id int64
	err := DB.QueryRow(
		`SELECT id FROM environment_variables WHERE environment_id = ? AND key = ?`,
		environmentID, key,
	).Scan(&id)

	if err == nil {
		// Row exists — update it.
		_, execErr := DB.Exec(
			`UPDATE environment_variables SET value = ?, is_secret = ? WHERE id = ?`,
			value, isSecret, id,
		)
		if execErr != nil {
			return EnvironmentVariable{}, fmt.Errorf("SetVariable update: %w", execErr)
		}
		return EnvironmentVariable{ID: id, EnvironmentID: environmentID, Key: key, Value: value, IsSecret: isSecret}, nil
	}

	// Row does not exist — insert it.
	res, execErr := DB.Exec(
		`INSERT INTO environment_variables (environment_id, key, value, is_secret) VALUES (?, ?, ?, ?)`,
		environmentID, key, value, isSecret,
	)
	if execErr != nil {
		return EnvironmentVariable{}, fmt.Errorf("SetVariable insert: %w", execErr)
	}
	newID, _ := res.LastInsertId()
	return EnvironmentVariable{ID: newID, EnvironmentID: environmentID, Key: key, Value: value, IsSecret: isSecret}, nil
}

// GetVariables returns all variables for the given environment ordered by id
// (insertion order). key is the AES-256 encryption key used to transparently
// decrypt any value that was stored with the "enc:" prefix. Pass nil to skip
// decryption (values will be returned as stored, with Broken=false). When
// decryption fails with ErrDecryptionFailed, the variable's Value is set to ""
// and Broken is set to true so callers can surface the error to the user.
func GetVariables(environmentID string, key []byte) ([]EnvironmentVariable, error) {
	rows, err := DB.Query(
		`SELECT id, environment_id, key, value, is_secret FROM environment_variables WHERE environment_id = ? ORDER BY id ASC`,
		environmentID,
	)
	if err != nil {
		return nil, fmt.Errorf("GetVariables: %w", err)
	}
	defer rows.Close()

	var vars []EnvironmentVariable
	for rows.Next() {
		var v EnvironmentVariable
		var isSecret int
		if err := rows.Scan(&v.ID, &v.EnvironmentID, &v.Key, &v.Value, &isSecret); err != nil {
			return nil, fmt.Errorf("GetVariables scan: %w", err)
		}
		v.IsSecret = isSecret == 1

		// Transparently decrypt enc:-prefixed values when a key is available.
		if key != nil && strings.HasPrefix(v.Value, "enc:") {
			plain, decErr := encryption.DecryptValue(v.Value, key)
			if decErr != nil {
				if errors.Is(decErr, encryption.ErrDecryptionFailed) {
					v.Value = ""
					v.Broken = true
				} else {
					return nil, fmt.Errorf("decrypt variable %q: %w", v.Key, decErr)
				}
			} else {
				v.Value = plain
			}
		}

		vars = append(vars, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("GetVariables rows: %w", err)
	}
	return vars, nil
}

// GetVariableByKey fetches the single variable row identified by (envId, varKey)
// without applying any decryption. Returns an error wrapping sql.ErrNoRows when
// no matching row exists. The caller is responsible for decrypting enc:-prefixed
// values if needed.
func GetVariableByKey(envId string, varKey string) (EnvironmentVariable, error) {
	var v EnvironmentVariable
	var isSecret int
	err := DB.QueryRow(
		`SELECT id, environment_id, key, value, is_secret FROM environment_variables WHERE environment_id = ? AND key = ? LIMIT 1`,
		envId, varKey,
	).Scan(&v.ID, &v.EnvironmentID, &v.Key, &v.Value, &isSecret)
	if err != nil {
		return EnvironmentVariable{}, fmt.Errorf("GetVariableByKey: variable %q not found in environment %q: %w", varKey, envId, err)
	}
	v.IsSecret = isSecret == 1
	return v, nil
}

// GetVariableRaw fetches a single environment_variables row by id without
// applying any decryption. The Value field will contain the raw stored bytes,
// including any "enc:" prefix. Use this when the caller needs to inspect or
// re-encrypt the stored ciphertext directly.
func GetVariableRaw(id int64) (EnvironmentVariable, error) {
	var v EnvironmentVariable
	var isSecret int
	err := DB.QueryRow(
		`SELECT id, environment_id, key, value, is_secret FROM environment_variables WHERE id = ?`,
		id,
	).Scan(&v.ID, &v.EnvironmentID, &v.Key, &v.Value, &isSecret)
	if err != nil {
		return EnvironmentVariable{}, fmt.Errorf("GetVariableRaw: %w", err)
	}
	v.IsSecret = isSecret == 1
	return v, nil
}

// ListAllVariablesRaw returns every row in environment_variables without
// decryption. Used exclusively by RotateVarEncryptionKey to iterate and
// re-encrypt all "enc:"-prefixed values within a single transaction.
func ListAllVariablesRaw() ([]EnvironmentVariable, error) {
	rows, err := DB.Query(
		`SELECT id, environment_id, key, value, is_secret FROM environment_variables ORDER BY id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("ListAllVariablesRaw: %w", err)
	}
	defer rows.Close()

	var vars []EnvironmentVariable
	for rows.Next() {
		var v EnvironmentVariable
		var isSecret int
		if err := rows.Scan(&v.ID, &v.EnvironmentID, &v.Key, &v.Value, &isSecret); err != nil {
			return nil, fmt.Errorf("ListAllVariablesRaw scan: %w", err)
		}
		v.IsSecret = isSecret == 1
		vars = append(vars, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ListAllVariablesRaw rows: %w", err)
	}
	return vars, nil
}

// UpdateVariableRaw overwrites the value and is_secret columns for a variable
// by id. The caller is responsible for passing a correctly formatted value
// (e.g., an "enc:"-prefixed ciphertext when isSecret is true).
func UpdateVariableRaw(id int64, value string, isSecret bool) error {
	res, err := DB.Exec(
		`UPDATE environment_variables SET value = ?, is_secret = ? WHERE id = ?`,
		value, isSecret, id,
	)
	if err != nil {
		return fmt.Errorf("UpdateVariableRaw: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("UpdateVariableRaw rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("UpdateVariableRaw: no variable with id %d", id)
	}
	return nil
}

// EncryptedVariableUpdate carries the id and new ciphertext for a single row
// that must be updated during a key-rotation transaction.
type EncryptedVariableUpdate struct {
	ID    int64
	Value string
}

// RotateEncryptedVariables updates the value column for every entry in updates
// inside a single database transaction. If any update fails the whole
// transaction is rolled back, leaving the database unchanged.
func RotateEncryptedVariables(updates []EncryptedVariableUpdate) error {
	tx, err := DB.Begin()
	if err != nil {
		return fmt.Errorf("RotateEncryptedVariables: begin tx: %w", err)
	}
	defer func() {
		// Rollback is a no-op after a successful Commit.
		_ = tx.Rollback()
	}()

	stmt, err := tx.Prepare(`UPDATE environment_variables SET value = ? WHERE id = ?`)
	if err != nil {
		return fmt.Errorf("RotateEncryptedVariables: prepare: %w", err)
	}
	defer stmt.Close()

	for _, u := range updates {
		if _, execErr := stmt.Exec(u.Value, u.ID); execErr != nil {
			return fmt.Errorf("RotateEncryptedVariables: update id=%d: %w", u.ID, execErr)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("RotateEncryptedVariables: commit: %w", err)
	}
	return nil
}

// DeleteVariable removes a variable row by its id.
func DeleteVariable(id int64) error {
	res, err := DB.Exec(`DELETE FROM environment_variables WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("DeleteVariable: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("DeleteVariable rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("DeleteVariable: no variable with id %d", id)
	}
	return nil
}
