package db

import (
	"fmt"
	"time"
)

// Collection mirrors the collections table row.
type Collection struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// InsertCollection persists a new collection row and returns it.
func InsertCollection(id, name string) (Collection, error) {
	now := time.Now().UTC()
	_, err := DB.Exec(
		`INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)`,
		id, name, now.Format(time.RFC3339),
	)
	if err != nil {
		return Collection{}, fmt.Errorf("InsertCollection: %w", err)
	}
	return Collection{ID: id, Name: name, CreatedAt: now}, nil
}

// UpdateCollection updates the name of an existing collection by ID.
func UpdateCollection(id, name string) error {
	res, err := DB.Exec(`UPDATE collections SET name = ? WHERE id = ?`, name, id)
	if err != nil {
		return fmt.Errorf("UpdateCollection: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("UpdateCollection rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("UpdateCollection: no collection with id %q", id)
	}
	return nil
}

// DeleteCollection removes a collection by ID. Child requests are removed via
// ON DELETE CASCADE. Returns an error if no such collection exists.
func DeleteCollection(id string) error {
	res, err := DB.Exec(`DELETE FROM collections WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("DeleteCollection: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("DeleteCollection rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("DeleteCollection: no collection with id %q", id)
	}
	return nil
}

// ListCollections returns all collections ordered by creation time.
func ListCollections() ([]Collection, error) {
	rows, err := DB.Query(`SELECT id, name, created_at FROM collections ORDER BY created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("ListCollections: %w", err)
	}
	defer rows.Close()

	var cols []Collection
	for rows.Next() {
		var c Collection
		var createdAtStr string
		if err := rows.Scan(&c.ID, &c.Name, &createdAtStr); err != nil {
			return nil, fmt.Errorf("ListCollections scan: %w", err)
		}
		c.CreatedAt, err = time.Parse(time.RFC3339, createdAtStr)
		if err != nil {
			// fallback — store raw string as zero time if unparseable
			c.CreatedAt = time.Time{}
		}
		cols = append(cols, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ListCollections rows: %w", err)
	}
	return cols, nil
}
