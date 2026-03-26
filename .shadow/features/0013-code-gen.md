# 0013 — Code Generation Panel

**Status**: Complete
**Archived**: 2026-03-25
**User Stories**: 14 / 14

---

## Summary

Adds a "Code" tab to RequestEditor that generates ready-to-run code snippets for the active request across seven languages: cURL, Python (requests), JavaScript Fetch, JavaScript Axios, TypeScript Fetch, Go (net/http), and Java (HttpClient). Code generation is entirely frontend-only with no new Go methods or DB changes. Snippets update reactively as request fields or the active environment change, with `{{variable}}` tokens interpolated client-side before dispatch to the generators. A syntax-highlighted, read-only code block with a one-click Copy button rounds out the feature.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Code tab in RequestEditor | ✅ |
| US-2 | Language selector | ✅ |
| US-3 | Reactive code generation | ✅ |
| US-4 | Variable interpolation | ✅ |
| US-5 | cURL generator | ✅ |
| US-6 | Python generator | ✅ |
| US-7 | JS/TS Fetch generator | ✅ |
| US-8 | JS Axios generator | ✅ |
| US-9 | Go generator | ✅ |
| US-10 | Java generator | ✅ |
| US-11 | Auth injection | ✅ |
| US-12 | Syntax-highlighted code block | ✅ |
| US-13 | Copy button | ✅ |
| US-14 | Long body truncation in display | ✅ |

---

## Implementation Details

### Frontend — Component Layer

**US-1 / US-2 / US-12 / US-13 / US-14 — `CodeGenPanel.tsx`**
A new `CodeGenPanel` component renders inside a "Code" tab added to `RequestEditor.tsx`. It hosts a language dropdown (default: cURL) backed by `useState<Language>`, calls `useCodeGen` to obtain the generated snippet, and displays it through a token-based syntax-highlighted `CodeBlock` sub-component. A "Copy" button writes the full code to `navigator.clipboard` and briefly shows a "Copied!" confirmation for 1.5 s via `useState<boolean>`. Snippets longer than 10 KB are sliced for display with a `// ... (truncated for display)` marker, while the clipboard always receives the full string.

**US-1 — `RequestEditor.tsx`**
The `'code'` tab option was appended to the tab array and conditionally renders `<CodeGenPanel />` when selected.

### Frontend — Logic Layer

**US-3 / US-4 / US-11 — `useCodeGen.ts`**
A `useCodeGen(request, envVars, language)` hook wraps code generation in `useMemo` with `[request, envVars, language]` as dependencies, ensuring instant reactive updates. Before calling generators, `interpolateRequest()` replaces all `{{var}}` tokens (mirroring `interpolator.go`'s regex) and merges auth headers (Bearer, Basic, API Key) so generators receive a single complete `ResolvedRequest` object.

### Frontend — Code Generators (`frontend/src/utils/codeGen/`)

**US-5 — `curl.ts`**: Pure string builder producing a `curl -X <METHOD>` command with `-H` header flags, query-param URL encoding, and body flags per `body_type` (`-d`, `--data-urlencode`, `-F`). Line continuation via backslash.

**US-6 — `pythonRequests.ts`**: Generates `import requests` + `requests.<method>()` with dict-typed headers and body mapped to `json=`, `data=`, or `files=` kwargs.

**US-7 — `jsFetch.ts` / `tsFetch.ts`**: Shared helper produces a `fetch(url, { method, headers, body })` call; TS variant adds `Response`, `HeadersInit` type annotations and an `async/await` wrapper.

**US-8 — `jsAxios.ts`**: Generates `axios({ method, url, headers, data })` with body mapped per `body_type`; includes a comment for `form-data` package requirement in Node.js.

**US-9 — `goNetHttp.ts`**: Produces a complete, runnable `main.go` using `net/http`, with imports driven by `body_type` (e.g., `mime/multipart` for form-data) and headers set via `req.Header.Set()`.

**US-10 — `javaHttpClient.ts`**: Generates a Java 11+ snippet using `java.net.http.HttpClient`, with `HttpRequest.Builder` headers, `BodyPublishers` per body type, and a comment block for the unsupported native multipart case.

**US-12 — `codeHighlighter.ts`**: New lightweight tokenizer utility applies regex-based keyword/string/comment/number highlighting, producing `<span>` markup; consumed by `CodeBlock` in `CodeGenPanel`.

**`index.ts`**: Barrel that exports all generator functions and the `Language` union type.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/RequestEditor.tsx` | Added `'code'` tab; conditionally renders `<CodeGenPanel />` |
| `frontend/src/components/CodeGenPanel.tsx` | New — language selector, code block, copy button, truncation logic |
| `frontend/src/hooks/useCodeGen.ts` | New — `useMemo`-based generation hook with interpolation and auth injection |
| `frontend/src/utils/codeGen/index.ts` | New — barrel for all generators and `Language` type |
| `frontend/src/utils/codeGen/curl.ts` | New — cURL generator |
| `frontend/src/utils/codeGen/pythonRequests.ts` | New — Python requests generator |
| `frontend/src/utils/codeGen/jsFetch.ts` | New — JavaScript Fetch generator |
| `frontend/src/utils/codeGen/tsFetch.ts` | New — TypeScript Fetch generator |
| `frontend/src/utils/codeGen/jsAxios.ts` | New — JavaScript Axios generator |
| `frontend/src/utils/codeGen/goNetHttp.ts` | New — Go net/http generator |
| `frontend/src/utils/codeGen/javaHttpClient.ts` | New — Java HttpClient generator |
| `frontend/src/utils/codeHighlighter.ts` | New — token-based syntax highlighter for code blocks |
| `frontend/src/App.css` | Minor style adjustments for Code tab layout |
| `frontend/src/styles/themes/dark.css` | Code block theme tokens |
| `frontend/src/styles/themes/light.css` | Code block theme tokens |
| `frontend/src/tokens.css` | New CSS tokens for code block surfaces |
