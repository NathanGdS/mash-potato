package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"mash-potato/db"
	"mash-potato/httpclient"
	"mash-potato/scripter"
)

// RunResult holds the outcome of a single request execution within a collection run.
type RunResult struct {
	RequestID       string                       `json:"RequestId"`
	RequestName     string                       `json:"RequestName"`
	Status          int                          `json:"Status"`
	DurationMs      int64                        `json:"DurationMs"`
	Passed          bool                         `json:"Passed"`
	TestsPassed     bool                         `json:"TestsPassed"`
	Error           string                       `json:"Error"`
	ResponseBody    string                       `json:"ResponseBody"`
	ResponseHeaders map[string][]string          `json:"ResponseHeaders"`
	TestResults     []httpclient.AssertionResult `json:"TestResults"`
	ConsoleLogs     []string                     `json:"ConsoleLogs"`
	ScriptErrors    []string                     `json:"ScriptErrors"`
}

// RunCollection executes the specified requests sequentially, emitting a
// "runner:result" Wails event after each one. delayMs milliseconds are
// inserted between requests (but not after the last one). The run can be
// cancelled at any time via CancelRun; accumulated results are returned
// even when cancelled.
func (a *App) RunCollection(collectionID string, requestIDs []string, delayMs int) ([]RunResult, error) {
	// Build a cancellable context for this run.
	ctx, cancel := context.WithCancel(a.ctx)

	// Store cancel func so CancelRun can call it.
	a.runnerMu.Lock()
	// Cancel any previously running collection.
	if a.runnerCancel != nil {
		a.runnerCancel()
	}
	a.runnerCancel = cancel
	a.runnerMu.Unlock()

	defer func() {
		a.runnerMu.Lock()
		a.runnerCancel = nil
		a.runnerMu.Unlock()
		cancel()
	}()

	// Resolve the request list: use provided IDs, or fall back to all requests
	// in the collection when none are specified.
	ids := requestIDs
	if len(ids) == 0 {
		reqs, err := db.ListRequests(collectionID)
		if err != nil {
			return nil, fmt.Errorf("RunCollection: list requests: %w", err)
		}
		for _, r := range reqs {
			ids = append(ids, r.ID)
		}
	}

	results := make([]RunResult, 0, len(ids))

	for i, reqID := range ids {
		// Honour cancellation before each request.
		select {
		case <-ctx.Done():
			return results, nil
		default:
		}

		result := a.executeForRunner(reqID)
		results = append(results, result)

		// Emit the live event so the frontend can update in real time.
		runtime.EventsEmit(a.ctx, "runner:result", result)

		// Sleep between requests — but not after the last one.
		if i < len(ids)-1 && delayMs > 0 {
			select {
			case <-ctx.Done():
				return results, nil
			case <-time.After(time.Duration(delayMs) * time.Millisecond):
			}
		}
	}

	return results, nil
}

// CancelRun cancels a running collection, if any. It is a no-op when no run
// is currently in progress.
func (a *App) CancelRun() {
	a.runnerMu.Lock()
	cancel := a.runnerCancel
	a.runnerMu.Unlock()

	if cancel != nil {
		cancel()
	}
}

// executeForRunner runs a single request and returns a RunResult.
// Mirrors SendRequest: loads vars, runs pre-script, interpolates, executes HTTP,
// runs post-script, and maps the outcome to RunResult.
func (a *App) executeForRunner(requestID string) RunResult {
	req, err := db.GetRequest(requestID)
	if err != nil {
		return RunResult{
			RequestID:    requestID,
			Error:        fmt.Sprintf("load request: %s", err.Error()),
			ConsoleLogs:  []string{},
			ScriptErrors: []string{},
		}
	}

	result := RunResult{
		RequestID:   req.ID,
		RequestName: req.Name,
	}

	// Load variables (globals + active env), same as SendRequest.
	vars := map[string]string{}
	secretsMap := make(map[string]bool)

	a.encKeyMu.RLock()
	encKey := a.encKey
	a.encKeyMu.RUnlock()

	globalID, err := db.GetGlobalEnvironmentID()
	if err == nil && globalID != "" {
		if globalVars, err := db.GetVariables(globalID, encKey); err == nil {
			for _, v := range globalVars {
				vars[v.Key] = v.Value
				if v.IsSecret {
					secretsMap[v.Key] = true
				}
			}
		}
	}

	envID, _ := db.GetSetting("active_environment_id")
	if envID != "" && envID != globalID {
		if dbVars, err := db.GetVariables(envID, encKey); err == nil {
			for _, v := range dbVars {
				vars[v.Key] = v.Value
				if v.IsSecret {
					secretsMap[v.Key] = true
				}
			}
		}
	}

	applyMutations := func(mutations map[string]string) {
		for k, v := range mutations {
			vars[k] = v
			if envID != "" {
				// Best-effort — never fail the request on a persistence error.
				_, _ = db.SetVariable(envID, k, v, false)
			}
		}
	}

	buildHeadersMap := func(headersJSON string) map[string]string {
		type kvRow struct {
			Key     string `json:"key"`
			Value   string `json:"value"`
			Enabled bool   `json:"enabled"`
		}
		var rows []kvRow
		_ = json.Unmarshal([]byte(headersJSON), &rows)
		m := make(map[string]string, len(rows))
		for _, r := range rows {
			if r.Enabled && r.Key != "" {
				m[r.Key] = r.Value
			}
		}
		return m
	}

	var consoleLogs []string
	var scriptErrors []string

	reqSnapshot := scripter.RequestSnapshot{
		URL:     req.URL,
		Method:  req.Method,
		Headers: buildHeadersMap(req.Headers),
		Body:    req.Body,
	}

	// --- Pre-script ---
	if req.PreScript != "" {
		preResult := scripter.RunPreScript(req.PreScript, scripter.ScriptContext{
			EnvVars:  vars,
			Request:  reqSnapshot,
			Response: nil,
		})
		applyMutations(preResult.EnvMutations)
		consoleLogs = append(consoleLogs, preResult.Logs...)
		scriptErrors = append(scriptErrors, preResult.Errors...)
	}

	// Interpolate (ephemeral — not persisted).
	// UsedSecretValues not needed here — runner does not write to history.
	if len(vars) > 0 {
		req.URL = Interpolate(req.URL, vars, secretsMap).Value
		req.Headers = Interpolate(req.Headers, vars, secretsMap).Value
		req.Params = Interpolate(req.Params, vars, secretsMap).Value
		req.Body = Interpolate(req.Body, vars, secretsMap).Value
		req.AuthConfig = Interpolate(req.AuthConfig, vars, secretsMap).Value
	}

	resp, err := httpclient.ExecuteRequest(req)
	if err != nil {
		result.Passed = false
		result.Error = err.Error()
		result.ConsoleLogs = consoleLogs
		result.ScriptErrors = scriptErrors
		return result
	}

	result.Status = resp.StatusCode
	result.DurationMs = resp.DurationMs
	result.ResponseBody = resp.Body
	result.ResponseHeaders = resp.Headers
	result.TestResults = resp.TestResults

	httpPassed := resp.StatusCode >= 200 && resp.StatusCode < 300
	testsPassed := true
	for _, t := range resp.TestResults {
		if !t.Passed {
			testsPassed = false
			break
		}
	}
	result.Passed = httpPassed
	result.TestsPassed = testsPassed

	// --- Post-script ---
	if req.PostScript != "" {
		respHeaders := make(map[string]string, len(resp.Headers))
		for k, vals := range resp.Headers {
			if len(vals) > 0 {
				respHeaders[k] = vals[0]
			}
		}
		respSnapshot := &scripter.ResponseSnapshot{
			Status:     resp.StatusCode,
			StatusText: resp.StatusText,
			Body:       resp.Body,
			Headers:    respHeaders,
		}
		postResult := scripter.RunPostScript(req.PostScript, scripter.ScriptContext{
			EnvVars:  vars,
			Request:  reqSnapshot,
			Response: respSnapshot,
		})
		applyMutations(postResult.EnvMutations)
		consoleLogs = append(consoleLogs, postResult.Logs...)
		scriptErrors = append(scriptErrors, postResult.Errors...)
	}

	result.ConsoleLogs = consoleLogs
	result.ScriptErrors = scriptErrors
	return result
}
