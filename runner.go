package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

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
	RetryCount      int                          `json:"RetryCount"`
	SkippedByFlow   bool                         `json:"SkippedByFlow"`
}

// RunCollectionResult is the top-level return value of RunCollection.
type RunCollectionResult struct {
	Results       []RunResult `json:"Results"`
	TerminalState string      `json:"TerminalState"` // "completed" | "cancelled" | "stopped_by_script"
}

// RunCollection executes the specified requests in order, supporting run variables,
// per-request retry, stopRunner() halting, and doRequest() sub-execution.
func (a *App) RunCollection(collectionID string, requestIDs []string, delayMs int, retryMap map[string]int) (RunCollectionResult, error) {
	ctx, cancel := context.WithCancel(a.ctx)

	a.runnerMu.Lock()
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

	ids := requestIDs
	if len(ids) == 0 {
		reqs, err := db.ListRequests(collectionID)
		if err != nil {
			return RunCollectionResult{}, fmt.Errorf("RunCollection: list requests: %w", err)
		}
		for _, r := range reqs {
			ids = append(ids, r.ID)
		}
	}

	runVars := make(map[string]string)
	results := make([]RunResult, len(ids))
	executed := make([]bool, len(ids))
	terminalState := "completed"

	for cursor := 0; cursor < len(ids); cursor++ {
		select {
		case <-ctx.Done():
			terminalState = "cancelled"
			goto done
		default:
		}

		idx := cursor
		maxRetries := 0
		if retryMap != nil {
			maxRetries = retryMap[ids[idx]]
		}
		retryBudget := maxRetries

		var result RunResult
		var scriptRes scripter.ScriptResult
		var stop bool
		for {
			result, scriptRes, stop = a.executeForRunner(ids[idx], runVars, 0)
			for k, v := range scriptRes.RunVarMutations {
				runVars[k] = v
			}
			if stop {
				break
			}
			failed := !result.Passed || !result.TestsPassed
			if !failed || retryBudget == 0 {
				break
			}
			retryBudget--
		}
		result.RetryCount = maxRetries - retryBudget

		executed[idx] = true
		results[idx] = result
		a.emit("runner:result", result)

		if stop {
			terminalState = "stopped_by_script"
			goto done
		}

		if cursor+1 < len(ids) && delayMs > 0 {
			select {
			case <-ctx.Done():
				terminalState = "cancelled"
				goto done
			case <-time.After(time.Duration(delayMs) * time.Millisecond):
			}
		}
	}

done:
	for i := range ids {
		if !executed[i] {
			req, _ := db.GetRequest(ids[i])
			name := ids[i]
			if req.ID != "" {
				name = req.Name
			}
			results[i] = RunResult{
				RequestID:     ids[i],
				RequestName:   name,
				SkippedByFlow: true,
				ConsoleLogs:   []string{},
				ScriptErrors:  []string{},
			}
		}
	}

	return RunCollectionResult{
		Results:       results,
		TerminalState: terminalState,
	}, nil
}

// CancelRun cancels a running collection, if any.
func (a *App) CancelRun() {
	a.runnerMu.Lock()
	cancel := a.runnerCancel
	a.runnerMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// executeForRunner runs a single request and returns the RunResult, the last
// ScriptResult (for RunVarMutations), and whether stopRunner() was called.
func (a *App) executeForRunner(requestID string, runVars map[string]string, depth int) (RunResult, scripter.ScriptResult, bool) {
	emptyScript := scripter.ScriptResult{
		RunVarMutations: map[string]string{},
		Logs:            []string{},
		Errors:          []string{},
	}

	req, err := db.GetRequest(requestID)
	if err != nil {
		return RunResult{
			RequestID:    requestID,
			Error:        fmt.Sprintf("load request: %s", err.Error()),
			ConsoleLogs:  []string{},
			ScriptErrors: []string{},
		}, emptyScript, false
	}

	result := RunResult{
		RequestID:   req.ID,
		RequestName: req.Name,
	}

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

	applyEnvMutations := func(mutations map[string]string) {
		for k, v := range mutations {
			vars[k] = v
			if envID != "" {
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

	// Build executor for doRequest calls from within scripts.
	executor := func(path string, subDepth int) (scripter.ResponseSnapshot, error) {
		subReqID, err := db.ResolveRequestByPath(path)
		if err != nil {
			return scripter.ResponseSnapshot{}, err
		}
		subResult, _, _ := a.executeForRunner(subReqID, runVars, subDepth)
		if len(subResult.ScriptErrors) > 0 {
			return scripter.ResponseSnapshot{}, fmt.Errorf("doRequest sub-execution script errors: %s", strings.Join(subResult.ScriptErrors, "; "))
		}
		if subResult.Status == 0 && subResult.Error != "" {
			return scripter.ResponseSnapshot{}, fmt.Errorf("%s", subResult.Error)
		}
		prefixedLogs := make([]string, len(subResult.ConsoleLogs))
		for i, l := range subResult.ConsoleLogs {
			prefixedLogs[i] = "[" + path + "] " + l
		}
		resp := scripter.ResponseSnapshot{
			Status:     subResult.Status,
			StatusText: http.StatusText(subResult.Status),
			Body:       subResult.ResponseBody,
			Logs:       prefixedLogs,
		}
		if subResult.ResponseHeaders != nil {
			resp.Headers = make(map[string]string, len(subResult.ResponseHeaders))
			for k, vals := range subResult.ResponseHeaders {
				if len(vals) > 0 {
					resp.Headers[k] = vals[0]
				}
			}
		}
		return resp, nil
	}

	var consoleLogs []string
	var scriptErrors []string
	var lastScriptResult scripter.ScriptResult
	var stopRunner bool

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
			RunVars:  runVars,
			Request:  reqSnapshot,
			Response: nil,
		}, executor, depth)
		applyEnvMutations(preResult.EnvMutations)
		consoleLogs = append(consoleLogs, preResult.Logs...)
		scriptErrors = append(scriptErrors, preResult.Errors...)
		lastScriptResult = preResult
		if preResult.StopRunner {
			stopRunner = true
		}
	}

	// Interpolate — env vars first, then run vars for {{run.*}} tokens.
	req.URL = Interpolate(req.URL, vars, secretsMap, runVars).Value
	req.Headers = Interpolate(req.Headers, vars, secretsMap, runVars).Value
	req.Params = Interpolate(req.Params, vars, secretsMap, runVars).Value
	req.Body = Interpolate(req.Body, vars, secretsMap, runVars).Value
	req.AuthConfig = Interpolate(req.AuthConfig, vars, secretsMap, runVars).Value

	resp, err := httpclient.ExecuteRequest(req)
	if err != nil {
		result.Passed = false
		result.Error = err.Error()
		result.ConsoleLogs = consoleLogs
		result.ScriptErrors = scriptErrors
		return result, lastScriptResult, stopRunner
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
			RunVars:  runVars,
			Request:  reqSnapshot,
			Response: respSnapshot,
		}, executor, depth)
		applyEnvMutations(postResult.EnvMutations)
		consoleLogs = append(consoleLogs, postResult.Logs...)
		scriptErrors = append(scriptErrors, postResult.Errors...)
		lastScriptResult = postResult
		if postResult.StopRunner {
			stopRunner = true
		}
	}

	result.ConsoleLogs = consoleLogs
	result.ScriptErrors = scriptErrors
	return result, lastScriptResult, stopRunner
}
