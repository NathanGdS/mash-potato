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

// ListRequests returns all requests for a given collection, ordered by creation time.
func ListRequests(collectionID string) ([]Request, error) {
	rows, err := DB.Query(
		`SELECT id, collection_id, folder_id, name, method, url, headers, params, body_type, body, auth_type, auth_config, timeout_seconds, tests, pre_script, post_script, created_at
		   FROM requests
		  WHERE collection_id = ?
		  ORDER BY created_at ASC`,
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
			&r.Headers, &r.Params, &r.BodyType, &r.Body, &r.AuthType, &r.AuthConfig, &r.TimeoutSeconds, &r.Tests, &r.PreScript, &r.PostScript, &createdAtStr,
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
