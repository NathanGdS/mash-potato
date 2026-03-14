package httpclient

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mash-potato/db"
)

// ─── buildURL ────────────────────────────────────────────────────────────────

// US-6: URL configuration
func TestBuildURL_NoParams(t *testing.T) {
	u, err := buildURL("https://example.com/path", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if u != "https://example.com/path" {
		t.Errorf("unexpected URL: %q", u)
	}
}

func TestBuildURL_EmptyURL_ReturnsError(t *testing.T) {
	_, err := buildURL("", nil)
	if err == nil {
		t.Fatal("expected error for empty URL")
	}
}

func TestBuildURL_AddsHTTPSSchemeWhenMissing(t *testing.T) {
	u, err := buildURL("example.com", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.HasPrefix(u, "https://") {
		t.Errorf("expected https:// prefix, got %q", u)
	}
}

// US-8: Query params appended to URL
func TestBuildURL_AppendsEnabledParams(t *testing.T) {
	params := []kvRow{
		{Key: "foo", Value: "bar", Enabled: true},
		{Key: "baz", Value: "qux", Enabled: true},
	}
	u, err := buildURL("https://api.example.com", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(u, "foo=bar") || !strings.Contains(u, "baz=qux") {
		t.Errorf("expected params in URL, got %q", u)
	}
}

func TestBuildURL_SkipsDisabledParams(t *testing.T) {
	params := []kvRow{
		{Key: "visible", Value: "yes", Enabled: true},
		{Key: "hidden", Value: "no", Enabled: false},
	}
	u, err := buildURL("https://api.example.com", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(u, "hidden") {
		t.Errorf("disabled param should not appear in URL: %q", u)
	}
	if !strings.Contains(u, "visible=yes") {
		t.Errorf("enabled param should appear in URL: %q", u)
	}
}

func TestBuildURL_SkipsParamsWithEmptyKey(t *testing.T) {
	params := []kvRow{
		{Key: "", Value: "orphan", Enabled: true},
	}
	u, err := buildURL("https://example.com", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(u, "orphan") {
		t.Errorf("param with empty key should not appear in URL: %q", u)
	}
}

// ─── parseKV ────────────────────────────────────────────────────────────────

func TestParseKV_ValidJSON(t *testing.T) {
	rows := parseKV(`[{"key":"foo","value":"bar","enabled":true}]`)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].Key != "foo" || rows[0].Value != "bar" || !rows[0].Enabled {
		t.Errorf("unexpected row: %+v", rows[0])
	}
}

func TestParseKV_EmptyArray(t *testing.T) {
	rows := parseKV("[]")
	if len(rows) != 0 {
		t.Errorf("expected 0 rows, got %d", len(rows))
	}
}

func TestParseKV_InvalidJSON_ReturnsNil(t *testing.T) {
	rows := parseKV("not-json")
	if rows != nil {
		t.Errorf("expected nil for invalid JSON, got %+v", rows)
	}
}

func TestParseKV_DisabledRow(t *testing.T) {
	rows := parseKV(`[{"key":"x","value":"y","enabled":false}]`)
	if len(rows) != 1 || rows[0].Enabled {
		t.Errorf("expected disabled row, got %+v", rows)
	}
}

// ─── ExecuteRequest helpers ──────────────────────────────────────────────────

func newTestRequest(method, rawURL, headers, params, bodyType, body string) db.Request {
	return db.Request{
		ID:           "test-id",
		CollectionID: "col-id",
		Name:         "Test Request",
		Method:       method,
		URL:          rawURL,
		Headers:      headers,
		Params:       params,
		BodyType:     bodyType,
		Body:         body,
	}
}

// ─── ExecuteRequest ──────────────────────────────────────────────────────────

// US-10: Send Request — basic GET
func TestExecuteRequest_GET_ReturnsStatus200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("expected GET, got %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	// US-11: status code and text
	if result.StatusCode != 200 {
		t.Errorf("expected StatusCode=200, got %d", result.StatusCode)
	}
	if !strings.Contains(result.StatusText, "200") {
		t.Errorf("expected StatusText to contain 200, got %q", result.StatusText)
	}
	// US-12: response body
	if result.Body != `{"ok":true}` {
		t.Errorf("unexpected Body: %q", result.Body)
	}
	// US-14: metrics
	if result.SizeBytes != int64(len(`{"ok":true}`)) {
		t.Errorf("unexpected SizeBytes: %d", result.SizeBytes)
	}
	if result.DurationMs < 0 {
		t.Errorf("DurationMs should be >= 0, got %d", result.DurationMs)
	}
}

// US-10: Send Request — POST with JSON body
func TestExecuteRequest_POST_JSON_SetsContentType(t *testing.T) {
	var gotContentType, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotContentType = r.Header.Get("Content-Type")
		buf := make([]byte, r.ContentLength)
		r.Body.Read(buf)
		gotBody = string(buf)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	payload := `{"name":"test"}`
	req := newTestRequest("POST", srv.URL, "[]", "[]", "json", payload)
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if result.StatusCode != 201 {
		t.Errorf("expected 201, got %d", result.StatusCode)
	}
	if gotContentType != "application/json" {
		t.Errorf("expected Content-Type=application/json, got %q", gotContentType)
	}
	if gotBody != payload {
		t.Errorf("unexpected body sent: %q", gotBody)
	}
}

// US-10: Send Request — POST with raw body
func TestExecuteRequest_POST_Raw_SetsContentType(t *testing.T) {
	var gotContentType string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotContentType = r.Header.Get("Content-Type")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := newTestRequest("POST", srv.URL, "[]", "[]", "raw", "plain text")
	ExecuteRequest(req)
	if gotContentType != "text/plain" {
		t.Errorf("expected text/plain, got %q", gotContentType)
	}
}

// US-10: Send Request — POST with form-data body
func TestExecuteRequest_POST_FormData_SendsFields(t *testing.T) {
	var gotField string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.ParseMultipartForm(1 << 20)
		gotField = r.FormValue("username")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	body := `[{"key":"username","value":"alice","enabled":true}]`
	req := newTestRequest("POST", srv.URL, "[]", "[]", "form-data", body)
	_, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if gotField != "alice" {
		t.Errorf("expected username=alice in form, got %q", gotField)
	}
}

func TestExecuteRequest_FormData_SkipsDisabledFields(t *testing.T) {
	var gotField string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.ParseMultipartForm(1 << 20)
		gotField = r.FormValue("hidden")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	body := `[{"key":"hidden","value":"secret","enabled":false}]`
	req := newTestRequest("POST", srv.URL, "[]", "[]", "form-data", body)
	ExecuteRequest(req)
	if gotField != "" {
		t.Errorf("disabled form field should not be sent, got %q", gotField)
	}
}

// US-7: Headers — enabled headers are sent, disabled ones are not
func TestExecuteRequest_SendsEnabledHeaders(t *testing.T) {
	var gotCustom, gotDisabled string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCustom = r.Header.Get("X-Custom")
		gotDisabled = r.Header.Get("X-Disabled")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	headers := `[{"key":"X-Custom","value":"hello","enabled":true},{"key":"X-Disabled","value":"nope","enabled":false}]`
	req := newTestRequest("GET", srv.URL, headers, "[]", "none", "")
	_, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if gotCustom != "hello" {
		t.Errorf("expected X-Custom=hello, got %q", gotCustom)
	}
	if gotDisabled != "" {
		t.Errorf("disabled header should not be sent, got %q", gotDisabled)
	}
}

// US-8: Query params — enabled params appended to URL
func TestExecuteRequest_AppendsQueryParams(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	params := `[{"key":"search","value":"hello","enabled":true},{"key":"skip","value":"me","enabled":false}]`
	req := newTestRequest("GET", srv.URL, "[]", params, "none", "")
	_, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if !strings.Contains(gotQuery, "search=hello") {
		t.Errorf("expected search=hello in query, got %q", gotQuery)
	}
	if strings.Contains(gotQuery, "skip") {
		t.Errorf("disabled param should not be in query, got %q", gotQuery)
	}
}

// US-13: Response Headers returned
func TestExecuteRequest_ReturnsResponseHeaders(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Response-Header", "value123")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	vals, ok := result.Headers["X-Response-Header"]
	if !ok || len(vals) == 0 || vals[0] != "value123" {
		t.Errorf("expected response header X-Response-Header=value123, got %v", result.Headers)
	}
}

// US-11: Status codes are correctly captured
func TestExecuteRequest_Returns404Status(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if result.StatusCode != 404 {
		t.Errorf("expected 404, got %d", result.StatusCode)
	}
	if !strings.Contains(result.StatusText, "404") {
		t.Errorf("StatusText should contain 404, got %q", result.StatusText)
	}
}

func TestExecuteRequest_Returns500Status(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if result.StatusCode != 500 {
		t.Errorf("expected 500, got %d", result.StatusCode)
	}
}

// US-10: Error surfaced for invalid URL
func TestExecuteRequest_EmptyURL_ReturnsError(t *testing.T) {
	req := newTestRequest("GET", "", "[]", "[]", "none", "")
	_, err := ExecuteRequest(req)
	if err == nil {
		t.Fatal("expected error for empty URL")
	}
}

// US-14: SizeBytes reflects actual body length
func TestExecuteRequest_SizeBytesMatchesBody(t *testing.T) {
	responseBody := "Hello, World!"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(responseBody))
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if result.SizeBytes != int64(len(responseBody)) {
		t.Errorf("expected SizeBytes=%d, got %d", len(responseBody), result.SizeBytes)
	}
}

// ─── Authentication ──────────────────────────────────────────────────────────

func TestExecuteRequest_Auth_Bearer(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	req.AuthType = "bearer"
	req.AuthConfig = `{"token":"secret-token"}`
	_, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if gotAuth != "Bearer secret-token" {
		t.Errorf("expected 'Bearer secret-token', got %q", gotAuth)
	}
}

func TestExecuteRequest_Auth_Basic(t *testing.T) {
	var user, pass string
	var ok bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok = r.BasicAuth()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	req.AuthType = "basic"
	req.AuthConfig = `{"username":"alice","password":"password123"}`
	_, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if !ok || user != "alice" || pass != "password123" {
		t.Errorf("expected user=alice, pass=password123, got user=%q, pass=%q, ok=%v", user, pass, ok)
	}
}

func TestExecuteRequest_Auth_ApiKey_Header(t *testing.T) {
	var gotValue string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotValue = r.Header.Get("X-API-Key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	req.AuthType = "apikey"
	req.AuthConfig = `{"keyName":"X-API-Key","keyValue":"my-secret-key","addTo":"header"}`
	_, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if gotValue != "my-secret-key" {
		t.Errorf("expected my-secret-key in header, got %q", gotValue)
	}
}

func TestExecuteRequest_Auth_ApiKey_Query(t *testing.T) {
	var gotValue string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotValue = r.URL.Query().Get("api_key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	req.AuthType = "apikey"
	req.AuthConfig = `{"keyName":"api_key","keyValue":"my-secret-key","addTo":"query"}`
	_, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	if gotValue != "my-secret-key" {
		t.Errorf("expected my-secret-key in query, got %q", gotValue)
	}
}

// ─── Assertions ─────────────────────────────────────────────────────────────

func TestExecuteRequest_Assertions(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id": 123, "name": "test", "active": true}`))
	}))
	defer srv.Close()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	req.Tests = "status == 200\nbody.id == 123\nbody.name == test\nheader[\"Content-Type\"] contains json"
	
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}

	if len(result.TestResults) != 4 {
		t.Fatalf("expected 4 test results, got %d", len(result.TestResults))
	}

	for _, res := range result.TestResults {
		if !res.Passed {
			t.Errorf("assertion failed: %s - %s", res.Expression, res.Message)
		}
	}
}

