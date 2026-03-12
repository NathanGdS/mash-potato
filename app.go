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
