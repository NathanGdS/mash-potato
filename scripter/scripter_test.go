package scripter

import (
	"testing"
)

// --- mp.runVars ---

func TestRunVars_GetReadsFromContext(t *testing.T) {
	result := RunPostScript(`mp.env.set("got", mp.runVars.get("token"))`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{"token": "my-token"},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	})
	if v, ok := result.EnvMutations["got"]; !ok || v != "my-token" {
		t.Errorf("expected EnvMutations[got]=my-token, got %v", result.EnvMutations)
	}
}

func TestRunVars_SetAppearsInMutations(t *testing.T) {
	result := RunPostScript(`mp.runVars.set("token", "abc123")`, ScriptContext{
		EnvVars:  map[string]string{},
		RunVars:  map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	})
	if v, ok := result.RunVarMutations["token"]; !ok || v != "abc123" {
		t.Errorf("expected RunVarMutations[token]=abc123, got %v", result.RunVarMutations)
	}
}

// --- mp.response.json() ---

func TestResponseJson_ParsesBody(t *testing.T) {
	result := RunPostScript(`mp.env.set("tok", mp.response.json().access_token)`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
		Response: &ResponseSnapshot{
			Status: 200,
			Body:   `{"access_token":"bearer-xyz"}`,
		},
	})
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if v := result.EnvMutations["tok"]; v != "bearer-xyz" {
		t.Errorf("expected tok=bearer-xyz, got %q", v)
	}
}

func TestResponseJson_InvalidJson_ReturnsUndefined(t *testing.T) {
	result := RunPostScript(`
		var obj = mp.response.json();
		mp.env.set("was_undefined", obj === undefined ? "yes" : "no");
	`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: "not json"},
	})
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors (should not throw): %v", result.Errors)
	}
	if v := result.EnvMutations["was_undefined"]; v != "yes" {
		t.Errorf("expected undefined for invalid JSON, got %q", v)
	}
}

// --- setNextRequest ---

func TestSetNextRequest_NotCalled_NilNextRequest(t *testing.T) {
	result := RunPostScript(`console.log("no jump")`, ScriptContext{
		EnvVars:  map[string]string{},
		RunVars:  map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	})
	if result.NextRequest != nil {
		t.Errorf("expected NextRequest to be nil when setNextRequest not called, got %v", *result.NextRequest)
	}
}

func TestSetNextRequest_NullArg(t *testing.T) {
	result := RunPostScript(`setNextRequest(null)`, ScriptContext{
		EnvVars:  map[string]string{},
		RunVars:  map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	})
	if result.NextRequest == nil {
		t.Fatal("expected NextRequest to be non-nil")
	}
	if *result.NextRequest != "" {
		t.Errorf("expected NextRequest to be empty string (stop signal), got %q", *result.NextRequest)
	}
}

func TestSetNextRequest_StringArg(t *testing.T) {
	result := RunPostScript(`setNextRequest("Foo")`, ScriptContext{
		EnvVars:  map[string]string{},
		RunVars:  map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	})
	if result.NextRequest == nil {
		t.Fatal("expected NextRequest to be non-nil")
	}
	if *result.NextRequest != "Foo" {
		t.Errorf("expected NextRequest=%q, got %q", "Foo", *result.NextRequest)
	}
}
