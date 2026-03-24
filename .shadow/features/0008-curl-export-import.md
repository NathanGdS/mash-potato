# 0008 — cURL Export & Import

**Status**: Complete
**Archived**: 2026-03-24
**User Stories**: 3 / 3

---

## Summary

Added two-way cURL interoperability to Mash Potato. Users can right-click any request in the sidebar to copy it as a ready-to-run `curl` command, and can import any `curl` command into a collection via a new modal dialog. The entire serializer and parser lives in a new `curl.go` file backed by two Wails-bound Go methods.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Export Request as cURL | ✅ |
| US-2 | Import from cURL — dialog | ✅ |
| US-3 | Go backend — curl serializer & parser | ✅ |

---

## Implementation Details

**US-1 — Export Request as cURL**
- Added "Copy as cURL" context menu entry to request items in `Sidebar.tsx`.
- On click, calls `ExportRequestAsCurl(requestID)` via Wails binding and writes the result to the clipboard via `navigator.clipboard.writeText`.
- A toast confirms "Copied to clipboard".
- Generated curl command includes `-X <METHOD>`, enabled query params in URL, `-H 'Key: Value'` per enabled header, and body flags per type (`-d` for json/raw, `--data-urlencode` for urlencoded, `--form` for form-data).

**US-2 — Import from cURL — dialog**
- New `ImportCurlDialog.tsx` component with a `<textarea>` for the curl command, a `<select>` listing all collections, and Import/Cancel buttons.
- Dialog is triggered from a sidebar header button.
- On success: modal closes, sidebar refreshes, new request is selected in the editor.
- On parse error or empty command: inline error message shown; modal stays open.
- Created request defaults to name `<METHOD> <host+path>`.

**US-3 — Go backend — curl serializer & parser**
- New `curl.go` file (package main) with `ExportRequestAsCurl(id string) (string, error)` and `ImportFromCurl(collectionID, curlCommand string) (db.Request, error)`.
- Parser tokenises the command, handles single/double-quoted values and backslash-newline continuations, extracts URL, method, headers, body flags, and auth flags.
- `body_type` inferred from Content-Type header when present.
- File references (`--data @file`, `--form field=@path`) return a descriptive error.
- Unit tests in `curl_test.go`.
- Wails JS bindings regenerated after adding the two new methods.

---

## Files Changed

| File | Change |
|------|--------|
| `curl.go` | New — ExportRequestAsCurl, ImportFromCurl, internal helpers |
| `app.go` | Minor wiring for new bound methods |
| `frontend/src/components/ImportCurlDialog.tsx` | New — import dialog component |
| `frontend/src/components/Sidebar.tsx` | Context menu entry + import button + mount dialog |
| `frontend/src/wailsjs/go/main/App.ts` | Regenerated bindings |
| `frontend/wailsjs/go/models.ts` | Regenerated models |
