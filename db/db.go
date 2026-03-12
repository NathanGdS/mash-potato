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

	// Enable foreign key enforcement (SQLite disables it by default).
	if _, err = DB.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		return fmt.Errorf("db.Init: foreign_keys pragma: %w", err)
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
	if err != nil {
		return fmt.Errorf("migrate collections: %w", err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS requests (
			id            TEXT PRIMARY KEY,
			collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
			name          TEXT NOT NULL,
			method        TEXT NOT NULL DEFAULT 'GET',
			url           TEXT NOT NULL DEFAULT '',
			headers       TEXT NOT NULL DEFAULT '[]',
			params        TEXT NOT NULL DEFAULT '[]',
			body_type     TEXT NOT NULL DEFAULT 'none',
			body          TEXT NOT NULL DEFAULT '',
			created_at    DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		);
	`)
	if err != nil {
		return fmt.Errorf("migrate requests: %w", err)
	}

	// Add columns that may be missing if the table was created by an older migration.
	addColumns := []string{
		`ALTER TABLE requests ADD COLUMN headers   TEXT NOT NULL DEFAULT '[]'`,
		`ALTER TABLE requests ADD COLUMN params    TEXT NOT NULL DEFAULT '[]'`,
		`ALTER TABLE requests ADD COLUMN body_type TEXT NOT NULL DEFAULT 'none'`,
		`ALTER TABLE requests ADD COLUMN body      TEXT NOT NULL DEFAULT ''`,
	}
	for _, stmt := range addColumns {
		if _, execErr := db.Exec(stmt); execErr != nil {
			// SQLite returns an error when the column already exists; ignore it.
			_ = execErr
		}
	}

	return nil
}
