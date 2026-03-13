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
npm run test      # Run Vitest suite
```

### Go backend

```bash
go build ./...    # Build Go packages
go vet ./...      # Lint Go code
go test ./...     # Run Go tests
```

### Makefile shortcuts

```bash
make dev          # wails dev
make build        # wails build
make test         # Go + frontend tests
make lint         # go vet
make generate     # Regenerate Wails JS bindings
make clean        # Remove build artifacts
```

## Architecture

### Stack
- **Backend**: Go 1.21, Wails v2, SQLite (`modernc.org/sqlite`)
- **Frontend**: React 18, TypeScript 5, Zustand (state), Vite (build), Vitest (tests)

### Communication
The frontend calls Go methods via Wails' auto-generated JS bindings in `frontend/src/wailsjs/go/`. These bindings are generated from the exported methods on the `App` struct in `app.go`. Any new Go method bound to `App` needs to be regenerated with `wails generate module` (or happens automatically on `wails dev`).

### Backend layout

| File/Dir | Purpose |
|---|---|
| `main.go` | Entry point; initializes DB, creates Wails app |
| `app.go` | `App` struct with all Wails-exposed methods |
| `interpolator.go` | `{{variable}}` template interpolation via regex |
| `db/db.go` | SQLite init, WAL mode, foreign keys, schema migrations |
| `db/collections.go` | Collection CRUD |
| `db/requests.go` | Request CRUD with JSON-encoded headers/params |
| `db/environments.go` | Environment and variable CRUD |
| `db/settings.go` | App settings persistence (key-value) |
| `httpclient/client.go` | Executes HTTP requests; handles headers, query params, body types, response timing |

The SQLite database is stored in the OS user config directory (resolved at runtime).

**Database schema:**
- `collections(id, name, created_at)`
- `requests(id, collection_id, name, method, url, headers, params, body_type, body, created_at)` — `headers` and `params` are JSON arrays of `{key, value, enabled}` objects.
- `environments(id, name, created_at)`
- `environment_variables(id, environment_id, key, value)`
- `settings(key, value)`

### Frontend layout

| Path | Purpose |
|---|---|
| `frontend/src/App.tsx` | Root layout: Sidebar + RequestEditor + ResponseViewer |
| `frontend/src/components/` | UI components (see below) |
| `frontend/src/store/` | Zustand stores: `collectionsStore`, `requestsStore`, `environmentsStore`, `responseStore` |
| `frontend/src/types/` | TypeScript interfaces for `Collection`, `Request`, `Environment` |
| `frontend/src/hooks/` | Custom hooks (`useVarAutocomplete`) |
| `frontend/src/utils/` | Shared utilities (`jsonHighlighter`, `varSegments`) |
| `frontend/src/wailsjs/` | Auto-generated Wails bindings — do not edit manually |

**Key components:**

| Component | Purpose |
|---|---|
| `Sidebar.tsx` | Collections list with requests |
| `RequestEditor.tsx` | Tabbed editor: URL bar, Headers, Params, Body |
| `BodyEditor.tsx` | Body type selector + editor with JSON beautify |
| `ResponseViewer.tsx` | Tabbed response: Body, Headers, status badge, metrics |
| `ResponseBody.tsx` | Syntax-highlighted JSON / raw response |
| `ResponseHeaders.tsx` | Response headers table |
| `KeyValueTable.tsx` | Reusable key-value editor with enable toggles |
| `MethodSelector.tsx` | HTTP method dropdown |
| `UrlBar.tsx` | URL input with `{{variable}}` highlighting |
| `StatusBadge.tsx` | Color-coded HTTP status pill |
| `MetricsBar.tsx` | Duration (ms) and size (bytes) display |
| `EnvironmentPanel.tsx` | Environment management modal |
| `EnvironmentSelector.tsx` | Active environment dropdown |
| `VarPopover.tsx` | `{{variable}}` autocomplete popover |
| `SaveVarDialog.tsx` | Save response value as a variable |

### State management pattern
Zustand stores own both state and async actions that call the Wails Go bindings. Components read state and dispatch actions from the store — no local component state for data that needs persistence.

### Request execution flow
1. Frontend calls `SendRequest(id)` via Wails binding
2. Go fetches the request from SQLite
3. Active environment variables are loaded
4. `{{variable}}` tokens are interpolated across all fields (URL, headers, params, body)
5. HTTP request executes (30s timeout)
6. `ResponseResult` returned: status, body, headers, duration, size

## Spec-Driven Development

This project uses a `.shadow/` directory for spec tracking:
- `.shadow/counter` — current phase number (currently `0005`)
- `.shadow/features/<id>-<name>.md` — archived specs for completed phases
- `.shadow/wip/<id>-<name>/root.md` — spec document for active phase
- `.shadow/wip/<id>-<name>/spec_state.json` — user stories with acceptance criteria and status

Use the `/shadow-plan`, `/shadow-run`, and `/sdd-finish` skills to manage the development lifecycle.

**Completed phases:**
- `0001` — MVP (collections, requests, HTTP execution, SQLite persistence)
- `0002` — Environments & variable interpolation
- `0003` — Variable autocomplete and `{{var}}` highlighting
- `0004` — UX polish & visual overhaul (CSS tokens, resizable panes, tab badges)
- `0005` — JSON visualization (beautify, syntax highlighting, copy button)
