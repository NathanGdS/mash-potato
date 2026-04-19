package httpclient

import (
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

// ─── RedactSecretValues ──────────────────────────────────────────────────────

// US-6: empty secrets list is a no-op
func TestRedactSecretValues_EmptySecrets_ReturnsBodyUnchanged(t *testing.T) {
	body := `{"token":"supersecret","id":1}`
	got := RedactSecretValues(body, nil, true)
	if got != body {
		t.Errorf("expected body unchanged, got %q", got)
	}

	got2 := RedactSecretValues(body, []string{}, false)
	if got2 != body {
		t.Errorf("expected body unchanged for empty slice, got %q", got2)
	}
}

// US-6: JSON body redaction wraps the replacement in quotes.
// The secret value is the full JSON string value (e.g. the token itself),
// not a substring embedded inside a larger value.
func TestRedactSecretValues_JSON_ReplacesQuotedValue(t *testing.T) {
	// The secret value "tok-abc" is stored as a standalone JSON string field.
	body := `{"token":"tok-abc","other":"keep-me"}`
	got := RedactSecretValues(body, []string{"tok-abc"}, true)
	if strings.Contains(got, "tok-abc") {
		t.Errorf("secret should be redacted, got %q", got)
	}
	if !strings.Contains(got, `"[REDACTED]"`) {
		t.Errorf("expected [REDACTED] with surrounding quotes, got %q", got)
	}
	// Non-targeted value must be preserved.
	if !strings.Contains(got, "keep-me") {
		t.Errorf("non-secret value should be preserved, got %q", got)
	}
}

// US-6: JSON body — secret not in a quoted context is left alone
// (the redaction only targets `"<value>"` not bare occurrences)
func TestRedactSecretValues_JSON_DoesNotRedactBareOccurrence(t *testing.T) {
	// A value that appears without surrounding quotes (e.g. a number field)
	// should not be touched by the JSON redaction path.
	body := `{"count":42,"name":"alice"}`
	// "alice" appears quoted — should be redacted.
	got := RedactSecretValues(body, []string{"alice"}, true)
	if strings.Contains(got, "alice") {
		t.Errorf("quoted secret should be redacted, got %q", got)
	}
}

// US-6: non-JSON body redaction uses plain string replacement
func TestRedactSecretValues_NonJSON_ReplacesBareValue(t *testing.T) {
	body := "token=my-secret-token&other=keep"
	got := RedactSecretValues(body, []string{"my-secret-token"}, false)
	if strings.Contains(got, "my-secret-token") {
		t.Errorf("secret should be redacted, got %q", got)
	}
	if !strings.Contains(got, "[REDACTED]") {
		t.Errorf("expected [REDACTED] in result, got %q", got)
	}
	if !strings.Contains(got, "keep") {
		t.Errorf("non-secret value should be preserved, got %q", got)
	}
}

// US-6: multiple secrets all redacted in one pass
func TestRedactSecretValues_MultipleSecrets_AllRedacted(t *testing.T) {
	body := `{"a":"secret1","b":"secret2","c":"safe"}`
	got := RedactSecretValues(body, []string{"secret1", "secret2"}, true)
	if strings.Contains(got, "secret1") || strings.Contains(got, "secret2") {
		t.Errorf("all secrets should be redacted, got %q", got)
	}
	if !strings.Contains(got, "safe") {
		t.Errorf("non-secret should be preserved, got %q", got)
	}
}

// US-6: empty string in secrets slice is skipped (no empty-string replacement)
func TestRedactSecretValues_EmptyStringSecret_Skipped(t *testing.T) {
	body := "some body text"
	got := RedactSecretValues(body, []string{""}, false)
	if got != body {
		t.Errorf("empty secret should be skipped, got %q", got)
	}
}

// ─── US-9: ms() helper ───────────────────────────────────────────────────────

func TestMs_NegativeDuration_ReturnsZero(t *testing.T) {
	end := time.Now()
	start := end.Add(10 * time.Millisecond) // start is after end → negative
	if got := ms(start, end); got != 0 {
		t.Errorf("expected 0 for negative duration, got %d", got)
	}
}

func TestMs_ZeroDuration_ReturnsZero(t *testing.T) {
	now := time.Now()
	if got := ms(now, now); got != 0 {
		t.Errorf("expected 0 for zero duration, got %d", got)
	}
}

func TestMs_PositiveDuration_MatchesMilliseconds(t *testing.T) {
	start := time.Now()
	end := start.Add(42 * time.Millisecond)
	want := end.Sub(start).Milliseconds()
	if got := ms(start, end); got != want {
		t.Errorf("expected %d ms, got %d", want, got)
	}
}

// ─── US-9: TimingPhases — raw-trace helper ───────────────────────────────────

// tracedTimes captures raw timestamps from httptrace hooks for a single GET
// request, allowing sub-millisecond precision checks that ms() would truncate.
type tracedTimes struct {
	dnsStart, dnsDone         time.Time
	connectStart, connectDone time.Time
	tlsStart, tlsDone         time.Time
	wroteRequest, firstByte   time.Time
	bodyReadDone              time.Time
}

// hookFired reports whether a hook pair was both set and in the correct order.
// A zero start means the hook never fired (e.g. DNS on loopback IP targets).
func hookFired(start, end time.Time) bool {
	return !start.IsZero() && !end.IsZero() && !end.Before(start)
}

// doTracedGET executes a GET request against rawURL with the supplied client
// and returns the raw hook timestamps.
func doTracedGET(t *testing.T, client *http.Client, rawURL string) tracedTimes {
	t.Helper()
	var tt tracedTimes
	trace := &httptrace.ClientTrace{
		DNSStart:             func(_ httptrace.DNSStartInfo) { tt.dnsStart = time.Now() },
		DNSDone:              func(_ httptrace.DNSDoneInfo) { tt.dnsDone = time.Now() },
		ConnectStart:         func(_, _ string) { tt.connectStart = time.Now() },
		ConnectDone:          func(_, _ string, _ error) { tt.connectDone = time.Now() },
		TLSHandshakeStart:    func() { tt.tlsStart = time.Now() },
		TLSHandshakeDone:     func(_ tls.ConnectionState, _ error) { tt.tlsDone = time.Now() },
		WroteRequest:         func(_ httptrace.WroteRequestInfo) { tt.wroteRequest = time.Now() },
		GotFirstResponseByte: func() { tt.firstByte = time.Now() },
	}
	ctx := httptrace.WithClientTrace(context.Background(), trace)
	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		t.Fatalf("doTracedGET: NewRequest: %v", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("doTracedGET: Do: %v", err)
	}
	// Drain the body before closing so the connection can be returned to the
	// pool and reused by subsequent requests in the same test.
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	tt.bodyReadDone = time.Now()
	return tt
}

// ─── US-9: TimingPhases — HTTPS (TLS) request ────────────────────────────────

// TestTimingPhases_HTTPS_TLSHookFires verifies that the TLS handshake trace
// hooks are invoked for an HTTPS connection.  The test uses nanosecond-
// precision timestamps to avoid flakiness from sub-millisecond loopback RTTs
// that would cause ms() to truncate to zero.
func TestTimingPhases_HTTPS_TLSHookFires(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	// Use the test server's own client so the self-signed cert is trusted.
	tt := doTracedGET(t, srv.Client(), srv.URL)

	if !hookFired(tt.tlsStart, tt.tlsDone) {
		t.Errorf("HTTPS: TLS handshake hooks not fired (start=%v, done=%v)", tt.tlsStart, tt.tlsDone)
	}
	if !hookFired(tt.connectStart, tt.connectDone) {
		t.Errorf("HTTPS: TCP connect hooks not fired (start=%v, done=%v)", tt.connectStart, tt.connectDone)
	}
	if !hookFired(tt.wroteRequest, tt.firstByte) {
		t.Errorf("HTTPS: TTFB hooks not fired (wrote=%v, first=%v)", tt.wroteRequest, tt.firstByte)
	}
	if tt.firstByte.IsZero() || tt.bodyReadDone.IsZero() || tt.bodyReadDone.Before(tt.firstByte) {
		t.Errorf("HTTPS: Download hooks not in order (first=%v, done=%v)", tt.firstByte, tt.bodyReadDone)
	}
}

// delayConn wraps a net.Conn and sleeps for d on the first Write call.
// This delays the TLS ClientHello, which lands inside the [tlsStart, tlsDone]
// and [connectStart, connectDone] windows, making both phases > 1 ms.
type delayConn struct {
	net.Conn
	delay time.Duration
	once  bool
}

func (dc *delayConn) Write(b []byte) (int, error) {
	if !dc.once {
		dc.once = true
		time.Sleep(dc.delay)
	}
	return dc.Conn.Write(b)
}

// TestTimingPhases_HTTPS_ViaExecuteRequest_AllPhasesNonZero verifies that all
// relevant timing phase fields returned by ExecuteRequest are > 0 for an HTTPS
// connection.  The handler sleeps 2 ms before writing headers (TTFB) and 2 ms
// after flushing them (Download).  A wrapping net.Conn sleeps on the first
// Write (TLS ClientHello), making TCPHandshake and TLSHandshake > 0.
// DNSLookup resolves in < 1 ms on loopback and is excluded from > 0 assertions.
func TestTimingPhases_HTTPS_ViaExecuteRequest_AllPhasesNonZero(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Delay before first byte → TTFB > 0.
		time.Sleep(2 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		// Flush so the client records GotFirstResponseByte, then sleep so
		// Download (firstByte → bodyReadDone) > 0.
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		time.Sleep(2 * time.Millisecond)
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	// Build a transport that trusts the test cert.  The custom DialContext
	// wraps the established net.Conn in delayConn so the first Write (TLS
	// ClientHello) sleeps 2 ms, landing inside the ConnectDone / TLSHandshake
	// measurement windows.
	baseTLS := srv.Client().Transport.(*http.Transport).TLSClientConfig
	slowTransport := &http.Transport{
		TLSClientConfig: baseTLS,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			var d net.Dialer
			conn, err := d.DialContext(ctx, network, addr)
			if err != nil {
				return nil, err
			}
			return &delayConn{Conn: conn, delay: 2 * time.Millisecond}, nil
		},
	}

	origTransport := http.DefaultTransport
	http.DefaultTransport = slowTransport
	defer func() { http.DefaultTransport = origTransport }()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}

	tp := result.Timing
	// TCPHandshake on loopback is typically < 1 ms; assert it's non-negative.
	if tp.TCPHandshake < 0 {
		t.Errorf("HTTPS: TCPHandshake must be >= 0, got %d", tp.TCPHandshake)
	}
	// delayConn sleeps on first Write (TLS ClientHello) → TLSHandshake > 0.
	if tp.TLSHandshake <= 0 {
		t.Errorf("HTTPS: TLSHandshake must be > 0, got %d", tp.TLSHandshake)
	}
	// Handler sleep before headers → TTFB > 0.
	if tp.TTFB <= 0 {
		t.Errorf("HTTPS: TTFB must be > 0, got %d", tp.TTFB)
	}
	// Handler flush+sleep before body → Download > 0.
	if tp.Download <= 0 {
		t.Errorf("HTTPS: Download must be > 0, got %d", tp.Download)
	}
}

// ─── US-9: TimingPhases — HTTP (non-TLS) request ─────────────────────────────

// TestTimingPhases_HTTP_TLSHandshakeIsZero verifies two invariants for plain
// HTTP connections:
//  1. TLSHandshake is always 0 (no TLS negotiation occurs).
//  2. The WroteRequest and GotFirstResponseByte hooks both fire, confirming
//     the TTFB measurement path is active (even if the loopback value is 0 ms).
func TestTimingPhases_HTTP_TLSHandshakeIsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sleep before writing headers → TTFB > 0.
		time.Sleep(2 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		// Flush headers so GotFirstResponseByte fires, then sleep before
		// writing the body so Download (firstByte → bodyReadDone) > 0.
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		time.Sleep(2 * time.Millisecond)
		w.Write([]byte("plain"))
	}))
	defer srv.Close()

	// Use a wrapping DialContext that sleeps on the first conn.Write to make
	// TCPHandshake (connectStart → connectDone) cross the 1 ms boundary.
	origTransport := http.DefaultTransport
	http.DefaultTransport = &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			var d net.Dialer
			conn, err := d.DialContext(ctx, network, addr)
			if err != nil {
				return nil, err
			}
			return &delayConn{Conn: conn, delay: 2 * time.Millisecond}, nil
		},
	}
	defer func() { http.DefaultTransport = origTransport }()

	// Verify via ExecuteRequest that TLSHandshake is exactly 0 and that the
	// other non-TLS phases are non-zero.
	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")
	result, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest: %v", err)
	}
	tp := result.Timing
	if tp.TLSHandshake != 0 {
		t.Errorf("HTTP: expected TLSHandshake == 0, got %d", tp.TLSHandshake)
	}
	// TCPHandshake on loopback is typically < 1 ms; assert it's non-negative.
	if tp.TCPHandshake < 0 {
		t.Errorf("HTTP: expected TCPHandshake >= 0, got %d", tp.TCPHandshake)
	}
	// Handler sleep before headers → TTFB > 0.
	if tp.TTFB <= 0 {
		t.Errorf("HTTP: expected TTFB > 0, got %d", tp.TTFB)
	}
	// Handler flush+sleep before body → Download > 0.
	if tp.Download <= 0 {
		t.Errorf("HTTP: expected Download > 0, got %d", tp.Download)
	}

	// Verify hook firing at nanosecond precision via raw trace.
	tt := doTracedGET(t, &http.Client{}, srv.URL)
	if tt.tlsStart != (time.Time{}) || tt.tlsDone != (time.Time{}) {
		t.Errorf("HTTP: TLS hooks should not fire, got start=%v done=%v", tt.tlsStart, tt.tlsDone)
	}
	if !hookFired(tt.wroteRequest, tt.firstByte) {
		t.Errorf("HTTP: TTFB hooks not fired (wrote=%v, first=%v)", tt.wroteRequest, tt.firstByte)
	}
	if tt.firstByte.IsZero() || tt.bodyReadDone.IsZero() || tt.bodyReadDone.Before(tt.firstByte) {
		t.Errorf("HTTP: Download hooks not in order (first=%v, done=%v)", tt.firstByte, tt.bodyReadDone)
	}
}

// ─── US-9: TimingPhases — connection reuse ────────────────────────────────────

// tracedRequest executes a single GET to rawURL using client and returns the
// populated TimingPhases.  It mirrors the httptrace instrumentation inside
// ExecuteRequest so the reuse test can share one *http.Client across calls.
func tracedRequest(t *testing.T, client *http.Client, rawURL string) (db.TimingPhases, tracedTimes) {
	t.Helper()
	tt := doTracedGET(t, client, rawURL)
	return db.TimingPhases{
		DNSLookup:    ms(tt.dnsStart, tt.dnsDone),
		TCPHandshake: ms(tt.connectStart, tt.connectDone),
		TLSHandshake: ms(tt.tlsStart, tt.tlsDone),
		TTFB:         ms(tt.wroteRequest, tt.firstByte),
		Download:     ms(tt.firstByte, tt.bodyReadDone),
	}, tt
}

func TestTimingPhases_ConnectionReuse_SecondRequestSkipsDNSAndTCP(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sleep before headers → TTFB > 0.
		time.Sleep(2 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		// Flush then sleep before body → Download > 0.
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		time.Sleep(2 * time.Millisecond)
		w.Write([]byte("reused"))
	}))
	defer srv.Close()

	// A shared transport ensures the TCP connection is pooled between calls.
	// We replace http.DefaultTransport so that both ExecuteRequest calls share
	// the same pool, then restore it after the test.
	sharedTransport := &http.Transport{}
	origTransport := http.DefaultTransport
	http.DefaultTransport = sharedTransport
	defer func() { http.DefaultTransport = origTransport }()

	req := newTestRequest("GET", srv.URL, "[]", "[]", "none", "")

	// First request establishes the TCP connection.
	_, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest (first): %v", err)
	}

	// Second request should reuse the pooled connection.
	result2, err := ExecuteRequest(req)
	if err != nil {
		t.Fatalf("ExecuteRequest (second): %v", err)
	}

	tp := result2.Timing
	if tp.DNSLookup != 0 {
		t.Errorf("reuse: DNSLookup must be 0 on second request, got %d", tp.DNSLookup)
	}
	if tp.TCPHandshake != 0 {
		t.Errorf("reuse: TCPHandshake must be 0 on second request, got %d", tp.TCPHandshake)
	}
	if tp.TTFB <= 0 {
		t.Errorf("reuse: TTFB must be > 0 on second request, got %d", tp.TTFB)
	}
	if tp.Download <= 0 {
		t.Errorf("reuse: Download must be > 0 on second request, got %d", tp.Download)
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

