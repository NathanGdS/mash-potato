package db

import (
	"testing"
)

func TestGetSetting_Default(t *testing.T) {
	clearTables()

	val, err := GetSetting("active_environment_id")
	if err != nil {
		t.Fatalf("GetSetting returned error: %v", err)
	}
	if val != "" {
		t.Errorf("expected empty string for missing key, got %q", val)
	}
}

func TestSetAndGetActiveEnvironment(t *testing.T) {
	clearTables()

	const key = "active_environment_id"
	const wantID = "env-abc-123"

	if err := SetSetting(key, wantID); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}

	got, err := GetSetting(key)
	if err != nil {
		t.Fatalf("GetSetting: %v", err)
	}
	if got != wantID {
		t.Errorf("expected %q, got %q", wantID, got)
	}

	// Upsert: overwrite with new value
	const updatedID = "env-xyz-456"
	if err := SetSetting(key, updatedID); err != nil {
		t.Fatalf("SetSetting (update): %v", err)
	}
	got, err = GetSetting(key)
	if err != nil {
		t.Fatalf("GetSetting (after update): %v", err)
	}
	if got != updatedID {
		t.Errorf("expected %q after update, got %q", updatedID, got)
	}

	// Clear: set to empty string
	if err := SetSetting(key, ""); err != nil {
		t.Fatalf("SetSetting (clear): %v", err)
	}
	got, err = GetSetting(key)
	if err != nil {
		t.Fatalf("GetSetting (after clear): %v", err)
	}
	if got != "" {
		t.Errorf("expected empty string after clear, got %q", got)
	}
}
