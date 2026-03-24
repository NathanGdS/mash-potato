# 0009 — Pre-request & Post-response Scripting

**Status**: Complete
**Archived**: 2026-03-24
**User Stories**: 6 / 6

---

## Summary

Each saved request now has two optional JavaScript script fields — `pre_script` and `post_script` — executed inside a sandboxed goja runtime embedded in Go. The pre-request script runs before `{{variable}}` interpolation so scripts can mutate environment variables that are then available to the request. The post-response script runs after the HTTP response arrives and can extract values from the response body into environment variables. Script output (console.log lines and errors) is surfaced in a new Console tab in the response panel.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | DB Migration | ✅ |
| US-2 | scripter/ Package | ✅ |
| US-3 | SendRequest Integration | ✅ |
| US-4 | Scripts Tab UI | ✅ |
| US-5 | Script Output Panel | ✅ |
| US-6 | Wails Bindings Update | ✅ |

---

## Implementation Details

**DB — US-1**
- Added versioned migration in `db/db.go` that runs `ALTER TABLE requests ADD COLUMN pre_script TEXT NOT NULL DEFAULT ''` and `ALTER TABLE requests ADD COLUMN post_script TEXT NOT NULL DEFAULT ''`.
- Updated `Request` struct in `db/requests.go` with `PreScript` and `PostScript` string fields.
- Updated all INSERT, UPDATE, and SELECT queries in `db/requests.go` to include the new columns.

**Backend — US-2: scripter/ Package**
- New `scripter/` package using `github.com/dop251/goja` (pure-Go JS engine, no CGo).
- Exposes `RunPreScript(script string, ctx ScriptContext) ScriptResult` and `RunPostScript(script string, ctx ScriptContext) ScriptResult`.
- Injects `mp` object with `mp.env.get(key)`, `mp.env.set(key, value)`, `mp.request` (read-only), and `mp.response` (post-script only, read-only).
- `console.log(...)` lines captured into `ScriptResult.Logs`; runtime errors captured into `ScriptResult.Errors` (non-fatal).
- No net/os exposure from within the JS sandbox.

**Backend — US-3: SendRequest Integration**
- `SendRequest` in `app.go` now: runs `RunPreScript` → applies env mutations to memory + SQLite → interpolates `{{vars}}` → executes HTTP → runs `RunPostScript` → applies env mutations → returns `ResponseResult`.
- `ResponseResult` in `httpclient/client.go` gains `ConsoleLogs []string` and `ScriptErrors []string` fields.
- Script errors are non-fatal; HTTP call proceeds regardless.

**Frontend — US-4: Scripts Tab UI**
- `RequestEditor.tsx` gains a "Scripts" tab alongside Headers, Params, and Body.
- New `ScriptsTab.tsx` renders Pre-request / Post-response sub-tabs.
- New `ScriptEditor.tsx` renders a monospace `<textarea>` bound to the store.
- `requestsStore` gains `preScript` / `postScript` state and `setPreScript` / `setPostScript` actions following the existing auto-save pattern.
- `Request` type in `frontend/src/types/request.ts` updated with `preScript` and `postScript` fields.

**Frontend — US-5: Script Output Panel**
- `ResponseViewer.tsx` gains a "Console" tab with a badge showing log/error count.
- New `ConsolePanel.tsx` renders two scrollable `<pre>` sections: Output (logs) and Errors (styled in red/orange).
- Empty state shows a muted "No script output" placeholder.
- `responseStore` gains `consoleLogs` and `scriptErrors`, populated from `ResponseResult` after each send.

**Frontend — US-6: Wails Bindings Update**
- `GetRequest` and `SaveRequest` Wails-bound methods carry the two new script fields.
- JS bindings in `frontend/src/wailsjs/go/` regenerated via `wails generate module`.
- `frontend/src/types/request.ts` updated with `preScript` and `postScript` as optional string fields.

---

## Files Changed

| File | Change |
|------|--------|
| `db/db.go` | Added migration for pre_script / post_script columns |
| `db/requests.go` | Updated Request struct + all CRUD queries |
| `db/requests_test.go` | Updated tests for new fields |
| `scripter/scripter.go` | New — goja runtime, mp object, RunPreScript / RunPostScript |
| `app.go` | Updated SendRequest to thread pre/post script execution |
| `httpclient/client.go` | ResponseResult gains ConsoleLogs + ScriptErrors fields |
| `go.mod` / `go.sum` | Added github.com/dop251/goja dependency |
| `frontend/src/components/RequestEditor.tsx` | Added Scripts tab |
| `frontend/src/components/ScriptsTab.tsx` | New — sub-tab switcher |
| `frontend/src/components/ScriptEditor.tsx` | New — monospace textarea |
| `frontend/src/components/ResponseViewer.tsx` | Added Console tab |
| `frontend/src/components/ConsolePanel.tsx` | New — log/error display |
| `frontend/src/store/requestsStore.ts` | Added preScript / postScript state + actions |
| `frontend/src/types/request.ts` | Updated Request interface |
| `frontend/src/wailsjs/go/main/App.ts` | Regenerated bindings |
| `frontend/wailsjs/go/models.ts` | Regenerated models |
