package main

import (
	"testing"

	"mash-potato/db"
)

func TestSetRunnerLoopLimit_Persists(t *testing.T) {
	if err := db.Init(":memory:"); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.DB.Close()

	app := newApp()
	if err := app.SetRunnerLoopLimit(25); err != nil {
		t.Fatalf("SetRunnerLoopLimit: %v", err)
	}
	got := app.GetRunnerLoopLimit()
	if got != 25 {
		t.Errorf("expected 25 after set, got %d", got)
	}
}

func TestGetRunnerLoopLimit_DefaultIs10(t *testing.T) {
	if err := db.Init(":memory:"); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.DB.Close()

	app := newApp()
	got := app.GetRunnerLoopLimit()
	if got != 10 {
		t.Errorf("expected default loop limit 10, got %d", got)
	}
}
