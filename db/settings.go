package db

import (
	"database/sql"
	"fmt"
)

// GetSetting returns the value for the given key.
// If the key does not exist, it returns ("", nil) — callers treat the empty
// string as "not set".
func GetSetting(key string) (string, error) {
	var value string
	err := DB.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("GetSetting(%q): %w", key, err)
	}
	return value, nil
}

// SetSetting upserts the given key/value pair.
func SetSetting(key, value string) error {
	_, err := DB.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	if err != nil {
		return fmt.Errorf("SetSetting(%q): %w", key, err)
	}
	return nil
}
