package db

import "fmt"

// HistoryEntry represents a single executed-request log row.
type HistoryEntry struct {
	ID                 int64  `json:"id"`
	Method             string `json:"method"`
	URL                string `json:"url"`
	Headers            string `json:"headers"`
	Params             string `json:"params"`
	BodyType           string `json:"body_type"`
	Body               string `json:"body"`
	ResponseStatus     int    `json:"response_status"`
	ResponseBody       string `json:"response_body"`
	ResponseHeaders    string `json:"response_headers"`
	ResponseDurationMs int64  `json:"response_duration_ms"`
	ResponseSizeBytes  int64  `json:"response_size_bytes"`
	ExecutedAt         string `json:"executed_at"`
}

// InsertHistory writes a new history entry to the database.
func InsertHistory(method, url, headers, params, bodyType, body string, responseStatus int, responseBody, responseHeaders string, responseDurationMs, responseSizeBytes int64) (HistoryEntry, error) {
	res, err := DB.Exec(`
		INSERT INTO request_history (method, url, headers, params, body_type, body, response_status, response_body, response_headers, response_duration_ms, response_size_bytes, executed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
	`, method, url, headers, params, bodyType, body, responseStatus, responseBody, responseHeaders, responseDurationMs, responseSizeBytes)
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
		SELECT id, method, url, headers, params, body_type, body, response_status, response_body, response_headers, response_duration_ms, response_size_bytes, executed_at
		FROM request_history WHERE id = ?
	`, id)
	var e HistoryEntry
	if err := row.Scan(&e.ID, &e.Method, &e.URL, &e.Headers, &e.Params, &e.BodyType, &e.Body, &e.ResponseStatus, &e.ResponseBody, &e.ResponseHeaders, &e.ResponseDurationMs, &e.ResponseSizeBytes, &e.ExecutedAt); err != nil {
		return HistoryEntry{}, fmt.Errorf("GetHistoryEntry: %w", err)
	}
	return e, nil
}

// ListHistory returns the last limit entries, newest first.
func ListHistory(limit int) ([]HistoryEntry, error) {
	rows, err := DB.Query(`
		SELECT id, method, url, headers, params, body_type, body, response_status, response_body, response_headers, response_duration_ms, response_size_bytes, executed_at
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
		if err := rows.Scan(&e.ID, &e.Method, &e.URL, &e.Headers, &e.Params, &e.BodyType, &e.Body, &e.ResponseStatus, &e.ResponseBody, &e.ResponseHeaders, &e.ResponseDurationMs, &e.ResponseSizeBytes, &e.ExecutedAt); err != nil {
			return nil, fmt.Errorf("ListHistory: scan: %w", err)
		}
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
