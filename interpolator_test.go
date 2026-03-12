package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mash-potato/db"
)

func TestInterpolate_SingleVar(t *testing.T) {
	vars := map[string]string{"host": "example.com"}
	got := Interpolate("https://{{host}}/api", vars)
	if got != "https://example.com/api" {
		t.Errorf("unexpected result: %q", got)
	}
}

func TestInterpolate_MultipleVars(t *testing.T) {
	vars := map[string]string{"host": "example.com", "version": "v2"}
	got := Interpolate("https://{{host}}/{{version}}/users", vars)
	if got != "https://example.com/v2/users" {
		t.Errorf("unexpected result: %q", got)
	}
}

func TestInterpolate_MissingKeyLeftAsIs(t *testing.T) {
	vars := map[string]string{"host": "example.com"}
	got := Interpolate("https://{{host}}/{{missing}}", vars)
	if got != "https://example.com/{{missing}}" {
		t.Errorf("unexpected result: %q", got)
	}
}

func TestInterpolate_NoActiveEnvironment(t *testing.T) {
	// Passing an empty/nil vars map simulates no active environment.
	got := Interpolate("https://{{host}}/api", map[string]string{})
	if got != "https://{{host}}/api" {
		t.Errorf("unexpected result: %q", got)
	}
}

func TestInterpolate_SpecialCharsInValue(t *testing.T) {
	vars := map[string]string{"token": "abc$def&ghi=jkl"}
	got := Interpolate("Bearer {{token}}", vars)
	if got != "Bearer abc$def&ghi=jkl" {
		t.Errorf("unexpected result: %q", got)
	}
}

func TestInterpolate_EmptyTemplate(t *testing.T) {
	vars := map[string]string{"key": "value"}
	got := Interpolate("", vars)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

// TestSendRequest_InterpolatesURL is a Go integration test that verifies that
// SendRequest resolves {{variable}} tokens in the URL using the active environment.
func TestSendRequest_InterpolatesURL(t *testing.T) {
	// Initialise an in-memory DB.
	if err := db.Init(":memory:"); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.DB.Close()

	// Start a test HTTP server that records the path it receives.
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	// Create a collection and a request that uses {{base_url}}.
	col, err := db.InsertCollection("col-1", "Test Collection")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}
	req, err := db.InsertRequest("req-1", col.ID, "Test Request")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(req.ID, "GET", srv.URL+"/{{path}}", "[]", "[]", "none", ""); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}

	// Create an environment with a base_url variable.
	env, err := db.InsertEnvironment("env-1", "Test Env")
	if err != nil {
		t.Fatalf("InsertEnvironment: %v", err)
	}
	if _, err := db.SetVariable(env.ID, "path", "ping"); err != nil {
		t.Fatalf("SetVariable: %v", err)
	}

	// Set that environment as active.
	if err := db.SetSetting("active_environment_id", env.ID); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}

	// Call SendRequest through App.
	app := newApp()
	result, err := app.SendRequest(req.ID)
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected 200, got %d", result.StatusCode)
	}
	if !strings.HasSuffix(gotPath, "/ping") {
		t.Errorf("expected path to end with /ping, got %q", gotPath)
	}
}
