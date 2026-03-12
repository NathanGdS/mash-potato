# 0001 — Phase 1 MVP

**Status**: Complete
**Archived**: 2026-03-11
**User Stories**: 14 / 14

---

## Summary

Built the complete MVP of Mash Potato, a Postman-like desktop API client using Wails v2 (Go + React/TypeScript). The MVP covers the full lifecycle of an API request: managing collections in a sidebar, configuring every aspect of a request (method, URL, headers, query params, body), executing the HTTP call through the Go backend, and viewing the response (status, body, headers, timing, size). Data is persisted in SQLite with a simple two-table schema.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Create Collection | ✅ |
| US-2 | Rename Collection | ✅ |
| US-3 | Delete Collection | ✅ |
| US-4 | Create Request | ✅ |
| US-5 | Configure HTTP Method | ✅ |
| US-6 | Configure URL | ✅ |
| US-7 | Configure Headers | ✅ |
| US-8 | Configure Query Parameters | ✅ |
| US-9 | Configure Request Body | ✅ |
| US-10 | Send Request | ✅ |
| US-11 | View Response Status | ✅ |
| US-12 | View Response Body | ✅ |
| US-13 | View Response Headers | ✅ |
| US-14 | View Request Metrics | ✅ |

---

## Implementation Details

### DB & Backend

- **SQLite schema** (`db/db.go`): two tables — `collections(id, name, created_at)` and `requests(id, collection_id, name, method, url, headers, params, body_type, body, created_at)`. WAL mode and foreign keys enabled. `requests.collection_id` has `ON DELETE CASCADE` so deleting a collection removes all its requests automatically.
- **Collection CRUD** (`db/collections.go`): `CreateCollection`, `GetCollections`, `RenameCollection`, `DeleteCollection`. Blank name rejected at the Go layer.
- **Request CRUD** (`db/requests.go`): `CreateRequest` (defaults to GET, empty URL, no headers/params, body_type=none), `GetRequestsByCollection`, `UpdateRequest`, `DeleteRequest`. `headers` and `params` stored as JSON arrays of `{key, value, enabled}` objects.
- **HTTP execution** (`httpclient/client.go`): `SendRequest` loads a request from the DB, filters enabled headers and params, builds the final URL with query string, sets `Content-Type` automatically based on `body_type` (json → `application/json`, raw → `text/plain`, form-data → `multipart/form-data`), executes with a 30 s timeout, and returns `ResponseResult{StatusCode, StatusText, Body, Headers, DurationMs, SizeBytes}`.
- **Wails bindings** (`app.go`): all DB and HTTP methods exposed as methods on the `App` struct, making them callable from the frontend via auto-generated JS bindings.

### Frontend

- **State** (`frontend/src/store/`): three Zustand stores — `collectionsStore` (list + active collection), `requestsStore` (list + active request, all update actions), `responseStore` (last `ResponseResult` + loading flag).
- **Sidebar** (`Sidebar.tsx`, `CollectionItem.tsx`): lists collections with expand/collapse for their requests. Supports new collection dialog, inline rename (double-click), and delete with confirmation.
- **Request editor** (`RequestEditor.tsx`): tabbed panel with URL bar + method selector, Headers tab, Params tab, Body tab, and a Send button. Auto-saves to DB on change (debounced or on-blur for URL).
- **Key-value table** (`KeyValueTable.tsx`): reusable component for headers, query params, and form-data body rows — checkbox to enable/disable each row without deletion.
- **Body editor** (`BodyEditor.tsx`): switches between None, JSON textarea, Raw textarea, and form-data `KeyValueTable` based on `body_type` selection.
- **Response viewer** (`ResponseViewer.tsx`): shows status badge (color-coded by 2xx/3xx/4xx/5xx), metrics bar (duration + size), tabbed body (Pretty JSON / Raw) with syntax highlighting for JSON responses, and a read-only headers table.

---

## Files Changed

| File | Change |
|------|--------|
| `main.go` | Entry point; DB init, Wails app bootstrap |
| `app.go` | `App` struct with all Wails-exposed methods |
| `db/db.go` | SQLite init, WAL, FK, schema migrations |
| `db/collections.go` | Collection CRUD queries |
| `db/requests.go` | Request CRUD with JSON-encoded headers/params |
| `httpclient/client.go` | HTTP execution, response timing, size measurement |
| `frontend/src/App.tsx` | Root layout: Sidebar + RequestEditor + ResponseViewer |
| `frontend/src/store/collectionsStore.ts` | Zustand store for collections |
| `frontend/src/store/requestsStore.ts` | Zustand store for requests |
| `frontend/src/store/responseStore.ts` | Zustand store for response state |
| `frontend/src/types/index.ts` | TypeScript interfaces: Collection, Request, ResponseResult |
| `frontend/src/components/Sidebar.tsx` | Sidebar shell and collection list |
| `frontend/src/components/CollectionItem.tsx` | Per-collection row with rename/delete |
| `frontend/src/components/RequestEditor.tsx` | Tabbed request editor with Send button |
| `frontend/src/components/MethodSelector.tsx` | HTTP method dropdown |
| `frontend/src/components/KeyValueTable.tsx` | Reusable key-value table with enable toggle |
| `frontend/src/components/BodyEditor.tsx` | Body type selector + editor |
| `frontend/src/components/ResponseViewer.tsx` | Response panel with tabs |
| `frontend/src/components/StatusBadge.tsx` | Color-coded status code badge |
| `frontend/src/components/MetricsBar.tsx` | Duration + size display |
| `frontend/src/wailsjs/` | Auto-generated Wails JS bindings (not edited manually) |
