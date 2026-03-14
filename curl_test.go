package main

import (
	"strings"
	"testing"

	"mash-potato/db"
)

// ── tokenise ──────────────────────────────────────────────────────────────────

func TestTokenise_Basic(t *testing.T) {
	tokens, err := tokenise("curl -X GET 'https://example.com'")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"curl", "-X", "GET", "https://example.com"}
	if len(tokens) != len(want) {
		t.Fatalf("got %v, want %v", tokens, want)
	}
	for i, w := range want {
		if tokens[i] != w {
			t.Errorf("token[%d]: got %q, want %q", i, tokens[i], w)
		}
	}
}

func TestTokenise_DoubleQuotes(t *testing.T) {
	tokens, err := tokenise(`curl -H "Content-Type: application/json"`)
	if err != nil {
		t.Fatal(err)
	}
	if len(tokens) != 3 {
		t.Fatalf("got %v", tokens)
	}
	if tokens[2] != "Content-Type: application/json" {
		t.Errorf("got %q", tokens[2])
	}
}

func TestTokenise_UnterminatedSingleQuote(t *testing.T) {
	_, err := tokenise("curl 'unterminated")
	if err == nil {
		t.Fatal("expected error for unterminated single quote")
	}
}

func TestTokenise_BackslashNewlineContinuation(t *testing.T) {
	cmd := "curl \\\n-X POST \\\n'https://example.com'"
	// strip continuations before tokenising (as parseCurl does)
	cmd = strings.ReplaceAll(cmd, "\\\n", " ")
	tokens, err := tokenise(cmd)
	if err != nil {
		t.Fatal(err)
	}
	if len(tokens) != 4 {
		t.Fatalf("got %v", tokens)
	}
}

// ── parseCurl ─────────────────────────────────────────────────────────────────

func TestParseCurl_SimpleGET(t *testing.T) {
	p, err := parseCurl("curl https://api.example.com/users")
	if err != nil {
		t.Fatal(err)
	}
	if p.method != "GET" {
		t.Errorf("method: got %q, want GET", p.method)
	}
	if p.rawURL != "https://api.example.com/users" {
		t.Errorf("url: got %q", p.rawURL)
	}
	if p.bodyType != "none" {
		t.Errorf("bodyType: got %q, want none", p.bodyType)
	}
}

func TestParseCurl_ExplicitMethod(t *testing.T) {
	p, err := parseCurl("curl -X DELETE 'https://api.example.com/item/1'")
	if err != nil {
		t.Fatal(err)
	}
	if p.method != "DELETE" {
		t.Errorf("method: got %q, want DELETE", p.method)
	}
}

func TestParseCurl_LongFlagRequest(t *testing.T) {
	p, err := parseCurl("curl --request PATCH 'https://example.com/x'")
	if err != nil {
		t.Fatal(err)
	}
	if p.method != "PATCH" {
		t.Errorf("method: got %q, want PATCH", p.method)
	}
}

func TestParseCurl_Headers(t *testing.T) {
	p, err := parseCurl(`curl -H "X-Foo: bar" -H 'Accept: application/json' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(p.headersJSON, "X-Foo") {
		t.Errorf("expected X-Foo in headers JSON, got %s", p.headersJSON)
	}
	if !strings.Contains(p.headersJSON, "Accept") {
		t.Errorf("expected Accept in headers JSON, got %s", p.headersJSON)
	}
}

func TestParseCurl_JSONBody(t *testing.T) {
	p, err := parseCurl(`curl -X POST -H "Content-Type: application/json" -d '{"key":"val"}' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.bodyType != "json" {
		t.Errorf("bodyType: got %q, want json", p.bodyType)
	}
	if p.body != `{"key":"val"}` {
		t.Errorf("body: got %q", p.body)
	}
	if p.method != "POST" {
		t.Errorf("method: got %q, want POST", p.method)
	}
}

func TestParseCurl_RawBody(t *testing.T) {
	p, err := parseCurl(`curl -X POST -d 'hello world' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.bodyType != "raw" {
		t.Errorf("bodyType: got %q, want raw", p.bodyType)
	}
}

func TestParseCurl_DataRaw(t *testing.T) {
	p, err := parseCurl(`curl --data-raw 'payload' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.bodyType != "raw" {
		t.Errorf("bodyType: got %q, want raw", p.bodyType)
	}
	if p.body != "payload" {
		t.Errorf("body: got %q", p.body)
	}
}

func TestParseCurl_DataBinary(t *testing.T) {
	p, err := parseCurl(`curl --data-binary 'binpayload' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.body != "binpayload" {
		t.Errorf("body: got %q", p.body)
	}
}

func TestParseCurl_UrlencodedContentType(t *testing.T) {
	p, err := parseCurl(`curl -X POST -H "Content-Type: application/x-www-form-urlencoded" -d 'a=1&b=2' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.bodyType != "urlencoded" {
		t.Errorf("bodyType: got %q, want urlencoded", p.bodyType)
	}
	if !strings.Contains(p.body, `"a"`) {
		t.Errorf("expected key a in body JSON, got %s", p.body)
	}
}

func TestParseCurl_DataUrlencode(t *testing.T) {
	p, err := parseCurl(`curl --data-urlencode 'username=alice' --data-urlencode 'password=secret' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.bodyType != "urlencoded" {
		t.Errorf("bodyType: got %q, want urlencoded", p.bodyType)
	}
	if !strings.Contains(p.body, "username") {
		t.Errorf("expected username in body JSON, got %s", p.body)
	}
	if p.method != "POST" {
		t.Errorf("method: got %q, want POST", p.method)
	}
}

func TestParseCurl_FormData(t *testing.T) {
	p, err := parseCurl(`curl --form 'field1=value1' -F 'field2=value2' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.bodyType != "form-data" {
		t.Errorf("bodyType: got %q, want form-data", p.bodyType)
	}
	if !strings.Contains(p.body, "field1") {
		t.Errorf("expected field1 in body JSON, got %s", p.body)
	}
}

func TestParseCurl_BasicAuth(t *testing.T) {
	p, err := parseCurl(`curl -u admin:secret https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.authType != "basic" {
		t.Errorf("authType: got %q, want basic", p.authType)
	}
	if !strings.Contains(p.authConfig, "admin") {
		t.Errorf("expected admin in authConfig, got %s", p.authConfig)
	}
	if !strings.Contains(p.authConfig, "secret") {
		t.Errorf("expected secret in authConfig, got %s", p.authConfig)
	}
}

func TestParseCurl_LongFlagUser(t *testing.T) {
	p, err := parseCurl(`curl --user root:pass https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.authType != "basic" {
		t.Errorf("authType: got %q, want basic", p.authType)
	}
}

func TestParseCurl_BearerAuth(t *testing.T) {
	p, err := parseCurl(`curl -H "Authorization: Bearer mytoken123" https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.authType != "bearer" {
		t.Errorf("authType: got %q, want bearer", p.authType)
	}
	if !strings.Contains(p.authConfig, "mytoken123") {
		t.Errorf("expected mytoken123 in authConfig, got %s", p.authConfig)
	}
	// Authorization header should NOT appear in the regular headers JSON.
	if strings.Contains(p.headersJSON, "Authorization") {
		t.Errorf("Authorization header should be removed from headers JSON, got %s", p.headersJSON)
	}
}

func TestParseCurl_FileReferenceData(t *testing.T) {
	_, err := parseCurl(`curl -d @/tmp/body.json https://example.com`)
	if err == nil {
		t.Fatal("expected error for file reference")
	}
}

func TestParseCurl_FileReferenceForm(t *testing.T) {
	_, err := parseCurl(`curl --form 'file=@/tmp/upload.png' https://example.com`)
	if err == nil {
		t.Fatal("expected error for file reference")
	}
}

func TestParseCurl_FileReferenceDataUrlencode(t *testing.T) {
	_, err := parseCurl(`curl --data-urlencode @/tmp/data.txt https://example.com`)
	if err == nil {
		t.Fatal("expected error for file reference")
	}
}

func TestParseCurl_EmptyCommand(t *testing.T) {
	_, err := parseCurl("   ")
	if err == nil {
		t.Fatal("expected error for empty command")
	}
}

func TestParseCurl_NoURL(t *testing.T) {
	_, err := parseCurl("curl -X GET")
	if err == nil {
		t.Fatal("expected error when no URL given")
	}
}

func TestParseCurl_BackslashNewlineContinuation(t *testing.T) {
	cmd := "curl \\\n-X POST \\\n-H 'Content-Type: application/json' \\\n-d '{\"a\":1}' \\\nhttps://example.com/path"
	p, err := parseCurl(cmd)
	if err != nil {
		t.Fatal(err)
	}
	if p.method != "POST" {
		t.Errorf("method: got %q, want POST", p.method)
	}
	if p.bodyType != "json" {
		t.Errorf("bodyType: got %q, want json", p.bodyType)
	}
}

func TestParseCurl_PositionalURLLast(t *testing.T) {
	// The last bare token should be the URL.
	p, err := parseCurl("curl -X GET https://first.com https://last.com")
	if err != nil {
		t.Fatal(err)
	}
	if p.rawURL != "https://last.com" {
		t.Errorf("url: got %q, want https://last.com", p.rawURL)
	}
}

func TestParseCurl_DefaultMethodPOSTWhenBody(t *testing.T) {
	p, err := parseCurl(`curl -d 'data' https://example.com`)
	if err != nil {
		t.Fatal(err)
	}
	if p.method != "POST" {
		t.Errorf("method: got %q, want POST", p.method)
	}
}

// ── buildCurlCommand ──────────────────────────────────────────────────────────

func TestBuildCurlCommand_SimpleGET(t *testing.T) {
	req := makeTestRequest("GET", "https://api.example.com/items")
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "curl") {
		t.Errorf("missing curl: %s", cmd)
	}
	if !strings.Contains(cmd, "-X GET") {
		t.Errorf("missing -X GET: %s", cmd)
	}
	if !strings.Contains(cmd, "api.example.com/items") {
		t.Errorf("missing URL: %s", cmd)
	}
}

func TestBuildCurlCommand_WithHeaders(t *testing.T) {
	req := makeTestRequest("GET", "https://example.com")
	req.Headers = `[{"key":"Accept","value":"application/json","enabled":true},{"key":"X-Disabled","value":"no","enabled":false}]`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "Accept") {
		t.Errorf("expected Accept header: %s", cmd)
	}
	if strings.Contains(cmd, "X-Disabled") {
		t.Errorf("disabled header should not appear: %s", cmd)
	}
}

func TestBuildCurlCommand_JSONBody(t *testing.T) {
	req := makeTestRequest("POST", "https://example.com/api")
	req.BodyType = "json"
	req.Body = `{"name":"test"}`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "-d") {
		t.Errorf("expected -d flag: %s", cmd)
	}
	if !strings.Contains(cmd, "name") {
		t.Errorf("expected body content: %s", cmd)
	}
	if !strings.Contains(cmd, "application/json") {
		t.Errorf("expected Content-Type: %s", cmd)
	}
}

func TestBuildCurlCommand_URLEncodedBody(t *testing.T) {
	req := makeTestRequest("POST", "https://example.com")
	req.BodyType = "urlencoded"
	req.Body = `[{"key":"user","value":"alice","enabled":true}]`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "--data-urlencode") {
		t.Errorf("expected --data-urlencode: %s", cmd)
	}
}

func TestBuildCurlCommand_FormData(t *testing.T) {
	req := makeTestRequest("POST", "https://example.com")
	req.BodyType = "form-data"
	req.Body = `[{"key":"field","value":"val","enabled":true}]`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "--form") {
		t.Errorf("expected --form: %s", cmd)
	}
}

func TestBuildCurlCommand_BearerAuth(t *testing.T) {
	req := makeTestRequest("GET", "https://example.com")
	req.AuthType = "bearer"
	req.AuthConfig = `{"token":"mytoken"}`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "Bearer mytoken") {
		t.Errorf("expected Bearer token: %s", cmd)
	}
}

func TestBuildCurlCommand_BasicAuth(t *testing.T) {
	req := makeTestRequest("GET", "https://example.com")
	req.AuthType = "basic"
	req.AuthConfig = `{"username":"admin","password":"pass"}`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "-u") {
		t.Errorf("expected -u flag: %s", cmd)
	}
	if !strings.Contains(cmd, "admin:pass") {
		t.Errorf("expected admin:pass: %s", cmd)
	}
}

func TestBuildCurlCommand_ApikeyHeader(t *testing.T) {
	req := makeTestRequest("GET", "https://example.com")
	req.AuthType = "apikey"
	req.AuthConfig = `{"keyName":"X-API-Key","keyValue":"abc123","addTo":"header"}`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "X-API-Key") {
		t.Errorf("expected X-API-Key header: %s", cmd)
	}
}

func TestBuildCurlCommand_ApikeyQuery(t *testing.T) {
	req := makeTestRequest("GET", "https://example.com/path")
	req.AuthType = "apikey"
	req.AuthConfig = `{"keyName":"api_key","keyValue":"secret","addTo":"query"}`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "api_key=secret") {
		t.Errorf("expected api_key query param in URL: %s", cmd)
	}
}

func TestBuildCurlCommand_QueryParams(t *testing.T) {
	req := makeTestRequest("GET", "https://example.com/search")
	req.Params = `[{"key":"q","value":"hello","enabled":true},{"key":"page","value":"2","enabled":false}]`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "q=hello") {
		t.Errorf("expected q=hello in URL: %s", cmd)
	}
	if strings.Contains(cmd, "page=2") {
		t.Errorf("disabled param should not appear: %s", cmd)
	}
}

func TestBuildCurlCommand_VariableTokensPassThrough(t *testing.T) {
	req := makeTestRequest("GET", "https://{{baseUrl}}/users")
	req.Headers = `[{"key":"Authorization","value":"Bearer {{token}}","enabled":true}]`
	cmd, err := buildCurlCommand(req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cmd, "{{baseUrl}}") {
		t.Errorf("expected raw variable token in URL: %s", cmd)
	}
	if !strings.Contains(cmd, "{{token}}") {
		t.Errorf("expected raw variable token in header: %s", cmd)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func TestSplitHeader(t *testing.T) {
	k, v := splitHeader("Content-Type: application/json")
	if k != "Content-Type" || v != "application/json" {
		t.Errorf("got %q %q", k, v)
	}
}

func TestSplitHeader_NoSpace(t *testing.T) {
	k, v := splitHeader("X-Custom:value")
	if k != "X-Custom" || v != "value" {
		t.Errorf("got %q %q", k, v)
	}
}

func TestSplitPair(t *testing.T) {
	k, v := splitPair("key=value=extra")
	if k != "key" || v != "value=extra" {
		t.Errorf("got %q %q", k, v)
	}
}

func TestShellQuote(t *testing.T) {
	q := shellQuote("it's a test")
	// should be: 'it'\''s a test'
	if q != `'it'\''s a test'` {
		t.Errorf("got %q", q)
	}
}

func TestNameFromURL(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"https://api.example.com/users/123", "123"},
		{"https://api.example.com/users", "users"},
		{"https://api.example.com/", "api.example.com"},
		{"https://api.example.com", "api.example.com"},
	}
	for _, c := range cases {
		got := nameFromURL(c.in)
		if got != c.want {
			t.Errorf("nameFromURL(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// makeTestRequest returns a db.Request with sensible defaults for testing
// buildCurlCommand without touching the database.
func makeTestRequest(method, rawURL string) db.Request {
	return db.Request{
		ID:             "test-id",
		CollectionID:   "col-id",
		Name:           "Test Request",
		Method:         method,
		URL:            rawURL,
		Headers:        "[]",
		Params:         "[]",
		BodyType:       "none",
		Body:           "",
		AuthType:       "none",
		AuthConfig:     "{}",
		TimeoutSeconds: 30,
	}
}
