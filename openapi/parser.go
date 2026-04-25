package openapi

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// Parse reads a file at filePath, auto-detects whether it is an OpenAPI 3.x or
// Swagger 2.0 spec (JSON or YAML), and returns a normalised *ParsedSpec.
// It returns a descriptive error for unrecognised or malformed input.
func Parse(filePath string) (*ParsedSpec, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("openapi: reading file %q: %w", filePath, err)
	}

	// Decode into a generic map to detect format before committing to a schema.
	raw, err := decodeRaw(data)
	if err != nil {
		return nil, fmt.Errorf("openapi: decoding %q: %w", filePath, err)
	}

	if hasKey(raw, "openapi") {
		return parseOpenAPI3(raw)
	}
	if hasKey(raw, "swagger") {
		return parseSwagger2(raw)
	}

	return nil, fmt.Errorf("openapi: %q is not a recognised OpenAPI 3.x or Swagger 2.0 document (missing \"openapi\" or \"swagger\" root key)", filePath)
}

// decodeRaw unmarshals JSON or YAML bytes into a generic map.
func decodeRaw(data []byte) (map[string]interface{}, error) {
	// Try JSON first — JSON is a strict subset of YAML, so the YAML decoder would
	// accept JSON as well, but the JSON decoder is faster for JSON files.
	trimmed := strings.TrimSpace(string(data))
	if strings.HasPrefix(trimmed, "{") {
		var m map[string]interface{}
		if err := json.Unmarshal(data, &m); err != nil {
			return nil, fmt.Errorf("json: %w", err)
		}
		return m, nil
	}

	// Fall back to YAML (covers YAML and JSON with leading whitespace/comments).
	var m map[string]interface{}
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("yaml: %w", err)
	}
	if m == nil {
		return nil, fmt.Errorf("document is empty")
	}
	return m, nil
}

// hasKey returns true when the map contains the given key with a non-nil value.
func hasKey(m map[string]interface{}, key string) bool {
	v, ok := m[key]
	return ok && v != nil
}

// -----------------------------------------------------------------
// OpenAPI 3.x
// -----------------------------------------------------------------

func parseOpenAPI3(raw map[string]interface{}) (*ParsedSpec, error) {
	spec := &ParsedSpec{}

	// Info
	if infoRaw, ok := raw["info"].(map[string]interface{}); ok {
		spec.Info = Info{
			Title:   str(infoRaw, "title"),
			Version: str(infoRaw, "version"),
		}
	}

	// Servers
	if serversRaw, ok := raw["servers"].([]interface{}); ok {
		for _, s := range serversRaw {
			if sm, ok := s.(map[string]interface{}); ok {
				spec.Servers = append(spec.Servers, Server{URL: str(sm, "url")})
			}
		}
	}

	// Paths
	if pathsRaw, ok := raw["paths"].(map[string]interface{}); ok {
		for path, pathVal := range pathsRaw {
			pathMap, ok := pathVal.(map[string]interface{})
			if !ok {
				continue
			}
			item := PathItem{Path: path}
			for _, method := range httpMethods() {
				opRaw, ok := pathMap[method].(map[string]interface{})
				if !ok {
					continue
				}
				op, err := parseOperation3(method, opRaw)
				if err != nil {
					return nil, err
				}
				item.Operations = append(item.Operations, op)
			}
			spec.Paths = append(spec.Paths, item)
		}
	}

	// Components -> SecuritySchemes
	spec.Components.SecuritySchemes = parseSecuritySchemes3(raw)

	// x-mashpotato-environments extension
	if xEnvRaw, ok := raw["x-mashpotato-environments"].([]interface{}); ok {
		for _, envVal := range xEnvRaw {
			envMap, ok := envVal.(map[string]interface{})
			if !ok {
				continue
			}
			env := XEnvironment{
				Name: str(envMap, "name"),
			}
			if isGlobal, ok := envMap["is_global"].(bool); ok {
				env.IsGlobal = isGlobal
			}
			if varsRaw, ok := envMap["variables"].([]interface{}); ok {
				for _, vVal := range varsRaw {
					vMap, ok := vVal.(map[string]interface{})
					if !ok {
						continue
					}
					v := XVariable{
						Key:   str(vMap, "key"),
						Value: str(vMap, "value"),
					}
					if isSecret, ok := vMap["is_secret"].(bool); ok {
						v.IsSecret = isSecret
					}
					env.Variables = append(env.Variables, v)
				}
			}
			spec.XEnvironments = append(spec.XEnvironments, env)
		}
	}

	return spec, nil
}

func parseOperation3(method string, raw map[string]interface{}) (Operation, error) {
	op := Operation{
		OperationID: str(raw, "operationId"),
		Method:      strings.ToUpper(method),
		Summary:     str(raw, "summary"),
	}

	// Tags
	if tags, ok := raw["tags"].([]interface{}); ok {
		for _, t := range tags {
			if s, ok := t.(string); ok {
				op.Tags = append(op.Tags, s)
			}
		}
	}

	// Parameters
	if params, ok := raw["parameters"].([]interface{}); ok {
		for _, p := range params {
			pm, ok := p.(map[string]interface{})
			if !ok {
				continue
			}
			param := Parameter{
				Name:     str(pm, "name"),
				In:       str(pm, "in"),
				Required: boolVal(pm, "required"),
				Schema:   mapVal(pm, "schema"),
				Example:  pm["example"],
			}
			op.Parameters = append(op.Parameters, param)
		}
	}

	// RequestBody
	if rbRaw, ok := raw["requestBody"].(map[string]interface{}); ok {
		rb := &RequestBody{
			Required:   boolVal(rbRaw, "required"),
			MediaTypes: make(map[string]MediaType),
		}
		if contentRaw, ok := rbRaw["content"].(map[string]interface{}); ok {
			for mediaType, mtVal := range contentRaw {
				mt := MediaType{}
				if mtMap, ok := mtVal.(map[string]interface{}); ok {
					mt.Schema = mapVal(mtMap, "schema")
					if ex, ok := mtMap["example"]; ok {
						mt.Example = ex
					}
				}
				rb.MediaTypes[mediaType] = mt
			}
		}
		op.RequestBody = rb
	}

	// Responses
	if responsesRaw, ok := raw["responses"].(map[string]interface{}); ok {
		op.Responses = make(map[string]Response)
		for statusCode, respVal := range responsesRaw {
			respMap, ok := respVal.(map[string]interface{})
			if !ok {
				continue
			}
			resp := Response{
				Description: str(respMap, "description"),
			}
			// Extract schema from first content entry if present.
			if contentRaw, ok := respMap["content"].(map[string]interface{}); ok {
				for _, mtVal := range contentRaw {
					if mtMap, ok := mtVal.(map[string]interface{}); ok {
						resp.Schema = mapVal(mtMap, "schema")
					}
					break // use first media type
				}
			}
			op.Responses[statusCode] = resp
		}
	}

	// Security requirements
	op.Security = parseSecurityRequirements(raw)

	return op, nil
}

func parseSecuritySchemes3(raw map[string]interface{}) map[string]SecurityScheme {
	componentsRaw, ok := raw["components"].(map[string]interface{})
	if !ok {
		return nil
	}
	schemesRaw, ok := componentsRaw["securitySchemes"].(map[string]interface{})
	if !ok {
		return nil
	}
	schemes := make(map[string]SecurityScheme, len(schemesRaw))
	for name, schVal := range schemesRaw {
		schMap, ok := schVal.(map[string]interface{})
		if !ok {
			continue
		}
		schemes[name] = SecurityScheme{
			Type:   str(schMap, "type"),
			Scheme: str(schMap, "scheme"),
			In:     str(schMap, "in"),
			Name:   str(schMap, "name"),
		}
	}
	return schemes
}

// -----------------------------------------------------------------
// Swagger 2.0
// -----------------------------------------------------------------

func parseSwagger2(raw map[string]interface{}) (*ParsedSpec, error) {
	spec := &ParsedSpec{}

	// Info
	if infoRaw, ok := raw["info"].(map[string]interface{}); ok {
		spec.Info = Info{
			Title:   str(infoRaw, "title"),
			Version: str(infoRaw, "version"),
		}
	}

	// Servers — collapse host + basePath + schemes into a single URL.
	host := str(raw, "host")
	basePath := str(raw, "basePath")
	if basePath == "" {
		basePath = "/"
	}
	schemes := []string{}
	if schemesRaw, ok := raw["schemes"].([]interface{}); ok {
		for _, s := range schemesRaw {
			if sv, ok := s.(string); ok {
				schemes = append(schemes, sv)
			}
		}
	}
	if len(schemes) == 0 {
		schemes = []string{"https"}
	}
	if host != "" {
		for _, scheme := range schemes {
			spec.Servers = append(spec.Servers, Server{
				URL: scheme + "://" + host + basePath,
			})
		}
	}

	// Paths
	if pathsRaw, ok := raw["paths"].(map[string]interface{}); ok {
		for path, pathVal := range pathsRaw {
			pathMap, ok := pathVal.(map[string]interface{})
			if !ok {
				continue
			}
			// Path-level parameters (shared across operations)
			var pathLevelParams []Parameter
			if pParams, ok := pathMap["parameters"].([]interface{}); ok {
				pathLevelParams = parseParams2(pParams)
			}

			item := PathItem{Path: path}
			for _, method := range httpMethods() {
				opRaw, ok := pathMap[method].(map[string]interface{})
				if !ok {
					continue
				}
				op, err := parseOperation2(method, opRaw, pathLevelParams)
				if err != nil {
					return nil, err
				}
				item.Operations = append(item.Operations, op)
			}
			spec.Paths = append(spec.Paths, item)
		}
	}

	// SecurityDefinitions -> Components.SecuritySchemes
	if secDefs, ok := raw["securityDefinitions"].(map[string]interface{}); ok {
		spec.Components.SecuritySchemes = make(map[string]SecurityScheme, len(secDefs))
		for name, schVal := range secDefs {
			schMap, ok := schVal.(map[string]interface{})
			if !ok {
				continue
			}
			ss := SecurityScheme{
				Type: str(schMap, "type"),
				In:   str(schMap, "in"),
				Name: str(schMap, "name"),
			}
			// Swagger 2.0 uses "basic" as type directly; normalise to http scheme.
			if ss.Type == "basic" {
				ss.Type = "http"
				ss.Scheme = "basic"
			}
			// apiKey remains; oauth2 remains.
			spec.Components.SecuritySchemes[name] = ss
		}
	}

	// x-mashpotato-environments extension (Swagger 2.0)
	if xEnvRaw, ok := raw["x-mashpotato-environments"].([]interface{}); ok {
		for _, envVal := range xEnvRaw {
			envMap, ok := envVal.(map[string]interface{})
			if !ok {
				continue
			}
			env := XEnvironment{
				Name: str(envMap, "name"),
			}
			if isGlobal, ok := envMap["is_global"].(bool); ok {
				env.IsGlobal = isGlobal
			}
			if varsRaw, ok := envMap["variables"].([]interface{}); ok {
				for _, vVal := range varsRaw {
					vMap, ok := vVal.(map[string]interface{})
					if !ok {
						continue
					}
					v := XVariable{
						Key:   str(vMap, "key"),
						Value: str(vMap, "value"),
					}
					if isSecret, ok := vMap["is_secret"].(bool); ok {
						v.IsSecret = isSecret
					}
					env.Variables = append(env.Variables, v)
				}
			}
			spec.XEnvironments = append(spec.XEnvironments, env)
		}
	}

	return spec, nil
}

func parseOperation2(method string, raw map[string]interface{}, pathParams []Parameter) (Operation, error) {
	op := Operation{
		OperationID: str(raw, "operationId"),
		Method:      strings.ToUpper(method),
		Summary:     str(raw, "summary"),
	}

	// Tags
	if tags, ok := raw["tags"].([]interface{}); ok {
		for _, t := range tags {
			if s, ok := t.(string); ok {
				op.Tags = append(op.Tags, s)
			}
		}
	}

	// Parameters — merge path-level and operation-level, operation overrides.
	opParams := []Parameter{}
	if params, ok := raw["parameters"].([]interface{}); ok {
		opParams = parseParams2(params)
	}
	op.Parameters = mergeParams(pathParams, opParams)

	// RequestBody — in Swagger 2.0 a "body" parameter becomes a RequestBody.
	for i, p := range op.Parameters {
		if p.In == "body" {
			op.RequestBody = &RequestBody{
				Required:   p.Required,
				MediaTypes: map[string]MediaType{"application/json": {Schema: p.Schema}},
			}
			// Remove the body parameter from the Parameters slice.
			op.Parameters = append(op.Parameters[:i], op.Parameters[i+1:]...)
			break
		}
	}

	// Responses
	if responsesRaw, ok := raw["responses"].(map[string]interface{}); ok {
		op.Responses = make(map[string]Response)
		for statusCode, respVal := range responsesRaw {
			respMap, ok := respVal.(map[string]interface{})
			if !ok {
				continue
			}
			op.Responses[statusCode] = Response{
				Description: str(respMap, "description"),
				Schema:      mapVal(respMap, "schema"),
			}
		}
	}

	// Security requirements
	op.Security = parseSecurityRequirements(raw)

	return op, nil
}

func parseParams2(params []interface{}) []Parameter {
	result := []Parameter{}
	for _, p := range params {
		pm, ok := p.(map[string]interface{})
		if !ok {
			continue
		}
		param := Parameter{
			Name:     str(pm, "name"),
			In:       str(pm, "in"),
			Required: boolVal(pm, "required"),
			Schema:   mapVal(pm, "schema"),
			Example:  pm["example"],
		}
		// Swagger 2.0 may inline the schema directly on the parameter.
		if param.Schema == nil {
			if t, ok := pm["type"]; ok {
				param.Schema = map[string]interface{}{"type": t}
			}
		}
		result = append(result, param)
	}
	return result
}

// mergeParams merges path-level params with operation-level params.
// Operation-level entries with the same (name, in) pair override path-level entries.
func mergeParams(pathParams, opParams []Parameter) []Parameter {
	merged := make([]Parameter, 0, len(pathParams)+len(opParams))
	seen := map[string]bool{}
	for _, p := range opParams {
		key := p.In + ":" + p.Name
		seen[key] = true
		merged = append(merged, p)
	}
	for _, p := range pathParams {
		key := p.In + ":" + p.Name
		if !seen[key] {
			merged = append(merged, p)
		}
	}
	return merged
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

func httpMethods() []string {
	return []string{"get", "post", "put", "patch", "delete", "head", "options", "trace"}
}

func str(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func boolVal(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

func mapVal(m map[string]interface{}, key string) map[string]interface{} {
	if v, ok := m[key]; ok {
		if mv, ok := v.(map[string]interface{}); ok {
			return mv
		}
	}
	return nil
}

// parseSecurityRequirements extracts the "security" array from a raw operation map.
// Each entry is a map from scheme name to a list of scope strings.
func parseSecurityRequirements(raw map[string]interface{}) []map[string][]string {
	secRaw, ok := raw["security"].([]interface{})
	if !ok {
		return nil
	}
	var result []map[string][]string
	for _, entry := range secRaw {
		entryMap, ok := entry.(map[string]interface{})
		if !ok {
			continue
		}
		req := make(map[string][]string, len(entryMap))
		for name, scopesRaw := range entryMap {
			var scopes []string
			if scopeList, ok := scopesRaw.([]interface{}); ok {
				for _, s := range scopeList {
					if sv, ok := s.(string); ok {
						scopes = append(scopes, sv)
					}
				}
			}
			if scopes == nil {
				scopes = []string{}
			}
			req[name] = scopes
		}
		result = append(result, req)
	}
	return result
}
