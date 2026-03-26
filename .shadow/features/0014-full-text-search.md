# 0014 — Full-Text Search Across Requests

**Status**: Complete
**Archived**: 2026-03-26
**User Stories**: 6 / 6

---

## Summary

Adds a global command-palette overlay (Ctrl+K / Cmd+K) that lets users search across all requests, URLs, and collection names in real time. Results render instantly in a floating overlay with color-coded method badges, collection breadcrumbs, and match highlighting. Selecting a result opens the request in the editor and closes the palette. An opt-in `/` prefix extends the search to include request body content.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Open Search Palette | ✅ |
| US-2 | Backend Search Endpoint | ✅ |
| US-3 | Render Search Results | ✅ |
| US-4 | Keyboard Navigation | ✅ |
| US-5 | Open Selected Request | ✅ |
| US-6 | Body Search (opt-in) | ✅ |

---

## Implementation Details

### US-1 — Open Search Palette

A `useEffect` in `App.tsx` registers a global `keydown` listener that fires on `(e.ctrlKey || e.metaKey) && e.key === 'k'`, calling `preventDefault` and toggling `showSearch` state. `<SearchPalette>` is rendered conditionally at the root of `App.tsx` outside the normal sidebar/editor layout, receiving `query`/`setQuery`/`onClose` props. The component mounts via `ReactDOM.createPortal` into `document.body`, rendering a full-screen semi-transparent backdrop at `z-index: 2000`. Clicking the backdrop or pressing Escape calls `onClose`. The search input receives autofocus on mount via `useRef` + `useEffect`. The palette always opens with an empty query (state is reset on open).

### US-2 — Backend Search Endpoint

`SearchResult` struct added to `db/requests.go` with fields `RequestID`, `RequestName`, `Method`, `URL`, `CollectionID`, `CollectionName` (snake_case JSON tags). `SearchRequests(query string) ([]SearchResult, error)` performs a 3-way case-insensitive LIKE join against `requests` and `collections`, capped at 50 rows. Empty query short-circuits before hitting the DB, returning an empty slice. The method is exposed on the `App` struct in `app.go`. The TypeScript binding `SearchRequests(query: string): Promise<SearchResult[]>` and the `SearchResult` interface were added to `frontend/src/wailsjs/go/main/App.ts`.

### US-3 — Render Search Results

`splitOnMatch(text, query)` utility added to `frontend/src/utils/searchHighlight.ts` — escapes regex special characters before constructing a `RegExp`, returning `{ before, match, after }` segments for safe substring highlighting. `SearchPalette.tsx` wires up a 200ms debounced call to `SearchRequests`, managing four mutually exclusive UI states: loading ("Searching…"), hint (empty query with `/body` tip), empty-results ("No results for…"), and results list. Each result row renders a color-coded method badge (hex palette matching `MethodSelector.tsx`), request name, collection breadcrumb (`› separator`), and URL — with `HighlightedText` highlighting the matched substring in `var(--accent)` bold. Result count is shown in the footer with "50+" when the cap is hit.

### US-4 — Keyboard Navigation

`focusedIndex` local state tracks the highlighted row. A `onKeyDown` handler on the palette container intercepts `ArrowDown` / `ArrowUp` (with wrapping via modulo arithmetic — the initial implementation used `Math.min`/`Math.max` which was fixed to `(prev + 1) % results.length`), `Enter` (calls `handleSelect` on the focused result), and `Escape` (calls `onClose`). A `useEffect` on `[results]` resets `focusedIndex` to 0 whenever the result set changes. A separate `useEffect` on `[focusedIndex]` calls `scrollIntoView({ block: 'nearest' })` on the focused list item. The debounce uses a `setTimeout`/`clearTimeout` pattern with cleanup on unmount.

### US-5 — Open Selected Request

`handleSelect` in `SearchPalette.tsx` calls `requestsStore.openRequest(result.request_id)` (fetches from backend, sets `activeRequest`) and `tabsStore.openTab({ requestId, requestName, method })` (adds or focuses an existing tab without duplication — `openTab` checks for an existing tab with the same `requestId` first), then immediately calls `onClose()`. The Sidebar's `CollectionItem.tsx` subscribes to `useRequestsStore((s) => s.activeRequest)` via Zustand, so the active request highlight updates reactively without additional wiring.

### US-6 — Body Search (opt-in)

Backend: `SearchRequestsWithBody(query string) ([]SearchResult, error)` added to `db/requests.go`, extending the WHERE clause with `OR (length(r.body) < 51200 AND r.body LIKE ?)` — the 50KB size guard is enforced at the SQL level, skipping oversized bodies silently. The method is exposed on `App` in `app.go` and the TypeScript binding `SearchRequestsWithBody(query: string): Promise<SearchResult[]>` added to the Wails bindings file. Frontend: `SearchPalette.tsx` detects a leading `/` in the query, strips it to form `effectiveQuery`, and calls `SearchRequestsWithBody` instead of `SearchRequests`. A `/body` pill indicator (styled with `var(--accent)`) appears in the input row when body search is active. The hint text in the empty state reminds users of the `/` prefix feature.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Added Ctrl+K/Cmd+K keydown listener, `showSearch`/`searchQuery` state, conditional `<SearchPalette>` render |
| `frontend/src/components/SearchPalette.tsx` | New — full search palette component with debounce, results, keyboard navigation, body search |
| `frontend/src/components/SearchPalette.css` | New — palette styles using existing CSS tokens |
| `frontend/src/utils/searchHighlight.ts` | New — `splitOnMatch` utility for safe regex substring highlighting |
| `db/requests.go` | Added `SearchResult` struct, `SearchRequests()`, and `SearchRequestsWithBody()` with 50KB body guard |
| `app.go` | Exposed `SearchRequests()` and `SearchRequestsWithBody()` on `App` struct |
| `frontend/src/wailsjs/go/main/App.ts` | Added `SearchResult` interface, `SearchRequests` and `SearchRequestsWithBody` bindings |
