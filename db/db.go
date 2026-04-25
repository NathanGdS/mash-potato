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
			folder_id    TEXT,
			name        TEXT NOT NULL,
			method      TEXT NOT NULL DEFAULT 'GET',
			url         TEXT NOT NULL DEFAULT '',
			headers     TEXT NOT NULL DEFAULT '[]',
			params      TEXT NOT NULL DEFAULT '[]',
			body_type   TEXT NOT NULL DEFAULT 'none',
			body       TEXT NOT NULL DEFAULT '',
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		);
	`)
	if err != nil {
		return fmt.Errorf("migrate requests: %w", err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS environments (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		);
	`)
	if err != nil {
		return fmt.Errorf("migrate environments: %w", err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS settings (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		);
	`)
	if err != nil {
		return fmt.Errorf("migrate settings: %w", err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS environment_variables (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			environment_id TEXT    NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
			key            TEXT    NOT NULL,
			value          TEXT    NOT NULL
		);
	`)
	if err != nil {
		return fmt.Errorf("migrate environment_variables: %w", err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS folders (
			id               TEXT PRIMARY KEY,
			collection_id    TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
			parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
			name             TEXT NOT NULL,
			created_at       DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		);
	`)
	if err != nil {
		return fmt.Errorf("migrate folders: %w", err)
	}

	// Add columns that may be missing if the table was created by an older migration.
	addColumns := []string{
		`ALTER TABLE requests ADD COLUMN headers   TEXT NOT NULL DEFAULT '[]'`,
		`ALTER TABLE requests ADD COLUMN params    TEXT NOT NULL DEFAULT '[]'`,
		`ALTER TABLE requests ADD COLUMN body_type TEXT NOT NULL DEFAULT 'none'`,
		`ALTER TABLE requests ADD COLUMN body      TEXT NOT NULL DEFAULT ''`,
		// Phase 006: add is_global flag to environments
		`ALTER TABLE environments ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0`,
		// Phase 008: add folder_id to requests
		`ALTER TABLE requests ADD COLUMN folder_id TEXT REFERENCES folders(id)`,
		// Phase 009: add auth fields to requests
		`ALTER TABLE requests ADD COLUMN auth_type   TEXT NOT NULL DEFAULT 'none'`,
		`ALTER TABLE requests ADD COLUMN auth_config TEXT NOT NULL DEFAULT '{}'`,
		// Phase 012: add timeout_seconds to requests
		`ALTER TABLE requests ADD COLUMN timeout_seconds INTEGER NOT NULL DEFAULT 30`,
		// Phase 013: add tests to requests
		`ALTER TABLE requests ADD COLUMN tests TEXT NOT NULL DEFAULT ''`,
		// Phase 0009: add pre/post scripting to requests
		`ALTER TABLE requests ADD COLUMN pre_script  TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE requests ADD COLUMN post_script TEXT NOT NULL DEFAULT ''`,
		// US-2: add is_secret flag to environment_variables
		`ALTER TABLE environment_variables ADD COLUMN is_secret BOOLEAN NOT NULL DEFAULT 0`,
		// US-3: add sort_order to requests
		`ALTER TABLE requests ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
		// US-2 (0022): add spec_source to collections for OpenAPI import tracking
		`ALTER TABLE collections ADD COLUMN spec_source TEXT`,
	}
	for _, stmt := range addColumns {
		if _, execErr := db.Exec(stmt); execErr != nil {
			// SQLite returns an error when the column already exists; ignore it.
			_ = execErr
		}
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS request_history (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			method          TEXT    NOT NULL DEFAULT 'GET',
			url             TEXT    NOT NULL DEFAULT '',
			headers         TEXT    NOT NULL DEFAULT '[]',
			params          TEXT    NOT NULL DEFAULT '[]',
			body_type       TEXT    NOT NULL DEFAULT 'none',
			body            TEXT    NOT NULL DEFAULT '',
			response_status INTEGER NOT NULL DEFAULT 0,
			executed_at     DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		);
	`)
	if err != nil {
		return fmt.Errorf("migrate request_history: %w", err)
	}

	// Phase 0007: store full response in history — idempotent, safe to re-run.
	historyAddColumns := []string{
		`ALTER TABLE request_history ADD COLUMN response_body        TEXT    NOT NULL DEFAULT ''`,
		`ALTER TABLE request_history ADD COLUMN response_headers     TEXT    NOT NULL DEFAULT '{}'`,
		`ALTER TABLE request_history ADD COLUMN response_duration_ms INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE request_history ADD COLUMN response_size_bytes  INTEGER NOT NULL DEFAULT 0`,
	}
	for _, stmt := range historyAddColumns {
		if _, execErr := db.Exec(stmt); execErr != nil {
			_ = execErr
		}
	}

	// Phase 0018: idempotent migration — add timing_json only if missing.
	// Uses PRAGMA table_info to detect the column before attempting ALTER TABLE.
	// Must run AFTER the CREATE TABLE above so the table exists on fresh DBs.
	if err = addColumnIfMissing(db, "request_history", "timing_json", "ALTER TABLE request_history ADD COLUMN timing_json TEXT"); err != nil {
		return fmt.Errorf("migrate timing_json: %w", err)
	}

	// Seed the built-in global environment if it does not yet exist.
	if err := seedGlobalEnvironment(db); err != nil {
		return fmt.Errorf("migrate seed global env: %w", err)
	}

	return nil
}

// addColumnIfMissing executes alterStmt only when the named column is absent
// from the given table, detected via PRAGMA table_info. This is idempotent and
// safe to call on every startup.
func addColumnIfMissing(db *sql.DB, table, column, alterStmt string) error {
	rows, err := db.Query(fmt.Sprintf(`PRAGMA table_info(%q)`, table))
	if err != nil {
		return fmt.Errorf("addColumnIfMissing PRAGMA: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var dfltValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return fmt.Errorf("addColumnIfMissing scan: %w", err)
		}
		if name == column {
			return nil // column already exists
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("addColumnIfMissing rows: %w", err)
	}

	if _, err := db.Exec(alterStmt); err != nil {
		return fmt.Errorf("addColumnIfMissing ALTER: %w", err)
	}
	return nil
}

// seedGlobalEnvironment inserts the built-in "Global" environment (is_global=1)
// exactly once. Safe to call on every startup — it is a no-op when the row exists.
func seedGlobalEnvironment(db *sql.DB) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM environments WHERE is_global = 1`).Scan(&count); err != nil {
		return fmt.Errorf("seedGlobalEnvironment count: %w", err)
	}
	if count > 0 {
		return nil // already seeded
	}
	_, err := db.Exec(
		`INSERT INTO environments (id, name, is_global, created_at) VALUES ('__global__', 'Global', 1, '2000-01-01T00:00:00Z')`,
	)
	if err != nil {
		return fmt.Errorf("seedGlobalEnvironment insert: %w", err)
	}
	return nil
}
