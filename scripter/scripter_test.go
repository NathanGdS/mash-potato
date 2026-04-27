package scripter

import (
	"fmt"
	"strings"
	"testing"
)

// --- mp.runVars ---

func TestRunVars_GetReadsFromContext(t *testing.T) {
	result := RunPostScript(`mp.env.set("got", mp.runVars.get("token"))`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{"token": "my-token"},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	}, nil, 0)
	if v, ok := result.EnvMutations["got"]; !ok || v != "my-token" {
		t.Errorf("expected EnvMutations[got]=my-token, got %v", result.EnvMutations)
	}
}

func TestRunVars_SetAppearsInMutations(t *testing.T) {
	result := RunPostScript(`mp.runVars.set("token", "abc123")`, ScriptContext{
		EnvVars:  map[string]string{},
		RunVars:  map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	}, nil, 0)
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
	}, nil, 0)
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
	}, nil, 0)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors (should not throw): %v", result.Errors)
	}
	if v := result.EnvMutations["was_undefined"]; v != "yes" {
		t.Errorf("expected undefined for invalid JSON, got %q", v)
	}
}

// --- setNextRequest removed ---

func TestSetNextRequest_ThrowsReferenceError(t *testing.T) {
	result := RunPostScript(`setNextRequest("Foo")`, ScriptContext{
		EnvVars:  map[string]string{},
		RunVars:  map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	}, nil, 0)
	if len(result.Errors) == 0 {
		t.Fatal("expected ReferenceError for setNextRequest, got no errors")
	}
	found := false
	for _, e := range result.Errors {
		if strings.Contains(e, "ReferenceError") || strings.Contains(e, "setNextRequest") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected ReferenceError for setNextRequest, got: %v", result.Errors)
	}
}

// --- stopRunner ---

func TestStopRunner_SetsFlag(t *testing.T) {
	result := RunPostScript(`stopRunner()`, ScriptContext{
		EnvVars:  map[string]string{},
		RunVars:  map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	}, nil, 0)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if !result.StopRunner {
		t.Error("expected StopRunner=true after stopRunner()")
	}
}

func TestStopRunner_NotCalled_FlagFalse(t *testing.T) {
	result := RunPostScript(`console.log("no stop")`, ScriptContext{
		EnvVars:  map[string]string{},
		RunVars:  map[string]string{},
		Response: &ResponseSnapshot{Status: 200, Body: ""},
	}, nil, 0)
	if result.StopRunner {
		t.Error("expected StopRunner=false when stopRunner() not called")
	}
}

// --- doRequest ---

func TestDoRequest_InvokesExecutorWithPath(t *testing.T) {
	var calledPath string
	executor := func(path string, depth int) (ResponseSnapshot, error) {
		calledPath = path
		return ResponseSnapshot{Status: 200, StatusText: "OK", Body: `{"ok":true}`, Logs: nil}, nil
	}
	result := RunPreScript(`doRequest("col/req")`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
	}, executor, 0)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if calledPath != "col/req" {
		t.Errorf("expected executor called with col/req, got %q", calledPath)
	}
}

func TestDoRequest_ReturnsResponseShape(t *testing.T) {
	executor := func(path string, depth int) (ResponseSnapshot, error) {
		return ResponseSnapshot{
			Status:     201,
			StatusText: "Created",
			Body:       `{"id":42}`,
			Headers:    map[string]string{"content-type": "application/json"},
		}, nil
	}
	result := RunPreScript(`
		var r = doRequest("col/req");
		mp.env.set("status", String(r.status));
		mp.env.set("statusText", r.statusText);
		mp.env.set("body", r.body);
		mp.env.set("ct", r.headers["content-type"]);
	`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
	}, executor, 0)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if result.EnvMutations["status"] != "201" {
		t.Errorf("expected status=201, got %q", result.EnvMutations["status"])
	}
	if result.EnvMutations["statusText"] != "Created" {
		t.Errorf("expected statusText=Created, got %q", result.EnvMutations["statusText"])
	}
	if result.EnvMutations["body"] != `{"id":42}` {
		t.Errorf("expected body, got %q", result.EnvMutations["body"])
	}
	if result.EnvMutations["ct"] != "application/json" {
		t.Errorf("expected content-type header, got %q", result.EnvMutations["ct"])
	}
}

func TestDoRequest_JsonHelper_ParsesBody(t *testing.T) {
	executor := func(path string, depth int) (ResponseSnapshot, error) {
		return ResponseSnapshot{Status: 200, Body: `{"token":"abc"}`}, nil
	}
	result := RunPreScript(`
		var r = doRequest("col/req");
		mp.env.set("tok", r.json().token);
	`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
	}, executor, 0)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if result.EnvMutations["tok"] != "abc" {
		t.Errorf("expected tok=abc, got %q", result.EnvMutations["tok"])
	}
}

func TestDoRequest_JsonHelper_NonJson_ReturnsUndefined(t *testing.T) {
	executor := func(path string, depth int) (ResponseSnapshot, error) {
		return ResponseSnapshot{Status: 200, Body: "not json"}, nil
	}
	result := RunPreScript(`
		var r = doRequest("col/req");
		mp.env.set("was_undefined", r.json() === undefined ? "yes" : "no");
	`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
	}, executor, 0)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors (should not throw): %v", result.Errors)
	}
	if result.EnvMutations["was_undefined"] != "yes" {
		t.Errorf("expected undefined for non-JSON, got %q", result.EnvMutations["was_undefined"])
	}
}

func TestDoRequest_ExecutorError_ThrowsJSException(t *testing.T) {
	executor := func(path string, depth int) (ResponseSnapshot, error) {
		return ResponseSnapshot{}, fmt.Errorf("request not found: %s", path)
	}
	result := RunPreScript(`
		try {
			doRequest("bad/path");
			mp.env.set("caught", "no");
		} catch(e) {
			mp.env.set("caught", "yes");
		}
	`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
	}, executor, 0)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected script-level errors: %v", result.Errors)
	}
	if result.EnvMutations["caught"] != "yes" {
		t.Errorf("expected JS exception caught, got caught=%q", result.EnvMutations["caught"])
	}
}

func TestDoRequest_DepthLimit_ThrowsJSException(t *testing.T) {
	executor := func(path string, depth int) (ResponseSnapshot, error) {
		return ResponseSnapshot{Status: 200, Body: ""}, nil
	}
	// Call at depth 5 — should throw
	result := RunPreScript(`
		try {
			doRequest("col/req");
			mp.env.set("caught", "no");
		} catch(e) {
			mp.env.set("caught", "yes");
			mp.env.set("msg", e.message || String(e));
		}
	`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
	}, executor, 5)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected script-level errors: %v", result.Errors)
	}
	if result.EnvMutations["caught"] != "yes" {
		t.Errorf("expected JS exception for depth limit, got caught=%q", result.EnvMutations["caught"])
	}
}

func TestDoRequest_DepthPassedToExecutor(t *testing.T) {
	var receivedDepth int
	executor := func(path string, depth int) (ResponseSnapshot, error) {
		receivedDepth = depth
		return ResponseSnapshot{Status: 200, Body: ""}, nil
	}
	RunPreScript(`doRequest("col/req")`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
	}, executor, 2)
	if receivedDepth != 3 {
		t.Errorf("expected executor called with depth=3 (parent+1), got %d", receivedDepth)
	}
}

func TestDoRequest_SubLogs_AppendedToParentLogs(t *testing.T) {
	executor := func(path string, depth int) (ResponseSnapshot, error) {
		return ResponseSnapshot{
			Status: 200,
			Body:   "",
			Logs:   []string{"[sub/req] sub log line"},
		}, nil
	}
	result := RunPreScript(`doRequest("sub/req")`, ScriptContext{
		EnvVars: map[string]string{},
		RunVars: map[string]string{},
	}, executor, 0)
	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	found := false
	for _, l := range result.Logs {
		if l == "[sub/req] sub log line" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected sub-request log in parent Logs, got: %v", result.Logs)
	}
}

