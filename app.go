package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"mash-potato/db"
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
