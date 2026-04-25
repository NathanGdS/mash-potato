package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"mash-potato/db"
	"mash-potato/openapi"
)

// pathParamRe matches OpenAPI path parameters like {param} for conversion to {{param}}.
var pathParamRe = regexp.MustCompile(`\{([^}]+)\}`)

// ImportResult summarises what was created by an OpenAPI import.
type ImportResult struct {
	CollectionID     string `json:"CollectionID"`
	RequestCount     int    `json:"RequestCount"`
	FolderCount      int    `json:"FolderCount"`
	EnvironmentCount int    `json:"EnvironmentCount"`
}

// ImportConflict is returned by ImportOpenAPISpec when a collection with the
// same name as the spec title already exists. No write operations occur before
// this error is returned.
type ImportConflict struct {
	ExistingID string
	Name       string
}

// Error implements the error interface.
func (e *ImportConflict) Error() string {
	return fmt.Sprintf("import conflict: a collection named %q already exists (id=%s)", e.Name, e.ExistingID)
}

// kvEntry is a key-value row stored as JSON in headers/params columns.
type kvEntry struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// importOpenAPISpec parses the file at filePath and scaffolds a new collection
// with folders (one per unique operation tag) and requests (one per operation).
// Returns a descriptive error when the file cannot be read or parsed.
// This is the Wails-bound entry point for US-3.
func importOpenAPISpec(filePath string) (ImportResult, error) {
	return importOpenAPISpecInternal(filePath, "")
}

// importOpenAPISpecInternal is the shared entry point used by both
// ImportOpenAPISpec and ImportOpenAPISpecWithResolution.
//
// resolution == ""        → initial import: returns *ImportConflict when
//
//	a collection with that title already exists.
//
// resolution == "merge"   → adds new folders/requests to the existing
//
//	collection; existing requests with same name+folder are left unchanged.
//
// resolution == "replace" → deletes the existing collection and creates a
//
//	fresh one from scratch.
//
// resolution == "copy"    → creates a new collection named "{Title} (copy)"
//
//	with no collision check applied.
//
// Any other value returns a descriptive error without performing any writes.
func importOpenAPISpecInternal(filePath, resolution string) (ImportResult, error) {
	// Validate resolution first — before any file I/O or DB reads.
	switch resolution {
	case "", "merge", "replace", "copy":
		// valid
	default:
		return ImportResult{}, fmt.Errorf(
			"ImportOpenAPISpecWithResolution: unrecognised resolution %q — must be one of: merge, replace, copy",
			resolution,
		)
	}

	spec, err := openapi.Parse(filePath)
	if err != nil {
		return ImportResult{}, fmt.Errorf("ImportOpenAPISpec: parse: %w", err)
	}

	title := spec.Info.Title
	if title == "" {
		title = "Imported API"
	}

	// Find an existing collection with the same name.
	existing, err := findCollectionByName(title)
	if err != nil {
		return ImportResult{}, fmt.Errorf("ImportOpenAPISpec: list collections: %w", err)
	}

	switch resolution {
	case "":
		// Initial import path — return conflict without writing.
		if existing != nil {
			return ImportResult{}, &ImportConflict{ExistingID: existing.ID, Name: title}
		}
		return scaffoldCollection(spec, title, filePath)

	case "merge":
		if existing == nil {
			// No pre-existing collection — just create fresh.
			return scaffoldCollection(spec, title, filePath)
		}
		return mergeIntoCollection(existing.ID, spec, filePath)

	case "replace":
		if existing != nil {
			if err := db.DeleteCollection(existing.ID); err != nil {
				return ImportResult{}, fmt.Errorf("ImportOpenAPISpecWithResolution replace: delete: %w", err)
			}
		}
		return scaffoldCollection(spec, title, filePath)

	case "copy":
		// Always creates a new collection with "(copy)" suffix; no conflict check.
		return scaffoldCollection(spec, title+" (copy)", filePath)
	}

	// Unreachable: resolution was validated above.
	panic("importOpenAPISpecInternal: unhandled resolution " + resolution)
}

// scaffoldCollection creates a new collection from spec under the given title,
// inserts all folders and requests, and stores filePath via SetCollectionSpecSource.
// This is the shared scaffold logic: no collision check is performed here.
func scaffoldCollection(spec *openapi.ParsedSpec, title, filePath string) (ImportResult, error) {
	colID := uuid.New().String()
	col, err := db.InsertCollection(colID, title)
	if err != nil {
		return ImportResult{}, fmt.Errorf("ImportOpenAPISpec: insert collection: %w", err)
	}

	// Persist the spec source path against the collection (best-effort).
	_ = db.SetCollectionSpecSource(db.DB, col.ID, filePath)

	baseURL := ""
	if len(spec.Servers) > 0 {
		baseURL = strings.TrimRight(spec.Servers[0].URL, "/")
	}

	// Collect unique tags in first-occurrence order; create one folder per non-empty tag.
	// Operations with no tags are placed at root level (no folder).
	tagOrder := []string{}
	tagSet := map[string]bool{}
	for _, pathItem := range spec.Paths {
		for _, op := range pathItem.Operations {
			tag := firstTag(op.Tags)
			if tag == "" {
				continue
			}
			if !tagSet[tag] {
				tagSet[tag] = true
				tagOrder = append(tagOrder, tag)
			}
		}
	}

	folderIDs := map[string]string{} // tag -> folderID
	for _, tag := range tagOrder {
		fid := uuid.New().String()
		if _, err := db.InsertFolder(fid, col.ID, "", tag); err != nil {
			return ImportResult{}, fmt.Errorf("ImportOpenAPISpec: insert folder %q: %w", tag, err)
		}
		folderIDs[tag] = fid
	}

	reqCount := 0
	for _, pathItem := range spec.Paths {
		for _, op := range pathItem.Operations {
			tag := firstTag(op.Tags)
			folderID := folderIDs[tag] // "" for untagged → root level

			rid := uuid.New().String()
			reqName := operationName(op)
			if tag == "" {
				if _, err := db.InsertRequest(rid, col.ID, reqName); err != nil {
					return ImportResult{}, fmt.Errorf("ImportOpenAPISpec: insert request %q: %w", reqName, err)
				}
			} else {
				if _, err := db.InsertRequestInFolder(rid, col.ID, folderID, reqName); err != nil {
					return ImportResult{}, fmt.Errorf("ImportOpenAPISpec: insert request %q: %w", reqName, err)
				}
			}

			if err := applyOperationFields(rid, pathItem.Path, baseURL, op, spec.Components.SecuritySchemes); err != nil {
				return ImportResult{}, fmt.Errorf("ImportOpenAPISpec: update request %q: %w", reqName, err)
			}
			reqCount++
		}
	}

	// Import environments from x-mashpotato-environments if present.
	envCount := 0
	for _, xEnv := range spec.XEnvironments {
		if xEnv.IsGlobal {
			// Skip global environment import — the app already has a built-in one.
			continue
		}
		envID := uuid.New().String()
		if _, err := db.InsertEnvironment(envID, xEnv.Name); err != nil {
			// Non-fatal — continue importing other environments.
			continue
		}
		for _, v := range xEnv.Variables {
			if _, err := db.SetVariable(envID, v.Key, v.Value, v.IsSecret); err != nil {
				// Non-fatal — skip variable on error.
				continue
			}
		}
		envCount++
	}

	return ImportResult{
		CollectionID:     col.ID,
		RequestCount:     reqCount,
		FolderCount:      len(folderIDs),
		EnvironmentCount: envCount,
	}, nil
}

// mergeIntoCollection adds new folders and requests from spec into an existing
// collection. Existing folders and requests with the same name+folder are left
// unchanged (no overwrites).
func mergeIntoCollection(existingID string, spec *openapi.ParsedSpec, filePath string) (ImportResult, error) {
	baseURL := ""
	if len(spec.Servers) > 0 {
		baseURL = strings.TrimRight(spec.Servers[0].URL, "/")
	}

	// Index existing folders by name.
	existingFolders, err := db.ListFolders(existingID)
	if err != nil {
		return ImportResult{}, fmt.Errorf("importMerge: list folders: %w", err)
	}
	folderByName := map[string]string{}
	for _, f := range existingFolders {
		folderByName[f.Name] = f.ID
	}

	// Index existing requests by "folderID:name" to avoid duplicates.
	existingReqs, err := db.ListRequests(existingID)
	if err != nil {
		return ImportResult{}, fmt.Errorf("importMerge: list requests: %w", err)
	}
	existingKey := map[string]bool{}
	for _, r := range existingReqs {
		fid := ""
		if r.FolderID != nil {
			fid = *r.FolderID
		}
		existingKey[fid+":"+r.Name] = true
	}

	newFolders, newRequests := 0, 0

	for _, pathItem := range spec.Paths {
		for _, op := range pathItem.Operations {
			tag := firstTag(op.Tags)

			// Untagged operations go to root level.
			var folderID string
			if tag != "" {
				var ok bool
				folderID, ok = folderByName[tag]
				if !ok {
					fid := uuid.New().String()
					if _, err := db.InsertFolder(fid, existingID, "", tag); err != nil {
						return ImportResult{}, fmt.Errorf("importMerge: insert folder %q: %w", tag, err)
					}
					folderByName[tag] = fid
					folderID = fid
					newFolders++
				}
			}

			reqName := operationName(op)
			key := folderID + ":" + reqName
			if existingKey[key] {
				continue // already present — leave unchanged
			}

			rid := uuid.New().String()
			if folderID == "" {
				if _, err := db.InsertRequest(rid, existingID, reqName); err != nil {
					return ImportResult{}, fmt.Errorf("importMerge: insert request %q: %w", reqName, err)
				}
			} else {
				if _, err := db.InsertRequestInFolder(rid, existingID, folderID, reqName); err != nil {
					return ImportResult{}, fmt.Errorf("importMerge: insert request %q: %w", reqName, err)
				}
			}
			if err := applyOperationFields(rid, pathItem.Path, baseURL, op, spec.Components.SecuritySchemes); err != nil {
				return ImportResult{}, fmt.Errorf("importMerge: update request %q: %w", reqName, err)
			}
			existingKey[key] = true
			newRequests++
		}
	}

	// Update spec source (best-effort).
	_ = db.SetCollectionSpecSource(db.DB, existingID, filePath)

	// Import environments from x-mashpotato-environments if present.
	envCount := 0
	for _, xEnv := range spec.XEnvironments {
		if xEnv.IsGlobal {
			continue
		}
		envID := uuid.New().String()
		if _, err := db.InsertEnvironment(envID, xEnv.Name); err != nil {
			continue
		}
		for _, v := range xEnv.Variables {
			if _, err := db.SetVariable(envID, v.Key, v.Value, v.IsSecret); err != nil {
				continue
			}
		}
		envCount++
	}

	return ImportResult{
		CollectionID:     existingID,
		RequestCount:     newRequests,
		FolderCount:      newFolders,
		EnvironmentCount: envCount,
	}, nil
}

// applyOperationFields sets all computed request fields for the given request ID.
// Extracted to avoid duplicating UpdateRequest calls between scaffold and merge paths.
func applyOperationFields(
	rid, path, baseURL string,
	op openapi.Operation,
	schemes map[string]openapi.SecurityScheme,
) error {
	method := strings.ToUpper(op.Method)
	url := buildURL(baseURL, path)
	headersJSON := marshalKV(buildHeaderEntries(op.Parameters))
	paramsJSON := marshalKV(buildParamEntries(op.Parameters))
	bodyType, body := buildBody(op.RequestBody)
	authType, authConfig := buildAuth(op.Security, schemes)
	tests := buildTests(op.Responses)

	return db.UpdateRequest(
		rid,
		method,
		url,
		headersJSON,
		paramsJSON,
		bodyType,
		body,
		authType,
		authConfig,
		30,
		tests,
		"",
		"",
	)
}

// findCollectionByName returns the first collection whose name matches title,
// or nil when none exists. An error is returned only on DB failure.
func findCollectionByName(title string) (*db.Collection, error) {
	cols, err := db.ListCollections()
	if err != nil {
		return nil, err
	}
	for i := range cols {
		if cols[i].Name == title {
			return &cols[i], nil
		}
	}
	return nil, nil
}

// -----------------------------------------------------------------
// Request-building helpers (shared between scaffold and merge)
// -----------------------------------------------------------------

// firstTag returns the first tag from the slice, or "" if empty.
// An empty return signals "no tag" so the caller can place the request
// at root level instead of inside a tag-named folder.
func firstTag(tags []string) string {
	if len(tags) > 0 && tags[0] != "" {
		return tags[0]
	}
	return ""
}

// operationName derives a human-readable request name from the operation.
func operationName(op openapi.Operation) string {
	if op.OperationID != "" {
		return op.OperationID
	}
	if op.Summary != "" {
		return op.Summary
	}
	return strings.ToUpper(op.Method)
}

// buildURL combines a base URL with a path template, converting {param} to {{param}}.
func buildURL(base, path string) string {
	result := pathParamRe.ReplaceAllString(path, "{{$1}}")
	return base + result
}

// buildParamEntries returns query-parameter KV entries from an operation's parameters.
// Required params are enabled; optional params are disabled.
func buildParamEntries(params []openapi.Parameter) []kvEntry {
	entries := []kvEntry{}
	for _, p := range params {
		if p.In != "query" {
			continue
		}
		value := ""
		if p.Example != nil {
			if s, ok := p.Example.(string); ok {
				value = s
			} else {
				value = fmt.Sprintf("%v", p.Example)
			}
		}
		entries = append(entries, kvEntry{Key: p.Name, Value: value, Enabled: p.Required})
	}
	return entries
}

// buildHeaderEntries returns header KV entries from an operation's parameters.
// Required params are enabled; optional params are disabled.
func buildHeaderEntries(params []openapi.Parameter) []kvEntry {
	entries := []kvEntry{}
	for _, p := range params {
		if p.In != "header" {
			continue
		}
		value := ""
		if p.Example != nil {
			if s, ok := p.Example.(string); ok {
				value = s
			} else {
				value = fmt.Sprintf("%v", p.Example)
			}
		}
		entries = append(entries, kvEntry{Key: p.Name, Value: value, Enabled: p.Required})
	}
	return entries
}

// marshalKV encodes a []kvEntry slice to a JSON string.
// Returns "[]" when entries is empty.
func marshalKV(entries []kvEntry) string {
	if len(entries) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(entries)
	return string(b)
}

// buildBody inspects the request body and returns (bodyType, bodyContent).
// Returns ("json", stub) when there is an application/json request body.
func buildBody(rb *openapi.RequestBody) (string, string) {
	if rb == nil {
		return "none", ""
	}
	mt, ok := rb.MediaTypes["application/json"]
	if !ok {
		return "none", ""
	}
	var stub interface{}
	if mt.Example != nil {
		stub = mt.Example
	} else {
		stub = schemaToStub(mt.Schema)
	}
	data, err := json.MarshalIndent(stub, "", "  ")
	if err != nil {
		return "json", "{}"
	}
	return "json", string(data)
}

// buildAuth maps the first security requirement entry to an auth_type/auth_config pair.
// Returns ("none", "{}") when no security is defined.
func buildAuth(security []map[string][]string, schemes map[string]openapi.SecurityScheme) (authType, authConfig string) {
	if len(security) == 0 || len(schemes) == 0 {
		return "none", "{}"
	}
	for schemeName := range security[0] {
		ss, ok := schemes[schemeName]
		if !ok {
			continue
		}
		switch {
		case ss.Type == "http" && strings.EqualFold(ss.Scheme, "bearer"):
			return "bearer", `{"token":""}`
		case ss.Type == "http" && strings.EqualFold(ss.Scheme, "basic"):
			return "basic", `{"username":"","password":""}`
		case ss.Type == "apiKey":
			cfg, _ := json.Marshal(map[string]string{
				"key":   ss.Name,
				"value": "",
				"in":    ss.In,
			})
			return "apikey", string(cfg)
		}
	}
	return "none", "{}"
}

// buildTests returns a starter test assertion for the first 2xx response found.
func buildTests(responses map[string]openapi.Response) string {
	for _, code := range []string{"200", "201", "202", "204"} {
		if _, ok := responses[code]; ok {
			return fmt.Sprintf("response.status == %s", code)
		}
	}
	return ""
}

// schemaToStub converts a JSON Schema map into a Go value suitable for JSON encoding.
func schemaToStub(schema map[string]interface{}) interface{} {
	if schema == nil {
		return map[string]interface{}{}
	}
	t, _ := schema["type"].(string)
	switch t {
	case "string":
		return ""
	case "number", "integer":
		return 0
	case "boolean":
		return false
	case "array":
		items, _ := schema["items"].(map[string]interface{})
		return []interface{}{schemaToStub(items)}
	case "object":
		result := map[string]interface{}{}
		props, ok := schema["properties"].(map[string]interface{})
		if !ok {
			return result
		}
		for key, propVal := range props {
			propSchema, _ := propVal.(map[string]interface{})
			result[key] = schemaToStub(propSchema)
		}
		return result
	default:
		return map[string]interface{}{}
	}
}
