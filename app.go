package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"mash-potato/db"
	"mash-potato/httpclient"
)

// App holds application state and exposes Wails-bound methods.
type App struct {
	ctx context.Context
}

// newApp creates an App instance.
func newApp() *App {
	return &App{}
}

// startup is called by Wails when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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
}

// SendRequest fetches the request from SQLite by id, executes it via net/http,
// and returns a ResponseResult with status, body, headers, duration, and size.
// Before dispatching, all {{variable}} tokens in URL, headers, params, and body
// are replaced with values from the active environment (if one is set).
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

	// 1. Load global variables (always active).
	globalID, err := db.GetGlobalEnvironmentID()
	if err == nil && globalID != "" {
		globalVars, err := db.GetVariables(globalID)
		if err != nil {
			return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: get global variables: %w", err)
		}
		for _, v := range globalVars {
			vars[v.Key] = v.Value
		}
	}

	// 2. Load active environment variables, overriding globals with same key.
	envID, err := db.GetSetting("active_environment_id")
	if err != nil {
		return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: get active environment: %w", err)
	}
	if envID != "" && envID != globalID {
		dbVars, err := db.GetVariables(envID)
		if err != nil {
			return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: get variables: %w", err)
		}
		for _, v := range dbVars {
			vars[v.Key] = v.Value
		}
	}

	// Apply interpolation to all text fields (ephemeral — not saved to DB).
	if len(vars) > 0 {
		req.URL = Interpolate(req.URL, vars)
		req.Headers = Interpolate(req.Headers, vars)
		req.Params = Interpolate(req.Params, vars)
		req.Body = Interpolate(req.Body, vars)
		req.AuthConfig = Interpolate(req.AuthConfig, vars)
	}

	result, err := httpclient.ExecuteRequest(req)
	if err != nil {
		return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: %w", err)
	}

	// Log to history — best-effort, never fail the response on write error.
	responseHeadersJSON, _ := json.Marshal(result.Headers)
	if _, herr := db.InsertHistory(req.Method, req.URL, req.Headers, req.Params, req.BodyType, req.Body, result.StatusCode, result.Body, string(responseHeadersJSON), result.DurationMs, result.SizeBytes); herr != nil {
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
func (a *App) SetVariable(environmentID string, key string, value string) (db.EnvironmentVariable, error) {
	if strings.TrimSpace(environmentID) == "" {
		return db.EnvironmentVariable{}, fmt.Errorf("environment id cannot be empty")
	}
	if strings.TrimSpace(key) == "" {
		return db.EnvironmentVariable{}, fmt.Errorf("variable key cannot be empty")
	}
	v, err := db.SetVariable(environmentID, key, value)
	if err != nil {
		return db.EnvironmentVariable{}, fmt.Errorf("SetVariable: %w", err)
	}
	return v, nil
}

// GetVariables returns all variables for the given environment.
func (a *App) GetVariables(environmentID string) ([]db.EnvironmentVariable, error) {
	vars, err := db.GetVariables(environmentID)
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
