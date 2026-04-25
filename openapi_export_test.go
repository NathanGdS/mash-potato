package main

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
	"mash-potato/db"
)

// initExportTestDB initialises a fresh in-memory DB for export tests.
func initExportTestDB(t *testing.T) {
	t.Helper()
	if err := db.Init(":memory:"); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
}

// clearExportTables removes all rows from collections / folders / requests / history between tests.
func clearExportTables(t *testing.T) {
	t.Helper()
	db.DB.Exec("DELETE FROM request_history")
	db.DB.Exec("DELETE FROM requests")
	db.DB.Exec("DELETE FROM folders")
	db.DB.Exec("DELETE FROM collections")
}

// -----------------------------------------------------------------
// toSnakeCase unit tests
// -----------------------------------------------------------------

func TestToSnakeCase(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Get User", "get_user"},
		{"listBooks", "listbooks"},
		{"Create New Post!", "create_new_post"},
		{"  spaces  ", "spaces"},
		{"already_snake", "already_snake"},
		{"Multiple---Dashes", "multiple_dashes"},
		{"CamelCase", "camelcase"},
	}
	for _, tc := range cases {
		got := toSnakeCase(tc.in)
		if got != tc.want {
			t.Errorf("toSnakeCase(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// -----------------------------------------------------------------
// introspectJSONSchema unit tests
// -----------------------------------------------------------------

func TestIntrospectJSONSchema(t *testing.T) {
	t.Run("object", func(t *testing.T) {
		schema := introspectJSONSchema(`{"name":"Alice","age":30,"active":true}`)
		if schema == nil {
			t.Fatal("expected schema, got nil")
		}
		if schema["type"] != "object" {
			t.Errorf("type: want %q, got %v", "object", schema["type"])
		}
		props, ok := schema["properties"].(map[string]interface{})
		if !ok {
			t.Fatalf("properties not a map: %T", schema["properties"])
		}
		if _, hasName := props["name"]; !hasName {
			t.Error("properties should contain 'name'")
		}
	})

	t.Run("array", func(t *testing.T) {
		schema := introspectJSONSchema(`[{"id":1}]`)
		if schema == nil {
			t.Fatal("expected schema, got nil")
		}
		if schema["type"] != "array" {
			t.Errorf("type: want %q, got %v", "array", schema["type"])
		}
	})

	t.Run("invalid json", func(t *testing.T) {
		schema := introspectJSONSchema(`not json`)
		if schema != nil {
			t.Error("expected nil for invalid JSON")
		}
	})

	t.Run("empty string", func(t *testing.T) {
		schema := introspectJSONSchema(``)
		if schema != nil {
			t.Error("expected nil for empty string")
		}
	})
}

// -----------------------------------------------------------------
// Full export integration test
// -----------------------------------------------------------------

func TestExportCollectionAsOpenAPI_YAMLStructure(t *testing.T) {
	initExportTestDB(t)
	t.Cleanup(func() { clearExportTables(t) })

	// Create a collection.
	col, err := db.InsertCollection("col-export-1", "Bookstore API")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}

	// Insert a GET request with query params and custom header.
	req1, err := db.InsertRequest("req-1", col.ID, "listBooks")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(
		req1.ID,
		"GET",
		"https://api.bookstore.example.com/v1/books",
		`[{"key":"X-Request-ID","value":"","enabled":true},{"key":"Authorization","value":"","enabled":true}]`,
		`[{"key":"limit","value":"","enabled":true},{"key":"offset","value":"","enabled":false}]`,
		"none", "", "none", "{}", 30, "", "", "",
	); err != nil {
		t.Fatalf("UpdateRequest req1: %v", err)
	}

	// Insert a POST request with JSON body.
	req2, err := db.InsertRequest("req-2", col.ID, "Create Book")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(
		req2.ID,
		"POST",
		"https://api.bookstore.example.com/v1/books",
		`[]`,
		`[]`,
		"json", `{"title":"","author":""}`, "none", "{}", 30, "", "", "",
	); err != nil {
		t.Fatalf("UpdateRequest req2: %v", err)
	}

	// Insert a GET request with path param.
	req3, err := db.InsertRequest("req-3", col.ID, "getBook")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(
		req3.ID,
		"GET",
		"https://api.bookstore.example.com/v1/books/{{bookId}}",
		`[]`,
		`[]`,
		"none", "", "none", "{}", 30, "", "", "",
	); err != nil {
		t.Fatalf("UpdateRequest req3: %v", err)
	}

	// Insert history entry for listBooks — rich JSON response body.
	_, err = db.InsertHistory(
		"GET",
		"https://api.bookstore.example.com/v1/books",
		"[]", "[]", "none", "",
		200,
		`[{"id":1,"title":"Go Programming","author":"Alan"}]`,
		"[]",
		123, 512,
		db.TimingPhases{},
	)
	if err != nil {
		t.Fatalf("InsertHistory: %v", err)
	}

	// Run export (without environments).
	yamlStr, err := exportCollectionAsOpenAPI(col.ID)
	if err != nil {
		t.Fatalf("exportCollectionAsOpenAPI: %v", err)
	}
	if yamlStr == "" {
		t.Fatal("expected non-empty YAML output")
	}

	// Parse the YAML to validate structure.
	var doc map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &doc); err != nil {
		t.Fatalf("YAML unmarshal failed: %v\nYAML:\n%s", err, yamlStr)
	}

	// Check openapi version.
	if doc["openapi"] != "3.1.0" {
		t.Errorf("openapi version: want %q, got %v", "3.1.0", doc["openapi"])
	}

	// Check info block.
	info, ok := doc["info"].(map[string]interface{})
	if !ok {
		t.Fatalf("info block not a map: %T", doc["info"])
	}
	if info["title"] != "Bookstore API" {
		t.Errorf("info.title: want %q, got %v", "Bookstore API", info["title"])
	}
	if info["version"] != "1.0.0" {
		t.Errorf("info.version: want %q, got %v", "1.0.0", info["version"])
	}

	// Check paths block.
	paths, ok := doc["paths"].(map[string]interface{})
	if !ok {
		t.Fatalf("paths not a map: %T", doc["paths"])
	}
	if len(paths) == 0 {
		t.Fatal("paths block is empty")
	}

	// Verify the /v1/books path exists with GET operation.
	booksPath, ok := paths["/v1/books"].(map[string]interface{})
	if !ok {
		t.Fatalf("path /v1/books not found or not a map, paths: %v", paths)
	}
	getOp, ok := booksPath["get"].(map[string]interface{})
	if !ok {
		t.Fatalf("GET /v1/books not found or not a map")
	}

	// operationId should be snake_cased from "listBooks".
	if getOp["operationId"] != "listbooks" {
		t.Errorf("operationId: want %q, got %v", "listbooks", getOp["operationId"])
	}

	// Query param "limit" should be present (enabled); "offset" should be absent (disabled).
	params, ok := getOp["parameters"].([]interface{})
	if !ok {
		t.Fatalf("parameters not a slice: %T", getOp["parameters"])
	}
	paramNames := map[string]string{}
	for _, p := range params {
		pm, ok := p.(map[string]interface{})
		if !ok {
			continue
		}
		paramNames[pm["name"].(string)] = pm["in"].(string)
	}
	if paramNames["limit"] != "query" {
		t.Errorf("param 'limit' should be in:query, got: %v", paramNames["limit"])
	}
	if _, hasOffset := paramNames["offset"]; hasOffset {
		t.Error("param 'offset' should be absent (disabled)")
	}
	// Authorization header should be omitted (standard header).
	if _, hasAuth := paramNames["Authorization"]; hasAuth {
		t.Error("Authorization header should be omitted (standard HTTP header)")
	}
	// X-Request-ID should be present (custom header).
	if paramNames["X-Request-ID"] != "header" {
		t.Errorf("param 'X-Request-ID' should be in:header, got: %v", paramNames["X-Request-ID"])
	}

	// Responses for listBooks — history entry should provide status 200 and schema.
	responses, ok := getOp["responses"].(map[string]interface{})
	if !ok {
		t.Fatalf("responses not a map: %T", getOp["responses"])
	}
	resp200, ok := responses["200"].(map[string]interface{})
	if !ok {
		t.Fatalf("response 200 not found or not a map, responses: %v", responses)
	}
	content, ok := resp200["content"].(map[string]interface{})
	if !ok {
		t.Fatalf("response 200 content missing (history-driven schema expected)")
	}
	if _, hasJSON := content["application/json"]; !hasJSON {
		t.Error("response 200 content should have application/json")
	}

	// POST /v1/books — should have requestBody.
	postOp, ok := booksPath["post"].(map[string]interface{})
	if !ok {
		t.Fatalf("POST /v1/books not found or not a map")
	}
	if postOp["operationId"] != "create_book" {
		t.Errorf("POST operationId: want %q, got %v", "create_book", postOp["operationId"])
	}
	if _, hasBody := postOp["requestBody"]; !hasBody {
		t.Error("POST /v1/books should have requestBody")
	}

	// GET /v1/books/{{bookId}} — variable tokens remain unresolved if no env var matches.
	booksIdPath, ok := paths["/v1/books/{{bookId}}"].(map[string]interface{})
	if !ok {
		t.Fatalf("path /v1/books/{{bookId}} not found, paths: %v", paths)
	}
	getBookOp, ok := booksIdPath["get"].(map[string]interface{})
	if !ok {
		t.Fatalf("GET /v1/books/{{bookId}} not found")
	}
	if getBookOp["operationId"] != "getbook" {
		t.Errorf("getBook operationId: want %q, got %v", "getbook", getBookOp["operationId"])
	}
	// No history — should default to 200 OK.
	getBookResponses, ok := getBookOp["responses"].(map[string]interface{})
	if !ok {
		t.Fatalf("getBook responses not a map: %T", getBookOp["responses"])
	}
	if _, has200 := getBookResponses["200"]; !has200 {
		t.Error("getBook default response should be 200")
	}
}

// -----------------------------------------------------------------
// Error cases
// -----------------------------------------------------------------

func TestExportCollectionAsOpenAPI_NotFound(t *testing.T) {
	initExportTestDB(t)
	t.Cleanup(func() { clearExportTables(t) })

	_, err := exportCollectionAsOpenAPI("non-existent-id")
	if err == nil {
		t.Fatal("expected error for non-existent collection, got nil")
	}
}

func TestExportCollectionAsOpenAPI_EmptyCollection(t *testing.T) {
	initExportTestDB(t)
	t.Cleanup(func() { clearExportTables(t) })

	col, err := db.InsertCollection("col-empty", "Empty Collection")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}

	_, err = exportCollectionAsOpenAPI(col.ID)
	if err == nil {
		t.Fatal("expected error for collection with no requests, got nil")
	}
	if !strings.Contains(err.Error(), "no requests") {
		t.Errorf("error message should mention 'no requests', got: %v", err)
	}
}

// -----------------------------------------------------------------
// App.ExportCollectionAsOpenAPI empty collectionID guard
// -----------------------------------------------------------------

func TestAppExportCollectionAsOpenAPI_EmptyID(t *testing.T) {
	a := &App{}
	_, err := a.ExportCollectionAsOpenAPI("")
	if err == nil {
		t.Fatal("expected error for empty collectionID, got nil")
	}
}

// -----------------------------------------------------------------
// Form body type exports correct content-type
// -----------------------------------------------------------------

func TestExportCollectionAsOpenAPI_FormBody(t *testing.T) {
	initExportTestDB(t)
	t.Cleanup(func() { clearExportTables(t) })

	col, err := db.InsertCollection("col-form", "Form API")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}
	req, err := db.InsertRequest("req-form", col.ID, "submitForm")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(
		req.ID,
		"POST",
		"https://example.com/submit",
		`[]`, `[]`,
		"form", "name=Alice&email=alice@example.com",
		"none", "{}", 30, "", "", "",
	); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}

	yamlStr, err := exportCollectionAsOpenAPI(col.ID)
	if err != nil {
		t.Fatalf("exportCollectionAsOpenAPI: %v", err)
	}

	var doc map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &doc); err != nil {
		t.Fatalf("YAML unmarshal: %v", err)
	}

	paths := doc["paths"].(map[string]interface{})
	submitPath := paths["/submit"].(map[string]interface{})
	postOp := submitPath["post"].(map[string]interface{})
	rb := postOp["requestBody"].(map[string]interface{})
	content := rb["content"].(map[string]interface{})
	if _, ok := content["application/x-www-form-urlencoded"]; !ok {
		t.Error("form body type should produce application/x-www-form-urlencoded content-type")
	}
}

// -----------------------------------------------------------------
// Round-trip tests: export preserves values in examples
// -----------------------------------------------------------------

func TestExportCollectionAsOpenAPI_ParamExamples(t *testing.T) {
	initExportTestDB(t)
	t.Cleanup(func() { clearExportTables(t) })

	col, err := db.InsertCollection("col-rt-1", "Round Trip API")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}
	req, err := db.InsertRequest("req-rt-1", col.ID, "searchBooks")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(
		req.ID,
		"GET",
		"https://api.example.com/books",
		`[{"key":"X-Custom-Header","value":"my-header-value","enabled":true}]`,
		`[{"key":"query","value":"test-value","enabled":true}]`,
		"none", "", "none", "{}", 30, "", "", "",
	); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}

	yamlStr, err := exportCollectionAsOpenAPI(col.ID)
	if err != nil {
		t.Fatalf("exportCollectionAsOpenAPI: %v", err)
	}

	var doc map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &doc); err != nil {
		t.Fatalf("YAML unmarshal: %v", err)
	}

	paths := doc["paths"].(map[string]interface{})
	booksPath := paths["/books"].(map[string]interface{})
	getOp := booksPath["get"].(map[string]interface{})
	params := getOp["parameters"].([]interface{})

	foundQueryParam := false
	foundHeaderParam := false
	for _, p := range params {
		pm := p.(map[string]interface{})
		if pm["name"] == "query" && pm["in"] == "query" {
			foundQueryParam = true
			if pm["example"] != "test-value" {
				t.Errorf("query param example: want %q, got %v", "test-value", pm["example"])
			}
		}
		if pm["name"] == "X-Custom-Header" && pm["in"] == "header" {
			foundHeaderParam = true
			if pm["example"] != "my-header-value" {
				t.Errorf("header param example: want %q, got %v", "my-header-value", pm["example"])
			}
		}
	}
	if !foundQueryParam {
		t.Error("query param 'query' not found in exported parameters")
	}
	if !foundHeaderParam {
		t.Error("header param 'X-Custom-Header' not found in exported parameters")
	}
}

func TestExportCollectionAsOpenAPI_BodyExample(t *testing.T) {
	initExportTestDB(t)
	t.Cleanup(func() { clearExportTables(t) })

	col, err := db.InsertCollection("col-rt-2", "Body Round Trip API")
	if err != nil {
		t.Fatalf("InsertCollection: %v", err)
	}
	req, err := db.InsertRequest("req-rt-2", col.ID, "createBook")
	if err != nil {
		t.Fatalf("InsertRequest: %v", err)
	}
	if err := db.UpdateRequest(
		req.ID,
		"POST",
		"https://api.example.com/books",
		`[]`, `[]`,
		"json", `{"name":"123123"}`, "none", "{}", 30, "", "", "",
	); err != nil {
		t.Fatalf("UpdateRequest: %v", err)
	}

	yamlStr, err := exportCollectionAsOpenAPI(col.ID)
	if err != nil {
		t.Fatalf("exportCollectionAsOpenAPI: %v", err)
	}

	var doc map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &doc); err != nil {
		t.Fatalf("YAML unmarshal: %v", err)
	}

	paths := doc["paths"].(map[string]interface{})
	booksPath := paths["/books"].(map[string]interface{})
	postOp := booksPath["post"].(map[string]interface{})
	rb := postOp["requestBody"].(map[string]interface{})
	content := rb["content"].(map[string]interface{})
	jsonMedia := content["application/json"].(map[string]interface{})

	example, ok := jsonMedia["example"]
	if !ok {
		t.Fatal("example missing from requestBody content")
	}
	exampleMap, ok := example.(map[string]interface{})
	if !ok {
		t.Fatalf("example not a map: %T", example)
	}
	if exampleMap["name"] != "123123" {
		t.Errorf("body example name: want %q, got %v", "123123", exampleMap["name"])
	}
}
