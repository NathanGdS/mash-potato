package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"mash-potato/db"
	"mash-potato/encryption"
	"mash-potato/httpclient"
	"mash-potato/scripter"
)

// App holds application state and exposes Wails-bound methods.
type App struct {
	ctx context.Context

	// encKey is the 32-byte AES-256 key used for variable encryption/decryption.
	// Initialized once in startup via encryption.GetOrCreateKey().
	// All reads must hold encKeyMu.RLock(); writes must hold encKeyMu.Lock().
	encKey   []byte
	encKeyMu sync.RWMutex

	// runner fields — protected by runnerMu.
	runnerMu     sync.Mutex
	runnerCancel context.CancelFunc
}

// newApp creates an App instance.
func newApp() *App {
	return &App{}
}

// startup is called by Wails when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	key, err := encryption.GetOrCreateKey()
	if err != nil {
		// Non-fatal: log the downgrade warning but continue. The key returned
		// may be a deterministic fallback rather than the secure keychain key.
		log.Printf("WARN: encryption key degraded: %v", err)
	}
	a.encKeyMu.Lock()
	a.encKey = key
	a.encKeyMu.Unlock()
}

// CreateCollection validates the name, generates a UUID, persists to SQLite,
// and returns the new collection.
func (a *App) CreateCollection(name string) (db.Collection, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return db.Collection{}, fmt.Errorf("collection name cannot be empty")
	}

	id := uuid.New().String()
	col, err := db.InsertCollection(id, name)
	if err != nil {
		return db.Collection{}, fmt.Errorf("CreateCollection: %w", err)
	}
	return col, nil
}

// RenameCollection validates the new name and updates the collection in SQLite.
func (a *App) RenameCollection(id string, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("collection name cannot be empty")
	}
	if err := db.UpdateCollection(id, name); err != nil {
		return fmt.Errorf("RenameCollection: %w", err)
	}
	return nil
}

// DeleteCollection removes a collection and all its child requests from SQLite.
func (a *App) DeleteCollection(id string) error {
	if err := db.DeleteCollection(id); err != nil {
		return fmt.Errorf("DeleteCollection: %w", err)
	}
	return nil
}

// ListCollections returns all stored collections.
func (a *App) ListCollections() ([]db.Collection, error) {
	cols, err := db.ListCollections()
	if err != nil {
		return nil, fmt.Errorf("ListCollections: %w", err)
	}
	// Return empty slice (not nil) so JSON encodes as []
	if cols == nil {
		return []db.Collection{}, nil
	}
	return cols, nil
}

// CreateRequest validates the name, generates a UUID, persists to SQLite,
// and returns the new request with default values.
func (a *App) CreateRequest(collectionID string, name string) (db.Request, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return db.Request{}, fmt.Errorf("request name cannot be empty")
	}
	if strings.TrimSpace(collectionID) == "" {
		return db.Request{}, fmt.Errorf("collection id cannot be empty")
	}
	id := uuid.New().String()
	req, err := db.InsertRequest(id, collectionID, name)
	if err != nil {
		return db.Request{}, fmt.Errorf("CreateRequest: %w", err)
	}
	return req, nil
}

// ListRequests returns all requests belonging to the given collection.
func (a *App) ListRequests(collectionID string) ([]db.Request, error) {
	reqs, err := db.ListRequests(collectionID)
	if err != nil {
		return nil, fmt.Errorf("ListRequests: %w", err)
	}
	if reqs == nil {
		return []db.Request{}, nil
	}
	return reqs, nil
}

// ReorderRequests updates sort_order for requests in a folder (or root level).
func (a *App) ReorderRequests(folderID string, requestIDs []string) error {
	if err := db.ReorderRequests(folderID, requestIDs); err != nil {
		return fmt.Errorf("ReorderRequests: %w", err)
	}
	return nil
}

// GetRequest returns a single request by ID.
func (a *App) GetRequest(id string) (db.Request, error) {
	if strings.TrimSpace(id) == "" {
		return db.Request{}, fmt.Errorf("request id cannot be empty")
	}
	req, err := db.GetRequest(id)
	if err != nil {
		return db.Request{}, fmt.Errorf("GetRequest: %w", err)
	}
	return req, nil
}

// RequestPayload carries all mutable request fields for UpdateRequest.
type RequestPayload struct {
	ID         string `json:"id"`
	Method     string `json:"method"`
	URL        string `json:"url"`
	Headers    string `json:"headers"`
	Params     string `json:"params"`
	BodyType       string `json:"body_type"`
	Body           string `json:"body"`
	AuthType       string `json:"auth_type"`
	AuthConfig     string `json:"auth_config"`
	TimeoutSeconds int    `json:"timeout_seconds"`
	Tests          string `json:"tests"`
	PreScript      string `json:"pre_script"`
	PostScript     string `json:"post_script"`
}

// SendRequest fetches the request from SQLite by id, executes it via net/http,
// and returns a ResponseResult with status, body, headers, duration, and size.
// Pre-script runs before interpolation; post-script runs after the HTTP call.
// Script errors are non-fatal — the request proceeds regardless.
// Interpolation is ephemeral — resolved values are never written back to the DB.
func (a *App) SendRequest(id string) (httpclient.ResponseResult, error) {
	if strings.TrimSpace(id) == "" {
		return httpclient.ResponseResult{}, fmt.Errorf("request id cannot be empty")
	}
	req, err := db.GetRequest(id)
	if err != nil {
		return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: load request: %w", err)
	}

	// Build the interpolation vars map: globals first, then active env on top.
	vars := map[string]string{}

	a.encKeyMu.RLock()
	encKey := a.encKey
	a.encKeyMu.RUnlock()

	secretsMap := make(map[string]bool)

	// 1. Load global variables (always active).
	globalID, err := db.GetGlobalEnvironmentID()
	if err == nil && globalID != "" {
		globalVars, err := db.GetVariables(globalID, encKey)
		if err != nil {
			return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: get global variables: %w", err)
		}
		for _, v := range globalVars {
			vars[v.Key] = v.Value
			if v.IsSecret {
				secretsMap[v.Key] = true
			}
		}
	}

	// 2. Load active environment variables, overriding globals with same key.
	envID, err := db.GetSetting("active_environment_id")
	if err != nil {
		return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: get active environment: %w", err)
	}
	if envID != "" && envID != globalID {
		dbVars, err := db.GetVariables(envID, encKey)
		if err != nil {
			return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: get variables: %w", err)
		}
		for _, v := range dbVars {
			vars[v.Key] = v.Value
			if v.IsSecret {
				secretsMap[v.Key] = true
			}
		}
	}

	// Accumulators for script output across pre and post execution.
	var consoleLogs []string
	var scriptErrors []string

	// applyMutations writes env mutations into the in-memory vars map and
	// persists them to SQLite when an active environment is available.
	applyMutations := func(mutations map[string]string) {
		for k, v := range mutations {
			vars[k] = v
			if envID != "" {
				// Best-effort â never fail the request on a persistence error.
				_, _ = db.SetVariable(envID, k, v, false)
			}
		}
	}

	// Build a flat headers map from the JSON KV array for the script snapshot.
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
		// NOTE: secretsMap is not updated after applyMutations. If a pre-script
		// writes a new key that corresponds to a secret variable in the DB, that
		// value will not be tracked in UsedSecretValues and may appear unredacted
		// in history. Fixing this requires a DB lookup per mutated key — deferred.
		applyMutations(preResult.EnvMutations)
		consoleLogs = append(consoleLogs, preResult.Logs...)
		scriptErrors = append(scriptErrors, preResult.Errors...)
	}

	// Apply interpolation to all text fields (ephemeral — not saved to DB).
	// secretsMap carries the set of variable names whose values must be
	// tracked for history redaction. UsedSecretValues from all fields are
	// aggregated into allSecretValues.
	//
	// Safe to skip interpolation when vars is empty: an empty variable map
	// cannot produce any resolved secret values, so allSecretValues stays nil
	// and the redaction loop below is a no-op.
	var allSecretValues []string
	if len(vars) > 0 {
		urlR := Interpolate(req.URL, vars, secretsMap)
		headersR := Interpolate(req.Headers, vars, secretsMap)
		paramsR := Interpolate(req.Params, vars, secretsMap)
		bodyR := Interpolate(req.Body, vars, secretsMap)
		authR := Interpolate(req.AuthConfig, vars, secretsMap)

		req.URL = urlR.Value
		req.Headers = headersR.Value
		req.Params = paramsR.Value
		req.Body = bodyR.Value
		req.AuthConfig = authR.Value

		allSecretValues = append(allSecretValues, urlR.UsedSecretValues...)
		allSecretValues = append(allSecretValues, headersR.UsedSecretValues...)
		allSecretValues = append(allSecretValues, paramsR.UsedSecretValues...)
		allSecretValues = append(allSecretValues, bodyR.UsedSecretValues...)
		allSecretValues = append(allSecretValues, authR.UsedSecretValues...)
	}

	result, err := httpclient.ExecuteRequest(req)
	if err != nil {
		return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: %w", err)
	}

	// --- Post-script ---
	if req.PostScript != "" {
		// Flatten response headers to map[string]string (first value per key).
		respHeaders := make(map[string]string, len(result.Headers))
		for k, vals := range result.Headers {
			if len(vals) > 0 {
				respHeaders[k] = vals[0]
			}
		}
		respSnapshot := &scripter.ResponseSnapshot{
			Status:     result.StatusCode,
			StatusText: result.StatusText,
			Body:       result.Body,
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

	// Attach script output to the result.
	if consoleLogs == nil {
		consoleLogs = []string{}
	}
	if scriptErrors == nil {
		scriptErrors = []string{}
	}
	result.ConsoleLogs = consoleLogs
	result.ScriptErrors = scriptErrors

	// Log to history — best-effort, never fail the response on write error.
	// Secret values are redacted in the history copy; the result returned to
	// the frontend is never redacted.
	//
	// Response headers are redacted before JSON serialisation so that secrets
	// that appear in response header values are not stored in cleartext.
	histURL := httpclient.RedactSecretValues(req.URL, allSecretValues, false)
	histHeaders := httpclient.RedactSecretValues(req.Headers, allSecretValues, false)
	histParams := httpclient.RedactSecretValues(req.Params, allSecretValues, false)
	histBody := httpclient.RedactSecretValues(req.Body, allSecretValues, req.BodyType == "json")
	responseContentType := ""
	if ctVals := result.Headers["Content-Type"]; len(ctVals) > 0 {
		responseContentType = ctVals[0]
	}
	isResponseJSON := strings.Contains(responseContentType, "application/json")
	histResponseBody := httpclient.RedactSecretValues(result.Body, allSecretValues, isResponseJSON)

	// Build a redacted copy of response headers before marshalling to JSON.
	histResponseHeaders := make(map[string][]string, len(result.Headers))
	for k, vals := range result.Headers {
		redacted := make([]string, len(vals))
		for i, v := range vals {
			redacted[i] = httpclient.RedactSecretValues(v, allSecretValues, false)
		}
		histResponseHeaders[k] = redacted
	}
	responseHeadersJSON, _ := json.Marshal(histResponseHeaders)

	if _, herr := db.InsertHistory(req.Method, histURL, histHeaders, histParams, req.BodyType, histBody, result.StatusCode, histResponseBody, string(responseHeadersJSON), result.DurationMs, result.SizeBytes, result.Timing); herr != nil {
		// Silently ignore history write failures.
		_ = herr
	}

	return result, nil
}

// GetHistory returns the last 100 history entries, newest first.
func (a *App) GetHistory() ([]db.HistoryEntry, error) {
	entries, err := db.ListHistory(100)
	if err != nil {
		return nil, fmt.Errorf("GetHistory: %w", err)
	}
	if entries == nil {
		return []db.HistoryEntry{}, nil
	}
	return entries, nil
}

// ClearHistory removes all request history entries.
func (a *App) ClearHistory() error {
	if err := db.ClearHistory(); err != nil {
		return fmt.Errorf("ClearHistory: %w", err)
	}
	return nil
}

// CreateEnvironment validates the name, generates a UUID, persists to SQLite,
// and returns the new environment.
func (a *App) CreateEnvironment(name string) (db.Environment, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return db.Environment{}, fmt.Errorf("environment name cannot be empty")
	}
	id := uuid.New().String()
	env, err := db.InsertEnvironment(id, name)
	if err != nil {
		return db.Environment{}, fmt.Errorf("CreateEnvironment: %w", err)
	}
	return env, nil
}

// ListEnvironments returns all stored environments.
func (a *App) ListEnvironments() ([]db.Environment, error) {
	envs, err := db.ListEnvironments()
	if err != nil {
		return nil, fmt.Errorf("ListEnvironments: %w", err)
	}
	if envs == nil {
		return []db.Environment{}, nil
	}
	return envs, nil
}

// RenameEnvironment validates the new name and updates the environment in SQLite.
// The built-in Global environment cannot be renamed.
func (a *App) RenameEnvironment(id string, name string) error {
	globalID, _ := db.GetGlobalEnvironmentID()
	if id == globalID {
		return fmt.Errorf("cannot rename the built-in Global environment")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("environment name cannot be empty")
	}
	if err := db.UpdateEnvironment(id, name); err != nil {
		return fmt.Errorf("RenameEnvironment: %w", err)
	}
	return nil
}

// DeleteEnvironment removes an environment from SQLite.
func (a *App) DeleteEnvironment(id string) error {
	if err := db.DeleteEnvironment(id); err != nil {
		return fmt.Errorf("DeleteEnvironment: %w", err)
	}
	return nil
}

// GetGlobalEnvironmentID returns the ID of the built-in global environment.
func (a *App) GetGlobalEnvironmentID() (string, error) {
	id, err := db.GetGlobalEnvironmentID()
	if err != nil {
		return "", fmt.Errorf("GetGlobalEnvironmentID: %w", err)
	}
	return id, nil
}

// GetActiveEnvironment returns the ID of the currently active environment.
// Returns an empty string when no environment is selected.
func (a *App) GetActiveEnvironment() (string, error) {
	id, err := db.GetSetting("active_environment_id")
	if err != nil {
		return "", fmt.Errorf("GetActiveEnvironment: %w", err)
	}
	return id, nil
}

// SetActiveEnvironment persists the active environment ID.
// Pass an empty string to clear the selection (no active environment).
func (a *App) SetActiveEnvironment(id string) error {
	if err := db.SetSetting("active_environment_id", id); err != nil {
		return fmt.Errorf("SetActiveEnvironment: %w", err)
	}
	return nil
}

// SetVariable upserts a key-value variable for the given environment and returns it.
func (a *App) SetVariable(environmentID string, key string, value string, isSecret bool) (db.EnvironmentVariable, error) {
	if strings.TrimSpace(environmentID) == "" {
		return db.EnvironmentVariable{}, fmt.Errorf("environment id cannot be empty")
	}
	if strings.TrimSpace(key) == "" {
		return db.EnvironmentVariable{}, fmt.Errorf("variable key cannot be empty")
	}
	v, err := db.SetVariable(environmentID, key, value, isSecret)
	if err != nil {
		return db.EnvironmentVariable{}, fmt.Errorf("SetVariable: %w", err)
	}
	return v, nil
}

// GetVariables returns all variables for the given environment.
func (a *App) GetVariables(environmentID string) ([]db.EnvironmentVariable, error) {
	a.encKeyMu.RLock()
	encKey := a.encKey
	a.encKeyMu.RUnlock()
	vars, err := db.GetVariables(environmentID, encKey)
	if err != nil {
		return nil, fmt.Errorf("GetVariables: %w", err)
	}
	if vars == nil {
		return []db.EnvironmentVariable{}, nil
	}
	return vars, nil
}

// DeleteVariable removes a variable by its integer id.
func (a *App) DeleteVariable(id int64) error {
	if err := db.DeleteVariable(id); err != nil {
		return fmt.Errorf("DeleteVariable: %w", err)
	}
	return nil
}

// DeleteRequest removes a request from SQLite by id.
func (a *App) DeleteRequest(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("request id cannot be empty")
	}
	if err := db.DeleteRequest(id); err != nil {
		return fmt.Errorf("DeleteRequest: %w", err)
	}
	return nil
}

// CreateFolder validates the name, generates a UUID, persists to SQLite, and returns the new folder.
// Pass parentFolderID = "" to create a root-level folder inside the collection.
func (a *App) CreateFolder(collectionID string, parentFolderID string, name string) (db.Folder, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return db.Folder{}, fmt.Errorf("folder name cannot be empty")
	}
	if strings.TrimSpace(collectionID) == "" {
		return db.Folder{}, fmt.Errorf("collection id cannot be empty")
	}
	id := uuid.New().String()
	folder, err := db.InsertFolder(id, collectionID, parentFolderID, name)
	if err != nil {
		return db.Folder{}, fmt.Errorf("CreateFolder: %w", err)
	}
	return folder, nil
}

// RenameFolder validates the new name and updates the folder in SQLite.
func (a *App) RenameFolder(id string, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("folder name cannot be empty")
	}
	if err := db.RenameFolder(id, name); err != nil {
		return fmt.Errorf("RenameFolder: %w", err)
	}
	return nil
}

// DeleteFolder removes a folder from SQLite. Requests inside the folder are
// moved to root level (no folder). Child folders are deleted recursively.
func (a *App) DeleteFolder(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("folder id cannot be empty")
	}
	if err := db.DeleteFolder(id); err != nil {
		return fmt.Errorf("DeleteFolder: %w", err)
	}
	return nil
}

// ListFolders returns all folders for the given collection.
func (a *App) ListFolders(collectionID string) ([]db.Folder, error) {
	folders, err := db.ListFolders(collectionID)
	if err != nil {
		return nil, fmt.Errorf("ListFolders: %w", err)
	}
	if folders == nil {
		return []db.Folder{}, nil
	}
	return folders, nil
}

// CreateRequestInFolder creates a new request inside the given folder.
// Pass folderID = "" to create a root-level request (same as CreateRequest).
func (a *App) CreateRequestInFolder(collectionID string, folderID string, name string) (db.Request, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return db.Request{}, fmt.Errorf("request name cannot be empty")
	}
	if strings.TrimSpace(collectionID) == "" {
		return db.Request{}, fmt.Errorf("collection id cannot be empty")
	}
	id := uuid.New().String()
	req, err := db.InsertRequestInFolder(id, collectionID, folderID, name)
	if err != nil {
		return db.Request{}, fmt.Errorf("CreateRequestInFolder: %w", err)
	}
	return req, nil
}

// GetSetting returns the value for a settings key.
// Returns an empty string when the key has not been set yet.
func (a *App) GetSetting(key string) (string, error) {
	if strings.TrimSpace(key) == "" {
		return "", fmt.Errorf("setting key cannot be empty")
	}
	value, err := db.GetSetting(key)
	if err != nil {
		return "", fmt.Errorf("GetSetting: %w", err)
	}
	return value, nil
}

// SetSetting upserts a key/value pair in the settings table.
func (a *App) SetSetting(key string, value string) error {
	if strings.TrimSpace(key) == "" {
		return fmt.Errorf("setting key cannot be empty")
	}
	if err := db.SetSetting(key, value); err != nil {
		return fmt.Errorf("SetSetting: %w", err)
	}
	return nil
}

// MoveRequest changes the folder a request belongs to.
// Pass folderID = "" to move the request to root level.
func (a *App) MoveRequest(requestID string, folderID string) error {
	if strings.TrimSpace(requestID) == "" {
		return fmt.Errorf("request id cannot be empty")
	}
	if err := db.MoveRequest(requestID, folderID); err != nil {
		return fmt.Errorf("MoveRequest: %w", err)
	}
	return nil
}

// MoveRequestToCollection moves a request to a different collection.
// Pass folderID = "" to place at root level of the target collection.
func (a *App) MoveRequestToCollection(requestID, targetCollectionID, targetFolderID string) error {
	if strings.TrimSpace(requestID) == "" {
		return fmt.Errorf("request id cannot be empty")
	}
	if strings.TrimSpace(targetCollectionID) == "" {
		return fmt.Errorf("target collection id cannot be empty")
	}
	if err := db.MoveRequestToCollection(requestID, targetCollectionID, targetFolderID); err != nil {
		return fmt.Errorf("MoveRequestToCollection: %w", err)
	}
	return nil
}

// SearchRequests returns up to 50 requests whose name, URL, or collection name
// contains the query string (case-insensitive). An empty query returns an empty slice.
func (a *App) SearchRequests(query string) ([]db.SearchResult, error) {
	results, err := db.SearchRequests(query)
	if err != nil {
		return nil, fmt.Errorf("SearchRequests: %w", err)
	}
	return results, nil
}

// SearchRequestsWithBody returns up to 50 requests whose name, URL, collection name,
// or body contains the query string (case-insensitive). Bodies larger than 50 KB are
// skipped silently. An empty query returns an empty slice.
func (a *App) SearchRequestsWithBody(query string) ([]db.SearchResult, error) {
	results, err := db.SearchRequestsWithBody(query)
	if err != nil {
		return nil, fmt.Errorf("SearchRequestsWithBody: %w", err)
	}
	return results, nil
}

// DuplicateRequest creates a copy of the request with " (copy)" appended to the name.
// The duplicate is placed in the same collection as the original and returned.
func (a *App) DuplicateRequest(requestID string) (db.Request, error) {
	if strings.TrimSpace(requestID) == "" {
		return db.Request{}, fmt.Errorf("request id cannot be empty")
	}
	newID := uuid.New().String()
	req, err := db.DuplicateRequest(requestID, newID)
	if err != nil {
		return db.Request{}, fmt.Errorf("DuplicateRequest: %w", err)
	}
	return req, nil
}

// RenameRequest validates the new name and updates the request in SQLite.
func (a *App) RenameRequest(id string, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("request name cannot be empty")
	}
	if err := db.RenameRequest(id, name); err != nil {
		return fmt.Errorf("RenameRequest: %w", err)
	}
	return nil
}

// UpdateRequest persists all mutable fields of a request to SQLite.
func (a *App) UpdateRequest(payload RequestPayload) error {
	if strings.TrimSpace(payload.ID) == "" {
		return fmt.Errorf("request id cannot be empty")
	}
	authType := payload.AuthType
	if authType == "" {
		authType = "none"
	}
	authConfig := payload.AuthConfig
	if authConfig == "" {
		authConfig = "{}"
	}
	if err := db.UpdateRequest(
		payload.ID,
		payload.Method,
		payload.URL,
		payload.Headers,
		payload.Params,
		payload.BodyType,
		payload.Body,
		authType,
		authConfig,
		payload.TimeoutSeconds,
		payload.Tests,
		payload.PreScript,
		payload.PostScript,
	); err != nil {
		return fmt.Errorf("UpdateRequest: %w", err)
	}
	return nil
}

// collectionExport is the JSON envelope written to/read from disk by
// ExportCollection and ImportCollection.
type collectionExport struct {
	Version    string        `json:"version"`
	Collection db.Collection `json:"collection"`
	Requests   []db.Request  `json:"requests"`
}

// ImportCollection opens a native Open File dialog, reads a collection JSON
// file previously exported by ExportCollection, and inserts the collection
// and all its requests into SQLite.  Duplicate names are allowed — the
// imported collection keeps its original name with a new UUID.
// Returns the newly created collection so the frontend can refresh the sidebar.
func (a *App) ImportCollection() (db.Collection, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import Collection",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return db.Collection{}, fmt.Errorf("ImportCollection: dialog error: %w", err)
	}
	// User cancelled the dialog.
	if filePath == "" {
		return db.Collection{}, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return db.Collection{}, fmt.Errorf("ImportCollection: read file: %w", err)
	}

	var payload collectionExport
	if err := json.Unmarshal(data, &payload); err != nil {
		return db.Collection{}, fmt.Errorf("ImportCollection: parse JSON: %w", err)
	}
	if payload.Version == "" {
		return db.Collection{}, fmt.Errorf("ImportCollection: invalid file — missing version field")
	}

	// Create a fresh collection with a new UUID so it never conflicts.
	newColID := uuid.New().String()
	col, err := db.InsertCollection(newColID, payload.Collection.Name)
	if err != nil {
		return db.Collection{}, fmt.Errorf("ImportCollection: insert collection: %w", err)
	}

	for _, r := range payload.Requests {
		newReqID := uuid.New().String()
		folderID := ""
		if r.FolderID != nil {
			folderID = *r.FolderID
		}
		imported, err := db.InsertRequestInFolder(newReqID, newColID, folderID, r.Name)
		if err != nil {
			return db.Collection{}, fmt.Errorf("ImportCollection: insert request %q: %w", r.Name, err)
		}
		// Overwrite the default fields with the exported values.
		authType := r.AuthType
		if authType == "" {
			authType = "none"
		}
		authConfig := r.AuthConfig
		if authConfig == "" {
			authConfig = "{}"
		}
		if err := db.UpdateRequest(
			imported.ID,
			r.Method,
			r.URL,
			r.Headers,
			r.Params,
			r.BodyType,
			r.Body,
			authType,
			authConfig,
			r.TimeoutSeconds,
			r.Tests,
			r.PreScript,
			r.PostScript,
		); err != nil {
			return db.Collection{}, fmt.Errorf("ImportCollection: update request %q: %w", r.Name, err)
		}
	}

	return col, nil
}

// ExportCollection opens a native Save File dialog and writes the collection
// and all its requests as a JSON file to the chosen path.
func (a *App) ExportCollection(collectionID string) error {
	if strings.TrimSpace(collectionID) == "" {
		return fmt.Errorf("collection id cannot be empty")
	}

	col, err := db.GetCollection(collectionID)
	if err != nil {
		return fmt.Errorf("ExportCollection: load collection: %w", err)
	}

	reqs, err := db.ListRequests(collectionID)
	if err != nil {
		return fmt.Errorf("ExportCollection: load requests: %w", err)
	}
	if reqs == nil {
		reqs = []db.Request{}
	}

	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Collection",
		DefaultFilename: col.Name + ".json",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return fmt.Errorf("ExportCollection: dialog error: %w", err)
	}
	// User cancelled the dialog.
	if filePath == "" {
		return nil
	}

	payload := collectionExport{
		Version:    "1.0",
		Collection: col,
		Requests:   reqs,
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("ExportCollection: marshal: %w", err)
	}
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("ExportCollection: write file: %w", err)
	}
	return nil
}

// SetSecretVariable encrypts value with the application key and upserts it as a
// secret variable for the given environment. The raw plaintext is never written
// to any log output.
// Note: envId is a string UUID — the spec originally referenced int64 but the
// entire codebase uses string IDs for environments.
func (a *App) SetSecretVariable(envId string, key, value string) error {
	if strings.TrimSpace(envId) == "" {
		return fmt.Errorf("SetSecretVariable: environment id cannot be empty")
	}
	if strings.TrimSpace(key) == "" {
		return fmt.Errorf("SetSecretVariable: variable key cannot be empty")
	}
	a.encKeyMu.RLock()
	encKey := a.encKey
	a.encKeyMu.RUnlock()
	encrypted, err := encryption.EncryptValue(value, encKey)
	if err != nil {
		return fmt.Errorf("SetSecretVariable: encrypt: %w", err)
	}
	if _, err := db.SetVariable(envId, key, encrypted, true); err != nil {
		return fmt.Errorf("SetSecretVariable: %w", err)
	}
	return nil
}

// GetDecryptedVariable fetches the single variable row identified by (envId, key),
// decrypts it inline if it carries an "enc:" prefix, and returns the plaintext.
// The plaintext is never written to any log output.
// Note: envId is a string UUID — the spec originally referenced int64 but the
// entire codebase uses string IDs for environments.
func (a *App) GetDecryptedVariable(envId string, key string) (string, error) {
	if strings.TrimSpace(envId) == "" {
		return "", fmt.Errorf("GetDecryptedVariable: environment id cannot be empty")
	}
	if strings.TrimSpace(key) == "" {
		return "", fmt.Errorf("GetDecryptedVariable: variable key cannot be empty")
	}

	v, err := db.GetVariableByKey(envId, key)
	if err != nil {
		return "", fmt.Errorf("GetDecryptedVariable: %w", err)
	}

	// Inline decryption: transparently decrypt enc:-prefixed values.
	if strings.HasPrefix(v.Value, "enc:") {
		a.encKeyMu.RLock()
		encKey := a.encKey
		a.encKeyMu.RUnlock()
		plain, decErr := encryption.DecryptValue(v.Value, encKey)
		if decErr != nil {
			return "", fmt.Errorf("GetDecryptedVariable: decryption failed for variable %q — the stored ciphertext could not be decrypted with the current key", key)
		}
		return plain, nil
	}

	return v.Value, nil
}

// ToggleVariableSecret changes the secret flag and storage format for the
// variable identified by varId.
//
//   - isSecret=true:  decrypts the current value (if already enc:-prefixed) and
//     re-encrypts it, setting is_secret=1.
//   - isSecret=false: decrypts the current value and stores it in plaintext,
//     setting is_secret=0.
//
// The enc: prefix is always treated as the authoritative indicator that the
// stored value is ciphertext, regardless of the current is_secret flag.
// The plaintext is never written to any log output.
func (a *App) ToggleVariableSecret(varId int64, isSecret bool) error {
	raw, err := db.GetVariableRaw(varId)
	if err != nil {
		return fmt.Errorf("ToggleVariableSecret: fetch: %w", err)
	}

	a.encKeyMu.RLock()
	encKey := a.encKey
	a.encKeyMu.RUnlock()

	// Determine the current plaintext value.
	plaintext := raw.Value
	if strings.HasPrefix(raw.Value, "enc:") {
		decrypted, decErr := encryption.DecryptValue(raw.Value, encKey)
		if decErr != nil {
			return fmt.Errorf("ToggleVariableSecret: decrypt existing value: decryption failed — cannot toggle a variable whose ciphertext cannot be decrypted")
		}
		plaintext = decrypted
	}

	// Encode the value in the target format.
	newValue := plaintext
	if isSecret {
		var encErr error
		newValue, encErr = encryption.EncryptValue(plaintext, encKey)
		if encErr != nil {
			return fmt.Errorf("ToggleVariableSecret: encrypt: %w", encErr)
		}
	}

	if err := db.UpdateVariableRaw(varId, newValue, isSecret); err != nil {
		return fmt.Errorf("ToggleVariableSecret: update: %w", err)
	}
	return nil
}

// PickOpenAPIFile opens a native file dialog for selecting an OpenAPI / Swagger
// spec file (.yaml, .yml, .json). Returns the selected file path, or an empty
// string if the user cancelled.
func (a *App) PickOpenAPIFile() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select OpenAPI / Swagger file",
		Filters: []runtime.FileFilter{
			{DisplayName: "OpenAPI / Swagger", Pattern: "*.yaml;*.yml;*.json"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("PickOpenAPIFile: dialog error: %w", err)
	}
	return filePath, nil
}

// ImportOpenAPISpec parses an OpenAPI 3.x or Swagger 2.0 spec at filePath,
// creates a fully structured collection with folders and requests, and returns
// a summary of what was created.
func (a *App) ImportOpenAPISpec(filePath string) (ImportResult, error) {
	if strings.TrimSpace(filePath) == "" {
		return ImportResult{}, fmt.Errorf("ImportOpenAPISpec: filePath cannot be empty")
	}
	return importOpenAPISpec(filePath)
}

// ImportOpenAPISpecWithResolution resolves an import conflict using one of
// three strategies:
//   - "merge"   — adds new folders/requests into the existing collection;
//     existing requests with the same name+folder are left unchanged.
//   - "replace" — deletes the existing collection, then creates a fresh one.
//   - "copy"    — creates a new collection named "{Title} (copy)" with no
//     collision check applied.
//
// Any other resolution value returns a descriptive error without performing writes.
func (a *App) ImportOpenAPISpecWithResolution(filePath, resolution string) (ImportResult, error) {
	if strings.TrimSpace(filePath) == "" {
		return ImportResult{}, fmt.Errorf("ImportOpenAPISpecWithResolution: filePath cannot be empty")
	}
	resolution = strings.TrimSpace(resolution)
	if resolution == "" {
		return ImportResult{}, fmt.Errorf("ImportOpenAPISpecWithResolution: resolution cannot be empty")
	}
	return importOpenAPISpecInternal(filePath, resolution)
}

// ExportCollectionAsOpenAPI serialises all requests in the given collection
// to a valid OpenAPI 3.1 YAML document string. Request history is consulted to
// enrich response schemas where available.
func (a *App) ExportCollectionAsOpenAPI(collectionID string) (string, error) {
	if strings.TrimSpace(collectionID) == "" {
		return "", fmt.Errorf("ExportCollectionAsOpenAPI: collectionID cannot be empty")
	}
	return exportCollectionAsOpenAPI(collectionID)
}

// ExportCollectionAsOpenAPIToFile generates an OpenAPI 3.1 YAML document for the
// collection, opens a native Save File dialog, and writes the result to disk.
func (a *App) ExportCollectionAsOpenAPIToFile(collectionID string) error {
	if strings.TrimSpace(collectionID) == "" {
		return fmt.Errorf("ExportCollectionAsOpenAPIToFile: collectionID cannot be empty")
	}

	col, err := db.GetCollection(collectionID)
	if err != nil {
		return fmt.Errorf("ExportCollectionAsOpenAPIToFile: load collection: %w", err)
	}

	yaml, err := exportCollectionAsOpenAPI(collectionID)
	if err != nil {
		return err
	}

	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export as OpenAPI 3.1",
		DefaultFilename: col.Name + ".yaml",
		Filters: []runtime.FileFilter{
			{DisplayName: "YAML Files (*.yaml, *.yml)", Pattern: "*.yaml;*.yml"},
		},
	})
	if err != nil {
		return fmt.Errorf("ExportCollectionAsOpenAPIToFile: dialog error: %w", err)
	}
	if filePath == "" {
		return nil
	}

	if err := os.WriteFile(filePath, []byte(yaml), 0644); err != nil {
		return fmt.Errorf("ExportCollectionAsOpenAPIToFile: write file: %w", err)
	}
	return nil
}

// RotateVarEncryptionKey generates a new encryption key, re-encrypts all
// secret variables with it in a single DB transaction, then stores the new
// key in the OS keychain.
// NOTE: Wails auto-generates a JS binding for this method. It is not
// wired to any frontend UI but is reachable via IPC — known limitation.
func (a *App) RotateVarEncryptionKey() error {
	a.encKeyMu.RLock()
	oldKey := make([]byte, len(a.encKey))
	copy(oldKey, a.encKey)
	a.encKeyMu.RUnlock()

	newKey, err := rotateVarEncryptionKey(oldKey)
	if err != nil {
		return err
	}

	a.encKeyMu.Lock()
	a.encKey = newKey
	a.encKeyMu.Unlock()
	return nil
}

// rotateVarEncryptionKey generates a fresh 32-byte AES key, re-encrypts every
// enc:-prefixed variable in a single DB transaction, and then stores the new
// key in the OS keychain. Returns the new key so the caller can update the
// in-memory key under its own mutex. If any step fails the DB is left unchanged.
//
// The new and old plaintext values are never written to any log output.
func rotateVarEncryptionKey(oldKey []byte) ([]byte, error) {
	// 1. Generate the new key.
	newKey, err := encryption.GenerateKey()
	if err != nil {
		return nil, fmt.Errorf("rotateVarEncryptionKey: generate key: %w", err)
	}

	// 2. Load every variable row without decryption.
	allVars, err := db.ListAllVariablesRaw()
	if err != nil {
		return nil, fmt.Errorf("rotateVarEncryptionKey: list variables: %w", err)
	}

	// 3. Build re-encrypted values entirely in memory before touching the DB.
	var updates []db.EncryptedVariableUpdate
	for _, v := range allVars {
		if !strings.HasPrefix(v.Value, "enc:") {
			continue
		}
		plain, decErr := encryption.DecryptValue(v.Value, oldKey)
		if decErr != nil {
			return nil, fmt.Errorf("rotateVarEncryptionKey: decrypt variable id=%d: decryption failed — aborting rotation", v.ID)
		}
		newBlob, encErr := encryption.EncryptValue(plain, newKey)
		if encErr != nil {
			return nil, fmt.Errorf("rotateVarEncryptionKey: re-encrypt variable id=%d: %w", v.ID, encErr)
		}
		updates = append(updates, db.EncryptedVariableUpdate{ID: v.ID, Value: newBlob})
	}

	// 4. Write all re-encrypted rows inside a single transaction.
	if len(updates) > 0 {
		if err := db.RotateEncryptedVariables(updates); err != nil {
			return nil, fmt.Errorf("rotateVarEncryptionKey: persist: %w", err)
		}
	}

	// 5. Persist the new key to the OS keychain only after the DB write succeeds.
	if err := encryption.StoreKey(newKey); err != nil {
		return nil, fmt.Errorf("rotateVarEncryptionKey: store new key: %w", err)
	}

	return newKey, nil
}
