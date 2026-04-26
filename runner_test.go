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

func TestRunCollection_SetNextRequest_Jump(t *testing.T) {
	app, srv := setupRunnerTest(t)

	// req1 jumps to req3, skipping req2
	colID, req1ID := insertRequest(t, "jump-col", "req1", srv.URL, "", `setNextRequest("req3")`)
	_, req2ID := insertRequest(t, "jump-col2", "req2", srv.URL, "", "")
	_, req3ID := insertRequest(t, "jump-col3", "req3", srv.URL, "", "")

	res, err := app.RunCollection(colID, []string{req1ID, req2ID, req3ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "completed" {
		t.Errorf("expected completed, got %q", res.TerminalState)
	}
	if res.Results[0].JumpedTo != "req3" {
		t.Errorf("expected req1 JumpedTo=req3, got %q", res.Results[0].JumpedTo)
	}
	if !res.Results[1].SkippedByFlow {
		t.Error("expected req2 to be SkippedByFlow=true")
	}
	if res.Results[2].SkippedByFlow {
		t.Error("expected req3 to NOT be skipped")
	}
}

func TestRunCollection_SetNextRequest_Null_StopsRun(t *testing.T) {
	app, srv := setupRunnerTest(t)

	colID, req1ID := insertRequest(t, "stop-col", "req1", srv.URL, "", `setNextRequest(null)`)
	_, req2ID := insertRequest(t, "stop-col2", "req2", srv.URL, "", "")

	res, err := app.RunCollection(colID, []string{req1ID, req2ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "stopped_by_script" {
		t.Errorf("expected stopped_by_script, got %q", res.TerminalState)
	}
	if res.Results[1].SkippedByFlow != true {
		t.Error("expected req2 to be SkippedByFlow after stop")
	}
}

func TestRunCollection_LoopLimit_Halts(t *testing.T) {
	app, srv := setupRunnerTest(t)

	// Set a low limit so the test is fast.
	if err := app.SetRunnerLoopLimit(2); err != nil {
		t.Fatalf("SetRunnerLoopLimit: %v", err)
	}

	// req1 always jumps back to itself — infinite loop.
	colID, req1ID := insertRequest(t, "loop-col", "req1", srv.URL, "", `setNextRequest("req1")`)

	res, err := app.RunCollection(colID, []string{req1ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "stopped_by_loop_limit" {
		t.Errorf("expected stopped_by_loop_limit, got %q", res.TerminalState)
	}
}

func TestRunCollection_RunVars_PassBetweenRequests(t *testing.T) {
	app, srv := setupRunnerTest(t)

	// req1 sets a run var; req2 reads it and logs it via console.log so we can verify.
	colID, req1ID := insertRequest(t, "runvar-col", "req1", srv.URL, "", `mp.runVars.set("tok", "hello")`)
	_, req2ID := insertRequest(t, "runvar-col2", "req2", srv.URL, `console.log(mp.runVars.get("tok"))`, "")

	res, err := app.RunCollection(colID, []string{req1ID, req2ID}, 0, nil)
	if err != nil {
		t.Fatalf("RunCollection: %v", err)
	}
	if res.TerminalState != "completed" {
		t.Errorf("expected completed, got %q", res.TerminalState)
	}
	// req2's pre-script should have logged the value set by req1's post-script.
	logs := res.Results[1].ConsoleLogs
	if len(logs) == 0 || logs[0] != "hello" {
		t.Errorf("expected req2 console log 'hello', got %v", logs)
	}
}

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

func TestRunCollection_Retry_ExhaustsFails(t *testing.T) {
	app, _ := setupRunnerTest(t)

	// Server always fails.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	colID, reqID := insertRequest(t, "retry-fail", "req1", srv.URL, "", "")
	retryMap := map[string]int{reqID: 2} // 2 retries = 3 total attempts

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

// --- retry tests ---

func TestRunCollection_Retry_SucceedsOnSecondAttempt(t *testing.T) {
	app, _ := setupRunnerTest(t)

	// Server fails first request, succeeds second.
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
