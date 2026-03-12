package db

import (
	"fmt"
	"time"
)

// EnvironmentVariable mirrors a row from the environment_variables table.
type EnvironmentVariable struct {
	ID            int64  `json:"id"`
	EnvironmentID string `json:"environment_id"`
	Key           string `json:"key"`
	Value         string `json:"value"`
}

// Environment mirrors the environments table row.
type Environment struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// InsertEnvironment persists a new environment row and returns it.
func InsertEnvironment(id, name string) (Environment, error) {
	now := time.Now().UTC()
	_, err := DB.Exec(
		`INSERT INTO environments (id, name, created_at) VALUES (?, ?, ?)`,
		id, name, now.Format(time.RFC3339),
	)
	if err != nil {
		return Environment{}, fmt.Errorf("InsertEnvironment: %w", err)
	}
	return Environment{ID: id, Name: name, CreatedAt: now}, nil
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

// DeleteEnvironment removes an environment by ID.
func DeleteEnvironment(id string) error {
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
func ListEnvironments() ([]Environment, error) {
	rows, err := DB.Query(`SELECT id, name, created_at FROM environments ORDER BY created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("ListEnvironments: %w", err)
	}
	defer rows.Close()

	var envs []Environment
	for rows.Next() {
		var e Environment
		var createdAtStr string
		if err := rows.Scan(&e.ID, &e.Name, &createdAtStr); err != nil {
			return nil, fmt.Errorf("ListEnvironments scan: %w", err)
		}
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

// SetVariable upserts a key-value variable for the given environment.
// If a variable with the same environment_id and key already exists it is updated;
// otherwise a new row is inserted. Returns the resulting EnvironmentVariable.
func SetVariable(environmentID, key, value string) (EnvironmentVariable, error) {
	// Check if a variable with this key already exists for this environment.
	var id int64
	err := DB.QueryRow(
		`SELECT id FROM environment_variables WHERE environment_id = ? AND key = ?`,
		environmentID, key,
	).Scan(&id)

	if err == nil {
		// Row exists — update it.
		_, execErr := DB.Exec(
			`UPDATE environment_variables SET value = ? WHERE id = ?`,
			value, id,
		)
		if execErr != nil {
			return EnvironmentVariable{}, fmt.Errorf("SetVariable update: %w", execErr)
		}
		return EnvironmentVariable{ID: id, EnvironmentID: environmentID, Key: key, Value: value}, nil
	}

	// Row does not exist — insert it.
	res, execErr := DB.Exec(
		`INSERT INTO environment_variables (environment_id, key, value) VALUES (?, ?, ?)`,
		environmentID, key, value,
	)
	if execErr != nil {
		return EnvironmentVariable{}, fmt.Errorf("SetVariable insert: %w", execErr)
	}
	newID, _ := res.LastInsertId()
	return EnvironmentVariable{ID: newID, EnvironmentID: environmentID, Key: key, Value: value}, nil
}

// GetVariables returns all variables for the given environment ordered by id (insertion order).
func GetVariables(environmentID string) ([]EnvironmentVariable, error) {
	rows, err := DB.Query(
		`SELECT id, environment_id, key, value FROM environment_variables WHERE environment_id = ? ORDER BY id ASC`,
		environmentID,
	)
	if err != nil {
		return nil, fmt.Errorf("GetVariables: %w", err)
	}
	defer rows.Close()

	var vars []EnvironmentVariable
	for rows.Next() {
		var v EnvironmentVariable
		if err := rows.Scan(&v.ID, &v.EnvironmentID, &v.Key, &v.Value); err != nil {
			return nil, fmt.Errorf("GetVariables scan: %w", err)
		}
		vars = append(vars, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("GetVariables rows: %w", err)
	}
	return vars, nil
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
