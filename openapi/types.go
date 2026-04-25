// Package openapi provides parsing for OpenAPI 3.x and Swagger 2.0 spec files
// into a normalised, format-agnostic internal representation.
package openapi

// ParsedSpec is the normalised, format-agnostic representation of an API spec.
type ParsedSpec struct {
	Info       Info
	Servers    []Server
	Paths      []PathItem
	Components Components
	// XEnvironments holds environment data from the x-mashpotato-environments
	// extension, if present. Nil when the extension is absent.
	XEnvironments []XEnvironment
}

// Info holds high-level metadata about the API.
type Info struct {
	Title   string
	Version string
}

// Server represents a base URL for the API.
type Server struct {
	URL string
}

// PathItem groups all operations under a single path template.
type PathItem struct {
	Path       string
	Operations []Operation
}

// Operation represents a single HTTP operation on a path.
type Operation struct {
	OperationID string
	Method      string
	Tags        []string
	Summary     string
	Parameters  []Parameter
	RequestBody *RequestBody
	Responses   map[string]Response
	// Security holds the operation-level security requirements.
	// Each entry is a map from scheme name to a list of required scopes.
	Security []map[string][]string
}

// Parameter describes a single input to an operation (path, query, header, cookie).
type Parameter struct {
	Name     string
	In       string // "path", "query", "header", "cookie"
	Required bool
	Schema   map[string]interface{}
	Example  interface{} // holds the example value from the spec
}

// RequestBody describes the body that may accompany a request.
type RequestBody struct {
	Required bool
	// MediaTypes maps a media-type string (e.g. "application/json") to its schema.
	MediaTypes map[string]MediaType
}

// MediaType holds the schema for a given content type.
type MediaType struct {
	Schema  map[string]interface{}
	Example interface{} // holds the example value from the spec
}

// Response describes one possible response from an operation.
type Response struct {
	Description string
	Schema      map[string]interface{}
}

// Components holds reusable API objects, currently only security schemes.
type Components struct {
	SecuritySchemes map[string]SecurityScheme
}

// SecurityScheme describes an authentication method.
type SecurityScheme struct {
	Type   string // "http", "apiKey", "oauth2", "openIdConnect"
	Scheme string // for type "http": "bearer", "basic", etc.
	In     string // for type "apiKey": "header" or "query"
	Name   string // for type "apiKey": name of the header or query param
}

// XEnvironment represents a single environment from the x-mashpotato-environments
// extension in an OpenAPI spec.
type XEnvironment struct {
	Name     string
	IsGlobal bool
	Variables []XVariable
}

// XVariable represents a single variable within an XEnvironment.
type XVariable struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	IsSecret bool   `json:"is_secret"`
}
