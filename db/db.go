package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

// Init opens (or creates) the SQLite database at the given path and runs migrations.
func Init(dataSourceName string) error {
	var err error
	DB, err = sql.Open("sqlite", dataSourceName)
	if err != nil {
		return fmt.Errorf("db.Init: open: %w", err)
	}

	// Enable WAL mode for better concurrent read performance.
	if _, err = DB.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		return fmt.Errorf("db.Init: WAL pragma: %w", err)
	}

	if err = migrate(DB); err != nil {
		return fmt.Errorf("db.Init: migrate: %w", err)
	}

	return nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS collections (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		);
	`)
	return err
}
