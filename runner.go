package main

import (
	"context"
	"encoding/json"
	"fmt"
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
	JumpedTo        string                       `json:"JumpedTo"`
}

// RunCollectionResult is the top-level return value of RunCollection.
type RunCollectionResult struct {
	Results       []RunResult `json:"Results"`
	TerminalState string      `json:"TerminalState"` // "completed" | "cancelled" | "stopped_by_script" | "stopped_by_loop_limit"
}

// RunCollection executes the specified requests in cursor-based order, supporting
// flow control via setNextRequest, run variables, loop detection, and per-request
// retry (retryMap is wired in issue 005; pass nil to use no retries).
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

	// Resolve the request list.
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

	// Load request names for nameToIndex (needed for setNextRequest jumps).
	nameToIndex := make(map[string]int, len(ids))
	for i, id := range ids {
		req, err := db.GetRequest(id)
		if err == nil {
			nameToIndex[req.Name] = i
		}
	}

	loopLimit := a.GetRunnerLoopLimit()
	visitCount := make(map[string]int, len(ids))
	runVars := make(map[string]string)

	// Results slice pre-allocated with zero values; filled as requests execute.
	results := make([]RunResult, len(ids))
	executed := make([]bool, len(ids))

	terminalState := "completed"
	cursor := 0

	for cursor < len(ids) {
		// Honour cancellation before each request.
		select {
		case <-ctx.Done():
			terminalState = "cancelled"
			goto done
		default:
		}

		idx := cursor

		// Retry loop: attempt the request up to 1+maxRetries times.
		maxRetries := 0
		if retryMap != nil {
			maxRetries = retryMap[ids[idx]]
		}
		retryBudget := maxRetries

		var result RunResult
		var scriptRes scripter.ScriptResult
		for {
			result, scriptRes = a.executeForRunner(ids[idx], runVars)
			// Merge run var mutations each attempt.
			for k, v := range scriptRes.RunVarMutations {
				runVars[k] = v
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

		// Determine next cursor from setNextRequest.
		nextCursor := cursor + 1 // default linear
		if scriptRes.NextRequest != nil {
			target := *scriptRes.NextRequest
			if target == "" {
				// setNextRequest(null) — stop run.
				terminalState = "stopped_by_script"
				goto done
			}
			jumpIdx, ok := nameToIndex[target]
			if !ok {
				results[idx].Error += fmt.Sprintf("; setNextRequest: request %q not found", target)
				terminalState = "stopped_by_script"
				goto done
			}
			results[idx].JumpedTo = target
			nextCursor = jumpIdx

			// Count this request visit (only on jumps, not linear advances).
			visitCount[ids[idx]]++
			if visitCount[ids[idx]] > loopLimit {
				terminalState = "stopped_by_loop_limit"
				goto done
			}
		}

		// Delay between requests.
		if nextCursor < len(ids) && delayMs > 0 {
			select {
			case <-ctx.Done():
				terminalState = "cancelled"
				goto done
			case <-time.After(time.Duration(delayMs) * time.Millisecond):
			}
		}

		cursor = nextCursor
	}

done:
	// Mark unexecuted requests as skipped.
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

// executeForRunner runs a single request and returns both the RunResult and the
// raw ScriptResult so the caller can inspect NextRequest and RunVarMutations.
func (a *App) executeForRunner(requestID string, runVars map[string]string) (RunResult, scripter.ScriptResult) {
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
		}, emptyScript
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

	var consoleLogs []string
	var scriptErrors []string
	var lastScriptResult scripter.ScriptResult

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
		})
		applyEnvMutations(preResult.EnvMutations)
		consoleLogs = append(consoleLogs, preResult.Logs...)
		scriptErrors = append(scriptErrors, preResult.Errors...)
		lastScriptResult = preResult
		// Pre-script can also call setNextRequest to skip the request entirely.
		if preResult.NextRequest != nil {
			result.ConsoleLogs = consoleLogs
			result.ScriptErrors = scriptErrors
			return result, preResult
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
		return result, lastScriptResult
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
		})
		applyEnvMutations(postResult.EnvMutations)
		consoleLogs = append(consoleLogs, postResult.Logs...)
		scriptErrors = append(scriptErrors, postResult.Errors...)
		lastScriptResult = postResult
	}

	result.ConsoleLogs = consoleLogs
	result.ScriptErrors = scriptErrors
	return result, lastScriptResult
}
