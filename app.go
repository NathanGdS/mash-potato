package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
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
	ID       string `json:"id"`
	Method   string `json:"method"`
	URL      string `json:"url"`
	Headers  string `json:"headers"`
	Params   string `json:"params"`
	BodyType string `json:"body_type"`
	Body     string `json:"body"`
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

	// Build the interpolation vars map from the active environment (if any).
	vars := map[string]string{}
	envID, err := db.GetSetting("active_environment_id")
	if err != nil {
		return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: get active environment: %w", err)
	}
	if envID != "" {
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
	}

	result, err := httpclient.ExecuteRequest(req)
	if err != nil {
		return httpclient.ResponseResult{}, fmt.Errorf("SendRequest: %w", err)
	}
	return result, nil
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
func (a *App) RenameEnvironment(id string, name string) error {
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

// UpdateRequest persists all mutable fields of a request to SQLite.
func (a *App) UpdateRequest(payload RequestPayload) error {
	if strings.TrimSpace(payload.ID) == "" {
		return fmt.Errorf("request id cannot be empty")
	}
	if err := db.UpdateRequest(
		payload.ID,
		payload.Method,
		payload.URL,
		payload.Headers,
		payload.Params,
		payload.BodyType,
		payload.Body,
	); err != nil {
		return fmt.Errorf("UpdateRequest: %w", err)
	}
	return nil
}
