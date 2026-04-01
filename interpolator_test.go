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
	got := Interpolate("https://{{host}}/api", vars, map[string]bool{})
	if got.Value != "https://example.com/api" {
		t.Errorf("unexpected result: %q", got.Value)
	}
}

func TestInterpolate_MultipleVars(t *testing.T) {
	vars := map[string]string{"host": "example.com", "version": "v2"}
	got := Interpolate("https://{{host}}/{{version}}/users", vars, map[string]bool{})
	if got.Value != "https://example.com/v2/users" {
		t.Errorf("unexpected result: %q", got.Value)
	}
}

func TestInterpolate_MissingKeyLeftAsIs(t *testing.T) {
	vars := map[string]string{"host": "example.com"}
	got := Interpolate("https://{{host}}/{{missing}}", vars, map[string]bool{})
	if got.Value != "https://example.com/{{missing}}" {
		t.Errorf("unexpected result: %q", got.Value)
	}
}

func TestInterpolate_NoActiveEnvironment(t *testing.T) {
	// Passing an empty/nil vars map simulates no active environment.
	got := Interpolate("https://{{host}}/api", map[string]string{}, map[string]bool{})
	if got.Value != "https://{{host}}/api" {
		t.Errorf("unexpected result: %q", got.Value)
	}
}

func TestInterpolate_SpecialCharsInValue(t *testing.T) {
	vars := map[string]string{"token": "abc$def&ghi=jkl"}
	got := Interpolate("Bearer {{token}}", vars, map[string]bool{})
	if got.Value != "Bearer abc$def&ghi=jkl" {
		t.Errorf("unexpected result: %q", got.Value)
	}
}

func TestInterpolate_EmptyTemplate(t *testing.T) {
	vars := map[string]string{"key": "value"}
	got := Interpolate("", vars, map[string]bool{})
	if got.Value != "" {
		t.Errorf("expected empty string, got %q", got.Value)
	}
}

// --- InterpolationResult / secret-tracking tests (US-5) ---

// TestInterpolate_SecretValueTracked verifies that a secret variable's resolved
// plaintext value appears in UsedSecretValues.
func TestInterpolate_SecretValueTracked(t *testing.T) {
	vars := map[string]string{"token": "super-secret", "host": "api.example.com"}
	secrets := map[string]bool{"token": true}

	result := Interpolate("https://{{host}}?key={{token}}", vars, secrets)

	if result.Value != "https://api.example.com?key=super-secret" {
		t.Errorf("unexpected interpolated value: %q", result.Value)
	}
	if len(result.UsedSecretValues) != 1 || result.UsedSecretValues[0] != "super-secret" {
		t.Errorf("expected UsedSecretValues=[\"super-secret\"], got %v", result.UsedSecretValues)
	}
}

// TestInterpolate_NonSecretNotTracked verifies that non-secret variables are
// NOT included in UsedSecretValues even when their values are substituted.
func TestInterpolate_NonSecretNotTracked(t *testing.T) {
	vars := map[string]string{"host": "api.example.com", "version": "v1"}
	secrets := map[string]bool{} // nothing is secret

	result := Interpolate("https://{{host}}/{{version}}", vars, secrets)

	if result.Value != "https://api.example.com/v1" {
		t.Errorf("unexpected interpolated value: %q", result.Value)
	}
	if len(result.UsedSecretValues) != 0 {
		t.Errorf("expected no UsedSecretValues, got %v", result.UsedSecretValues)
	}
}

// TestInterpolate_SecretUsedTwiceRecordedTwice verifies that when the same
// secret variable appears multiple times in the template, its resolved value
// is appended to UsedSecretValues once per substitution.
func TestInterpolate_SecretUsedTwiceRecordedTwice(t *testing.T) {
	vars := map[string]string{"apiKey": "key-abc123"}
	secrets := map[string]bool{"apiKey": true}

	result := Interpolate("{{apiKey}}:{{apiKey}}", vars, secrets)

	if result.Value != "key-abc123:key-abc123" {
		t.Errorf("unexpected interpolated value: %q", result.Value)
	}
	if len(result.UsedSecretValues) != 2 {
		t.Errorf("expected UsedSecretValues to have 2 entries, got %d: %v", len(result.UsedSecretValues), result.UsedSecretValues)
	}
	for _, v := range result.UsedSecretValues {
		if v != "key-abc123" {
			t.Errorf("expected each entry to be \"key-abc123\", got %q", v)
		}
	}
}

// TestInterpolate_SecretEmptyValueNotTracked verifies that a secret variable
// resolving to an empty string is not added to UsedSecretValues.
func TestInterpolate_SecretEmptyValueNotTracked(t *testing.T) {
	vars := map[string]string{"emptySecret": ""}
	secrets := map[string]bool{"emptySecret": true}

	result := Interpolate("prefix-{{emptySecret}}-suffix", vars, secrets)

	if result.Value != "prefix--suffix" {
		t.Errorf("unexpected interpolated value: %q", result.Value)
	}
	if len(result.UsedSecretValues) != 0 {
		t.Errorf("expected no UsedSecretValues for empty secret, got %v", result.UsedSecretValues)
	}
}

// TestInterpolate_NoSubstitutions_UsedSecretValuesNotNil verifies that
// UsedSecretValues is non-nil and has length 0 when there are no
// substitutions at all (nil-safety guard).
func TestInterpolate_NoSubstitutions_UsedSecretValuesNotNil(t *testing.T) {
	result := Interpolate("plain text with no tokens", map[string]string{}, map[string]bool{})

	if result.UsedSecretValues == nil {
		t.Error("expected UsedSecretValues to be non-nil, got nil")
	}
	if len(result.UsedSecretValues) != 0 {
		t.Errorf("expected len(UsedSecretValues)==0, got %d: %v", len(result.UsedSecretValues), result.UsedSecretValues)
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
	if err := db.UpdateRequest(req.ID, "GET", srv.URL+"/{{path}}", "[]", "[]", "none", "", "none", "{}", 30, "", "", ""); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}

	// Create an environment with a base_url variable.
	env, err := db.InsertEnvironment("env-1", "Test Env")
	if err != nil {
		t.Fatalf("InsertEnvironment: %v", err)
	}
	if _, err := db.SetVariable(env.ID, "path", "ping", false); err != nil {
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

func TestSendRequest_InterpolatesAuth(t *testing.T) {
	// Initialise an in-memory DB.
	if err := db.Init(":memory:"); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	defer db.DB.Close()

	var gotAuthHeader string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthHeader = r.Header.Get("X-My-Auth")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	// Create collection and request with {{auth_key}} and {{auth_val}}
	col, _ := db.InsertCollection("col-auth", "Auth Test")
	req, _ := db.InsertRequest("req-auth", col.ID, "Auth Request")
	
	// auth_config with variables
	authConfig := `{"keyName":"{{name_var}}","keyValue":"{{val_var}}","addTo":"header"}`
	if err := db.UpdateRequest(req.ID, "GET", srv.URL, "[]", "[]", "none", "", "apikey", authConfig, 30, "", "", ""); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}

	// Environment with variables
	env, _ := db.InsertEnvironment("env-auth", "Auth Env")
	db.SetVariable(env.ID, "name_var", "X-My-Auth", false)
	db.SetVariable(env.ID, "val_var", "secret-123", false)
	db.SetSetting("active_environment_id", env.ID)

	app := newApp()
	_, err := app.SendRequest(req.ID)
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}

	if gotAuthHeader != "secret-123" {
		t.Errorf("expected secret-123 in X-My-Auth header, got %q", gotAuthHeader)
	}
}
