package db

import (
	"testing"
)

// US-1: Create Collection
func TestInsertCollection(t *testing.T) {
	clearTables()
	col, err := InsertCollection("c1", "My Collection")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}
	if col.ID != "c1" {
		t.Errorf("expected id=c1, got %q", col.ID)
	}
	if col.Name != "My Collection" {
		t.Errorf("expected name=%q, got %q", "My Collection", col.Name)
	}
	if col.CreatedAt.IsZero() {
		t.Error("expected non-zero CreatedAt")
	}
}

func TestInsertCollection_DuplicateID(t *testing.T) {
	clearTables()
	InsertCollection("dup", "First")
	_, err := InsertCollection("dup", "Second")
	if err == nil {
		t.Fatal("expected error for duplicate primary key")
	}
}

func TestInsertCollection_AppearsInList(t *testing.T) {
	clearTables()
	InsertCollection("list-1", "Alpha")
	cols, err := ListCollections()
	if err != nil {
		t.Fatalf("ListCollections: %v", err)
	}
	if len(cols) != 1 || cols[0].Name != "Alpha" {
		t.Errorf("expected 1 collection named Alpha, got %+v", cols)
	}
}

// US-2: Rename Collection
func TestUpdateCollection(t *testing.T) {
	clearTables()
	InsertCollection("upd-1", "Old Name")
	if err := UpdateCollection("upd-1", "New Name"); err != nil {
		t.Fatalf("UpdateCollection: %v", err)
	}
	cols, _ := ListCollections()
	if cols[0].Name != "New Name" {
		t.Errorf("name not updated: got %q", cols[0].Name)
	}
}

func TestUpdateCollection_NotFound(t *testing.T) {
	clearTables()
	err := UpdateCollection("ghost", "Whatever")
	if err == nil {
		t.Fatal("expected error for non-existent collection")
	}
}

func TestUpdateCollection_EmptyNamePersists(t *testing.T) {
	// The DB layer does not enforce non-empty name (that's the app layer's job),
	// but UpdateCollection should succeed if called with an empty string.
	clearTables()
	InsertCollection("upd-2", "Valid")
	err := UpdateCollection("upd-2", "")
	if err != nil {
		t.Fatalf("UpdateCollection with empty name: %v", err)
	}
}

// US-3: Delete Collection
func TestDeleteCollection(t *testing.T) {
	clearTables()
	InsertCollection("del-1", "To Delete")
	if err := DeleteCollection("del-1"); err != nil {
		t.Fatalf("DeleteCollection: %v", err)
	}
	cols, _ := ListCollections()
	if len(cols) != 0 {
		t.Errorf("expected 0 collections after delete, got %d", len(cols))
	}
}

func TestDeleteCollection_NotFound(t *testing.T) {
	clearTables()
	err := DeleteCollection("ghost")
	if err == nil {
		t.Fatal("expected error for non-existent collection")
	}
}

func TestDeleteCollection_CascadesRequests(t *testing.T) {
	clearTables()
	InsertCollection("col-cas", "Parent")
	InsertRequest("req-cas", "col-cas", "Child Request")
	DeleteCollection("col-cas")
	reqs, _ := ListRequests("col-cas")
	if len(reqs) != 0 {
		t.Errorf("expected cascade delete of child requests, got %d", len(reqs))
	}
}

func TestListCollections_Empty(t *testing.T) {
	clearTables()
	cols, err := ListCollections()
	if err != nil {
		t.Fatalf("ListCollections: %v", err)
	}
	if len(cols) != 0 {
		t.Errorf("expected empty list, got %d", len(cols))
	}
}

func TestListCollections_OrderedByCreatedAt(t *testing.T) {
	clearTables()
	InsertCollection("ord-1", "Alpha")
	InsertCollection("ord-2", "Beta")
	InsertCollection("ord-3", "Gamma")
	cols, err := ListCollections()
	if err != nil {
		t.Fatalf("ListCollections: %v", err)
	}
	if len(cols) != 3 {
		t.Fatalf("expected 3 collections, got %d", len(cols))
	}
	if cols[0].Name != "Alpha" || cols[1].Name != "Beta" || cols[2].Name != "Gamma" {
		t.Errorf("unexpected order: %v, %v, %v", cols[0].Name, cols[1].Name, cols[2].Name)
	}
}
