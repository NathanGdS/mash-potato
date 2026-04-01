package db

import (
	"testing"

	"mash-potato/encryption"
)

// TestCreateEnvironment covers the basic happy path for InsertEnvironment.
func TestCreateEnvironment(t *testing.T) {
	clearTables()
	env, err := InsertEnvironment("env-1", "Development")
	if err != nil {
		t.Fatalf("InsertEnvironment: %v", err)
	}
	if env.ID != "env-1" {
		t.Errorf("expected id=env-1, got %q", env.ID)
	}
	if env.Name != "Development" {
		t.Errorf("expected name=%q, got %q", "Development", env.Name)
	}
	if env.CreatedAt.IsZero() {
		t.Error("expected non-zero CreatedAt")
	}
}

func TestCreateEnvironment_DuplicateID(t *testing.T) {
	clearTables()
	InsertEnvironment("dup-env", "First")
	_, err := InsertEnvironment("dup-env", "Second")
	if err == nil {
		t.Fatal("expected error for duplicate primary key")
	}
}

// TestListEnvironments covers listing with multiple environments.
func TestListEnvironments(t *testing.T) {
	clearTables()
	InsertEnvironment("e1", "Alpha")
	InsertEnvironment("e2", "Beta")
	InsertEnvironment("e3", "Gamma")

	envs, err := ListEnvironments()
	if err != nil {
		t.Fatalf("ListEnvironments: %v", err)
	}
	if len(envs) != 3 {
		t.Fatalf("expected 3 environments, got %d", len(envs))
	}
	if envs[0].Name != "Alpha" || envs[1].Name != "Beta" || envs[2].Name != "Gamma" {
		t.Errorf("unexpected order: %v, %v, %v", envs[0].Name, envs[1].Name, envs[2].Name)
	}
}

func TestListEnvironments_Empty(t *testing.T) {
	clearTables()
	envs, err := ListEnvironments()
	if err != nil {
		t.Fatalf("ListEnvironments: %v", err)
	}
	if len(envs) != 0 {
		t.Errorf("expected empty list, got %d", len(envs))
	}
}

// TestRenameEnvironment verifies that UpdateEnvironment changes the name.
func TestRenameEnvironment(t *testing.T) {
	clearTables()
	InsertEnvironment("ren-1", "Old Name")
	if err := UpdateEnvironment("ren-1", "New Name"); err != nil {
		t.Fatalf("UpdateEnvironment: %v", err)
	}
	envs, _ := ListEnvironments()
	if envs[0].Name != "New Name" {
		t.Errorf("name not updated: got %q", envs[0].Name)
	}
}

func TestRenameEnvironment_NotFound(t *testing.T) {
	clearTables()
	err := UpdateEnvironment("ghost-env", "Whatever")
	if err == nil {
		t.Fatal("expected error for non-existent environment")
	}
}

// TestDeleteEnvironment verifies that DeleteEnvironment removes the row.
func TestDeleteEnvironment(t *testing.T) {
	clearTables()
	InsertEnvironment("del-env-1", "To Delete")
	if err := DeleteEnvironment("del-env-1"); err != nil {
		t.Fatalf("DeleteEnvironment: %v", err)
	}
	envs, _ := ListEnvironments()
	if len(envs) != 0 {
		t.Errorf("expected 0 environments after delete, got %d", len(envs))
	}
}

func TestDeleteEnvironment_NotFound(t *testing.T) {
	clearTables()
	err := DeleteEnvironment("ghost-env")
	if err == nil {
		t.Fatal("expected error for non-existent environment")
	}
}

// TestSetVariable covers inserting and updating a variable.
func TestSetVariable(t *testing.T) {
	clearTables()
	InsertEnvironment("env-var-1", "Vars Env")

	v, err := SetVariable("env-var-1", "API_KEY", "secret", false)
	if err != nil {
		t.Fatalf("SetVariable insert: %v", err)
	}
	if v.Key != "API_KEY" {
		t.Errorf("expected key=API_KEY, got %q", v.Key)
	}
	if v.Value != "secret" {
		t.Errorf("expected value=secret, got %q", v.Value)
	}
	if v.ID == 0 {
		t.Error("expected non-zero id after insert")
	}
	if v.IsSecret {
		t.Error("expected IsSecret=false on insert")
	}

	// Update by setting same key with new value.
	v2, err := SetVariable("env-var-1", "API_KEY", "new-secret", false)
	if err != nil {
		t.Fatalf("SetVariable update: %v", err)
	}
	if v2.ID != v.ID {
		t.Errorf("expected same id on update, got %d vs %d", v2.ID, v.ID)
	}
	if v2.Value != "new-secret" {
		t.Errorf("expected updated value=new-secret, got %q", v2.Value)
	}
}

// TestGetVariables verifies that all variables for an environment are returned.
func TestGetVariables(t *testing.T) {
	clearTables()
	InsertEnvironment("env-gv", "GetVars Env")
	SetVariable("env-gv", "HOST", "localhost", false)
	SetVariable("env-gv", "PORT", "8080", false)

	vars, err := GetVariables("env-gv", nil)
	if err != nil {
		t.Fatalf("GetVariables: %v", err)
	}
	if len(vars) != 2 {
		t.Fatalf("expected 2 variables, got %d", len(vars))
	}
	if vars[0].Key != "HOST" || vars[1].Key != "PORT" {
		t.Errorf("unexpected keys: %q, %q", vars[0].Key, vars[1].Key)
	}
}

// TestGetVariables_Empty verifies an empty slice when no variables exist.
func TestGetVariables_Empty(t *testing.T) {
	clearTables()
	InsertEnvironment("env-empty-vars", "Empty")
	vars, err := GetVariables("env-empty-vars", nil)
	if err != nil {
		t.Fatalf("GetVariables: %v", err)
	}
	if len(vars) != 0 {
		t.Errorf("expected 0 variables, got %d", len(vars))
	}
}

// TestDeleteVariable verifies that a variable can be removed by id.
func TestDeleteVariable(t *testing.T) {
	clearTables()
	InsertEnvironment("env-del-var", "DelVar Env")
	v, _ := SetVariable("env-del-var", "TOKEN", "abc", false)

	if err := DeleteVariable(v.ID); err != nil {
		t.Fatalf("DeleteVariable: %v", err)
	}
	vars, _ := GetVariables("env-del-var", nil)
	if len(vars) != 0 {
		t.Errorf("expected 0 variables after delete, got %d", len(vars))
	}
}

// TestDeleteVariable_NotFound verifies an error is returned for a missing id.
func TestDeleteVariable_NotFound(t *testing.T) {
	clearTables()
	err := DeleteVariable(99999)
	if err == nil {
		t.Fatal("expected error for non-existent variable")
	}
}

// TestSetVariable_IsSecret verifies that is_secret is persisted and retrieved correctly.
func TestSetVariable_IsSecret(t *testing.T) {
	clearTables()
	InsertEnvironment("env-secret", "Secret Env")

	// Insert a secret variable.
	v, err := SetVariable("env-secret", "TOKEN", "hunter2", true)
	if err != nil {
		t.Fatalf("SetVariable secret: %v", err)
	}
	if !v.IsSecret {
		t.Error("expected IsSecret=true after insert with isSecret=true")
	}

	// Read it back via GetVariables and check the flag survives the round-trip.
	vars, err := GetVariables("env-secret", nil)
	if err != nil {
		t.Fatalf("GetVariables: %v", err)
	}
	if len(vars) != 1 {
		t.Fatalf("expected 1 variable, got %d", len(vars))
	}
	if !vars[0].IsSecret {
		t.Error("expected IsSecret=true after round-trip through GetVariables")
	}

	// Insert a non-secret variable and confirm the default is false.
	v2, err := SetVariable("env-secret", "PUBLIC", "value", false)
	if err != nil {
		t.Fatalf("SetVariable non-secret: %v", err)
	}
	if v2.IsSecret {
		t.Error("expected IsSecret=false for non-secret variable")
	}
}

// TestSetVariable_IsSecret_Default verifies that rows inserted without an
// explicit is_secret value have the column defaulting to 0 (false) at the
// database level, confirming the migration DEFAULT clause is effective.
func TestSetVariable_IsSecret_Default(t *testing.T) {
	clearTables()
	InsertEnvironment("env-default", "Default Env")

	// Insert directly via raw SQL without specifying is_secret — exercises the DEFAULT.
	_, err := DB.Exec(
		`INSERT INTO environment_variables (environment_id, key, value) VALUES (?, ?, ?)`,
		"env-default", "RAW_KEY", "raw_value",
	)
	if err != nil {
		t.Fatalf("raw insert: %v", err)
	}

	vars, err := GetVariables("env-default", nil)
	if err != nil {
		t.Fatalf("GetVariables: %v", err)
	}
	if len(vars) != 1 {
		t.Fatalf("expected 1 variable, got %d", len(vars))
	}
	if vars[0].IsSecret {
		t.Error("expected IsSecret=false (DEFAULT 0) for row inserted without is_secret column")
	}
}

// TestMigration_IsSecretIdempotent verifies that running the migration step
// a second time (simulated by calling migrate again on the same open DB)
// does not return an error — the ALTER TABLE is silently ignored.
func TestMigration_IsSecretIdempotent(t *testing.T) {
	// migrate() is package-internal and already ran during TestMain. Calling it
	// again on the live DB must not panic or return a hard error.
	if err := migrate(DB); err != nil {
		t.Fatalf("second migrate() call returned an error: %v", err)
	}
}

// TestCascadeDeleteOnEnvironmentDelete verifies that deleting an environment
// also removes all its variables via ON DELETE CASCADE.
func TestCascadeDeleteOnEnvironmentDelete(t *testing.T) {
	clearTables()
	InsertEnvironment("env-cascade", "Cascade Env")
	SetVariable("env-cascade", "KEY1", "val1", false)
	SetVariable("env-cascade", "KEY2", "val2", false)

	if err := DeleteEnvironment("env-cascade"); err != nil {
		t.Fatalf("DeleteEnvironment: %v", err)
	}
	vars, err := GetVariables("env-cascade", nil)
	if err != nil {
		t.Fatalf("GetVariables after cascade: %v", err)
	}
	if len(vars) != 0 {
		t.Errorf("expected 0 variables after cascaded delete, got %d", len(vars))
	}
}

// TestGetVariables_DecryptSecret verifies the round-trip: a value stored as an
// enc:-prefixed ciphertext is transparently decrypted when GetVariables is
// called with the matching key.
func TestGetVariables_DecryptSecret(t *testing.T) {
	clearTables()
	InsertEnvironment("env-decrypt", "Decrypt Env")

	// Generate a deterministic 32-byte test key.
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}

	plaintext := "super-secret-value"
	encrypted, err := encryption.EncryptValue(plaintext, key)
	if err != nil {
		t.Fatalf("EncryptValue: %v", err)
	}

	// Store the pre-encrypted value — the DB layer never encrypts itself.
	if _, err := SetVariable("env-decrypt", "SECRET_KEY", encrypted, true); err != nil {
		t.Fatalf("SetVariable: %v", err)
	}

	// GetVariables with the correct key must return the plaintext.
	vars, err := GetVariables("env-decrypt", key)
	if err != nil {
		t.Fatalf("GetVariables: %v", err)
	}
	if len(vars) != 1 {
		t.Fatalf("expected 1 variable, got %d", len(vars))
	}
	if vars[0].Value != plaintext {
		t.Errorf("expected decrypted value %q, got %q", plaintext, vars[0].Value)
	}
	if vars[0].Broken {
		t.Error("expected Broken=false for successful decryption")
	}
	if !vars[0].IsSecret {
		t.Error("expected IsSecret=true after round-trip")
	}
}

// TestGetVariables_DecryptBroken verifies that a value encrypted with one key
// but read with a different key causes Broken=true and Value="" (ErrDecryptionFailed
// sentinel path), rather than a hard error.
func TestGetVariables_DecryptBroken(t *testing.T) {
	clearTables()
	InsertEnvironment("env-broken", "Broken Env")

	// Encrypt with key-A.
	keyA := make([]byte, 32)
	for i := range keyA {
		keyA[i] = byte(i + 1)
	}
	encrypted, err := encryption.EncryptValue("original-secret", keyA)
	if err != nil {
		t.Fatalf("EncryptValue: %v", err)
	}

	// Store the ciphertext.
	if _, err := SetVariable("env-broken", "BAD", encrypted, true); err != nil {
		t.Fatalf("SetVariable: %v", err)
	}

	// Attempt to decrypt with key-B (different key) — must trigger ErrDecryptionFailed.
	keyB := make([]byte, 32)
	for i := range keyB {
		keyB[i] = byte(i + 100)
	}
	vars, err := GetVariables("env-broken", keyB)
	if err != nil {
		t.Fatalf("GetVariables must not hard-error on wrong-key decryption: %v", err)
	}
	if len(vars) != 1 {
		t.Fatalf("expected 1 variable, got %d", len(vars))
	}
	if !vars[0].Broken {
		t.Error("expected Broken=true when decrypting with wrong key")
	}
	if vars[0].Value != "" {
		t.Errorf("expected Value=\"\" for broken variable, got %q", vars[0].Value)
	}
}

// TestGetVariables_NilKeySkipsDecryption verifies that passing nil as the key
// returns the raw enc: ciphertext without attempting decryption.
func TestGetVariables_NilKeySkipsDecryption(t *testing.T) {
	clearTables()
	InsertEnvironment("env-nil-key", "Nil Key Env")

	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	plaintext := "my-secret"
	encrypted, _ := encryption.EncryptValue(plaintext, key)
	SetVariable("env-nil-key", "TOKEN", encrypted, true)

	// nil key — raw ciphertext should come back unchanged.
	vars, err := GetVariables("env-nil-key", nil)
	if err != nil {
		t.Fatalf("GetVariables: %v", err)
	}
	if vars[0].Value != encrypted {
		t.Errorf("expected raw ciphertext %q, got %q", encrypted, vars[0].Value)
	}
	if vars[0].Broken {
		t.Error("expected Broken=false when key is nil")
	}
}
