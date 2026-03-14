package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/google/uuid"
	"mash-potato/db"
)

// ── Serializer ────────────────────────────────────────────────────────────────

// ExportRequestAsCurl fetches the request by id, resolves active environment
// variables, and returns a ready-to-run curl command string.
func (a *App) ExportRequestAsCurl(id string) (string, error) {
	if strings.TrimSpace(id) == "" {
		return "", fmt.Errorf("request id cannot be empty")
	}
	req, err := db.GetRequest(id)
	if err != nil {
		return "", fmt.Errorf("ExportRequestAsCurl: %w", err)
	}

	// Build vars map: globals first, then active env on top (same as SendRequest).
	vars := map[string]string{}
	if globalID, err := db.GetGlobalEnvironmentID(); err == nil && globalID != "" {
		if gVars, err := db.GetVariables(globalID); err == nil {
			for _, v := range gVars {
				vars[v.Key] = v.Value
			}
		}
	}
	if envID, err := db.GetSetting("active_environment_id"); err == nil && envID != "" {
		if eVars, err := db.GetVariables(envID); err == nil {
			for _, v := range eVars {
				vars[v.Key] = v.Value
			}
		}
	}
	if len(vars) > 0 {
		req.URL = Interpolate(req.URL, vars)
		req.Headers = Interpolate(req.Headers, vars)
		req.Params = Interpolate(req.Params, vars)
		req.Body = Interpolate(req.Body, vars)
		req.AuthConfig = Interpolate(req.AuthConfig, vars)
	}

	return buildCurlCommand(req)
}

// buildCurlCommand converts a db.Request into a curl command string.
func buildCurlCommand(req db.Request) (string, error) {
	var parts []string
	parts = append(parts, "curl")

	// Method (omit -X GET since that's curl's default, but always emit for clarity).
	parts = append(parts, "-X", req.Method)

	// Enabled headers.
	type kvRow struct {
		Key     string `json:"key"`
		Value   string `json:"value"`
		Enabled bool   `json:"enabled"`
	}
	parseKV := func(raw string) []kvRow {
		var rows []kvRow
		_ = json.Unmarshal([]byte(raw), &rows)
		return rows
	}

	hasContentType := false
	for _, h := range parseKV(req.Headers) {
		if h.Enabled && h.Key != "" {
			parts = append(parts, "-H", shellQuote(h.Key+": "+h.Value))
			if strings.EqualFold(h.Key, "content-type") {
				hasContentType = true
			}
		}
	}

	// Auth flags.
	type authCfg struct {
		Token    string `json:"token"`
		Username string `json:"username"`
		Password string `json:"password"`
		KeyName  string `json:"keyName"`
		KeyValue string `json:"keyValue"`
		AddTo    string `json:"addTo"`
	}
	var auth authCfg
	_ = json.Unmarshal([]byte(req.AuthConfig), &auth)
	switch req.AuthType {
	case "bearer":
		if auth.Token != "" {
			parts = append(parts, "-H", shellQuote("Authorization: Bearer "+auth.Token))
		}
	case "basic":
		if auth.Username != "" {
			parts = append(parts, "-u", shellQuote(auth.Username+":"+auth.Password))
		}
	case "apikey":
		if auth.KeyName != "" && auth.KeyValue != "" {
			if auth.AddTo == "query" {
				// will be appended to URL below
			} else {
				parts = append(parts, "-H", shellQuote(auth.KeyName+": "+auth.KeyValue))
			}
		}
	}

	// Body flags.
	switch req.BodyType {
	case "json":
		if req.Body != "" {
			if !hasContentType {
				parts = append(parts, "-H", shellQuote("Content-Type: application/json"))
			}
			body := req.Body
			var buf bytes.Buffer
			if err := json.Compact(&buf, []byte(body)); err == nil {
				body = buf.String()
			}
			parts = append(parts, "-d", shellQuote(body))
		}
	case "raw":
		if req.Body != "" {
			parts = append(parts, "-d", shellQuote(req.Body))
		}
	case "urlencoded":
		for _, row := range parseKV(req.Body) {
			if row.Enabled && row.Key != "" {
				parts = append(parts, "--data-urlencode", shellQuote(row.Key+"="+row.Value))
			}
		}
	case "form-data":
		for _, row := range parseKV(req.Body) {
			if row.Enabled && row.Key != "" {
				parts = append(parts, "--form", shellQuote(row.Key+"="+row.Value))
			}
		}
	}

	// Build final URL (with enabled params + apikey query param if applicable).
	finalURL := req.URL
	if !strings.Contains(finalURL, "://") && finalURL != "" {
		finalURL = "https://" + finalURL
	}
	if finalURL != "" {
		params := parseKV(req.Params)
		if req.AuthType == "apikey" && auth.AddTo == "query" && auth.KeyName != "" && auth.KeyValue != "" {
			params = append(params, kvRow{Key: auth.KeyName, Value: auth.KeyValue, Enabled: true})
		}
		u, err := url.Parse(finalURL)
		if err == nil && len(params) > 0 {
			q := u.Query()
			for _, p := range params {
				if p.Enabled && p.Key != "" {
					q.Add(p.Key, p.Value)
				}
			}
			u.RawQuery = q.Encode()
			finalURL = u.String()
		}
	}
	parts = append(parts, shellQuote(finalURL))

	return strings.Join(parts, " "), nil
}

// shellQuote wraps s in single quotes, escaping any embedded single quotes.
func shellQuote(s string) string {
	// Replace ' with '\''
	escaped := strings.ReplaceAll(s, "'", `'\''`)
	return "'" + escaped + "'"
}

// ── Parser ────────────────────────────────────────────────────────────────────

// ImportFromCurl parses curlCommand, inserts a new request into collectionID,
// and returns the persisted db.Request.
func (a *App) ImportFromCurl(collectionID string, curlCommand string) (db.Request, error) {
	if strings.TrimSpace(collectionID) == "" {
		return db.Request{}, fmt.Errorf("collection id cannot be empty")
	}
	if strings.TrimSpace(curlCommand) == "" {
		return db.Request{}, fmt.Errorf("curl command cannot be empty")
	}

	parsed, err := parseCurl(curlCommand)
	if err != nil {
		return db.Request{}, fmt.Errorf("ImportFromCurl: %w", err)
	}

	id := uuid.New().String()
	req, err := db.InsertRequest(id, collectionID, parsed.name)
	if err != nil {
		return db.Request{}, fmt.Errorf("ImportFromCurl: insert: %w", err)
	}

	authType := parsed.authType
	if authType == "" {
		authType = "none"
	}
	authConfig := parsed.authConfig
	if authConfig == "" {
		authConfig = "{}"
	}

	if err := db.UpdateRequest(
		req.ID,
		parsed.method,
		parsed.rawURL,
		parsed.headersJSON,
		"[]",
		parsed.bodyType,
		parsed.body,
		authType,
		authConfig,
		30,
		"",
	); err != nil {
		return db.Request{}, fmt.Errorf("ImportFromCurl: update: %w", err)
	}
	return db.GetRequest(req.ID)
}

// parsedCurl holds the intermediate result of parsing a curl command.
type parsedCurl struct {
	name        string
	method      string
	rawURL      string
	headersJSON string
	bodyType    string
	body        string
	authType    string
	authConfig  string
}

// parseCurl tokenises and interprets a curl command string.
func parseCurl(cmd string) (parsedCurl, error) {
	// Strip backslash-newline continuations.
	cmd = strings.ReplaceAll(cmd, "\\\n", " ")
	cmd = strings.ReplaceAll(cmd, "\\\r\n", " ")

	tokens, err := tokenise(cmd)
	if err != nil {
		return parsedCurl{}, err
	}
	if len(tokens) == 0 {
		return parsedCurl{}, fmt.Errorf("empty command")
	}

	type kvPair struct {
		key   string
		value string
	}

	var (
		rawURL       string
		method       string
		headers      []kvPair
		dataArgs     []string // -d / --data / --data-raw / --data-binary
		urlencodedKV []kvPair // --data-urlencode
		formKV       []kvPair // --form / -F
		basicUser    string
	)

	i := 0
	// skip the "curl" command itself
	if len(tokens) > 0 && strings.ToLower(tokens[0]) == "curl" {
		i = 1
	}

	for i < len(tokens) {
		t := tokens[i]
		switch {
		case t == "-X" || t == "--request":
			i++
			if i < len(tokens) {
				method = strings.ToUpper(tokens[i])
			}

		case t == "-H" || t == "--header":
			i++
			if i < len(tokens) {
				key, val := splitHeader(tokens[i])
				headers = append(headers, kvPair{key, val})
			}

		case t == "-d" || t == "--data" || t == "--data-raw" || t == "--data-binary":
			i++
			if i < len(tokens) {
				v := tokens[i]
				if strings.HasPrefix(v, "@") {
					return parsedCurl{}, fmt.Errorf("file references are not supported (found %s)", v)
				}
				dataArgs = append(dataArgs, v)
			}

		case t == "--data-urlencode":
			i++
			if i < len(tokens) {
				v := tokens[i]
				if strings.HasPrefix(v, "@") || strings.Contains(v, "@") {
					return parsedCurl{}, fmt.Errorf("file references are not supported (found %s)", v)
				}
				key, val := splitPair(v)
				urlencodedKV = append(urlencodedKV, kvPair{key, val})
			}

		case t == "--form" || t == "-F":
			i++
			if i < len(tokens) {
				v := tokens[i]
				if strings.Contains(v, "@") {
					return parsedCurl{}, fmt.Errorf("file references are not supported (found %s)", v)
				}
				key, val := splitPair(v)
				formKV = append(formKV, kvPair{key, val})
			}

		case t == "-u" || t == "--user":
			i++
			if i < len(tokens) {
				basicUser = tokens[i]
			}

		case strings.HasPrefix(t, "-"):
			// Unknown flag — skip its value if it looks like a flag with a value.
			// Single-letter flags that take values; skip next token.
			// We just skip this token and continue (best effort).

		default:
			// Bare positional argument — last one wins as the URL.
			rawURL = t
		}
		i++
	}

	if rawURL == "" {
		return parsedCurl{}, fmt.Errorf("no URL found in curl command")
	}

	// Default method.
	if method == "" {
		if len(dataArgs) > 0 || len(urlencodedKV) > 0 || len(formKV) > 0 {
			method = "POST"
		} else {
			method = "GET"
		}
	}

	// Determine content-type from headers.
	contentType := ""
	var filteredHeaders []kvPair
	for _, h := range headers {
		if strings.EqualFold(h.key, "content-type") {
			contentType = strings.ToLower(strings.TrimSpace(h.value))
		} else {
			filteredHeaders = append(filteredHeaders, h)
		}
	}

	// Detect auth headers and remove from regular headers.
	var authType string
	var authConfigMap map[string]string
	var cleanHeaders []kvPair
	for _, h := range filteredHeaders {
		if strings.EqualFold(h.key, "authorization") {
			val := h.value
			if strings.HasPrefix(strings.ToLower(val), "bearer ") {
				authType = "bearer"
				authConfigMap = map[string]string{"token": strings.TrimSpace(val[7:])}
			} else if strings.HasPrefix(strings.ToLower(val), "basic ") {
				// Already a Basic header (base64); store as raw header since we can't decode.
				cleanHeaders = append(cleanHeaders, h)
			} else {
				cleanHeaders = append(cleanHeaders, h)
			}
		} else {
			cleanHeaders = append(cleanHeaders, h)
		}
	}

	// Basic auth via -u flag.
	if basicUser != "" && authType == "" {
		authType = "basic"
		uname, pass := splitPairColon(basicUser)
		authConfigMap = map[string]string{"username": uname, "password": pass}
	}

	// Build headers JSON.
	type kvRow struct {
		Key     string `json:"key"`
		Value   string `json:"value"`
		Enabled bool   `json:"enabled"`
	}
	var headerRows []kvRow
	for _, h := range cleanHeaders {
		headerRows = append(headerRows, kvRow{h.key, h.value, true})
	}
	headersJSONBytes, _ := json.Marshal(headerRows)
	if headerRows == nil {
		headersJSONBytes = []byte("[]")
	}

	// Infer body type.
	bodyType := "none"
	bodyStr := ""

	switch {
	case len(formKV) > 0:
		bodyType = "form-data"
		var rows []kvRow
		for _, kv := range formKV {
			rows = append(rows, kvRow{kv.key, kv.value, true})
		}
		b, _ := json.Marshal(rows)
		bodyStr = string(b)

	case len(urlencodedKV) > 0:
		bodyType = "urlencoded"
		var rows []kvRow
		for _, kv := range urlencodedKV {
			rows = append(rows, kvRow{kv.key, kv.value, true})
		}
		b, _ := json.Marshal(rows)
		bodyStr = string(b)

	case len(dataArgs) > 0:
		raw := strings.Join(dataArgs, "&")
		switch {
		case strings.Contains(contentType, "application/json"):
			bodyType = "json"
			bodyStr = raw
		case strings.Contains(contentType, "application/x-www-form-urlencoded"):
			// Parse the raw data string as urlencoded key=value pairs.
			bodyType = "urlencoded"
			vals, err := url.ParseQuery(raw)
			if err != nil {
				bodyType = "raw"
				bodyStr = raw
			} else {
				var rows []kvRow
				for k, vs := range vals {
					for _, v := range vs {
						rows = append(rows, kvRow{k, v, true})
					}
				}
				b, _ := json.Marshal(rows)
				bodyStr = string(b)
			}
		case strings.Contains(contentType, "multipart/form-data"):
			bodyType = "form-data"
			bodyStr = raw
		default:
			bodyType = "raw"
			bodyStr = raw
		}
	}

	// Auth config JSON.
	authConfigStr := "{}"
	if authConfigMap != nil {
		b, _ := json.Marshal(authConfigMap)
		authConfigStr = string(b)
	}

	// Derive a human-readable name from the URL path.
	name := nameFromURL(rawURL)

	return parsedCurl{
		name:        name,
		method:      method,
		rawURL:      rawURL,
		headersJSON: string(headersJSONBytes),
		bodyType:    bodyType,
		body:        bodyStr,
		authType:    authType,
		authConfig:  authConfigStr,
	}, nil
}

// ── Tokeniser ─────────────────────────────────────────────────────────────────

// tokenise splits a shell command string into tokens, respecting single-quoted
// and double-quoted strings.
func tokenise(s string) ([]string, error) {
	var tokens []string
	var cur strings.Builder
	inSingle := false
	inDouble := false

	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case inSingle:
			if c == '\'' {
				inSingle = false
			} else {
				cur.WriteByte(c)
			}
		case inDouble:
			if c == '"' {
				inDouble = false
			} else if c == '\\' && i+1 < len(s) {
				i++
				cur.WriteByte(s[i])
			} else {
				cur.WriteByte(c)
			}
		case c == '\'':
			inSingle = true
		case c == '"':
			inDouble = true
		case c == ' ' || c == '\t' || c == '\r' || c == '\n':
			if cur.Len() > 0 {
				tokens = append(tokens, cur.String())
				cur.Reset()
			}
		case c == '\\' && i+1 < len(s):
			i++
			cur.WriteByte(s[i])
		default:
			cur.WriteByte(c)
		}
	}
	if inSingle {
		return nil, fmt.Errorf("unterminated single quote in curl command")
	}
	if cur.Len() > 0 {
		tokens = append(tokens, cur.String())
	}
	return tokens, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// splitHeader splits a "Key: Value" header string on the first ": ".
func splitHeader(s string) (key, value string) {
	idx := strings.Index(s, ": ")
	if idx == -1 {
		idx = strings.Index(s, ":")
		if idx == -1 {
			return s, ""
		}
		return s[:idx], strings.TrimSpace(s[idx+1:])
	}
	return s[:idx], s[idx+2:]
}

// splitPair splits "key=value" on the first '='.
func splitPair(s string) (key, value string) {
	idx := strings.Index(s, "=")
	if idx == -1 {
		return s, ""
	}
	return s[:idx], s[idx+1:]
}

// splitPairColon splits "user:pass" on the first ':'.
func splitPairColon(s string) (left, right string) {
	idx := strings.Index(s, ":")
	if idx == -1 {
		return s, ""
	}
	return s[:idx], s[idx+1:]
}

// nameFromURL derives a short human-readable name from a URL.
func nameFromURL(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.Path == "" || u.Path == "/" {
		if u != nil && u.Host != "" {
			return u.Host
		}
		return "Imported Request"
	}
	// Use the last non-empty path segment.
	segments := strings.Split(strings.Trim(u.Path, "/"), "/")
	for j := len(segments) - 1; j >= 0; j-- {
		if segments[j] != "" {
			return segments[j]
		}
	}
	return u.Host
}
