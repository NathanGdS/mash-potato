package db

import (
	"testing"
)

func TestResolveRequestByPath_RootLevel(t *testing.T) {
	clearTables()

	col, _ := InsertCollection("col-path-1", "my-collection")
	req, _ := InsertRequest("req-path-1", col.ID, "my-request")

	id, err := ResolveRequestByPath("my-collection/my-request")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != req.ID {
		t.Errorf("expected %q, got %q", req.ID, id)
	}
}

func TestResolveRequestByPath_NestedFolder(t *testing.T) {
	clearTables()

	col, _ := InsertCollection("col-path-2", "my-col2")
	folder, _ := InsertFolder("folder-path-2", col.ID, "", "my-folder")
	req, _ := InsertRequestInFolder("req-path-2", col.ID, folder.ID, "nested-req")

	id, err := ResolveRequestByPath("my-col2/my-folder/nested-req")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != req.ID {
		t.Errorf("expected %q, got %q", req.ID, id)
	}
}

func TestResolveRequestByPath_MissingCollection(t *testing.T) {
	clearTables()

	_, err := ResolveRequestByPath("nonexistent-col/some-req")
	if err == nil {
		t.Error("expected error for missing collection, got nil")
	}
}

func TestResolveRequestByPath_MissingRequest(t *testing.T) {
	clearTables()

	col, _ := InsertCollection("col-path-3", "col-mr")
	_ = col

	_, err := ResolveRequestByPath("col-mr/missing-req")
	if err == nil {
		t.Error("expected error for missing request, got nil")
	}
}

func TestResolveRequestByPath_MissingFolder(t *testing.T) {
	clearTables()

	col, _ := InsertCollection("col-path-4", "col-mf")
	req, _ := InsertRequest("req-path-4", col.ID, "root-req")
	_ = req

	_, err := ResolveRequestByPath("col-mf/nonexistent-folder/root-req")
	if err == nil {
		t.Error("expected error for missing folder segment, got nil")
	}
}

func TestResolveRequestByPath_TooShort(t *testing.T) {
	clearTables()

	_, err := ResolveRequestByPath("only-one-segment")
	if err == nil {
		t.Error("expected error for path with no slash, got nil")
	}
}
