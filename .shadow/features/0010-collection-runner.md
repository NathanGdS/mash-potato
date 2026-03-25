# 0010 — Collection Runner

**Status**: Complete
**Archived**: 2026-03-24
**User Stories**: 7 / 7

---

## Summary

Adds a Collection Runner feature that lets users execute all requests in a collection or folder sequentially, observe live per-request status updates in real time via Wails events, and review an aggregate pass/fail summary. Mirrors the Collection Runner UX found in Postman and Insomnia. A request passes on a 2xx HTTP response and fails on any non-2xx status or transport error. Script-based assertions are out of scope for this phase.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Open Runner Modal | ✅ |
| US-2 | Pre-run Request Selection | ✅ |
| US-3 | Delay Configuration | ✅ |
| US-4 | Live Run Execution | ✅ |
| US-5 | Run Summary | ✅ |
| US-6 | Stop In-Progress Run | ✅ |
| US-7 | Go Backend — RunCollection Method | ✅ |

---

## Implementation Details

### Frontend

**US-1 — Open Runner Modal**: Added `onContextMenu` handlers to collection and folder rows in `CollectionItem.tsx` and `FolderItem.tsx`. Right-clicking either node shows a context menu with "Run Collection" or "Run Folder". Clicking the option opens `CollectionRunner.tsx` with the scope name and ordered request list. App-level open state is managed via `runnerStore`. The modal header reads "Run: {name}".

**US-2 — Pre-run Request Selection**: Each request row in the modal has a checkbox, checked by default. Local state tracks `{ id, name, method, enabled }` per row. Unchecking a row excludes it from the run. The Start button is disabled and an empty-state message is shown when zero rows are checked. The HTTP method badge is displayed alongside each request name.

**US-3 — Delay Configuration**: A numeric input labeled "Delay (ms)" is shown in the controls row, defaulting to 0. Accepts only integers ≥ 0; invalid or negative input triggers inline validation and blocks the Start button. The value is passed as `delayMs` to `RunCollection`.

**US-4 — Live Run Execution**: On mount, `CollectionRunner` registers a `runner:result` Wails event listener (via `EventsOn` from the runtime). Each row transitions: `pending → running → pass | fail`. Failed rows display the HTTP status code or error string. The Start button is disabled during a run; the Stop button is enabled.

**US-5 — Run Summary**: After `RunCollection` resolves, a summary bar appears showing "{X} passed · {Y} failed · {total}ms". Counts and total duration are derived from accumulated row state. The bar is hidden before and during execution; visible only when `runState === 'done'`.

**US-6 — Stop In-Progress Run**: The Stop button calls `CancelRun()` via the Wails binding, setting `runState` to `'stopped'`. Remaining pending rows stay in `pending` state. The summary bar still shows accurate counts for completed rows.

### Backend

**US-7 — Go Backend**: `RunCollection(collectionID string, requestIDs []string, delayMs int) ([]RunResult, error)` implemented in `runner.go`. Fetches each request from the DB, loads active environment variables, interpolates `{{variables}}`, executes via `httpclient`, and emits `runtime.EventsEmit(ctx, "runner:result", result)` after each. Sleeps `delayMs` between requests (skipped after the last). A `CancelRun()` method stores and invokes a `context.WithCancel` cancel func (mutex-protected) to support clean cancellation. Wails bindings were regenerated to expose both methods in the frontend.

---

## Files Changed

| File | Change |
|------|--------|
| `runner.go` | New file — `RunResult` struct, `RunCollection` and `CancelRun` App methods |
| `app.go` | Added cancel func field + mutex for `CancelRun` support |
| `frontend/src/components/CollectionRunner.tsx` | New — runner modal component with request list, controls, live updates, summary |
| `frontend/src/components/CollectionRunner.css` | New — styles for runner modal |
| `frontend/src/components/CollectionItem.tsx` | Added right-click context menu to open runner |
| `frontend/src/components/FolderItem.tsx` | Added right-click context menu to open runner |
| `frontend/src/store/runnerStore.ts` | New — lightweight Zustand store for runner open state and scope |
| `frontend/src/App.tsx` | Wired `CollectionRunner` modal into root layout |
| `frontend/src/wailsjs/go/main/App.ts` | Regenerated — includes `RunCollection`, `CancelRun` |
| `frontend/src/wailsjs/runtime/runtime.ts` | Regenerated runtime bindings |
| `frontend/wailsjs/go/main/App.d.ts` | Regenerated type declarations |
| `frontend/wailsjs/go/main/App.js` | Regenerated JS bindings |
| `frontend/wailsjs/go/models.ts` | Regenerated — includes `RunResult` model |
