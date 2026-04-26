package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"gopkg.in/yaml.v3"
	"mash-potato/db"
)

// standardHTTPHeaders is the set of HTTP headers that should be omitted from
// the exported parameters to avoid conflicts with protocol-level handling.
var standardHTTPHeaders = map[string]bool{
	"content-type":   true,
	"authorization":  true,
	"accept":         true,
	"content-length": true,
	"host":           true,
	"user-agent":     true,
	"connection":     true,
}

// authTypeToSecurity maps internal auth_type values to OpenAPI security scheme
// info. Each entry returns (schemeType, schemeSubType) usable in components.securitySchemes.
var authTypeToSecurity = map[string]struct {
	schemeType string
	scheme     string
	in         string
	name       string
}{
	"bearer": {schemeType: "http", scheme: "bearer"},
	"basic":  {schemeType: "http", scheme: "basic"},
	"apikey": {schemeType: "apiKey", in: "header", name: "X-API-Key"},
}

// extractBaseURLs collects unique base URLs from all requests in the collection.
// It returns a deduplicated list of servers suitable for the OpenAPI servers section.
func extractBaseURLs(reqs []*db.Request) []map[string]interface{} {
	seen := map[string]bool{}
	var servers []map[string]interface{}
	for _, req := range reqs {
		u := req.URL
		parsed, err := url.Parse(u)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			continue
		}
		base := parsed.Scheme + "://" + parsed.Host
		if !seen[base] {
			seen[base] = true
			servers = append(servers, map[string]interface{}{
				"url": base,
			})
		}
	}
	if len(servers) == 0 {
		servers = append(servers, map[string]interface{}{
			"url": "http://localhost",
		})
	}
	return servers
}

// exportCollectionAsOpenAPI builds and returns a valid OpenAPI 3.1 YAML document
// representing all requests in the given collection. History entries are consulted
// to enrich response schemas where available. All environment variables are resolved
// to their actual values — no {{variable}} tokens remain in the exported spec.
func exportCollectionAsOpenAPI(collectionID string) (string, error) {
	col, err := db.GetCollection(collectionID)
	if err != nil {
		return "", fmt.Errorf("ExportCollectionAsOpenAPI: collection not found: %w", err)
	}

	reqs, err := db.ListRequests(collectionID)
	if err != nil {
		return "", fmt.Errorf("ExportCollectionAsOpenAPI: list requests: %w", err)
	}
	if len(reqs) == 0 {
		return "", fmt.Errorf("ExportCollectionAsOpenAPI: collection %q has no requests", col.Name)
	}

	// Build variable map for interpolation (globals + active environment).
	vars := buildExportVarsMap()
	secretsMap := map[string]bool{}

	// Load history once; build index keyed by "METHOD url" for fast lookup.
	history, err := db.ListHistory(1000)
	if err != nil {
		// Non-fatal — degrade gracefully to default responses.
		history = nil
	}
	// historyIndex maps "METHOD|url" → most-recent HistoryEntry (ListHistory is newest-first).
	historyIndex := map[string]db.HistoryEntry{}
	for _, h := range history {
		key := strings.ToUpper(h.Method) + "|" + h.URL
		if _, exists := historyIndex[key]; !exists {
			historyIndex[key] = h
		}
	}

	// OpenAPI 3.1 document represented as ordered maps for stable YAML output.
	paths := map[string]interface{}{}
	// Accumulate security schemes across all requests.
	securitySchemes := map[string]interface{}{}

	for i := range reqs {
		req := &reqs[i]
		// Interpolate all {{variable}} tokens with actual values.
		if len(vars) > 0 {
			urlR := Interpolate(req.URL, vars, secretsMap, nil)
			headersR := Interpolate(req.Headers, vars, secretsMap, nil)
			paramsR := Interpolate(req.Params, vars, secretsMap, nil)
			bodyR := Interpolate(req.Body, vars, secretsMap, nil)
			authR := Interpolate(req.AuthConfig, vars, secretsMap, nil)

			req.URL = urlR.Value
			req.Headers = headersR.Value
			req.Params = paramsR.Value
			req.Body = bodyR.Value
			req.AuthConfig = authR.Value
		}

		method := strings.ToLower(req.Method)
		if method == "" {
			method = "get"
		}

		// Strip query string from path (query params go into parameters).
		path := req.URL
		if idx := strings.Index(path, "?"); idx != -1 {
			path = path[:idx]
		}
		// Strip scheme+host to get just the path portion.
		if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
			withoutScheme := strings.SplitN(path, "://", 2)[1]
			slashIdx := strings.Index(withoutScheme, "/")
			if slashIdx == -1 {
				path = "/"
			} else {
				path = withoutScheme[slashIdx:]
			}
		}
		if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}

		operation := buildExportOperation(*req, historyIndex)

		// Add security requirement if request has auth configured.
		if req.AuthType != "" && req.AuthType != "none" {
			if secRef, ok := buildExportSecurity(*req, securitySchemes); ok {
				operation["security"] = secRef
			}
		}

		// Path items may have multiple methods; merge if the path already exists.
		if existing, ok := paths[path]; ok {
			if pathItem, ok := existing.(map[string]interface{}); ok {
				pathItem[method] = operation
			}
		} else {
			paths[path] = map[string]interface{}{
				method: operation,
			}
		}
	}

	// Build pointer slice for extractBaseURLs (mutations were applied in-place).
	reqPtrs := make([]*db.Request, len(reqs))
	for i := range reqs {
		reqPtrs[i] = &reqs[i]
	}
	servers := extractBaseURLs(reqPtrs)

	doc := map[string]interface{}{
		"openapi": "3.1.0",
		"info": map[string]interface{}{
			"title":   col.Name,
			"version": "1.0.0",
		},
		"servers": servers,
		"paths":   paths,
	}

	// Add components.securitySchemes if any auth was found.
	if len(securitySchemes) > 0 {
		doc["components"] = map[string]interface{}{
			"securitySchemes": securitySchemes,
		}
	}

	out, err := yaml.Marshal(doc)
	if err != nil {
		return "", fmt.Errorf("ExportCollectionAsOpenAPI: marshal yaml: %w", err)
	}
	return string(out), nil
}

// buildExportVarsMap builds a variable map for interpolation during export.
// It loads global environment variables first, then active environment variables
// on top (same cascade as SendRequest), ensuring all {{variable}} tokens are
// resolved to their actual values.
func buildExportVarsMap() map[string]string {
	vars := map[string]string{}

	// 1. Load global variables (always active).
	globalID, err := db.GetGlobalEnvironmentID()
	if err != nil {
		return vars
	}
	globalVars, err := db.GetVariables(globalID, nil)
	if err == nil {
		for _, v := range globalVars {
			vars[v.Key] = v.Value
		}
	}

	// 2. Load active environment variables, overriding globals with same key.
	activeEnvID, err := db.GetSetting("active_environment_id")
	if err == nil && activeEnvID != "" && activeEnvID != globalID {
		activeVars, err := db.GetVariables(activeEnvID, nil)
		if err == nil {
			for _, v := range activeVars {
				vars[v.Key] = v.Value
			}
		}
	}

	return vars
}

// buildExportOperation converts a single db.Request into an OpenAPI operation map.
func buildExportOperation(req db.Request, historyIndex map[string]db.HistoryEntry) map[string]interface{} {
	op := map[string]interface{}{
		"operationId": toSnakeCase(req.Name),
		"summary":     req.Name,
	}

	// Parameters: path params + query params + filtered headers.
	params := buildExportParameters(req)
	if len(params) > 0 {
		op["parameters"] = params
	}

	// Request body for json / form body types.
	rb := buildExportRequestBody(req)
	if rb != nil {
		op["requestBody"] = rb
	}

	// Responses: prefer history, fall back to default 200.
	op["responses"] = buildExportResponses(req, historyIndex)

	return op
}

// buildExportParameters builds the OpenAPI parameters list from a request's
// query params, and headers — omitting disabled entries and standard HTTP headers.
// Note: Path parameters are not extracted since all {{variable}} tokens are
// resolved to concrete values during export.
func buildExportParameters(req db.Request) []map[string]interface{} {
	var params []map[string]interface{}

	// Query params.
	var queryKVs []kvEntry
	if err := json.Unmarshal([]byte(req.Params), &queryKVs); err == nil {
		for _, kv := range queryKVs {
			if !kv.Enabled || kv.Key == "" {
				continue
			}
			param := map[string]interface{}{
				"name":     kv.Key,
				"in":       "query",
				"required": false,
				"schema":   map[string]interface{}{"type": "string"},
			}
			if kv.Value != "" {
				param["example"] = kv.Value
			}
			params = append(params, param)
		}
	}

	// Header params — skip standard HTTP headers and auth headers (handled via security).
	var headerKVs []kvEntry
	if err := json.Unmarshal([]byte(req.Headers), &headerKVs); err == nil {
		for _, kv := range headerKVs {
			if !kv.Enabled || kv.Key == "" {
				continue
			}
			if standardHTTPHeaders[strings.ToLower(kv.Key)] {
				continue
			}
			// Skip auth-related headers since they're expressed via security schemes.
			if req.AuthType == "bearer" && strings.EqualFold(kv.Key, "Authorization") {
				continue
			}
			if req.AuthType == "apikey" {
				var cfg struct {
					Key string `json:"key"`
				}
				if err := json.Unmarshal([]byte(req.AuthConfig), &cfg); err == nil && strings.EqualFold(kv.Key, cfg.Key) {
					continue
				}
			}
			param := map[string]interface{}{
				"name":     kv.Key,
				"in":       "header",
				"required": false,
				"schema":   map[string]interface{}{"type": "string"},
			}
			if kv.Value != "" {
				param["example"] = kv.Value
			}
			params = append(params, param)
		}
	}

	return params
}

// buildExportRequestBody returns a requestBody object for json/form body types, or nil.
// When the body contains valid JSON for "json" type, it is included as an example.
func buildExportRequestBody(req db.Request) map[string]interface{} {
	switch req.BodyType {
	case "json":
		content := map[string]interface{}{
			"schema": map[string]interface{}{"type": "object"},
		}
		if req.Body != "" {
			var v interface{}
			if err := json.Unmarshal([]byte(req.Body), &v); err == nil {
				content["example"] = v
				schema := introspectJSONSchema(req.Body)
				if schema != nil {
					content["schema"] = schema
				}
			}
		}
		return map[string]interface{}{
			"content": map[string]interface{}{
				"application/json": content,
			},
		}
	case "form":
		return map[string]interface{}{
			"content": map[string]interface{}{
				"application/x-www-form-urlencoded": map[string]interface{}{
					"schema": map[string]interface{}{"type": "object"},
				},
			},
		}
	case "raw":
		if req.Body == "" {
			return nil
		}
		return map[string]interface{}{
			"content": map[string]interface{}{
				"text/plain": map[string]interface{}{
					"schema":  map[string]interface{}{"type": "string"},
					"example": req.Body,
				},
			},
		}
	}
	return nil
}

// buildExportResponses returns the responses map for an operation.
// When history contains an entry matching the request's URL+method, the most
// recent response status is used as the key and the response body (if valid JSON)
// is introspected to build a simple inline JSON Schema.
func buildExportResponses(req db.Request, historyIndex map[string]db.HistoryEntry) map[string]interface{} {
	key := strings.ToUpper(req.Method) + "|" + req.URL
	entry, found := historyIndex[key]
	if !found {
		return map[string]interface{}{
			"200": map[string]interface{}{"description": "OK"},
		}
	}

	statusKey := fmt.Sprintf("%d", entry.ResponseStatus)
	if statusKey == "0" {
		statusKey = "200"
	}

	responseObj := map[string]interface{}{
		"description": fmt.Sprintf("Response %s", statusKey),
	}

	// Try to introspect the JSON response body.
	if entry.ResponseBody != "" {
		schema := introspectJSONSchema(entry.ResponseBody)
		if schema != nil {
			responseObj["content"] = map[string]interface{}{
				"application/json": map[string]interface{}{
					"schema": schema,
				},
			}
		}
	}

	return map[string]interface{}{
		statusKey: responseObj,
	}
}

// introspectJSONSchema parses raw JSON and returns a one-level-deep JSON Schema
// map describing its structure. Returns nil if the input is not valid JSON.
func introspectJSONSchema(rawJSON string) map[string]interface{} {
	var v interface{}
	if err := json.Unmarshal([]byte(rawJSON), &v); err != nil {
		return nil
	}
	return jsonValueToSchema(v)
}

// jsonValueToSchema converts a parsed JSON value into a JSON Schema map (one level deep).
func jsonValueToSchema(v interface{}) map[string]interface{} {
	switch val := v.(type) {
	case map[string]interface{}:
		props := map[string]interface{}{}
		for k, pv := range val {
			props[k] = jsonValueToSchema(pv)
		}
		return map[string]interface{}{
			"type":       "object",
			"properties": props,
		}
	case []interface{}:
		schema := map[string]interface{}{"type": "array"}
		if len(val) > 0 {
			schema["items"] = jsonValueToSchema(val[0])
		}
		return schema
	case string:
		return map[string]interface{}{"type": "string"}
	case float64:
		return map[string]interface{}{"type": "number"}
	case bool:
		return map[string]interface{}{"type": "boolean"}
	case nil:
		return map[string]interface{}{"type": "null"}
	default:
		return map[string]interface{}{"type": "string"}
	}
}

// buildExportSecurity creates a security requirement for the request's auth config
// and adds the corresponding scheme to the shared securitySchemes map.
// Returns the security requirement array and whether auth was applicable.
func buildExportSecurity(req db.Request, securitySchemes map[string]interface{}) ([]map[string][]string, bool) {
	info, ok := authTypeToSecurity[req.AuthType]
	if !ok {
		return nil, false
	}

	schemeName := req.AuthType
	switch req.AuthType {
	case "bearer":
		securitySchemes[schemeName] = map[string]interface{}{
			"type":   info.schemeType,
			"scheme": info.scheme,
		}
	case "basic":
		securitySchemes[schemeName] = map[string]interface{}{
			"type":   info.schemeType,
			"scheme": info.scheme,
		}
	case "apikey":
		var cfg struct {
			Key string `json:"key"`
			In  string `json:"in"`
		}
		if err := json.Unmarshal([]byte(req.AuthConfig), &cfg); err != nil {
			cfg.Key = info.name
			cfg.In = info.in
		}
		if cfg.In == "" {
			cfg.In = "header"
		}
		if cfg.Key == "" {
			cfg.Key = "X-API-Key"
		}
		securitySchemes[schemeName] = map[string]interface{}{
			"type": info.schemeType,
			"in":   cfg.In,
			"name": cfg.Key,
		}
	default:
		return nil, false
	}

	return []map[string][]string{{schemeName: {}}}, true
}

// toSnakeCase converts a request name to a snake_cased operationId by replacing
// non-alphanumeric characters (including spaces) with underscores.
func toSnakeCase(name string) string {
	var b strings.Builder
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(unicode.ToLower(r))
		} else {
			b.WriteRune('_')
		}
	}
	// Collapse consecutive underscores.
	result := regexp.MustCompile(`_+`).ReplaceAllString(b.String(), "_")
	result = strings.Trim(result, "_")
	return result
}
