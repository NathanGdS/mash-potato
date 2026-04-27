package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"mash-potato/db"
)

// setupRunnerTest creates a minimal App with an in-memory DB and returns a
// test HTTP server whose URL can be used as request URLs.
func setupRunnerTest(t *testing.T) (*App, *httptest.Server) {
	t.Helper()
	if err := db.Init(":memory:"); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
	t.Cleanup(func() { db.DB.Close() })

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(srv.Close)

	app := newApp()
	app.ctx = context.Background()
	return app, srv
}

// insertRequest is a test helper that inserts a collection + request and returns IDs.
func insertRequest(t *testing.T, colName, reqName, url, preScript, postScript string) (colID, reqID string) {
	t.Helper()
	col, err := db.InsertCollection("col-"+colName, colName)
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}
	req, err := db.InsertRequest("req-"+reqName, col.ID, reqName)
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(req.ID, "GET", url, "[]", "[]", "none", "", "none", "{}", 30, "", preScript, postScript); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}
	return col.ID, req.ID
}

// insertRequestInCol inserts a request into an existing collection by its name.
func insertRequestInCol(t *testing.T, colName, reqName, url, preScript, postScript string) (colID, reqID string) {
	t.Helper()
	// Find or create the collection
	col, err := db.InsertCollection("col-ic-"+colName+"-"+reqName, colName)
	if err != nil {
		// Try to find existing by name
		t.Fatalf("InsertCollection for %s: %v", colName, err)
	}
	req, err := db.InsertRequest("req-ic-"+colName+"-"+reqName, col.ID, reqName)
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(req.ID, "GET", url, "[]", "[]", "none", "", "none", "{}", 30, "", preScript, postScript); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}
	return col.ID, req.ID
}

// --- Linear / basic tests ---

func TestRunCollection_LinearRun_CompletedState(t *testing.T) {
	app, srv := setupRunnerTest(t)
	colID, req1ID := insertRequest(t, "linear", "req1", srv.URL, "", "")
	_, req2ID := insertRequest(t, "linear2", "req2", srv.URL, "", "")

	result, err := app.RunCollection(colID, []string{req1ID, req2ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if result.TerminalState != "completed" {
		t.Errorf("expected TerminalState=completed, got %q", result.TerminalState)
	}
	if len(result.Results) != 2 {
		t.Errorf("expected 2 results, got %d", len(result.Results))
	}
}

func TestRunCollection_RunVars_PassBetweenRequests(t *testing.T) {
	app, srv := setupRunnerTest(t)

	colID, req1ID := insertRequest(t, "runvar-col", "req1", srv.URL, "", `mp.runVars.set("tok", "hello")`)
	_, req2ID := insertRequest(t, "runvar-col2", "req2", srv.URL, `console.log(mp.runVars.get("tok"))`, "")

	res, err := app.RunCollection(colID, []string{req1ID, req2ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "completed" {
		t.Errorf("expected completed, got %q", res.TerminalState)
	}
	logs := res.Results[1].ConsoleLogs
	if len(logs) == 0 || logs[0] != "hello" {
		t.Errorf("expected req2 console log 'hello', got %v", logs)
	}
}

// --- setNextRequest removed ---

func TestRunCollection_SetNextRequest_ProducesScriptError(t *testing.T) {
	app, srv := setupRunnerTest(t)

	colID, req1ID := insertRequest(t, "snr-col", "req1", srv.URL, "", `setNextRequest("req2")`)
	_, req2ID := insertRequest(t, "snr-col2", "req2", srv.URL, "", "")

	res, err := app.RunCollection(colID, []string{req1ID, req2ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	// setNextRequest is undefined — should produce a script error, not a panic.
	if res.Results[0].ScriptErrors == nil || len(res.Results[0].ScriptErrors) == 0 {
		t.Error("expected ScriptErrors for undefined setNextRequest, got none")
	}
	// Run should complete normally (not stop_by_script).
	if res.TerminalState != "completed" {
		t.Errorf("expected completed, got %q", res.TerminalState)
	}
	// req2 should NOT be skipped — no jump happened.
	if res.Results[1].SkippedByFlow {
		t.Error("req2 should not be skipped since setNextRequest is gone")
	}
}

// --- stopRunner ---

func TestRunCollection_StopRunner_HaltsRun(t *testing.T) {
	app, srv := setupRunnerTest(t)

	colID, req1ID := insertRequest(t, "stop-col", "req1", srv.URL, "", `stopRunner()`)
	_, req2ID := insertRequest(t, "stop-col2", "req2", srv.URL, "", "")

	res, err := app.RunCollection(colID, []string{req1ID, req2ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "stopped_by_script" {
		t.Errorf("expected stopped_by_script, got %q", res.TerminalState)
	}
	if !res.Results[1].SkippedByFlow {
		t.Error("expected req2 to be SkippedByFlow after stopRunner()")
	}
}

func TestRunCollection_StopRunner_InPreScript(t *testing.T) {
	app, srv := setupRunnerTest(t)

	colID, req1ID := insertRequest(t, "stop-pre-col", "req1", srv.URL, `stopRunner()`, "")
	_, req2ID := insertRequest(t, "stop-pre-col2", "req2", srv.URL, "", "")

	res, err := app.RunCollection(colID, []string{req1ID, req2ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "stopped_by_script" {
		t.Errorf("expected stopped_by_script, got %q", res.TerminalState)
	}
}

// --- doRequest ---

func TestRunCollection_DoRequest_ExecutesSubRequest(t *testing.T) {
	app, _ := setupRunnerTest(t)

	// Sub-request server returns a token
	var subHits atomic.Int32
	subSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		subHits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"token":"sub-tok"}`))
	}))
	t.Cleanup(subSrv.Close)

	mainSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(mainSrv.Close)

	// Insert sub-request in its own collection
	subCol, err := db.InsertCollection("col-sub-exec", "sub-exec-col")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}
	subReq, err := db.InsertRequest("req-sub-exec", subCol.ID, "sub-req")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(subReq.ID, "GET", subSrv.URL, "[]", "[]", "none", "", "none", "{}", 30, "", "", ""); err != nil {
		t.Fatalf("UpdateRequest sub: %v", err)
	}

	// Main collection: req1 calls doRequest
	mainCol, err := db.InsertCollection("col-main-exec", "main-exec-col")
	if err != nil {
		t.Fatalf("InsertCollection main: %v", err)
	}
	mainReq, err := db.InsertRequest("req-main-exec", mainCol.ID, "main-req")
	if err != nil {
		t.Fatalf("InsertRequest main: %v", err)
	}
	preScript := `doRequest("sub-exec-col/sub-req")`
	if err := db.UpdateRequest(mainReq.ID, "GET", mainSrv.URL, "[]", "[]", "none", "", "none", "{}", 30, "", preScript, ""); err != nil {
		t.Fatalf("UpdateRequest main: %v", err)
	}

	res, err := app.RunCollection(mainCol.ID, []string{mainReq.ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "completed" {
		t.Errorf("expected completed, got %q", res.TerminalState)
	}
	if subHits.Load() != 1 {
		t.Errorf("expected sub-request to be hit once, got %d", subHits.Load())
	}
}

func TestRunCollection_DoRequest_EnvMutationPersists(t *testing.T) {
	app, _ := setupRunnerTest(t)

	// Set up active environment
	env, err := db.InsertEnvironment("env-doRequest-test", "Test Env")
	if err != nil {
		t.Fatalf("InsertEnvironment: %v", err)
	}
	if err := db.SetSetting("active_environment_id", env.ID); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}

	// Auth sub-request: POST returns a token, post-script saves it to env
	authSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"token":"auth-token-xyz"}`))
	}))
	t.Cleanup(authSrv.Close)

	mainSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(mainSrv.Close)

	// Auth collection
	authCol, err := db.InsertCollection("col-auth-env", "auth-env-col")
	if err != nil {
		t.Fatalf("InsertCollection auth: %v", err)
	}
	authReq, err := db.InsertRequest("req-auth-env", authCol.ID, "auth-req")
	if err != nil {
		t.Fatalf("InsertRequest auth: %v", err)
	}
	authPost := `mp.env.set("authToken", mp.response.json().token)`
	if err := db.UpdateRequest(authReq.ID, "GET", authSrv.URL, "[]", "[]", "none", "", "none", "{}", 30, "", "", authPost); err != nil {
		t.Fatalf("UpdateRequest auth: %v", err)
	}

	// Main collection: req1 calls doRequest to auth, req2 logs the token
	mainCol, err := db.InsertCollection("col-main-env", "main-env-col")
	if err != nil {
		t.Fatalf("InsertCollection main: %v", err)
	}
	req1, err := db.InsertRequest("req-main-env-1", mainCol.ID, "req1")
	if err != nil {
		t.Fatalf("InsertRequest req1: %v", err)
	}
	if err := db.UpdateRequest(req1.ID, "GET", mainSrv.URL, "[]", "[]", "none", "", "none", "{}", 30, "", `doRequest("auth-env-col/auth-req")`, ""); err != nil {
		t.Fatalf("UpdateRequest req1: %v", err)
	}

	req2, err := db.InsertRequest("req-main-env-2", mainCol.ID, "req2")
	if err != nil {
		t.Fatalf("InsertRequest req2: %v", err)
	}
	if err := db.UpdateRequest(req2.ID, "GET", mainSrv.URL, "[]", "[]", "none", "", "none", "{}", 30, "", `console.log(mp.env.get("authToken"))`, ""); err != nil {
		t.Fatalf("UpdateRequest req2: %v", err)
	}

	res, err := app.RunCollection(mainCol.ID, []string{req1.ID, req2.ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "completed" {
		t.Errorf("expected completed, got %q", res.TerminalState)
	}
	// req2's pre-script should have logged the token set by auth-req's post-script
	logs := res.Results[1].ConsoleLogs
	if len(logs) == 0 || logs[0] != "auth-token-xyz" {
		t.Errorf("expected req2 console log 'auth-token-xyz', got %v", logs)
	}
}

func TestRunCollection_DoRequest_CircularHitsDepthLimit(t *testing.T) {
	app, _ := setupRunnerTest(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(srv.Close)

	// col-circ/req-a calls doRequest("col-circ/req-a") — circular
	circCol, err := db.InsertCollection("col-circ", "col-circ")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}
	circReq, err := db.InsertRequest("req-circ-a", circCol.ID, "req-a")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	preScript := `doRequest("col-circ/req-a")`
	if err := db.UpdateRequest(circReq.ID, "GET", srv.URL, "[]", "[]", "none", "", "none", "{}", 30, "", preScript, ""); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}

	res, err := app.RunCollection(circCol.ID, []string{circReq.ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	// Should NOT hang or panic — should produce ScriptErrors
	if len(res.Results[0].ScriptErrors) == 0 {
		t.Error("expected ScriptErrors for circular doRequest, got none")
	}
}

// --- retry tests ---

func TestRunCollection_Retry_ExhaustsFails(t *testing.T) {
	app, _ := setupRunnerTest(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	colID, reqID := insertRequest(t, "retry-fail", "req1", srv.URL, "", "")
	retryMap := map[string]int{reqID: 2}

	res, err := app.RunCollection(colID, []string{reqID}, 0, retryMap)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	r := res.Results[0]
	if r.Passed {
		t.Error("expected request to still fail after exhausting retries")
	}
	if r.RetryCount != 2 {
		t.Errorf("expected RetryCount=2, got %d", r.RetryCount)
	}
}

func TestRunCollection_Retry_SucceedsOnSecondAttempt(t *testing.T) {
	app, _ := setupRunnerTest(t)

	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	colID, reqID := insertRequest(t, "retry-ok", "req1", srv.URL, "", "")
	retryMap := map[string]int{reqID: 1}

	res, err := app.RunCollection(colID, []string{reqID}, 0, retryMap)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "completed" {
		t.Errorf("expected completed, got %q", res.TerminalState)
	}
	r := res.Results[0]
	if !r.Passed {
		t.Error("expected request to be passed after retry")
	}
	if r.RetryCount != 1 {
		t.Errorf("expected RetryCount=1, got %d", r.RetryCount)
	}
}
