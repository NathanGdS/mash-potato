package db

import (
	"testing"
)

// US-4: Create Request
func TestInsertRequest_DefaultValues(t *testing.T) {
	clearTables()
	InsertCollection("col-1", "Col")
	req, err := InsertRequest("req-1", "col-1", "My Request")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if req.ID != "req-1" {
		t.Errorf("expected id=req-1, got %q", req.ID)
	}
	if req.CollectionID != "col-1" {
		t.Errorf("expected collection_id=col-1, got %q", req.CollectionID)
	}
	if req.Name != "My Request" {
		t.Errorf("expected name=%q, got %q", "My Request", req.Name)
	}
	// US-5: default method is GET
	if req.Method != "GET" {
		t.Errorf("expected method=GET, got %q", req.Method)
	}
	// US-6: default URL is empty
	if req.URL != "" {
		t.Errorf("expected empty URL, got %q", req.URL)
	}
	// US-7: default headers is []
	if req.Headers != "[]" {
		t.Errorf("expected headers=[], got %q", req.Headers)
	}
	// US-8: default params is []
	if req.Params != "[]" {
		t.Errorf("expected params=[], got %q", req.Params)
	}
	// US-9: default body_type is none
	if req.BodyType != "none" {
		t.Errorf("expected body_type=none, got %q", req.BodyType)
	}
	if req.Body != "" {
		t.Errorf("expected empty body, got %q", req.Body)
	}
	if req.CreatedAt.IsZero() {
		t.Error("expected non-zero CreatedAt")
	}
}

func TestInsertRequest_AppearsInList(t *testing.T) {
	clearTables()
	InsertCollection("col-2", "Col")
	InsertRequest("req-2", "col-2", "Listed")
	reqs, err := ListRequests("col-2")
	if err != nil {
		t.Fatalf("ListRequests: %v", err)
	}
	if len(reqs) != 1 || reqs[0].Name != "Listed" {
		t.Errorf("expected request in list, got %+v", reqs)
	}
}

// US-5/6/7/8/9: Update Request fields
func TestUpdateRequest_Method(t *testing.T) {
	clearTables()
	InsertCollection("col-3", "Col")
	InsertRequest("req-3", "col-3", "R")
	err := UpdateRequest("req-3", "POST", "", "[]", "[]", "none", "")
	if err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}
	req, _ := GetRequest("req-3")
	if req.Method != "POST" {
		t.Errorf("expected POST, got %q", req.Method)
	}
}

func TestUpdateRequest_URL(t *testing.T) {
	clearTables()
	InsertCollection("col-4", "Col")
	InsertRequest("req-4", "col-4", "R")
	UpdateRequest("req-4", "GET", "https://api.example.com", "[]", "[]", "none", "")
	req, _ := GetRequest("req-4")
	if req.URL != "https://api.example.com" {
		t.Errorf("expected URL, got %q", req.URL)
	}
}

func TestUpdateRequest_Headers(t *testing.T) {
	clearTables()
	InsertCollection("col-5", "Col")
	InsertRequest("req-5", "col-5", "R")
	headers := `[{"key":"Authorization","value":"Bearer token","enabled":true}]`
	UpdateRequest("req-5", "GET", "", headers, "[]", "none", "")
	req, _ := GetRequest("req-5")
	if req.Headers != headers {
		t.Errorf("headers not persisted: got %q", req.Headers)
	}
}

func TestUpdateRequest_Params(t *testing.T) {
	clearTables()
	InsertCollection("col-6", "Col")
	InsertRequest("req-6", "col-6", "R")
	params := `[{"key":"page","value":"1","enabled":true}]`
	UpdateRequest("req-6", "GET", "", "[]", params, "none", "")
	req, _ := GetRequest("req-6")
	if req.Params != params {
		t.Errorf("params not persisted: got %q", req.Params)
	}
}

func TestUpdateRequest_Body_JSON(t *testing.T) {
	clearTables()
	InsertCollection("col-7", "Col")
	InsertRequest("req-7", "col-7", "R")
	body := `{"hello":"world"}`
	UpdateRequest("req-7", "POST", "", "[]", "[]", "json", body)
	req, _ := GetRequest("req-7")
	if req.BodyType != "json" {
		t.Errorf("expected body_type=json, got %q", req.BodyType)
	}
	if req.Body != body {
		t.Errorf("body not persisted: got %q", req.Body)
	}
}

func TestUpdateRequest_NotFound(t *testing.T) {
	clearTables()
	err := UpdateRequest("ghost", "GET", "", "[]", "[]", "none", "")
	if err == nil {
		t.Fatal("expected error for non-existent request")
	}
}

// GetRequest
func TestGetRequest(t *testing.T) {
	clearTables()
	InsertCollection("col-8", "Col")
	InsertRequest("req-8", "col-8", "Fetch Me")
	req, err := GetRequest("req-8")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}
	if req.ID != "req-8" || req.Name != "Fetch Me" {
		t.Errorf("unexpected request: %+v", req)
	}
}

func TestGetRequest_NotFound(t *testing.T) {
	clearTables()
	_, err := GetRequest("ghost")
	if err == nil {
		t.Fatal("expected error for non-existent request")
	}
}

// ListRequests
func TestListRequests_OnlyForCollection(t *testing.T) {
	clearTables()
	InsertCollection("col-9a", "ColA")
	InsertCollection("col-9b", "ColB")
	InsertRequest("req-9a", "col-9a", "A")
	InsertRequest("req-9b", "col-9b", "B")
	reqs, err := ListRequests("col-9a")
	if err != nil {
		t.Fatalf("ListRequests: %v", err)
	}
	if len(reqs) != 1 || reqs[0].CollectionID != "col-9a" {
		t.Errorf("expected 1 request for col-9a, got %+v", reqs)
	}
}

func TestListRequests_Empty(t *testing.T) {
	clearTables()
	InsertCollection("col-10", "Col")
	reqs, err := ListRequests("col-10")
	if err != nil {
		t.Fatalf("ListRequests: %v", err)
	}
	if len(reqs) != 0 {
		t.Errorf("expected 0 requests, got %d", len(reqs))
	}
}

func TestListRequests_OrderedByCreatedAt(t *testing.T) {
	clearTables()
	InsertCollection("col-11", "Col")
	InsertRequest("req-11a", "col-11", "First")
	InsertRequest("req-11b", "col-11", "Second")
	reqs, _ := ListRequests("col-11")
	if len(reqs) != 2 {
		t.Fatalf("expected 2 requests, got %d", len(reqs))
	}
	if reqs[0].Name != "First" || reqs[1].Name != "Second" {
		t.Errorf("unexpected order: %v, %v", reqs[0].Name, reqs[1].Name)
	}
}

// Persistence: values survive get-after-update round-trip
func TestUpdateRequest_PersistsAllFields(t *testing.T) {
	clearTables()
	InsertCollection("col-12", "Col")
	InsertRequest("req-12", "col-12", "Full Update")

	method := "PUT"
	url := "https://example.com/resource/1"
	headers := `[{"key":"X-Token","value":"abc","enabled":true}]`
	params := `[{"key":"v","value":"2","enabled":true}]`
	bodyType := "raw"
	body := "plain text body"

	err := UpdateRequest("req-12", method, url, headers, params, bodyType, body)
	if err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}

	req, err := GetRequest("req-12")
	if err != nil {
		t.Fatalf("GetRequest: %v", err)
	}

	checks := map[string][2]string{
		"Method":   {req.Method, method},
		"URL":      {req.URL, url},
		"Headers":  {req.Headers, headers},
		"Params":   {req.Params, params},
		"BodyType": {req.BodyType, bodyType},
		"Body":     {req.Body, body},
	}
	for field, pair := range checks {
		if pair[0] != pair[1] {
			t.Errorf("%s: expected %q, got %q", field, pair[1], pair[0])
		}
	}
}
