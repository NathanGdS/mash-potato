package db

import (
	"testing"
)

// ── MoveRequest (within same collection) ──

func TestMoveRequest_ToRoot(t *testing.T) {
	clearTables()
	InsertCollection("col-1", "Col A")
	InsertFolder("folder-1", "col-1", "", "Folder A")
	InsertRequestInFolder("req-1", "col-1", "folder-1", "Request 1")

	err := MoveRequest("req-1", "")
	if err != nil {
		t.Fatalf("MoveRequest: %v", err)
	}

	req, err := GetRequest("req-1")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if req.FolderID != nil {
		t.Errorf("expected folder_id=nil, got %v", *req.FolderID)
	}
	if req.CollectionID != "col-1" {
		t.Errorf("expected collection_id=col-1, got %q", req.CollectionID)
	}

	var sortOrder int
	DB.QueryRow(`SELECT sort_order FROM requests WHERE id = ?`, "req-1").Scan(&sortOrder)
	if sortOrder != 1 {
		t.Errorf("expected sort_order=1, got %d", sortOrder)
	}
}

func TestMoveRequest_ToFolder(t *testing.T) {
	clearTables()
	InsertCollection("col-2", "Col B")
	InsertFolder("folder-2", "col-2", "", "Folder B")
	InsertRequest("req-2", "col-2", "Request 2")

	err := MoveRequest("req-2", "folder-2")
	if err != nil {
		t.Fatalf("MoveRequest: %v", err)
	}

	req, err := GetRequest("req-2")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if req.FolderID == nil || *req.FolderID != "folder-2" {
		t.Errorf("expected folder_id=folder-2, got %v", req.FolderID)
	}

	var sortOrder int
	DB.QueryRow(`SELECT sort_order FROM requests WHERE id = ?`, "req-2").Scan(&sortOrder)
	if sortOrder != 1 {
		t.Errorf("expected sort_order=1, got %d", sortOrder)
	}
}

func TestMoveRequest_AppendsToEnd(t *testing.T) {
	clearTables()
	InsertCollection("col-3", "Col C")
	InsertFolder("folder-3", "col-3", "", "Folder C")
	InsertRequestInFolder("req-3a", "col-3", "folder-3", "A")
	InsertRequestInFolder("req-3b", "col-3", "folder-3", "B")
	InsertRequest("req-3c", "col-3", "C")

	err := MoveRequest("req-3c", "folder-3")
	if err != nil {
		t.Fatalf("MoveRequest: %v", err)
	}

	var sortOrder int
	DB.QueryRow(`SELECT sort_order FROM requests WHERE id = ?`, "req-3c").Scan(&sortOrder)

	var maxExisting int
	DB.QueryRow(`SELECT COALESCE(MAX(sort_order), 0) FROM requests WHERE id IN (?, ?)`, "req-3a", "req-3b").Scan(&maxExisting)
	if sortOrder <= maxExisting {
		t.Errorf("expected sort_order=%d > max existing=%d, got %d", maxExisting+1, maxExisting, sortOrder)
	}
}

func TestMoveRequest_NotFound(t *testing.T) {
	clearTables()
	err := MoveRequest("ghost", "")
	if err == nil {
		t.Fatal("expected error for non-existent request")
	}
}

// ── MoveRequestToCollection (cross-collection) ──

func TestMoveRequestToCollection_ToRoot(t *testing.T) {
	clearTables()
	InsertCollection("col-src", "Source")
	InsertCollection("col-dest", "Destination")
	InsertRequest("req-4", "col-src", "Cross Collection Request")

	err := MoveRequestToCollection("req-4", "col-dest", "")
	if err != nil {
		t.Fatalf("MoveRequestToCollection: %v", err)
	}

	req, err := GetRequest("req-4")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if req.CollectionID != "col-dest" {
		t.Errorf("expected collection_id=col-dest, got %q", req.CollectionID)
	}
	if req.FolderID != nil {
		t.Errorf("expected folder_id=nil, got %v", req.FolderID)
	}

	var sortOrder int
	DB.QueryRow(`SELECT sort_order FROM requests WHERE id = ?`, "req-4").Scan(&sortOrder)
	if sortOrder != 1 {
		t.Errorf("expected sort_order=1, got %d", sortOrder)
	}

	srcReqs, _ := ListRequests("col-src")
	if len(srcReqs) != 0 {
		t.Errorf("expected 0 requests in source, got %d", len(srcReqs))
	}

	destReqs, _ := ListRequests("col-dest")
	if len(destReqs) != 1 || destReqs[0].ID != "req-4" {
		t.Errorf("expected 1 request in destination, got %+v", destReqs)
	}
}

func TestMoveRequestToCollection_ToFolder(t *testing.T) {
	clearTables()
	InsertCollection("col-src2", "Source 2")
	InsertCollection("col-dest2", "Destination 2")
	InsertFolder("folder-dest", "col-dest2", "", "Target Folder")
	InsertRequest("req-5", "col-src2", "Move to Folder")

	err := MoveRequestToCollection("req-5", "col-dest2", "folder-dest")
	if err != nil {
		t.Fatalf("MoveRequestToCollection: %v", err)
	}

	req, err := GetRequest("req-5")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if req.CollectionID != "col-dest2" {
		t.Errorf("expected collection_id=col-dest2, got %q", req.CollectionID)
	}
	if req.FolderID == nil || *req.FolderID != "folder-dest" {
		t.Errorf("expected folder_id=folder-dest, got %v", req.FolderID)
	}
}

func TestMoveRequestToCollection_AppendsToEnd(t *testing.T) {
	clearTables()
	InsertCollection("col-src3", "Source 3")
	InsertCollection("col-dest3", "Destination 3")
	InsertRequestInFolder("req-6a", "col-dest3", "", "Existing A")
	InsertRequestInFolder("req-6b", "col-dest3", "", "Existing B")
	InsertRequest("req-6c", "col-src3", "Moving")

	err := MoveRequestToCollection("req-6c", "col-dest3", "")
	if err != nil {
		t.Fatalf("MoveRequestToCollection: %v", err)
	}

	var sortOrder int
	DB.QueryRow(`SELECT sort_order FROM requests WHERE id = ?`, "req-6c").Scan(&sortOrder)

	var maxExisting int
	DB.QueryRow(`SELECT COALESCE(MAX(sort_order), 0) FROM requests WHERE id IN (?, ?)`, "req-6a", "req-6b").Scan(&maxExisting)
	if sortOrder <= maxExisting {
		t.Errorf("expected sort_order=%d > max existing=%d, got %d", maxExisting+1, maxExisting, sortOrder)
	}
}

func TestMoveRequestToCollection_PreservesAllFields(t *testing.T) {
	clearTables()
	InsertCollection("col-src4", "Source 4")
	InsertCollection("col-dest4", "Destination 4")
	InsertRequest("req-7", "col-src4", "Full Request")

	_, err := DB.Exec(
		`UPDATE requests SET method = ?, url = ?, headers = ?, params = ?, body_type = ?, body = ?, auth_type = ?, auth_config = ?, timeout_seconds = ?, tests = ?, pre_script = ?, post_script = ? WHERE id = ?`,
		"POST", "https://api.example.com/v1", `[{"key":"X-Custom","value":"val","enabled":true}]`, `[{"key":"page","value":"1","enabled":true}]`, "json", `{"key":"value"}`, "bearer", `{"token":"secret"}`, 60, "assert status == 200", "console.log('pre')", "console.log('post')", "req-7",
	)
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}

	err = MoveRequestToCollection("req-7", "col-dest4", "")
	if err != nil {
		t.Fatalf("MoveRequestToCollection: %v", err)
	}

	req, err := GetRequest("req-7")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}

	checks := map[string][2]string{
		"Method":       {req.Method, "POST"},
		"URL":          {req.URL, "https://api.example.com/v1"},
		"Headers":      {req.Headers, `[{"key":"X-Custom","value":"val","enabled":true}]`},
		"Params":       {req.Params, `[{"key":"page","value":"1","enabled":true}]`},
		"BodyType":     {req.BodyType, "json"},
		"Body":         {req.Body, `{"key":"value"}`},
		"AuthType":     {req.AuthType, "bearer"},
		"AuthConfig":   {req.AuthConfig, `{"token":"secret"}`},
		"Tests":        {req.Tests, "assert status == 200"},
		"PreScript":    {req.PreScript, "console.log('pre')"},
		"PostScript":   {req.PostScript, "console.log('post')"},
	}
	for field, pair := range checks {
		if pair[0] != pair[1] {
			t.Errorf("%s: expected %q, got %q", field, pair[1], pair[0])
		}
	}
	if req.TimeoutSeconds != 60 {
		t.Errorf("TimeoutSeconds: expected 60, got %d", req.TimeoutSeconds)
	}
}

func TestMoveRequestToCollection_NotFound(t *testing.T) {
	clearTables()
	InsertCollection("col-dest5", "Destination 5")
	err := MoveRequestToCollection("ghost", "col-dest5", "")
	if err == nil {
		t.Fatal("expected error for non-existent request")
	}
}

func TestMoveRequestToCollection_SameCollection(t *testing.T) {
	clearTables()
	InsertCollection("col-same", "Same")
	InsertFolder("folder-a", "col-same", "", "Folder A")
	InsertFolder("folder-b", "col-same", "", "Folder B")
	InsertRequestInFolder("req-8", "col-same", "folder-a", "Same Collection Move")

	err := MoveRequestToCollection("req-8", "col-same", "folder-b")
	if err != nil {
		t.Fatalf("MoveRequestToCollection: %v", err)
	}

	req, err := GetRequest("req-8")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if req.CollectionID != "col-same" {
		t.Errorf("expected collection_id=col-same, got %q", req.CollectionID)
	}
	if req.FolderID == nil || *req.FolderID != "folder-b" {
		t.Errorf("expected folder_id=folder-b, got %v", req.FolderID)
	}
}

func TestMoveRequestToCollection_FromFolderToFolder(t *testing.T) {
	clearTables()
	InsertCollection("col-src6", "Source 6")
	InsertCollection("col-dest6", "Destination 6")
	InsertFolder("folder-src", "col-src6", "", "Source Folder")
	InsertFolder("folder-dest", "col-dest6", "", "Dest Folder")
	InsertRequestInFolder("req-9", "col-src6", "folder-src", "Cross Collection Folder Move")

	err := MoveRequestToCollection("req-9", "col-dest6", "folder-dest")
	if err != nil {
		t.Fatalf("MoveRequestToCollection: %v", err)
	}

	req, err := GetRequest("req-9")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if req.CollectionID != "col-dest6" {
		t.Errorf("expected collection_id=col-dest6, got %q", req.CollectionID)
	}
	if req.FolderID == nil || *req.FolderID != "folder-dest" {
		t.Errorf("expected folder_id=folder-dest, got %v", req.FolderID)
	}
}
