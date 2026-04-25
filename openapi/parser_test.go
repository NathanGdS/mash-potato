package openapi_test

import (
	"path/filepath"
	"runtime"
	"sort"
	"testing"

	"mash-potato/openapi"
)

// fixture returns the absolute path to a testdata file.
func fixture(name string) string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "testdata", name)
}

// -----------------------------------------------------------------
// OpenAPI 3.x JSON
// -----------------------------------------------------------------

func TestParseOpenAPI3JSON(t *testing.T) {
	spec, err := openapi.Parse(fixture("openapi3.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Info
	if spec.Info.Title != "Pet Store" {
		t.Errorf("Info.Title: want %q, got %q", "Pet Store", spec.Info.Title)
	}
	if spec.Info.Version != "1.0.0" {
		t.Errorf("Info.Version: want %q, got %q", "1.0.0", spec.Info.Version)
	}

	// Servers
	if len(spec.Servers) != 1 {
		t.Fatalf("Servers: want 1, got %d", len(spec.Servers))
	}
	if spec.Servers[0].URL != "https://petstore.example.com/v1" {
		t.Errorf("Servers[0].URL: want %q, got %q", "https://petstore.example.com/v1", spec.Servers[0].URL)
	}

	// Paths — there should be 2
	if len(spec.Paths) != 2 {
		t.Fatalf("Paths: want 2, got %d", len(spec.Paths))
	}

	// Locate /pets path
	petsItem := findPath(spec.Paths, "/pets")
	if petsItem == nil {
		t.Fatal("path /pets not found")
	}
	if len(petsItem.Operations) != 2 {
		t.Errorf("/pets operations: want 2, got %d", len(petsItem.Operations))
	}

	// GET /pets
	getOp := findOp(petsItem.Operations, "GET")
	if getOp == nil {
		t.Fatal("GET /pets not found")
	}
	if getOp.OperationID != "listPets" {
		t.Errorf("OperationID: want %q, got %q", "listPets", getOp.OperationID)
	}
	if len(getOp.Tags) != 1 || getOp.Tags[0] != "pets" {
		t.Errorf("Tags: want [pets], got %v", getOp.Tags)
	}
	if len(getOp.Parameters) != 1 {
		t.Fatalf("GET /pets Parameters: want 1, got %d", len(getOp.Parameters))
	}
	p := getOp.Parameters[0]
	if p.Name != "limit" || p.In != "query" || p.Required {
		t.Errorf("parameter: want {limit query false}, got {%s %s %v}", p.Name, p.In, p.Required)
	}
	if getOp.Responses["200"].Description != "A list of pets" {
		t.Errorf("response 200 description mismatch")
	}

	// POST /pets — requestBody
	postOp := findOp(petsItem.Operations, "POST")
	if postOp == nil {
		t.Fatal("POST /pets not found")
	}
	if postOp.RequestBody == nil {
		t.Fatal("POST /pets: expected requestBody, got nil")
	}
	if !postOp.RequestBody.Required {
		t.Error("POST /pets requestBody.Required should be true")
	}
	if _, ok := postOp.RequestBody.MediaTypes["application/json"]; !ok {
		t.Error("POST /pets requestBody missing application/json media type")
	}

	// Security schemes
	if len(spec.Components.SecuritySchemes) != 2 {
		t.Fatalf("SecuritySchemes: want 2, got %d", len(spec.Components.SecuritySchemes))
	}
	bearer, ok := spec.Components.SecuritySchemes["bearerAuth"]
	if !ok {
		t.Fatal("bearerAuth scheme not found")
	}
	if bearer.Type != "http" || bearer.Scheme != "bearer" {
		t.Errorf("bearerAuth: want {http bearer}, got {%s %s}", bearer.Type, bearer.Scheme)
	}
	apiKey, ok := spec.Components.SecuritySchemes["apiKeyAuth"]
	if !ok {
		t.Fatal("apiKeyAuth scheme not found")
	}
	if apiKey.Type != "apiKey" || apiKey.In != "header" || apiKey.Name != "X-API-Key" {
		t.Errorf("apiKeyAuth: want {apiKey header X-API-Key}, got {%s %s %s}", apiKey.Type, apiKey.In, apiKey.Name)
	}
}

// -----------------------------------------------------------------
// OpenAPI 3.x YAML
// -----------------------------------------------------------------

func TestParseOpenAPI3YAML(t *testing.T) {
	spec, err := openapi.Parse(fixture("openapi3.yaml"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if spec.Info.Title != "Pet Store YAML" {
		t.Errorf("Info.Title: want %q, got %q", "Pet Store YAML", spec.Info.Title)
	}
	if spec.Info.Version != "2.0.0" {
		t.Errorf("Info.Version: want %q, got %q", "2.0.0", spec.Info.Version)
	}

	if len(spec.Servers) != 1 || spec.Servers[0].URL != "https://petstore-yaml.example.com/v2" {
		t.Errorf("Servers mismatch: %+v", spec.Servers)
	}

	itemsPath := findPath(spec.Paths, "/items")
	if itemsPath == nil {
		t.Fatal("/items path not found")
	}

	postOp := findOp(itemsPath.Operations, "POST")
	if postOp == nil {
		t.Fatal("POST /items not found")
	}
	if postOp.RequestBody == nil || !postOp.RequestBody.Required {
		t.Error("POST /items requestBody should be present and required")
	}

	ss, ok := spec.Components.SecuritySchemes["basicAuth"]
	if !ok {
		t.Fatal("basicAuth scheme not found")
	}
	if ss.Type != "http" || ss.Scheme != "basic" {
		t.Errorf("basicAuth: want {http basic}, got {%s %s}", ss.Type, ss.Scheme)
	}
}

// -----------------------------------------------------------------
// Swagger 2.0 JSON
// -----------------------------------------------------------------

func TestParseSwagger2JSON(t *testing.T) {
	spec, err := openapi.Parse(fixture("swagger2.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if spec.Info.Title != "Swagger Pet Store" {
		t.Errorf("Info.Title: want %q, got %q", "Swagger Pet Store", spec.Info.Title)
	}

	// Servers — host + basePath + schemes collapsed (2 schemes → 2 servers).
	if len(spec.Servers) != 2 {
		t.Fatalf("Servers: want 2, got %d", len(spec.Servers))
	}
	urls := []string{spec.Servers[0].URL, spec.Servers[1].URL}
	sort.Strings(urls)
	if urls[0] != "http://petstore.swagger.io/v2" || urls[1] != "https://petstore.swagger.io/v2" {
		t.Errorf("unexpected server URLs: %v", urls)
	}

	petPath := findPath(spec.Paths, "/pet")
	if petPath == nil {
		t.Fatal("/pet path not found")
	}

	// POST /pet — body param becomes RequestBody.
	postOp := findOp(petPath.Operations, "POST")
	if postOp == nil {
		t.Fatal("POST /pet not found")
	}
	if postOp.RequestBody == nil {
		t.Fatal("POST /pet: expected requestBody, got nil")
	}
	if !postOp.RequestBody.Required {
		t.Error("POST /pet requestBody.Required should be true")
	}
	// The body param should NOT remain in Parameters.
	for _, p := range postOp.Parameters {
		if p.In == "body" {
			t.Error("body parameter should have been removed from Parameters after promotion to RequestBody")
		}
	}

	// GET /pet — query param preserved.
	getOp := findOp(petPath.Operations, "GET")
	if getOp == nil {
		t.Fatal("GET /pet not found")
	}
	if len(getOp.Parameters) != 1 || getOp.Parameters[0].In != "query" {
		t.Errorf("GET /pet parameters: %+v", getOp.Parameters)
	}
	if getOp.Parameters[0].Schema == nil {
		t.Error("GET /pet query param should have inline schema")
	}

	// Security definitions — basicAuth normalised to http/basic.
	basic, ok := spec.Components.SecuritySchemes["basicAuth"]
	if !ok {
		t.Fatal("basicAuth not found")
	}
	if basic.Type != "http" || basic.Scheme != "basic" {
		t.Errorf("basicAuth normalisation: want {http basic}, got {%s %s}", basic.Type, basic.Scheme)
	}
	apiKey, ok := spec.Components.SecuritySchemes["api_key"]
	if !ok {
		t.Fatal("api_key not found")
	}
	if apiKey.Type != "apiKey" || apiKey.In != "header" || apiKey.Name != "api_key" {
		t.Errorf("api_key: %+v", apiKey)
	}
}

// -----------------------------------------------------------------
// Swagger 2.0 YAML
// -----------------------------------------------------------------

func TestParseSwagger2YAML(t *testing.T) {
	spec, err := openapi.Parse(fixture("swagger2.yaml"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if spec.Info.Title != "Swagger Bookstore" {
		t.Errorf("Info.Title: want %q, got %q", "Swagger Bookstore", spec.Info.Title)
	}

	if len(spec.Servers) != 1 || spec.Servers[0].URL != "https://bookstore.example.com/api" {
		t.Errorf("Servers: %+v", spec.Servers)
	}

	booksPath := findPath(spec.Paths, "/books")
	if booksPath == nil {
		t.Fatal("/books path not found")
	}

	postOp := findOp(booksPath.Operations, "POST")
	if postOp == nil {
		t.Fatal("POST /books not found")
	}
	if postOp.RequestBody == nil {
		t.Fatal("POST /books: expected requestBody")
	}

	basic, ok := spec.Components.SecuritySchemes["basicAuth"]
	if !ok {
		t.Fatal("basicAuth not found")
	}
	if basic.Type != "http" || basic.Scheme != "basic" {
		t.Errorf("basicAuth: want {http basic}, got {%s %s}", basic.Type, basic.Scheme)
	}
}

// -----------------------------------------------------------------
// Malformed file
// -----------------------------------------------------------------

func TestParseMalformed(t *testing.T) {
	_, err := openapi.Parse(fixture("malformed.json"))
	if err == nil {
		t.Fatal("expected error for malformed file, got nil")
	}
}

// -----------------------------------------------------------------
// Unknown spec (no openapi/swagger key)
// -----------------------------------------------------------------

func TestParseUnknownSpec(t *testing.T) {
	_, err := openapi.Parse(fixture("unknown.json"))
	if err == nil {
		t.Fatal("expected error for unknown spec format, got nil")
	}
}

// -----------------------------------------------------------------
// Non-existent file
// -----------------------------------------------------------------

func TestParseFileNotFound(t *testing.T) {
	_, err := openapi.Parse(fixture("does_not_exist.json"))
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

func findPath(paths []openapi.PathItem, path string) *openapi.PathItem {
	for i := range paths {
		if paths[i].Path == path {
			return &paths[i]
		}
	}
	return nil
}

func findOp(ops []openapi.Operation, method string) *openapi.Operation {
	for i := range ops {
		if ops[i].Method == method {
			return &ops[i]
		}
	}
	return nil
}
