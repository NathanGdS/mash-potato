package httpclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"mash-potato/db"
)

// ResponseResult holds the result of an executed HTTP request.
type ResponseResult struct {
	StatusCode   int                 `json:"StatusCode"`
	StatusText   string              `json:"StatusText"`
	Body         string              `json:"Body"`
	Headers      map[string][]string `json:"Headers"`
	DurationMs   int64               `json:"DurationMs"`
	SizeBytes    int64               `json:"SizeBytes"`
	TestResults  []AssertionResult   `json:"TestResults"`
	ConsoleLogs  []string            `json:"consoleLogs"`
	ScriptErrors []string            `json:"scriptErrors"`
}

// kvRow mirrors the JSON structure stored for headers/params/form-data.
type kvRow struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// parseKV deserialises a JSON KV array; returns empty slice on failure.
func parseKV(raw string) []kvRow {
	var rows []kvRow
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		return nil
	}
	return rows
}

// buildURL appends enabled query params to the base URL.
func buildURL(rawURL string, params []kvRow) (string, error) {
	if rawURL == "" {
		return "", fmt.Errorf("URL cannot be empty")
	}
	// Ensure scheme is present so url.Parse works reliably.
	if !strings.Contains(rawURL, "://") {
		rawURL = "https://" + rawURL
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}

	if len(params) > 0 {
		q := u.Query()
		for _, p := range params {
			if p.Enabled && p.Key != "" {
				q.Add(p.Key, p.Value)
			}
		}
		u.RawQuery = q.Encode()
	}

	return u.String(), nil
}

// authConfig holds the type-specific fields stored in auth_config JSON.
type authConfig struct {
	Token    string `json:"token"`    // bearer
	Username string `json:"username"` // basic
	Password string `json:"password"` // basic
	KeyName  string `json:"keyName"`  // apikey: header/param name
	KeyValue string `json:"keyValue"` // apikey: value
	AddTo    string `json:"addTo"`    // apikey: "header" | "query"
}

// applyAuth injects the appropriate Authorization header (or query param) based on auth_type.
// It mutates httpReq in place. Errors are silently swallowed so a bad config never blocks the send.
func applyAuth(httpReq *http.Request, authType string, authConfigJSON string) {
	if authType == "" || authType == "none" {
		return
	}
	var cfg authConfig
	if err := json.Unmarshal([]byte(authConfigJSON), &cfg); err != nil {
		return
	}
	switch authType {
	case "bearer":
		if cfg.Token != "" {
			httpReq.Header.Set("Authorization", "Bearer "+cfg.Token)
		}
	case "basic":
		if cfg.Username != "" {
			httpReq.SetBasicAuth(cfg.Username, cfg.Password)
		}
	case "apikey":
		if cfg.KeyName != "" && cfg.KeyValue != "" {
			if cfg.AddTo == "query" {
				q := httpReq.URL.Query()
				q.Set(cfg.KeyName, cfg.KeyValue)
				httpReq.URL.RawQuery = q.Encode()
			} else {
				// Default: inject as header
				httpReq.Header.Set(cfg.KeyName, cfg.KeyValue)
			}
		}
	}
}

// ExecuteRequest executes the HTTP request described by req and returns a ResponseResult.
func ExecuteRequest(req db.Request) (ResponseResult, error) {
	params := parseKV(req.Params)
	headers := parseKV(req.Headers)

	finalURL, err := buildURL(req.URL, params)
	if err != nil {
		return ResponseResult{}, err
	}

	// Build request body and determine Content-Type.
	var bodyReader io.Reader
	contentType := ""

	switch req.BodyType {
	case "json":
		contentType = "application/json"
		bodyReader = strings.NewReader(req.Body)

	case "raw":
		contentType = "text/plain"
		bodyReader = strings.NewReader(req.Body)

	case "form-data":
		formRows := parseKV(req.Body)
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		for _, row := range formRows {
			if row.Enabled && row.Key != "" {
				if err := writer.WriteField(row.Key, row.Value); err != nil {
					return ResponseResult{}, fmt.Errorf("form-data write field: %w", err)
				}
			}
		}
		if err := writer.Close(); err != nil {
			return ResponseResult{}, fmt.Errorf("form-data close: %w", err)
		}
		contentType = writer.FormDataContentType()
		bodyReader = &buf

	case "urlencoded":
		urlencodedRows := parseKV(req.Body)
		vals := url.Values{}
		for _, row := range urlencodedRows {
			if row.Enabled && row.Key != "" {
				vals.Add(row.Key, row.Value)
			}
		}
		contentType = "application/x-www-form-urlencoded"
		bodyReader = strings.NewReader(vals.Encode())

	default: // "none" or anything else
		bodyReader = http.NoBody
	}

	httpReq, err := http.NewRequest(req.Method, finalURL, bodyReader)
	if err != nil {
		return ResponseResult{}, fmt.Errorf("create request: %w", err)
	}

	// Apply enabled headers.
	for _, h := range headers {
		if h.Enabled && h.Key != "" {
			httpReq.Header.Set(h.Key, h.Value)
		}
	}

	// Apply auth (injected ephemerally — not persisted to stored headers).
	applyAuth(httpReq, req.AuthType, req.AuthConfig)

	// Set Content-Type if the body requires it and the caller has not already set it.
	if contentType != "" && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", contentType)
	}

	timeout := time.Duration(req.TimeoutSeconds) * time.Second
	// Note: http.Client.Timeout of 0 means no timeout.
	client := &http.Client{Timeout: timeout}

	start := time.Now()
	resp, err := client.Do(httpReq)
	elapsed := time.Since(start)
	if err != nil {
		return ResponseResult{}, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return ResponseResult{}, fmt.Errorf("read response body: %w", err)
	}

	result := ResponseResult{
		StatusCode: resp.StatusCode,
		StatusText: resp.Status,
		Body:       string(bodyBytes),
		Headers:    map[string][]string(resp.Header),
		DurationMs: elapsed.Milliseconds(),
		SizeBytes:  int64(len(bodyBytes)),
	}

	// Phase 010: Evaluate assertions.
	result.TestResults = EvaluateAssertions(req.Tests, result)

	return result, nil
}
