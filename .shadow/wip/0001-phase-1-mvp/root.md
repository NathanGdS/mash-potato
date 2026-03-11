# 0001 — Phase 1 MVP

## Description
Build the core MVP of a Postman-like API client desktop application. The MVP covers collection management (create, rename, delete), request configuration (method, URL, headers, query params, body), request execution via the Go backend, and a response viewer (status, body, headers, metrics).

## Tech Context
- **Runtime**: Wails v2 — Go backend + React frontend communicating via Wails bindings (no REST server between them)
- **Language (backend)**: Go
- **Language (frontend)**: React (TypeScript preferred)
- **Database**: SQLite via `modernc.org/sqlite` or `mattn/go-sqlite3`; schema migrations handled manually or via a simple embedded migrator
- **HTTP execution**: Go standard `net/http` client in the backend; results returned as a Go struct exposed to the frontend via Wails
- **State management (frontend)**: React context or Zustand — keep it simple
- **Project is greenfield**: no source files exist yet; Wails project must be initialized first

## Out of Scope
- Environments and variable interpolation (Phase 2)
- Extracting variables from responses (Phase 3)
- Authentication helpers, scripts, test assertions
- Import/export (Postman, OpenAPI)
