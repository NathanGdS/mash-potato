# 0008 — cURL Export & Import

## Description
Adds two-way cURL interoperability to Mash Potato:
- **Export**: right-clicking any request in the sidebar produces a ready-to-run `curl` command (copied to clipboard) that faithfully represents the stored method, URL, query params, headers, body, and auth config.
- **Import**: a modal (reachable from the sidebar header or a collection's context menu) lets the user paste any `curl` command, pick a target collection, and create a new request from it automatically.

## Tech Context
- **Backend (Go)**: Two new `App`-bound methods — `ExportRequestAsCurl(id string) (string, error)` and `ImportFromCurl(collectionID, curlCommand string) (db.Request, error)`. Both live in a new file `curl.go` at package root to keep `app.go` clean.
- **curl serializer**: reconstructs the final URL (with enabled query params via `httpclient.buildURL` logic), emits `-X <METHOD>`, one `-H` flag per enabled header, body flags per body type (`-d` for json/raw, `--data-urlencode` for urlencoded, `--form` for form-data), and auth headers/flags (`-H "Authorization: Bearer …"`, `-H "Authorization: Basic …"` or `-u user:pass`, `-H keyName:keyValue` or query param for apikey).
- **curl parser**: tokenises the command string into flags (handles both single-quoted and double-quoted values, backslash-escaped newlines). Extracts: last bare positional URL, `-X`/`--request`, `-H`/`--header`, `-d`/`--data`/`--data-raw`/`--data-binary`, `--data-urlencode`, `--form`/`-F`, `-u`/`--user`. Infers `body_type` from Content-Type header if present.
- **Wails bindings**: regenerate after adding the two new methods (`make generate`).
- **Frontend**: context menu entry "Copy as cURL" on request items calls `ExportRequestAsCurl`, then `navigator.clipboard.writeText`. New `ImportCurlDialog` component with a `<textarea>`, collection `<select>`, and Import button calls `ImportFromCurl`.

## Out of Scope
- Importing a curl command that references a file (`--data @file`, `--form file=@path`) — emit a clear error.
- Environment variable interpolation during export (export the raw `{{var}}` tokens as-is).
- Batch export of an entire collection as a shell script.
