package db

import (
	"testing"
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

	v, err := SetVariable("env-var-1", "API_KEY", "secret")
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

	// Update by setting same key with new value.
	v2, err := SetVariable("env-var-1", "API_KEY", "new-secret")
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
	SetVariable("env-gv", "HOST", "localhost")
	SetVariable("env-gv", "PORT", "8080")

	vars, err := GetVariables("env-gv")
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
	vars, err := GetVariables("env-empty-vars")
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
	v, _ := SetVariable("env-del-var", "TOKEN", "abc")

	if err := DeleteVariable(v.ID); err != nil {
		t.Fatalf("DeleteVariable: %v", err)
	}
	vars, _ := GetVariables("env-del-var")
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

// TestCascadeDeleteOnEnvironmentDelete verifies that deleting an environment
// also removes all its variables via ON DELETE CASCADE.
func TestCascadeDeleteOnEnvironmentDelete(t *testing.T) {
	clearTables()
	InsertEnvironment("env-cascade", "Cascade Env")
	SetVariable("env-cascade", "KEY1", "val1")
	SetVariable("env-cascade", "KEY2", "val2")

	if err := DeleteEnvironment("env-cascade"); err != nil {
		t.Fatalf("DeleteEnvironment: %v", err)
	}
	vars, err := GetVariables("env-cascade")
	if err != nil {
		t.Fatalf("GetVariables after cascade: %v", err)
	}
	if len(vars) != 0 {
		t.Errorf("expected 0 variables after cascaded delete, got %d", len(vars))
	}
}
