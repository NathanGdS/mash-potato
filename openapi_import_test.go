package main

import (
	"encoding/json"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"mash-potato/db"
	"mash-potato/openapi"
)

// importFixture returns the absolute path to an openapi testdata file.
func importFixture(name string) string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "openapi", "testdata", name)
}

// initImportTestDB initialises a fresh in-memory DB for import tests.
func initImportTestDB(t *testing.T) {
	t.Helper()
	if err := db.Init(":memory:"); err != nil {
		t.Fatalf("db.Init: %v", err)
	}
}

// clearImportTables removes all collection / folder / request rows between tests.
func clearImportTables(t *testing.T) {
	t.Helper()
	db.DB.Exec("DELETE FROM requests")
	db.DB.Exec("DELETE FROM folders")
	db.DB.Exec("DELETE FROM collections")
}

// -----------------------------------------------------------------
// Table-driven integration test against the fixture YAML
// -----------------------------------------------------------------

func TestImportOpenAPISpec_FixtureYAML(t *testing.T) {
	fixture := importFixture("import_fixture.yaml")

	tests := []struct {
		name              string
		wantFolderCount   int
		wantRequestCount  int
		checkURL          func(t *testing.T, colID string)
		checkAuth         func(t *testing.T, colID string)
	}{
		{
			name:             "folder and request counts",
			wantFolderCount:  2, // books, authors (untagged ops go to root level)
			wantRequestCount: 6, // listBooks, createBook, getBook, deleteBook, listAuthors, healthCheck
			checkURL: func(t *testing.T, colID string) {
				reqs, err := db.ListRequests(colID)
				if err != nil {
					t.Fatalf("ListRequests: %v", err)
				}
				// Find getBook and verify path param conversion.
				for _, r := range reqs {
					if r.Name == "getBook" {
						want := "https://api.bookstore.example.com/v1/books/{{bookId}}"
						if r.URL != want {
							t.Errorf("getBook URL: want %q, got %q", want, r.URL)
						}
					}
				}
			},
			checkAuth: func(t *testing.T, colID string) {
				reqs, err := db.ListRequests(colID)
				if err != nil {
					t.Fatalf("ListRequests: %v", err)
				}
				authMap := map[string]string{}
				for _, r := range reqs {
					authMap[r.Name] = r.AuthType
				}
				// listBooks and createBook use bearerAuth.
				if authMap["listBooks"] != "bearer" {
					t.Errorf("listBooks auth_type: want %q, got %q", "bearer", authMap["listBooks"])
				}
				if authMap["createBook"] != "bearer" {
					t.Errorf("createBook auth_type: want %q, got %q", "bearer", authMap["createBook"])
				}
				// getBook uses apiKeyAuth.
				if authMap["getBook"] != "apikey" {
					t.Errorf("getBook auth_type: want %q, got %q", "apikey", authMap["getBook"])
				}
				// listAuthors uses basicAuth.
				if authMap["listAuthors"] != "basic" {
					t.Errorf("listAuthors auth_type: want %q, got %q", "basic", authMap["listAuthors"])
				}
				// healthCheck has no security.
				if authMap["healthCheck"] != "none" {
					t.Errorf("healthCheck auth_type: want %q, got %q", "none", authMap["healthCheck"])
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			initImportTestDB(t)
			t.Cleanup(func() { clearImportTables(t) })

			result, err := importOpenAPISpec(fixture)
			if err != nil {
				t.Fatalf("importOpenAPISpec: %v", err)
			}
			if result.CollectionID == "" {
				t.Error("CollectionID is empty")
			}
			if result.FolderCount != tc.wantFolderCount {
				t.Errorf("FolderCount: want %d, got %d", tc.wantFolderCount, result.FolderCount)
			}
			if result.RequestCount != tc.wantRequestCount {
				t.Errorf("RequestCount: want %d, got %d", tc.wantRequestCount, result.RequestCount)
			}
			if tc.checkURL != nil {
				tc.checkURL(t, result.CollectionID)
			}
			if tc.checkAuth != nil {
				tc.checkAuth(t, result.CollectionID)
			}
		})
	}
}

// -----------------------------------------------------------------
// Verify spec source is stored after import
// -----------------------------------------------------------------

func TestImportOpenAPISpec_SpecSourceStored(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	fixture := importFixture("import_fixture.yaml")
	result, err := importOpenAPISpec(fixture)
	if err != nil {
		t.Fatalf("importOpenAPISpec: %v", err)
	}

	src, err := db.GetCollectionSpecSource(db.DB, result.CollectionID)
	if err != nil {
		t.Fatalf("GetCollectionSpecSource: %v", err)
	}
	if src != fixture {
		t.Errorf("spec source: want %q, got %q", fixture, src)
	}
}

// -----------------------------------------------------------------
// Error on missing or malformed file
// -----------------------------------------------------------------

func TestImportOpenAPISpec_FileNotFound(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	_, err := importOpenAPISpec(importFixture("does_not_exist.yaml"))
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestImportOpenAPISpec_MalformedFile(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	_, err := importOpenAPISpec(importFixture("malformed.json"))
	if err == nil {
		t.Fatal("expected error for malformed file, got nil")
	}
	// No partial collection should have been created.
	cols, _ := db.ListCollections()
	if len(cols) != 0 {
		t.Errorf("malformed file: expected no collections, got %d", len(cols))
	}
}

// -----------------------------------------------------------------
// URL building helpers
// -----------------------------------------------------------------

func TestBuildURL_PathParamConversion(t *testing.T) {
	cases := []struct {
		base, path, want string
	}{
		{
			"https://api.example.com/v1",
			"/pets/{petId}",
			"https://api.example.com/v1/pets/{{petId}}",
		},
		{
			"https://api.example.com",
			"/users/{userId}/posts/{postId}",
			"https://api.example.com/users/{{userId}}/posts/{{postId}}",
		},
		{
			"https://api.example.com",
			"/no-params",
			"https://api.example.com/no-params",
		},
	}
	for _, tc := range cases {
		got := buildURL(tc.base, tc.path)
		if got != tc.want {
			t.Errorf("buildURL(%q, %q) = %q, want %q", tc.base, tc.path, got, tc.want)
		}
	}
}

// -----------------------------------------------------------------
// buildTests helper
// -----------------------------------------------------------------

func TestBuildTests_FirstSuccess(t *testing.T) {
	cases := []struct {
		name      string
		responses map[string]openapi.Response
		want      string
	}{
		{
			name:      "200 present",
			responses: map[string]openapi.Response{"200": {Description: "ok"}, "404": {Description: "not found"}},
			want:      "response.status == 200",
		},
		{
			name:      "only 201",
			responses: map[string]openapi.Response{"201": {Description: "created"}},
			want:      "response.status == 201",
		},
		{
			name:      "no 2xx",
			responses: map[string]openapi.Response{"400": {Description: "bad request"}},
			want:      "",
		},
		{
			name:      "empty responses",
			responses: map[string]openapi.Response{},
			want:      "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := buildTests(tc.responses)
			if got != tc.want {
				t.Errorf("buildTests: want %q, got %q", tc.want, got)
			}
		})
	}
}

// -----------------------------------------------------------------
// buildAuth helper
// -----------------------------------------------------------------

func TestBuildAuth(t *testing.T) {
	schemes := map[string]openapi.SecurityScheme{
		"bearerAuth": {Type: "http", Scheme: "bearer"},
		"apiKeyAuth": {Type: "apiKey", In: "header", Name: "X-API-Key"},
		"basicAuth":  {Type: "http", Scheme: "basic"},
	}

	cases := []struct {
		name           string
		security       []map[string][]string
		wantAuthType   string
		wantAuthConfig string
	}{
		{
			name:           "no security",
			security:       nil,
			wantAuthType:   "none",
			wantAuthConfig: "{}",
		},
		{
			name:           "bearer",
			security:       []map[string][]string{{"bearerAuth": {}}},
			wantAuthType:   "bearer",
			wantAuthConfig: `{"token":""}`,
		},
		{
			name:           "basic",
			security:       []map[string][]string{{"basicAuth": {}}},
			wantAuthType:   "basic",
			wantAuthConfig: `{"username":"","password":""}`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotType, gotConfig := buildAuth(tc.security, schemes)
			if gotType != tc.wantAuthType {
				t.Errorf("authType: want %q, got %q", tc.wantAuthType, gotType)
			}
			if gotConfig != tc.wantAuthConfig {
				t.Errorf("authConfig mismatch for %q: want %q, got %q", tc.name, tc.wantAuthConfig, gotConfig)
			}
		})
	}
}

// -----------------------------------------------------------------
// schemaToStub helper
// -----------------------------------------------------------------

func TestSchemaToStub(t *testing.T) {
	cases := []struct {
		name   string
		schema map[string]interface{}
		check  func(t *testing.T, got interface{})
	}{
		{
			name:   "string type",
			schema: map[string]interface{}{"type": "string"},
			check: func(t *testing.T, got interface{}) {
				if got != "" {
					t.Errorf("want empty string, got %v", got)
				}
			},
		},
		{
			name:   "integer type",
			schema: map[string]interface{}{"type": "integer"},
			check: func(t *testing.T, got interface{}) {
				if got != 0 {
					t.Errorf("want 0, got %v", got)
				}
			},
		},
		{
			name:   "boolean type",
			schema: map[string]interface{}{"type": "boolean"},
			check: func(t *testing.T, got interface{}) {
				if got != false {
					t.Errorf("want false, got %v", got)
				}
			},
		},
		{
			name: "object with properties",
			schema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name": map[string]interface{}{"type": "string"},
					"age":  map[string]interface{}{"type": "integer"},
				},
			},
			check: func(t *testing.T, got interface{}) {
				m, ok := got.(map[string]interface{})
				if !ok {
					t.Fatalf("want map, got %T", got)
				}
				if m["name"] != "" {
					t.Errorf("name: want empty string, got %v", m["name"])
				}
				if m["age"] != 0 {
					t.Errorf("age: want 0, got %v", m["age"])
				}
			},
		},
		{
			name:   "nil schema",
			schema: nil,
			check: func(t *testing.T, got interface{}) {
				m, ok := got.(map[string]interface{})
				if !ok || len(m) != 0 {
					t.Errorf("nil schema should yield empty map, got %v", got)
				}
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := schemaToStub(tc.schema)
			tc.check(t, got)
		})
	}
}

// -----------------------------------------------------------------
// Query and header param building
// -----------------------------------------------------------------

func TestBuildParamEntries(t *testing.T) {
	params := []openapi.Parameter{
		{Name: "limit", In: "query", Required: false},
		{Name: "offset", In: "query", Required: true},
		{Name: "X-Header", In: "header", Required: true},
		{Name: "id", In: "path", Required: true},
	}
	entries := buildParamEntries(params)
	if len(entries) != 2 {
		t.Fatalf("want 2 query params, got %d", len(entries))
	}
	if entries[0].Enabled {
		t.Error("limit should be disabled (not required)")
	}
	if !entries[1].Enabled {
		t.Error("offset should be enabled (required)")
	}
}

func TestBuildHeaderEntries(t *testing.T) {
	params := []openapi.Parameter{
		{Name: "X-Required", In: "header", Required: true},
		{Name: "X-Optional", In: "header", Required: false},
		{Name: "query-param", In: "query", Required: true},
	}
	entries := buildHeaderEntries(params)
	if len(entries) != 2 {
		t.Fatalf("want 2 header entries, got %d", len(entries))
	}
	if !entries[0].Enabled {
		t.Error("X-Required should be enabled")
	}
	if entries[1].Enabled {
		t.Error("X-Optional should be disabled")
	}
}

// -----------------------------------------------------------------
// US-4: ImportConflict typed error
// -----------------------------------------------------------------

func TestImportConflict_Error(t *testing.T) {
	err := &ImportConflict{ExistingID: "abc-123", Name: "Pet Store"}
	msg := err.Error()
	if !strings.Contains(msg, "Pet Store") {
		t.Errorf("ImportConflict.Error() missing name: %s", msg)
	}
	if !strings.Contains(msg, "abc-123") {
		t.Errorf("ImportConflict.Error() missing id: %s", msg)
	}
}

// -----------------------------------------------------------------
// US-4: Conflict detection (resolution == "")
// -----------------------------------------------------------------

func TestImportOpenAPISpecInternal_ConflictDetected(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	if _, err := importOpenAPISpecInternal(importFixture("openapi3.json"), ""); err != nil {
		t.Fatalf("first import: %v", err)
	}

	_, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "")
	if err == nil {
		t.Fatal("expected *ImportConflict error, got nil")
	}
	conflict, ok := err.(*ImportConflict)
	if !ok {
		t.Fatalf("expected *ImportConflict, got %T: %v", err, err)
	}
	if conflict.Name != "Pet Store" {
		t.Errorf("conflict.Name: want %q, got %q", "Pet Store", conflict.Name)
	}
	if conflict.ExistingID == "" {
		t.Error("conflict.ExistingID is empty")
	}
	cols, _ := db.ListCollections()
	if len(cols) != 1 {
		t.Errorf("want 1 collection after conflict, got %d", len(cols))
	}
}

// -----------------------------------------------------------------
// US-4: Resolution: merge
// -----------------------------------------------------------------

func TestImportOpenAPISpecInternal_ResolutionMerge(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	first, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "")
	if err != nil {
		t.Fatalf("first import: %v", err)
	}

	second, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "merge")
	if err != nil {
		t.Fatalf("merge import: %v", err)
	}
	if second.CollectionID != first.CollectionID {
		t.Errorf("merge: CollectionID changed from %q to %q", first.CollectionID, second.CollectionID)
	}
	if second.RequestCount != 0 {
		t.Errorf("merge: RequestCount should be 0 (all already present), got %d", second.RequestCount)
	}
}

// -----------------------------------------------------------------
// US-4: Resolution: replace
// -----------------------------------------------------------------

func TestImportOpenAPISpecInternal_ResolutionReplace(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	first, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "")
	if err != nil {
		t.Fatalf("first import: %v", err)
	}

	second, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "replace")
	if err != nil {
		t.Fatalf("replace import: %v", err)
	}
	if second.CollectionID == first.CollectionID {
		t.Error("replace: CollectionID should be a new UUID, not the same as original")
	}
	if second.RequestCount != 3 {
		t.Errorf("replace: RequestCount: want 3, got %d", second.RequestCount)
	}
	cols, _ := db.ListCollections()
	for _, c := range cols {
		if c.ID == first.CollectionID {
			t.Errorf("replace: old collection %q still exists in DB", first.CollectionID)
		}
	}
}

// -----------------------------------------------------------------
// US-4: Resolution: copy
// -----------------------------------------------------------------

func TestImportOpenAPISpecInternal_ResolutionCopy(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	first, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "")
	if err != nil {
		t.Fatalf("first import: %v", err)
	}

	second, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "copy")
	if err != nil {
		t.Fatalf("copy import: %v", err)
	}
	if second.CollectionID == first.CollectionID {
		t.Error("copy: CollectionID should be a new UUID")
	}
	cols, _ := db.ListCollections()
	foundCopy := false
	for _, c := range cols {
		if c.ID == second.CollectionID && c.Name == "Pet Store (copy)" {
			foundCopy = true
		}
	}
	if !foundCopy {
		t.Errorf("copy: expected collection named %q not found in DB", "Pet Store (copy)")
	}
	if second.RequestCount != 3 {
		t.Errorf("copy: RequestCount: want 3, got %d", second.RequestCount)
	}
}

// -----------------------------------------------------------------
// US-4: Resolution: invalid value — no writes must occur
// -----------------------------------------------------------------

func TestImportOpenAPISpecInternal_InvalidResolution(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	_, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "overwrite")
	if err == nil {
		t.Fatal("expected an error for invalid resolution, got nil")
	}
	if !strings.Contains(err.Error(), "overwrite") {
		t.Errorf("error should mention the unrecognised resolution, got: %v", err)
	}
	cols, _ := db.ListCollections()
	if len(cols) != 0 {
		t.Errorf("invalid resolution: expected no collections created, got %d", len(cols))
	}
}

// -----------------------------------------------------------------
// US-4: Resolution: copy twice — no collision check, two collections created
// -----------------------------------------------------------------

func TestImportOpenAPISpecInternal_CopyTwiceCreatesTwoCollections(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	first, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "copy")
	if err != nil {
		t.Fatalf("first copy import: %v", err)
	}

	second, err := importOpenAPISpecInternal(importFixture("openapi3.json"), "copy")
	if err != nil {
		t.Fatalf("second copy import: %v", err)
	}

	if first.CollectionID == second.CollectionID {
		t.Error("copy twice: both imports returned the same CollectionID")
	}

	cols, _ := db.ListCollections()
	if len(cols) != 2 {
		t.Errorf("copy twice: expected 2 collections, got %d", len(cols))
	}
	for _, c := range cols {
		if c.Name != "Pet Store (copy)" {
			t.Errorf("copy twice: unexpected collection name %q", c.Name)
		}
	}
}

// -----------------------------------------------------------------
// Round-trip tests: import reads examples from spec
// -----------------------------------------------------------------

func TestImportOpenAPISpec_ParamExamplePreserved(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	fixture := importFixture("import_fixture.yaml")
	result, err := importOpenAPISpec(fixture)
	if err != nil {
		t.Fatalf("importOpenAPISpec: %v", err)
	}

	reqs, err := db.ListRequests(result.CollectionID)
	if err != nil {
		t.Fatalf("ListRequests: %v", err)
	}

	// Find listBooks and verify query param example is preserved.
	for _, r := range reqs {
		if r.Name == "listBooks" {
			var params []kvEntry
			if err := json.Unmarshal([]byte(r.Params), &params); err != nil {
				t.Fatalf("unmarshal params: %v", err)
			}
			for _, p := range params {
				if p.Key == "limit" {
					if p.Value != "10" {
						t.Errorf("limit param value: want %q, got %q", "10", p.Value)
					}
				}
			}

			var headers []kvEntry
			if err := json.Unmarshal([]byte(r.Headers), &headers); err != nil {
				t.Fatalf("unmarshal headers: %v", err)
			}
			for _, h := range headers {
				if h.Key == "X-Request-ID" {
					if h.Value != "abc-123" {
						t.Errorf("X-Request-ID header value: want %q, got %q", "abc-123", h.Value)
					}
				}
			}
			return
		}
	}
	t.Error("listBooks request not found")
}

func TestImportOpenAPISpec_BodyExamplePreserved(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	fixture := importFixture("import_fixture.yaml")
	result, err := importOpenAPISpec(fixture)
	if err != nil {
		t.Fatalf("importOpenAPISpec: %v", err)
	}

	reqs, err := db.ListRequests(result.CollectionID)
	if err != nil {
		t.Fatalf("ListRequests: %v", err)
	}

	// Find createBook and verify body example is preserved.
	for _, r := range reqs {
		if r.Name == "createBook" {
			if r.BodyType != "json" {
				t.Fatalf("createBook bodyType: want %q, got %q", "json", r.BodyType)
			}
			var body map[string]interface{}
			if err := json.Unmarshal([]byte(r.Body), &body); err != nil {
				t.Fatalf("unmarshal body: %v", err)
			}
			if body["title"] != "The Great Gatsby" {
				t.Errorf("body title: want %q, got %v", "The Great Gatsby", body["title"])
			}
			if body["author"] != "F. Scott Fitzgerald" {
				t.Errorf("body author: want %q, got %v", "F. Scott Fitzgerald", body["author"])
			}
			return
		}
	}
	t.Error("createBook request not found")
}

func TestImportOpenAPISpec_FallbackToSchemaStub(t *testing.T) {
	initImportTestDB(t)
	t.Cleanup(func() { clearImportTables(t) })

	// Use openapi3.json which has no examples — should fall back to schema stubs.
	fixture := importFixture("openapi3.json")
	result, err := importOpenAPISpec(fixture)
	if err != nil {
		t.Fatalf("importOpenAPISpec: %v", err)
	}

	reqs, err := db.ListRequests(result.CollectionID)
	if err != nil {
		t.Fatalf("ListRequests: %v", err)
	}

	// Verify requests were created with stub bodies (not empty).
	for _, r := range reqs {
		if r.BodyType == "json" && r.Body != "" {
			// Should have a valid JSON stub, not empty.
			var body interface{}
			if err := json.Unmarshal([]byte(r.Body), &body); err != nil {
				t.Errorf("request %q body is not valid JSON: %v\nBody: %s", r.Name, err, r.Body)
			}
		}
	}
}
