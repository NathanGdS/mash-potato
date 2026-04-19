package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

// TimingPhases holds per-phase HTTP timing data in milliseconds.
// JSON tags use snake_case to match the httpclient package convention.
type TimingPhases struct {
	DNSLookup    int64 `json:"dns_lookup"`
	TCPHandshake int64 `json:"tcp_handshake"`
	TLSHandshake int64 `json:"tls_handshake"`
	TTFB         int64 `json:"ttfb"`
	Download     int64 `json:"download"`
}

// HistoryEntry represents a single executed-request log row.
type HistoryEntry struct {
	ID                 int64        `json:"id"`
	Method             string       `json:"method"`
	URL                string       `json:"url"`
	Headers            string       `json:"headers"`
	Params             string       `json:"params"`
	BodyType           string       `json:"body_type"`
	Body               string       `json:"body"`
	ResponseStatus     int          `json:"response_status"`
	ResponseBody       string       `json:"response_body"`
	ResponseHeaders    string       `json:"response_headers"`
	ResponseDurationMs int64        `json:"response_duration_ms"`
	ResponseSizeBytes  int64        `json:"response_size_bytes"`
	ExecutedAt         string       `json:"executed_at"`
	Timing             TimingPhases `json:"timing"`
}

// serializeTiming marshals TimingPhases to a JSON string; returns "{}" on error.
func serializeTiming(t TimingPhases) string {
	b, err := json.Marshal(t)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// deserializeTiming unmarshals a nullable timing_json column into TimingPhases.
// A NULL or empty value returns a zero-value TimingPhases without error.
func deserializeTiming(raw sql.NullString) TimingPhases {
	if !raw.Valid || raw.String == "" {
		return TimingPhases{}
	}
	var t TimingPhases
	if err := json.Unmarshal([]byte(raw.String), &t); err != nil {
		return TimingPhases{}
	}
	return t
}

// InsertHistory writes a new history entry to the database.
func InsertHistory(method, url, headers, params, bodyType, body string, responseStatus int, responseBody, responseHeaders string, responseDurationMs, responseSizeBytes int64, timing TimingPhases) (HistoryEntry, error) {
	res, err := DB.Exec(`
		INSERT INTO request_history (method, url, headers, params, body_type, body, response_status, response_body, response_headers, response_duration_ms, response_size_bytes, timing_json, executed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
	`, method, url, headers, params, bodyType, body, responseStatus, responseBody, responseHeaders, responseDurationMs, responseSizeBytes, serializeTiming(timing))
	if err != nil {
		return HistoryEntry{}, fmt.Errorf("InsertHistory: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return HistoryEntry{}, fmt.Errorf("InsertHistory: last insert id: %w", err)
	}
	return GetHistoryEntry(id)
}

// GetHistoryEntry returns a single history entry by ID.
func GetHistoryEntry(id int64) (HistoryEntry, error) {
	row := DB.QueryRow(`
		SELECT id, method, url, headers, params, body_type, body, response_status, response_body, response_headers, response_duration_ms, response_size_bytes, executed_at, timing_json
		FROM request_history WHERE id = ?
	`, id)
	var e HistoryEntry
	var timingRaw sql.NullString
	if err := row.Scan(&e.ID, &e.Method, &e.URL, &e.Headers, &e.Params, &e.BodyType, &e.Body, &e.ResponseStatus, &e.ResponseBody, &e.ResponseHeaders, &e.ResponseDurationMs, &e.ResponseSizeBytes, &e.ExecutedAt, &timingRaw); err != nil {
		return HistoryEntry{}, fmt.Errorf("GetHistoryEntry: %w", err)
	}
	e.Timing = deserializeTiming(timingRaw)
	return e, nil
}

// ListHistory returns the last limit entries, newest first.
func ListHistory(limit int) ([]HistoryEntry, error) {
	rows, err := DB.Query(`
		SELECT id, method, url, headers, params, body_type, body, response_status, response_body, response_headers, response_duration_ms, response_size_bytes, executed_at, timing_json
		FROM request_history
		ORDER BY id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("ListHistory: %w", err)
	}
	defer rows.Close()

	var entries []HistoryEntry
	for rows.Next() {
		var e HistoryEntry
		var timingRaw sql.NullString
		if err := rows.Scan(&e.ID, &e.Method, &e.URL, &e.Headers, &e.Params, &e.BodyType, &e.Body, &e.ResponseStatus, &e.ResponseBody, &e.ResponseHeaders, &e.ResponseDurationMs, &e.ResponseSizeBytes, &e.ExecutedAt, &timingRaw); err != nil {
			return nil, fmt.Errorf("ListHistory: scan: %w", err)
		}
		e.Timing = deserializeTiming(timingRaw)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ClearHistory deletes all history entries.
func ClearHistory() error {
	if _, err := DB.Exec(`DELETE FROM request_history`); err != nil {
		return fmt.Errorf("ClearHistory: %w", err)
	}
	return nil
}
