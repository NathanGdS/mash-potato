package db_test

import (
	"os"
	"path/filepath"
	"testing"

	"mash-potato/db"
)

func setupSettingsDB(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	dsn := filepath.Join(dir, "test.db")
	if err := db.Init(dsn); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
}

func TestGetSetting_Default(t *testing.T) {
	setupSettingsDB(t)

	val, err := db.GetSetting("active_environment_id")
	if err != nil {
		t.Fatalf("GetSetting returned error: %v", err)
	}
	if val != "" {
		t.Errorf("expected empty string for missing key, got %q", val)
	}
}

func TestSetAndGetActiveEnvironment(t *testing.T) {
	setupSettingsDB(t)

	const key = "active_environment_id"
	const wantID = "env-abc-123"

	if err := db.SetSetting(key, wantID); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}

	got, err := db.GetSetting(key)
	if err != nil {
		t.Fatalf("GetSetting: %v", err)
	}
	if got != wantID {
		t.Errorf("expected %q, got %q", wantID, got)
	}

	// Upsert: overwrite with new value
	const updatedID = "env-xyz-456"
	if err := db.SetSetting(key, updatedID); err != nil {
		t.Fatalf("SetSetting (update): %v", err)
	}
	got, err = db.GetSetting(key)
	if err != nil {
		t.Fatalf("GetSetting (after update): %v", err)
	}
	if got != updatedID {
		t.Errorf("expected %q after update, got %q", updatedID, got)
	}

	// Clear: set to empty string
	if err := db.SetSetting(key, ""); err != nil {
		t.Fatalf("SetSetting (clear): %v", err)
	}
	got, err = db.GetSetting(key)
	if err != nil {
		t.Fatalf("GetSetting (after clear): %v", err)
	}
	if got != "" {
		t.Errorf("expected empty string after clear, got %q", got)
	}
}
