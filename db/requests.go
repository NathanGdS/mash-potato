package db

import (
	"database/sql"
	"fmt"
	"time"
)

// Request mirrors the requests table row.
type Request struct {
	ID           string    `json:"id"`
	CollectionID string    `json:"collection_id"`
	FolderID     *string   `json:"folder_id"`
	Name         string    `json:"name"`
	Method       string    `json:"method"`
	URL          string    `json:"url"`
	Headers      string    `json:"headers"`
	Params       string    `json:"params"`
	BodyType     string    `json:"body_type"`
	Body         string    `json:"body"`
	AuthType       string    `json:"auth_type"`
	AuthConfig     string    `json:"auth_config"`
	TimeoutSeconds int       `json:"timeout_seconds"`
	Tests          string    `json:"tests"`
	PreScript      string    `json:"pre_script"`
	PostScript     string    `json:"post_script"`
	SortOrder     int       `json:"sort_order"`
	CreatedAt      time.Time `json:"created_at"`
}

// InsertRequest persists a new request row with default values and returns it.
// The request is placed at root level (no folder).
func InsertRequest(id, collectionID, name string) (Request, error) {
	return InsertRequestInFolder(id, collectionID, "", name)
}

// InsertRequestInFolder persists a new request row inside the given folder.
// Pass folderID = "" to place the request at root level (no folder).
func InsertRequestInFolder(id, collectionID, folderID, name string) (Request, error) {
	now := time.Now().UTC()
	var pfID *string
	if folderID != "" {
		pfID = &folderID
	}
	_, err := DB.Exec(
		`INSERT INTO requests
			(id, collection_id, folder_id, name, method, url, headers, params, body_type, body, auth_type, auth_config, timeout_seconds, tests, pre_script, post_script, created_at)
		 VALUES (?, ?, ?, ?, 'GET', '', '[]', '[]', 'none', '', 'none', '{}', 30, '', '', '', ?)`,
		id, collectionID, nullableString(folderID), name, now.Format(time.RFC3339),
	)
	if err != nil {
		return Request{}, fmt.Errorf("InsertRequestInFolder: %w", err)
	}
	return Request{
		ID:             id,
		CollectionID:   collectionID,
		FolderID:       pfID,
		Name:           name,
		Method:         "GET",
		URL:            "",
		Headers:        "[]",
		Params:         "[]",
		BodyType:       "none",
		Body:           "",
		AuthType:       "none",
		AuthConfig:     "{}",
		TimeoutSeconds: 30,
		Tests:          "",
		PreScript:      "",
		PostScript:     "",
		CreatedAt:      now,
	}, nil
}

// GetRequest returns a single request by its ID.
func GetRequest(id string) (Request, error) {
	row := DB.QueryRow(
		`SELECT id, collection_id, folder_id, name, method, url, headers, params, body_type, body, auth_type, auth_config, timeout_seconds, tests, pre_script, post_script, created_at
		   FROM requests
		  WHERE id = ?`,
		id,
	)
	var r Request
	var createdAtStr string
	var folderID sql.NullString
	if err := row.Scan(
		&r.ID, &r.CollectionID, &folderID, &r.Name, &r.Method, &r.URL,
		&r.Headers, &r.Params, &r.BodyType, &r.Body, &r.AuthType, &r.AuthConfig, &r.TimeoutSeconds, &r.Tests, &r.PreScript, &r.PostScript, &createdAtStr,
	); err != nil {
		return Request{}, fmt.Errorf("GetRequest: %w", err)
	}
	if folderID.Valid {
		r.FolderID = &folderID.String
	}
	var parseErr error
	r.CreatedAt, parseErr = time.Parse(time.RFC3339, createdAtStr)
	if parseErr != nil {
		r.CreatedAt = time.Time{}
	}
	return r, nil
}

// UpdateRequest updates all mutable fields of a request row.
func UpdateRequest(id, method, url, headers, params, bodyType, body, authType, authConfig string, timeoutSeconds int, tests, preScript, postScript string) error {
	res, err := DB.Exec(
		`UPDATE requests
		    SET method = ?, url = ?, headers = ?, params = ?, body_type = ?, body = ?, auth_type = ?, auth_config = ?, timeout_seconds = ?, tests = ?, pre_script = ?, post_script = ?
		  WHERE id = ?`,
		method, url, headers, params, bodyType, body, authType, authConfig, timeoutSeconds, tests, preScript, postScript, id,
	)
	if err != nil {
		return fmt.Errorf("UpdateRequest: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("UpdateRequest rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("UpdateRequest: no row with id %s", id)
	}
	return nil
}

// RenameRequest updates the name of a request.
func RenameRequest(id, name string) error {
	res, err := DB.Exec(`UPDATE requests SET name = ? WHERE id = ?`, name, id)
	if err != nil {
		return fmt.Errorf("RenameRequest: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("RenameRequest rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("RenameRequest: no row with id %s", id)
	}
	return nil
}

// DeleteRequest removes a request row by its ID.
func DeleteRequest(id string) error {
	res, err := DB.Exec(`DELETE FROM requests WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("DeleteRequest: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("DeleteRequest rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("DeleteRequest: no row with id %s", id)
	}
	return nil
}

// DuplicateRequest fetches the request with the given id, inserts a copy with
// " (copy)" appended to the name, and returns the new request.
func DuplicateRequest(id, newID string) (Request, error) {
	orig, err := GetRequest(id)
	if err != nil {
		return Request{}, fmt.Errorf("DuplicateRequest: fetch original: %w", err)
	}
	copyName := orig.Name + " (copy)"
	now := time.Now().UTC()
	var folderIDVal interface{}
	if orig.FolderID != nil {
		folderIDVal = *orig.FolderID
	}
	_, err = DB.Exec(
		`INSERT INTO requests
			(id, collection_id, folder_id, name, method, url, headers, params, body_type, body, auth_type, auth_config, timeout_seconds, tests, pre_script, post_script, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		newID, orig.CollectionID, folderIDVal, copyName, orig.Method, orig.URL,
		orig.Headers, orig.Params, orig.BodyType, orig.Body, orig.AuthType, orig.AuthConfig,
		orig.TimeoutSeconds, orig.Tests, orig.PreScript, orig.PostScript, now.Format(time.RFC3339),
	)
	if err != nil {
		return Request{}, fmt.Errorf("DuplicateRequest: insert copy: %w", err)
	}
	return Request{
		ID:             newID,
		CollectionID:   orig.CollectionID,
		FolderID:       orig.FolderID,
		Name:           copyName,
		Method:         orig.Method,
		URL:            orig.URL,
		Headers:        orig.Headers,
		Params:         orig.Params,
		BodyType:       orig.BodyType,
		Body:           orig.Body,
		AuthType:       orig.AuthType,
		AuthConfig:     orig.AuthConfig,
		TimeoutSeconds: orig.TimeoutSeconds,
		Tests:          orig.Tests,
		PreScript:      orig.PreScript,
		PostScript:     orig.PostScript,
		CreatedAt:      now,
	}, nil
}

// SearchResult holds the fields returned by SearchRequests.
type SearchResult struct {
	RequestID      string `json:"request_id"`
	RequestName    string `json:"request_name"`
	Method         string `json:"method"`
	URL            string `json:"url"`
	CollectionID   string `json:"collection_id"`
	CollectionName string `json:"collection_name"`
}

// SearchRequests returns up to 50 requests whose name, URL, or collection name
// contains the given query string (case-insensitive via SQLite LIKE).
// An empty query returns an empty slice without hitting the database.
func SearchRequests(query string) ([]SearchResult, error) {
	if query == "" {
		return []SearchResult{}, nil
	}
	pattern := "%" + query + "%"
	rows, err := DB.Query(
		`SELECT r.id, r.name, r.method, r.url, c.id, c.name
		   FROM requests r
		   JOIN collections c ON r.collection_id = c.id
		  WHERE r.name LIKE ? OR r.url LIKE ? OR c.name LIKE ?
		  LIMIT 50`,
		pattern, pattern, pattern,
	)
	if err != nil {
		return nil, fmt.Errorf("SearchRequests: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var sr SearchResult
		if err := rows.Scan(&sr.RequestID, &sr.RequestName, &sr.Method, &sr.URL, &sr.CollectionID, &sr.CollectionName); err != nil {
			return nil, fmt.Errorf("SearchRequests scan: %w", err)
		}
		results = append(results, sr)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("SearchRequests rows: %w", err)
	}
	if results == nil {
		return []SearchResult{}, nil
	}
	return results, nil
}

// SearchRequestsWithBody returns up to 50 requests whose name, URL, collection name,
// or body contains the given query string (case-insensitive via SQLite LIKE).
// Bodies larger than 50 KB are skipped silently via a length guard in the WHERE clause.
// An empty query returns an empty slice without hitting the database.
func SearchRequestsWithBody(query string) ([]SearchResult, error) {
	if query == "" {
		return []SearchResult{}, nil
	}
	pattern := "%" + query + "%"
	rows, err := DB.Query(
		`SELECT r.id, r.name, r.method, r.url, c.id, c.name
		   FROM requests r
		   JOIN collections c ON r.collection_id = c.id
		  WHERE r.name LIKE ?
		     OR r.url LIKE ?
		     OR c.name LIKE ?
		     OR (length(r.body) < 51200 AND r.body LIKE ?)
		  LIMIT 50`,
		pattern, pattern, pattern, pattern,
	)
	if err != nil {
		return nil, fmt.Errorf("SearchRequestsWithBody: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var sr SearchResult
		if err := rows.Scan(&sr.RequestID, &sr.RequestName, &sr.Method, &sr.URL, &sr.CollectionID, &sr.CollectionName); err != nil {
			return nil, fmt.Errorf("SearchRequestsWithBody scan: %w", err)
		}
		results = append(results, sr)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("SearchRequestsWithBody rows: %w", err)
	}
	if results == nil {
		return []SearchResult{}, nil
	}
	return results, nil
}

// ListRequests returns all requests for a given collection, ordered by sort_order then created_at.
func ListRequests(collectionID string) ([]Request, error) {
	rows, err := DB.Query(
		`SELECT id, collection_id, folder_id, name, method, url, headers, params, body_type, body, auth_type, auth_config, timeout_seconds, tests, pre_script, post_script, COALESCE(sort_order, 0), created_at
		   FROM requests
		  WHERE collection_id = ?
		  ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC`,
		collectionID,
	)
	if err != nil {
		return nil, fmt.Errorf("ListRequests: %w", err)
	}
	defer rows.Close()

	var reqs []Request
	for rows.Next() {
		var r Request
		var createdAtStr string
		var folderID sql.NullString
		if err := rows.Scan(
			&r.ID, &r.CollectionID, &folderID, &r.Name, &r.Method, &r.URL,
			&r.Headers, &r.Params, &r.BodyType, &r.Body, &r.AuthType, &r.AuthConfig, &r.TimeoutSeconds, &r.Tests, &r.PreScript, &r.PostScript, &r.SortOrder, &createdAtStr,
		); err != nil {
			return nil, fmt.Errorf("ListRequests scan: %w", err)
		}
		if folderID.Valid {
			r.FolderID = &folderID.String
		}
		r.CreatedAt, err = time.Parse(time.RFC3339, createdAtStr)
		if err != nil {
			r.CreatedAt = time.Time{}
		}
		reqs = append(reqs, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ListRequests rows: %w", err)
	}
	return reqs, nil
}

// ReorderRequests updates the sort_order for requests in a folder (or root level if folderID = "").
// requestIDs should contain the ordered list of request IDs.
func ReorderRequests(folderID string, requestIDs []string) error {
	for i, id := range requestIDs {
		var err error
		if folderID == "" {
			_, err = DB.Exec(`UPDATE requests SET sort_order = ? WHERE id = ? AND folder_id IS NULL`, i, id)
		} else {
			_, err = DB.Exec(`UPDATE requests SET sort_order = ? WHERE id = ? AND folder_id = ?`, i, id, folderID)
		}
		if err != nil {
			return fmt.Errorf("ReorderRequests update %s: %w", id, err)
		}
	}
	return nil
}
