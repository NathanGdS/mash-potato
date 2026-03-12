# 0004 — UX Polish & Visual Overhaul

**Status**: Complete
**Archived**: 2026-03-12
**User Stories**: 6 / 6

---

## Summary

This phase brought Mash Potato's UI significantly closer to the polish level of tools like Postman and Insomnia. A CSS design token system was introduced as the foundation, eliminating all hardcoded colors and spacing literals across the codebase. On top of that foundation, four targeted UX improvements were shipped: colored HTTP method badge pills in the sidebar, tab count badges on the request editor, a Send→Cancel button with spinner during in-flight requests, and visually prominent response metric chips showing status code, time, and size at a glance. A drag-resizable pane divider between the request editor and response viewer was also included.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Method Badge Pills | ✅ |
| US-2 | Tab Count Badges | ✅ |
| US-3 | Send Button Loading State | ✅ |
| US-4 | Prominent Response Metrics | ✅ |
| US-5 | Resizable Pane Divider | ✅ |
| US-6 | Design Token System | ✅ |

---

## Implementation Details

### US-6 — Design Token System
Created `frontend/src/tokens.css` with a `:root` block defining the full design vocabulary: background scale (`--bg-primary/secondary/surface`), accent (`--accent`, `--accent-hover`), text scale (`--text-primary/secondary/muted/subtle`), border (`--border`), radius (`--radius-sm/md`), spacing grid (`--space-1` through `--space-6`), HTTP method badge color pairs (`--method-*-bg/fg`), and HTTP status color triplets (`--status-2xx/3xx/4xx/5xx-bg/fg/border`). The file is imported at the top of `App.css`, making tokens globally available. All CSS files under `frontend/src/` were updated to reference these tokens — zero hardcoded hex values remain outside `tokens.css`.

### US-1 — Method Badge Pills
Added a `methodBadgeClass(method)` helper in `CollectionItem.tsx` that maps an HTTP method string to a CSS class like `request-method request-method--get`. The `<span>` rendering the method in each sidebar request item now uses this dynamic class. In `Sidebar.css`, the `.request-method` rule was replaced with pill badge styles (`display: inline-flex`, `height: 18px`, `min-width: 38px`, `border-radius: 3px`) and six modifier classes using the method color tokens defined in US-6. The tokens for method colors were also added to `tokens.css` as part of this story's delivery.

### US-2 — Tab Count Badges
In `RequestEditor.tsx`, three derived values are computed before rendering the tab bar: `paramsCount` (enabled params with a non-empty key), `headersCount` (enabled headers with a non-empty key), and `hasBody` (non-empty trimmed body string). Each tab renders a `<span className="re-tab-count">` only when its value is truthy — Params and Headers show the numeric count, Body shows a dot (`●`). The `.re-tab` rule in `App.css` was updated to `inline-flex` so the badge sits vertically centered without affecting tab height. A `.re-tab-count` pill rule and an active-tab override were added to tint the badge orange when the tab is selected.

### US-3 — Send Button Loading State
A module-level `_cancelFlag` boolean was added to `responseStore.ts` outside Zustand state so the async send closure can read it synchronously. A `cancelRequest()` action sets the flag and immediately flips `isLoading` to `false`. The `sendRequest` action resets the flag on start and silently discards the response if the flag is set when the Wails call resolves. In `RequestEditor.tsx`, `handleSend` was replaced with `handleSendOrCancel` — when loading, it calls `cancelRequest()`; otherwise it calls `sendRequest()`. The button gains the class `send-btn--cancel` while loading, rendering a CSS spinner and the label "Cancel" with a gray background. The loading spinner that previously occupied the response pane in `ResponseViewer.tsx` was removed entirely; the button is now the sole loading indicator.

### US-4 — Prominent Response Metrics
The existing `StatusBadge` and `MetricsBar` components in `ResponseViewer.tsx` already had the correct class structure; only CSS changes were needed. `.status-badge` was enlarged to `16px` font, increased padding, and given `border-radius: --radius-md`. The existing color-coded variant classes (`--2xx` through `--5xx`) already used the status token colors from US-6. `.metrics-item` was converted into a bordered chip with `--bg-surface` background and `--radius-sm`. `.metrics-separator` was hidden since bordered chips are self-separating. `.response-viewer-toolbar` received a `--bg-secondary` background, thicker border-bottom, and `flex-wrap` for narrow panel resilience.

### US-5 — Resizable Pane Divider
A drag handle was added between the request editor and response viewer in `App.tsx`. The layout uses controlled height state (percentage-based), with `onMouseDown` on the divider element and global `mousemove`/`mouseup` listeners. Heights are clamped so neither panel collapses below a minimum. The handle shows an `ns-resize` cursor and a subtle visual affordance. Split position persists for the session via component state.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/tokens.css` | New file — full design token system (colors, spacing, radius, method/status colors) |
| `frontend/src/App.css` | Tokenized; added resizable divider styles, Send/Cancel button styles, tab count badge styles, response toolbar enhancements |
| `frontend/src/App.tsx` | Resizable pane divider implementation |
| `frontend/src/components/CollectionItem.tsx` | Added `methodBadgeClass()` helper; dynamic method badge class on sidebar items |
| `frontend/src/components/Sidebar.css` | Replaced color-only method styles with pill badge CSS; tokenized all values |
| `frontend/src/components/RequestEditor.tsx` | Tab count badge derivation; Send→Cancel button with `handleSendOrCancel` |
| `frontend/src/store/responseStore.ts` | Added `_cancelFlag` + `cancelRequest()` action; discard-on-cancel logic in `sendRequest` |
| `frontend/src/components/ResponseViewer.tsx` | Removed loading spinner; status/metrics display unchanged (CSS-only update) |
| `frontend/src/components/EnvironmentPanel.css` | Tokenized all hex values |
| `frontend/src/components/NewCollectionModal.css` | Tokenized all hex values |
| `frontend/src/components/VarPopover.css` | Tokenized all hex values |
| `frontend/src/components/SaveVarDialog.css` | Tokenized all hex values |
