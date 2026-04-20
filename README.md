# Mash Potato

A lightweight, native desktop API client — your Postman alternative without the bloat.

Built with [Wails v2](https://wails.io/), combining a Go backend with a React/TypeScript frontend into a single self-contained binary.

---

## Features

### Collections & Organization
- **Collections & Folders** — organize requests into collections with nested folder trees and drag-to-reorder
- **Request CRUD** — create, rename, duplicate, delete, and move requests between folders
- **Collection Export/Import** — save and load collections as JSON files

### Request Execution
- **HTTP Methods** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, and more
- **Headers & Query Params** — key-value editor with enable/disable toggles
- **Request Body** — JSON, Raw, Form Data, and Form URL-encoded body types with JSON beautify
- **Authentication** — Bearer Token, Basic Auth, and API Key auth types
- **Timeout Configuration** — per-request configurable timeout (default 30s)
- **Cancel in Flight** — abort an in-progress request at any time

### Environments & Variables
- **Environments** — create, rename, delete, and switch active environments
- **Global Environment** — always-active baseline variables available across all environments
- **`{{variable}}` Interpolation** — token substitution across URLs, headers, params, body, and auth fields
- **Variable Autocomplete** — popover suggestions when typing `{{` anywhere in the editor
- **Variable Hover Tooltip** — hover over any `{{variable}}` token to see its resolved value
- **Secret Variables** — AES-256-GCM encrypted at rest, masked in UI with 5-second reveal timeout; never logged in plaintext
- **Save Response as Variable** — select text from a response body and save it directly as an environment variable

### Scripting
- **Pre/Post-Request Scripts** — JavaScript execution via `goja` engine before and after each request
- **Environment Mutations** — scripts can read and write environment variables
- **Console Panel** — view `console.log` output and script errors in a dedicated panel

### Response & Analysis
- **Response Viewer** — syntax-highlighted JSON body, status badge, headers, duration, and size metrics
- **Timing Waterfall** — DNS, TCP, TLS, TTFB, and download breakdown per request
- **Test Assertions** — write JavaScript assertions against responses with pass/fail results display
- **Response Diffing** — side-by-side comparison of two responses including a headers diff table
- **Request History** — last 100 requests with full response snapshots; diff any two history entries

### Tooling
- **Code Generation** — export requests as cURL, Python, JavaScript (Fetch/Axios), TypeScript, Go, or Java
- **cURL Import** — paste a cURL command to auto-populate a request
- **Collection Runner** — execute all requests in a collection sequentially with aggregated pass/fail results
- **Global Search** — keyboard-driven palette (Ctrl+K) to find requests across all collections instantly

### UI & Persistence
- **Tab System** — multi-request editing with unsaved-change (dirty-state) tracking
- **Resizable Panes** — drag to adjust the editor/response split
- **Theme** — Dark, Light, or System theme with 8 accent color presets
- **Persistent Storage** — SQLite database in the OS user config directory
- **Settings** — configurable timeout, theme, accent color, and other app preferences

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.21, Wails v2 |
| Database | SQLite (`modernc.org/sqlite` — pure Go, no CGO) |
| Scripting | `goja` (JavaScript engine in Go) |
| Encryption | AES-256 (OS keychain-backed) |
| Frontend | React 18, TypeScript 5 |
| State | Zustand |
| Build | Vite |
| Testing | Vitest (frontend), Go testing (backend) |

---

## Prerequisites

- [Go 1.21+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Wails v2 CLI](https://wails.io/docs/gettingstarted/installation)

Install Wails:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

Check all dependencies are met:

```bash
wails doctor
```

---

## Development

```bash
# Clone the repo
git clone https://github.com/your-username/mash-potato.git
cd mash-potato

# Start in dev mode (hot-reload for Go + React)
wails dev
```

Or via Makefile:

```bash
make dev
```

---

## Building

```bash
# Production binary
wails build

# Or via Makefile
make build
```

The compiled binary is output to `build/bin/`.

---

## Testing

```bash
# Run all tests (Go + frontend)
make test

# Go tests only
go test ./...

# Frontend tests only
cd frontend && npm run test
```

---

## Project Structure

```
mash-potato/
├── main.go                     # Entry point — initializes DB and Wails app
├── app.go                      # Wails-exposed Go methods (the backend API)
├── interpolator.go             # {{variable}} template interpolation
├── curl.go                     # cURL export and import
├── runner.go                   # Collection runner with event emission
├── db/                         # SQLite layer
│   ├── db.go                   # Init, WAL mode, schema migrations
│   ├── collections.go          # Collection CRUD
│   ├── requests.go             # Request CRUD
│   ├── folders.go              # Folder CRUD (nested)
│   ├── environments.go         # Environment CRUD
│   ├── history.go              # Request history CRUD
│   └── settings.go             # App settings persistence
├── httpclient/
│   ├── client.go               # HTTP request execution with timing/size metrics
│   └── assertions.go           # Test assertion evaluation
├── scripter/
│   └── scripter.go             # JS pre/post-request script execution via goja
├── encryption/
│   └── vars.go                 # AES-256 encryption/decryption for secrets
└── frontend/src/
    ├── App.tsx                  # Root layout
    ├── components/              # UI components (60+)
    ├── store/                   # Zustand stores (12)
    ├── types/                   # TypeScript interfaces
    ├── hooks/                   # Custom React hooks (5)
    ├── utils/                   # Shared utilities
    └── wailsjs/                 # Auto-generated Wails bindings
```

---

## How It Works

The frontend calls Go methods through Wails' auto-generated JS bindings (in `frontend/src/wailsjs/`). All state and async actions live in Zustand stores — components never call the backend directly.

**Request flow:**

1. User clicks Send
2. Frontend calls `SendRequest(id)` via Wails binding
3. Go fetches the request from SQLite
4. Active environment variables are loaded
5. `{{variable}}` tokens are interpolated across all fields
6. Pre-request script runs (can mutate vars/headers)
7. HTTP request executes (configurable timeout, default 30s)
8. Post-request script runs with access to response snapshot
9. Test assertions evaluated against response
10. Response (status, body, headers, duration, size, assertion results) returned to frontend
11. Execution logged to `request_history`

---

## Database

SQLite file is stored in the OS user config directory (resolved at runtime). Schema:

```sql
collections(id, name, created_at)
folders(id, collection_id, parent_folder_id, name, created_at)
requests(id, collection_id, folder_id, name, method, url, headers, params, body_type, body, auth_type, auth_config, timeout_seconds, tests, pre_script, post_script, sort_order, created_at)
environments(id, name, is_global, created_at)
environment_variables(id, environment_id, key, value, is_secret)
settings(key, value)
request_history(id, method, url, headers, params, body_type, body, response_status, response_body, response_headers, response_duration_ms, response_size_bytes, timing_json, executed_at)
```

`headers` and `params` are JSON-encoded arrays of `{key, value, enabled}` objects. The built-in "Global" environment (`id = '__global__'`, `is_global = 1`) is seeded at startup.

---

## Stores

| Store | Purpose |
|---|---|
| `collectionsStore` | Collections list and CRUD actions |
| `foldersStore` | Folder tree state |
| `requestsStore` | Open/active request state |
| `tabsStore` | Open request tabs |
| `environmentsStore` | Environments and variables |
| `responseStore` | Last HTTP response + assertion results |
| `runnerStore` | Collection runner state and results |
| `historyStore` | Request history list |
| `settingsStore` | App settings (theme, timeout, etc.) |

## Hooks

| Hook | Purpose |
|---|---|
| `useVarAutocomplete` | `{{variable}}` autocomplete suggestions |
| `useVarHoverTooltip` | Variable hover tooltip |
| `useCodeGen` | Code generation (curl, Python, etc.) from a request |
| `useDiff` | Diff computation between two responses |

---

## Makefile Reference

| Command | Description |
|---|---|
| `make dev` | Start Wails dev mode |
| `make build` | Build production binary |
| `make test` | Run Go + frontend tests |
| `make lint` | Run `go vet` |
| `make generate` | Regenerate Wails JS bindings |
| `make clean` | Remove build artifacts |

---

## License

MIT
