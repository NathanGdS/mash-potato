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
| `curl.go` | cURL export (`ExportRequestAsCurl`) and import (`ImportFromCurl`) |
| `runner.go` | Collection runner; executes requests in sequence, emits `RunResult` events |
| `db/db.go` | SQLite init, WAL mode, foreign keys, schema migrations |
| `db/collections.go` | Collection CRUD |
| `db/requests.go` | Request CRUD with JSON-encoded headers/params |
| `db/folders.go` | Folder CRUD (nested folders within collections) |
| `db/environments.go` | Environment and variable CRUD |
| `db/history.go` | Request history CRUD |
| `db/settings.go` | App settings persistence (key-value) |
| `httpclient/client.go` | Executes HTTP requests; handles headers, query params, body types, response timing |
| `httpclient/assertions.go` | Test assertion evaluation against `ResponseResult` |
| `scripter/scripter.go` | JS pre/post-request script execution via `goja` |
| `encryption/vars.go` | AES-256 encryption/decryption for secret environment variables |

The SQLite database is stored in the OS user config directory (resolved at runtime).

**Database schema:**
- `collections(id, name, created_at)`
- `folders(id, collection_id, parent_folder_id, name, created_at)`
- `requests(id, collection_id, folder_id, name, method, url, headers, params, body_type, body, auth_type, auth_config, timeout_seconds, tests, pre_script, post_script, created_at)` — `headers` and `params` are JSON arrays of `{key, value, enabled}` objects.
- `environments(id, name, is_global, created_at)` — built-in "Global" environment seeded at startup (`id = '__global__'`)
- `environment_variables(id, environment_id, key, value, is_secret)`
- `settings(key, value)`
- `request_history(id, method, url, headers, params, body_type, body, response_status, response_body, response_headers, response_duration_ms, response_size_bytes, executed_at)`

### Frontend layout

| Path | Purpose |
|---|---|
| `frontend/src/App.tsx` | Root layout: Sidebar + TabBar + RequestEditor + ResponseViewer |
| `frontend/src/components/` | UI components (see below) |
| `frontend/src/store/` | Zustand stores (see below) |
| `frontend/src/types/` | TypeScript interfaces for `Collection`, `Request`, `Environment` |
| `frontend/src/hooks/` | Custom hooks |
| `frontend/src/utils/` | Shared utilities |
| `frontend/src/wailsjs/` | Auto-generated Wails bindings — do not edit manually |

**Stores:**

| Store | Purpose |
|---|---|
| `collectionsStore` | Collections list and CRUD actions |
| `requestsStore` | Open/active request state |
| `foldersStore` | Folder tree state |
| `tabsStore` | Open request tabs |
| `environmentsStore` | Environments and variables |
| `responseStore` | Last HTTP response + assertion results |
| `runnerStore` | Collection runner state and results |
| `historyStore` | Request history list |
| `settingsStore` | App settings (theme, timeout, etc.) |

**Hooks:**

| Hook | Purpose |
|---|---|
| `useVarAutocomplete` | `{{variable}}` autocomplete suggestions |
| `useCodeGen` | Code generation (curl, Python, etc.) from a request |
| `useDiff` | Diff computation between two responses |

**Utils:**

| Util | Purpose |
|---|---|
| `codeHighlighter` | Syntax highlighting for JSON and other response bodies |
| `varSegments` | Splits URL/strings into literal and `{{variable}}` segments |
| `searchHighlight` | Highlights search matches in text |

**Key components:**

| Component | Purpose |
|---|---|
| `Sidebar.tsx` | Collections tree with folders and requests |
| `CollectionItem.tsx` | Single collection row in sidebar |
| `FolderItem.tsx` | Folder row in sidebar (supports nesting) |
| `TabBar.tsx` | Open request tabs bar |
| `RequestEditor.tsx` | Tabbed editor: URL bar, Headers, Params, Body, Auth, Tests, Scripts |
| `BodyEditor.tsx` | Body type selector + editor with JSON beautify |
| `AuthEditor.tsx` | Auth tab (Bearer, Basic, API Key) |
| `TestsEditor.tsx` | Test assertion editor |
| `TestResults.tsx` | Test assertion results display |
| `ScriptEditor.tsx` | Pre/post-request JS script editor |
| `ScriptsTab.tsx` | Scripts tab wrapper |
| `ScriptDocsModal.tsx` | Scripting API reference modal |
| `ConsolePanel.tsx` | Script console log output panel |
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
| `ImportCurlDialog.tsx` | cURL import dialog |
| `CollectionRunner.tsx` | Collection runner modal/panel |
| `HistoryList.tsx` | Request history list |
| `SearchPalette.tsx` | Global search palette |
| `CodeGenPanel.tsx` | Code generation panel (curl, Python, etc.) |
| `DiffPane.tsx` | Side-by-side response diff pane |
| `DiffViewer.tsx` | Diff viewer component |
| `HeadersDiffTable.tsx` | Headers diff table |
| `SettingsPanel.tsx` | App settings panel |
| `NewCollectionModal.tsx` | New collection creation modal |

### State management pattern
Zustand stores own both state and async actions that call the Wails Go bindings. Components read state and dispatch actions from the store — no local component state for data that needs persistence.

### Request execution flow
1. Frontend calls `SendRequest(id)` via Wails binding
2. Go fetches the request from SQLite
3. Active environment variables are loaded
4. `{{variable}}` tokens are interpolated across all fields (URL, headers, params, body)
5. Pre-request script runs via `scripter` (can mutate vars/headers)
6. HTTP request executes (configurable timeout, default 30s)
7. Post-request script runs with access to `ResponseSnapshot`
8. Test assertions evaluated via `httpclient.EvaluateAssertions`
9. `ResponseResult` returned: status, body, headers, duration, size, assertion results
10. Execution logged to `request_history`

## Spec-Driven Development

This project uses a `.shadow/` directory for spec tracking:
- `.shadow/counter` — current phase number (currently `0018`)
- `.shadow/features/<id>-<name>.md` — archived specs for completed phases
- `.shadow/wip/<id>-<name>/root.md` — spec document for active phase
- `.shadow/wip/<id>-<name>/spec_state.json` — user stories with acceptance criteria and status

Use the `/shadow-plan`, `/shadow-run`, and `/shadow-finish` skills to manage the development lifecycle.

## Known Patterns & Lessons

### `{{variable}}` highlight overlay (mirror pattern)

Every input that renders `{{variable}}` highlighting uses a mirror-behind-input pattern:
- A `position: absolute; inset: 0` div (the mirror) renders colored spans behind a transparent `<input>`
- The real input sits at `z-index: 1` with `color: transparent; caret-color: var(--text-primary)`

**Critical invariant:** mirror and input MUST share the same `font-family` AND `padding`. Any mismatch shifts character positions between the two layers, making the cursor click land at the wrong character.

- `url-bar-mirror` / `.url-bar`: both use `font-family: var(--font-mono)`, `padding: 6px 10px`
- `kv-value-mirror` / `.kv-input--highlight`: base uses `font-family: inherit`, `padding: 4px 6px`
- Auth inputs (`.auth-field-input`) use `font-family: var(--font-mono)` and `padding: 6px 12px` — so auth wrappers must add class `kv-value-wrapper--mono` to override mirror font and padding to match

When adding highlight overlay to any new input, verify font-family and padding match the mirror **before** shipping.
