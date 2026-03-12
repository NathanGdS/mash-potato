# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Mash Potato** is a Postman-like desktop API client built with [Wails v2](https://wails.io/) — a Go backend bridged to a React/TypeScript frontend, compiled into a native desktop application.

## Commands

### Development

```bash
# Start development mode (hot-reload for both Go and frontend)
wails dev

# Build production binary
wails build
```

### Frontend only (from `frontend/`)

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server standalone
npm run build     # TypeScript check + Vite build
```

### Go backend

```bash
go build ./...    # Build Go packages
go vet ./...      # Lint Go code
```

No automated tests exist in this project yet.

## Architecture

### Stack
- **Backend**: Go 1.21, Wails v2, SQLite (`modernc.org/sqlite`)
- **Frontend**: React 18, TypeScript 5, Zustand (state), Vite (build)

### Communication
The frontend calls Go methods via Wails' auto-generated JS bindings in `frontend/src/wailsjs/go/`. These bindings are generated from the exported methods on the `App` struct in `app.go`. Any new Go method bound to `App` needs to be regenerated with `wails generate module` (or happens automatically on `wails dev`).

### Backend layout

| File/Dir | Purpose |
|---|---|
| `main.go` | Entry point; initializes DB, creates Wails app |
| `app.go` | `App` struct with all Wails-exposed methods |
| `db/db.go` | SQLite init, WAL mode, foreign keys, schema migrations |
| `db/collections.go` | Collection CRUD |
| `db/requests.go` | Request CRUD with JSON-encoded headers/params |
| `httpclient/client.go` | Executes HTTP requests; handles headers, query params, body types, response timing |

The SQLite database is stored in the OS user config directory (resolved at runtime).

**Database schema:**
- `collections(id, name, created_at)`
- `requests(id, collection_id, name, method, url, headers, params, body_type, body, created_at)` — `headers` and `params` are JSON arrays of `{key, value, enabled}` objects.

### Frontend layout

| Path | Purpose |
|---|---|
| `frontend/src/App.tsx` | Root layout: Sidebar + RequestEditor + ResponseViewer |
| `frontend/src/components/` | UI components (Sidebar, RequestEditor, ResponseViewer, KeyValueTable, BodyEditor) |
| `frontend/src/store/` | Zustand stores: `collectionsStore`, `requestsStore`, `responseStore` |
| `frontend/src/types/` | TypeScript interfaces for `Collection` and `Request` |
| `frontend/src/wailsjs/` | Auto-generated Wails bindings — do not edit manually |

### State management pattern
Zustand stores own both state and async actions that call the Wails Go bindings. Components read state and dispatch actions from the store — no local component state for data that needs persistence.

## Spec-Driven Development

This project uses a `.shadow/` directory for spec tracking:
- `.shadow/counter` — current phase number
- `.shadow/wip/<id>-<name>/root.md` — spec document for active phase
- `.shadow/wip/<id>-<name>/spec_state.json` — user stories with acceptance criteria and status

Use the `/shadow-plan`, `/shadow-run`, and `/sdd-finish` skills to manage the development lifecycle. Check the `Roadmap.md` in the root for the planned phases.
