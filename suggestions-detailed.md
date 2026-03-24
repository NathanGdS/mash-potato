# Mash Potato — Feature Suggestions

> Analysis date: 2026-03-24
> Based on current implementation state and gap analysis vs. Postman / Insomnia.

---

## Current State Summary

The app is a solid MVP with:
- Collections, folders, requests with full CRUD
- HTTP execution (all major methods, body types, auth types)
- Environment + global variables with `{{var}}` interpolation
- Response viewer with JSON syntax highlighting
- Test assertions (status, header, JSON path)
- Request history (last 100 entries)
- cURL import/export, collection import/export
- Multi-tab editor with dirty state tracking

What follows are 10 prioritized suggestions, ordered from highest to lowest impact relative to effort.

---

## 1. Pre-request & Post-request Scripts

**What it is:** A scripting tab on each request where the user can write small JS snippets that run before or after the HTTP call.

**Why it matters:** This is the single most impactful missing feature. Postman built its entire power-user base on `pm.environment.set()` scripts. Without it, teams cannot chain requests (e.g., login → grab token → set as variable → use in next call).

**Proposed UX:**
- Add two sub-tabs inside the existing Tests tab: **Pre-request** and **Post-response** (Tests becomes a third sub-tab).
- Expose a minimal `mp` API in the sandbox: `mp.env.set(key, value)`, `mp.env.get(key)`, `mp.request`, `mp.response.json()`, `mp.response.status`.
- Backend: embed a JS runtime (e.g., [goja](https://github.com/dop251/goja)) in Go, run pre-script before interpolation and post-script after response arrives.

**Schema change:** Add `pre_script TEXT` and `post_script TEXT` columns to `requests`.

---

## 2. Collection Runner

**What it is:** A modal that executes all requests in a collection (or folder) in sequence, shows a pass/fail summary per request, and reports test results in aggregate.

**Why it matters:** Insomnia's Collection Runner and Postman's Runner are both flagship features for QA workflows. Without it, tests are only useful one-at-a-time.

**Proposed UX:**
- Right-click a collection or folder → **Run folder / Run collection**.
- Runner modal: ordered list of requests with checkboxes to include/exclude.
- Start button triggers sequential execution, live status updates per row (pending → running → pass/fail).
- Final summary: X passed, Y failed, total duration.
- Option to set delay between requests (ms).

**Backend:** New `RunCollection(collectionID, folderID *string, delayMs int)` method that loops over requests, calls `SendRequest` per item, returns `[]RunResult`.

---

## 3. OAuth 2.0 Authorization Flow

**What it is:** A first-class OAuth 2.0 client inside the Auth tab, supporting Authorization Code, Client Credentials, and Password grant types.

**Why it matters:** The vast majority of modern APIs are protected by OAuth 2.0. Basic Auth and Bearer Token require users to manually obtain tokens — a significant friction point. Insomnia and Postman both have full OAuth flows built-in.

**Proposed UX:**
- New auth type: **OAuth 2.0** in `AuthEditor`.
- Fields: Grant Type, Auth URL, Token URL, Client ID, Client Secret, Scope, Redirect URI.
- **Get New Token** button opens a browser window (or embedded webview) for the auth code flow, captures the redirect, exchanges for token, stores it as `{{oauth_token}}` in the active environment.
- Token expiry tracking with auto-refresh option.

**Backend:** New `FetchOAuthToken(config OAuthConfig)` method; uses Go's `golang.org/x/oauth2` package.

---

## 4. Full-Text Search Across Requests

**What it is:** A global search palette (Cmd/Ctrl+K) that searches request names, URLs, headers, and body content across all collections.

**Why it matters:** Once a workspace grows beyond ~50 requests, discoverability becomes painful. This is a quality-of-life feature that pays dividends daily.

**Proposed UX:**
- `Ctrl+K` / `Cmd+K` opens a floating command palette.
- Fuzzy search across: request name, URL, collection name, folder name.
- Arrow keys to navigate results, Enter to open the request in a new tab.
- Secondary mode: `/` prefix to search within response history bodies.

**Backend:** New `SearchRequests(query string)` method using SQLite `LIKE` or FTS5 virtual tables for full-text search on request fields.

---

## 5. Response Diff Viewer

**What it is:** Side-by-side comparison of two responses — either two history entries or the current response vs. a pinned baseline.

**Why it matters:** When iterating on an API (schema changes, bug fixes, performance tuning), developers constantly compare "before" and "after". Both Postman and Insomnia users rely on third-party diff tools for this. Building it in saves context switching.

**Proposed UX:**
- In the History sidebar: select two entries → **Compare** button.
- Or: in the ResponseViewer, a **Pin as baseline** button; subsequent responses show a diff badge with changed line count.
- Diff view: unified or split diff with color-coded additions/deletions (green/red), line numbers.
- Diffable fields: response body, headers, status code, timing.

**Frontend:** Use a diff library like `diff` (npm) to compute deltas, render with custom highlighting. No backend changes needed — history data is already persisted.

---

## 6. OpenAPI / Swagger Import

**What it is:** Import an OpenAPI 3.x or Swagger 2.0 spec (JSON or YAML) and auto-generate a collection with one request per endpoint, pre-filled method, URL, parameters, and example body.

**Why it matters:** Most backend teams publish OpenAPI specs. Generating a test collection from a spec instantly is a massive productivity win. Insomnia has this as a core workflow. It also positions Mash Potato as a tool for API consumers, not just API builders.

**Proposed UX:**
- Sidebar → Import → **Import from OpenAPI spec** (file dialog, accepts `.json` / `.yaml`).
- Creates a new collection named after the `info.title`.
- Folders map to OpenAPI `tags`; each `operationId` becomes a request.
- Path parameters become `{{paramName}}` variables; query params pre-populated in the Params tab; request body schema generates an example JSON body.

**Backend:** New `ImportFromOpenAPI(filePath string)` method; parse spec using a Go OpenAPI library (e.g., `github.com/getkin/kin-openapi`), build collection + request tree.

---

## 7. Code Generation Panel

**What it is:** A panel that generates ready-to-paste HTTP client code from the current request in multiple languages/libraries.

**Why it matters:** After prototyping an API call in Mash Potato, developers need to integrate it into their codebase. cURL export exists, but code-gen for Python (`requests`), JavaScript (`fetch`/`axios`), Go (`net/http`), and TypeScript covers the most common use cases without leaving the app.

**Proposed UX:**
- New tab in RequestEditor: **Code** (sits alongside Params, Headers, Body, Auth, Tests).
- Language selector dropdown: cURL, Python (requests), JavaScript (fetch), JavaScript (axios), Go (net/http), TypeScript (fetch).
- Read-only code block with syntax highlighting and a copy button.
- Variables resolved using the active environment at render time.

**Backend:** New `GenerateCode(requestID string, language string)` method; pure string templating, no external dependencies needed.

---

## 8. Encrypted Secret Variables

**What it is:** A way to mark environment variables as **secret** — they are stored encrypted at rest and masked in the UI (shown as `••••••`).

**Why it matters:** API keys, tokens, and passwords are currently stored as plain text in SQLite. This is a security risk when demos are shared, screen-recorded, or when the DB file is inspected. Insomnia's secret variable support is a frequently requested feature by security-conscious teams.

**Proposed UX:**
- In `EnvironmentPanel`, each variable row gets a **lock icon** toggle next to the value.
- Secret variables show `••••••` in the table; a reveal button shows the value temporarily.
- In request fields, secret variable values are still interpolated normally but never logged in history (shown as `[REDACTED]` in history entries).

**Backend:** Add `is_secret BOOLEAN` and store value encrypted using AES-GCM with a key derived from a machine-specific secret (e.g., OS keychain via `github.com/zalando/go-keyring`). New `SetSecretVariable` / `GetDecryptedVariable` methods.

---

## 9. Detailed Request Timing Breakdown

**What it is:** A waterfall-style timing panel that shows DNS resolution, TCP connection, TLS handshake, time-to-first-byte (TTFB), and total transfer time as individual segments.

**Why it matters:** The current MetricsBar shows only total duration and response size. Diagnosing whether latency is caused by DNS, TLS negotiation, or slow server response requires more granular data. This is especially valuable for teams building performance-sensitive APIs.

**Proposed UX:**
- New **Timing** tab in ResponseViewer (alongside Body, Headers, Tests).
- Horizontal bar chart: each phase shown as a colored segment with its duration in ms.
- Phases: DNS Lookup, TCP Handshake, TLS Negotiation (if HTTPS), Waiting (TTFB), Content Download.
- Hover tooltip shows absolute start time and duration per phase.

**Backend:** Use Go's `httptrace.ClientTrace` to capture per-phase timestamps during request execution. Extend `ResponseResult` struct with a `Timing` field containing phase breakdowns.

---

## 10. Light / Dark Theme Toggle + Custom Accent Color

**What it is:** A theme system with at least a light mode option and an accent color picker, accessible from a Settings panel.

**Why it matters:** Mash Potato currently has a single fixed dark theme. A light mode is a baseline expectation for desktop apps in 2026 and is frequently the first complaint from users who work in bright environments. It is also a low-risk, high-visibility improvement that signals polish.

**Proposed UX:**
- Gear icon in the sidebar footer opens a **Settings** panel (slide-in or modal).
- Theme selector: Dark (current), Light, System (follow OS preference).
- Accent color picker: a palette of 6–8 presets (current blue, purple, green, orange, red, teal).
- Settings persisted via the existing `settings` table (`theme`, `accent_color` keys).
- Implementation: CSS custom properties (already used via `--color-*` tokens) make this straightforward — swap a `data-theme` attribute on `<body>`.

**Backend:** No new Go methods needed; uses existing `GetSetting` / `SetSetting`. Frontend work only.

---

## Priority Matrix

| # | Feature | Impact | Effort | Recommended Order |
|---|---------|--------|--------|-------------------|
| 1 | Pre/Post-request Scripts | Very High | High | 3rd |
| 2 | Collection Runner | High | Medium | 4th |
| 3 | OAuth 2.0 Flow | High | High | 5th |
| 4 | Full-Text Search | High | Low | 1st |
| 5 | Response Diff Viewer | Medium | Medium | 6th |
| 6 | OpenAPI Import | High | High | 7th |
| 7 | Code Generation Panel | Medium | Low | 2nd |
| 8 | Encrypted Secret Variables | Medium | Medium | 8th |
| 9 | Detailed Timing Breakdown | Medium | Medium | 9th |
| 10 | Light/Dark Theme | Low | Low | 10th |

**Recommended build order:** 4 → 7 → 1 → 2 → 3 → 5 → 6 → 8 → 9 → 10
