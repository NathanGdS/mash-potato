package db

import (
	"fmt"
	"time"
)

// Request mirrors the requests table row.
type Request struct {
	ID           string    `json:"id"`
	CollectionID string    `json:"collection_id"`
	Name         string    `json:"name"`
	Method       string    `json:"method"`
	URL          string    `json:"url"`
	Headers      string    `json:"headers"`
	Params       string    `json:"params"`
	BodyType     string    `json:"body_type"`
	Body         string    `json:"body"`
	CreatedAt    time.Time `json:"created_at"`
}

// InsertRequest persists a new request row with default values and returns it.
func InsertRequest(id, collectionID, name string) (Request, error) {
	now := time.Now().UTC()
	_, err := DB.Exec(
		`INSERT INTO requests
			(id, collection_id, name, method, url, headers, params, body_type, body, created_at)
		 VALUES (?, ?, ?, 'GET', '', '[]', '[]', 'none', '', ?)`,
		id, collectionID, name, now.Format(time.RFC3339),
	)
	if err != nil {
		return Request{}, fmt.Errorf("InsertRequest: %w", err)
	}
	return Request{
		ID:           id,
		CollectionID: collectionID,
		Name:         name,
		Method:       "GET",
		URL:          "",
		Headers:      "[]",
		Params:       "[]",
		BodyType:     "none",
		Body:         "",
		CreatedAt:    now,
	}, nil
}

// GetRequest returns a single request by its ID.
func GetRequest(id string) (Request, error) {
	row := DB.QueryRow(
		`SELECT id, collection_id, name, method, url, headers, params, body_type, body, created_at
		   FROM requests
		  WHERE id = ?`,
		id,
	)
	var r Request
	var createdAtStr string
	if err := row.Scan(
		&r.ID, &r.CollectionID, &r.Name, &r.Method, &r.URL,
		&r.Headers, &r.Params, &r.BodyType, &r.Body, &createdAtStr,
	); err != nil {
		return Request{}, fmt.Errorf("GetRequest: %w", err)
	}
	var parseErr error
	r.CreatedAt, parseErr = time.Parse(time.RFC3339, createdAtStr)
	if parseErr != nil {
		r.CreatedAt = time.Time{}
	}
	return r, nil
}

// UpdateRequest updates all mutable fields of a request row.
func UpdateRequest(id, method, url, headers, params, bodyType, body string) error {
	res, err := DB.Exec(
		`UPDATE requests
		    SET method = ?, url = ?, headers = ?, params = ?, body_type = ?, body = ?
		  WHERE id = ?`,
		method, url, headers, params, bodyType, body, id,
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

// ListRequests returns all requests for a given collection, ordered by creation time.
func ListRequests(collectionID string) ([]Request, error) {
	rows, err := DB.Query(
		`SELECT id, collection_id, name, method, url, headers, params, body_type, body, created_at
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
		if err := rows.Scan(
			&r.ID, &r.CollectionID, &r.Name, &r.Method, &r.URL,
			&r.Headers, &r.Params, &r.BodyType, &r.Body, &createdAtStr,
		); err != nil {
			return nil, fmt.Errorf("ListRequests scan: %w", err)
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
