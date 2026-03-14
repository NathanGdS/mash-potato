# 0006 — Full Feature Set

**Status**: Complete
**Archived**: 2026-03-13
**User Stories**: 17 / 17

---

## Summary

Phase 0006 delivered a comprehensive expansion of Mash Potato covering all major UX gaps identified in the project analysis. This phase added a full tab system with persistence and dirty-state tracking, an Auth tab supporting Bearer, Basic, and API Key authentication, folder-based collection organization, request execution history, a post-response assertions engine, global variables, configurable per-request timeouts, collection import/export, Form URL Encoded body type, request duplication, and HEAD/OPTIONS HTTP methods.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Request Tabs — Open | ✅ |
| US-2 | Request Tabs — Close & Switch | ✅ |
| US-3 | Request Tabs — Persistence | ✅ |
| US-4 | Unsaved Changes Indicator | ✅ |
| US-5 | Auth Tab — Bearer Token | ✅ |
| US-6 | Auth Tab — Basic Auth | ✅ |
| US-7 | Auth Tab — API Key | ✅ |
| US-8 | Folders in Collections | ✅ |
| US-9 | Request History | ✅ |
| US-10 | Post-Response Assertions | ✅ |
| US-11 | Global Variables | ✅ |
| US-12 | Configurable Request Timeout | ✅ |
| US-13 | Export Collection | ✅ |
| US-14 | Import Collection | ✅ |
| US-15 | Form URL Encoded Body Type | ✅ |
| US-16 | Duplicate Request | ✅ |
| US-17 | HEAD and OPTIONS Methods | ✅ |

---

## Implementation Details

### Tab System (US-1 – US-4)

- **Frontend**: New `tabsStore.ts` (Zustand) with `openTabs: RequestTab[]`, `activeTabId`, `dirtyTabs: Set<string>`, and actions `openTab`, `closeTab`, `setActiveTab`, `markDirty`, `markClean`.
- New `TabBar.tsx` component rendered above `RequestEditor` in `App.tsx`; tabs display colored method badge + request name + dirty dot indicator + × close button.
- Close logic selects the left neighbour tab (or right if first); falls back to empty/placeholder state when no tabs remain.
- Tab state is debounce-persisted to SQLite settings key `open_tabs` via `GetSetting`/`SetSetting` Wails bindings in `app.go`; hydrated on app load with dead-ID pruning.

### Auth Tab (US-5 – US-7)

- **DB**: `auth_type` (TEXT) and `auth_config` (TEXT/JSON) columns added to `requests` table via migration in `db/db.go`.
- **Backend**: `httpclient/client.go` injects auth headers at send time — Bearer adds `Authorization: Bearer <token>`, Basic Base64-encodes `user:pass` into `Authorization: Basic <b64>`, API Key injects into headers or query params based on `addTo` field.
- **Frontend**: New `AuthEditor.tsx` component renders a type selector (`none` | `bearer` | `basic` | `apikey`) and dynamic fields per type; password field uses `type="password"`. Mounted as new "Auth" tab in `RequestEditor.tsx`.

### Folders in Collections (US-8)

- **DB**: New `folders` table `(id, collection_id, parent_folder_id NULLABLE, name, created_at)` in `db/folders.go`; `folder_id NULLABLE` column added to `requests`.
- **Backend**: New CRUD bindings `CreateFolder`, `RenameFolder`, `DeleteFolder`, `MoveRequest` in `app.go`.
- **Frontend**: `Sidebar.tsx` refactored to render a recursive tree; new `FolderItem.tsx` component handles expand/collapse toggle. `collectionsStore.ts` updated with folder actions.

### Request History (US-9)

- **DB**: New `request_history` table `(id, method, url, headers, params, body_type, body, response_status, executed_at)` in `db/history.go`; capped at 100 newest entries.
- **Backend**: History row written after each `SendRequest` execution. New bindings `GetHistory` and `ClearHistory` in `app.go`.
- **Frontend**: New `historyStore.ts` and `HistoryList.tsx`; sidebar gains History tab with "Clear History" button. Clicking an entry populates the editor without auto-saving.

### Post-Response Assertions (US-10)

- **DB**: `tests` (TEXT) column added to `requests` table.
- **Backend**: New `httpclient/assertions.go` parses and evaluates assertion expressions after HTTP response. Supports `status == N`, `body.<json.path> exists/== <value>`, `header["name"] contains/== <value>`. `ResponseResult` extended with `TestResults []AssertionResult`.
- **Frontend**: New `TestsEditor.tsx` (plain textarea, one assertion per line) as "Tests" tab in `RequestEditor`; new `TestResults.tsx` renders pass/fail rows with colour coding in `ResponseViewer`.

### Global Variables (US-11)

- **DB**: `is_global` BOOLEAN column added to `environments`; one global environment seeded at init in `db/environments.go`.
- **Backend**: Interpolator loads global vars first, then overlays active environment vars. `EnvironmentPanel` exposes Global as a non-deletable entry.
- **Frontend**: `environmentsStore.ts` and `useVarAutocomplete.ts` updated to merge global + active env variables for autocomplete and highlighting.

### Configurable Request Timeout (US-12)

- **DB**: `timeout_seconds` INTEGER column added to `requests` (default 30).
- **Backend**: `httpclient/client.go` uses `context.WithTimeout` with the per-request value; `0` means no timeout.
- **Frontend**: Numeric input added to `RequestEditor.tsx` (URL bar row area); wired through `requestsStore`.

### Export & Import Collection (US-13 – US-14)

- **Backend**: `ExportCollection(collectionId)` uses `runtime.SaveFileDialog` to get path, serializes collection + requests + folders to JSON schema `{ version: "1.0", collection: {...}, requests: [...], folders: [...] }`, writes with `os.WriteFile`. `ImportCollection()` uses `runtime.OpenFileDialog`, parses and validates schema, inserts via existing DB CRUD.
- **Frontend**: Export button/context menu on collection in `Sidebar.tsx`; Import button in sidebar header. `collectionsStore.ts` updated with `importCollection` action.

### Form URL Encoded Body Type (US-15)

- **Backend**: `httpclient/client.go` handles `urlencoded` body type by parsing JSON array of `{key, value, enabled}` and encoding via `url.Values`; `Content-Type` auto-set to `application/x-www-form-urlencoded`.
- **Frontend**: `BodyEditor.tsx` adds "Form URL Encoded" option and renders existing `KeyValueTable` component for it. Body stored as JSON array matching the headers/params pattern.

### Duplicate Request (US-16)

- **Backend**: `DuplicateRequest(requestId)` in `app.go` fetches original, inserts copy with `" (copy)"` appended to name, returns new request.
- **Frontend**: Right-click context menu on `CollectionItem` / request row in `Sidebar.tsx`; `collectionsStore.ts` gains `duplicateRequest` action; duplicate optionally opens in a new tab.

### HEAD and OPTIONS Methods (US-17)

- `MethodSelector.tsx` updated to include HEAD and OPTIONS in the methods array with assigned badge colours (grey for HEAD, purple for OPTIONS).
- No changes required in `httpclient/client.go` — method string is passed through `http.NewRequest` directly.

---

## Files Changed

| File | Change |
|------|--------|
| `app.go` | New bindings: GetSetting, SetSetting, CreateFolder, RenameFolder, DeleteFolder, MoveRequest, GetHistory, ClearHistory, ExportCollection, ImportCollection, DuplicateRequest |
| `db/db.go` | Schema migrations for folders, auth columns, tests column, timeout_seconds, is_global, request_history |
| `db/collections.go` | Minor updates for folder-aware export/import |
| `db/requests.go` | Added auth_type, auth_config, tests, timeout_seconds, folder_id columns; DuplicateRequest |
| `db/environments.go` | is_global column; global env seeding; global var merge in interpolator |
| `db/folders.go` | New file — folder CRUD |
| `db/history.go` | New file — history CRUD |
| `httpclient/client.go` | Auth injection, urlencoded body, per-request timeout via context |
| `httpclient/assertions.go` | New file — assertions parser and evaluator |
| `httpclient/client_test.go` | Tests for new client behaviour |
| `interpolator_test.go` | Tests for global var merge |
| `frontend/src/App.tsx` | TabBar integration, layout updates |
| `frontend/src/App.css` | Layout adjustments for tab bar |
| `frontend/src/store/tabsStore.ts` | New file — tabs + dirty state |
| `frontend/src/store/collectionsStore.ts` | Folder actions, duplicateRequest, import/export |
| `frontend/src/store/requestsStore.ts` | Auth, timeout, tests fields |
| `frontend/src/store/environmentsStore.ts` | Global env support |
| `frontend/src/store/historyStore.ts` | New file — history store |
| `frontend/src/store/foldersStore.ts` | New file — folder store |
| `frontend/src/types/request.ts` | Added auth_type, auth_config, tests, timeout_seconds, folder_id |
| `frontend/src/types/environment.ts` | is_global flag |
| `frontend/src/types/folder.ts` | New file — Folder type |
| `frontend/src/components/TabBar.tsx` | New file — tab bar UI |
| `frontend/src/components/TabBar.css` | New file — tab bar styles |
| `frontend/src/components/RequestEditor.tsx` | Auth tab, Tests tab, timeout input, dirty tracking |
| `frontend/src/components/AuthEditor.tsx` | New file — auth type selector + fields |
| `frontend/src/components/TestsEditor.tsx` | New file — assertion textarea |
| `frontend/src/components/TestResults.tsx` | New file — pass/fail result rows |
| `frontend/src/components/Sidebar.tsx` | Folder tree, history tab, import button, context menus |
| `frontend/src/components/Sidebar.css` | Folder/history styles |
| `frontend/src/components/FolderItem.tsx` | New file — recursive folder tree node |
| `frontend/src/components/HistoryList.tsx` | New file — history list UI |
| `frontend/src/components/HistoryList.css` | New file — history list styles |
| `frontend/src/components/CollectionItem.tsx` | Right-click context menu for duplicate/export |
| `frontend/src/components/BodyEditor.tsx` | Form URL Encoded option |
| `frontend/src/components/MethodSelector.tsx` | HEAD and OPTIONS methods |
| `frontend/src/components/EnvironmentPanel.tsx` | Global env non-deletable UI |
| `frontend/src/components/EnvironmentPanel.css` | Global env styling |
| `frontend/src/components/ResponseViewer.tsx` | Tests tab in response panel |
| `frontend/src/hooks/useVarAutocomplete.ts` | Global + active env merge |
| `frontend/src/wailsjs/go/main/App.ts` | Regenerated bindings |
| `frontend/wailsjs/go/main/App.d.ts` | Regenerated bindings |
| `frontend/wailsjs/go/main/App.js` | Regenerated bindings |
| `frontend/wailsjs/go/models.ts` | Updated model types |
| `frontend/src/components/RequestEditor.test.tsx` | Updated tests |
| `frontend/src/store/environmentsStore.test.ts` | Updated tests |
