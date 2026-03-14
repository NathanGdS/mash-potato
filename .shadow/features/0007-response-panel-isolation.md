# 0007 — Response Panel Isolation per Request

**Status**: Complete
**Archived**: 2026-03-13
**User Stories**: 3 / 3

---

## Summary

Previously, the response panel held a single global state, causing stale data from the last-executed request to bleed into whichever request was selected next. This feature refactored `responseStore.ts` from a single `response` slot to a `Record<string, ResponseResult | null>` map keyed by request ID. Each request now owns its own response slot: navigating away preserves that request's last response, returning restores it, and requests never sent display an empty panel. No backend changes were needed.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Per-request response memory | ✅ |
| US-2 | Fresh state for never-executed requests | ✅ |
| US-3 | Response updates on send | ✅ |

---

## Implementation Details

### Frontend — State Management

- **`responseStore.ts`**: Replaced `response: ResponseResult | null` with `responses: Record<string, ResponseResult | null>` and `activeRequestId: string | null`. Added `setActiveRequestId(id)` action. `sendRequest(id)` now writes to `responses[id]` only, leaving all other slots intact. Loading and error state remain global (only one request in-flight at a time).
- **`requestsStore.ts`**: `openRequest(id)` now calls `responseStore.setActiveRequestId(id)` so switching requests in the sidebar correctly activates the matching response slot.
- **`tabsStore.ts`**: `setActiveTab` similarly calls `setActiveRequestId` so switching tabs keeps the panel in sync.

### Frontend — Components

- **`ResponseViewer.tsx`**: Reads `responses[activeRequestId]` from the store instead of the former single `response` field. When the active ID has no entry, the panel renders its empty/idle state naturally — no explicit clear required.
- **`ResponseBody.tsx`**: Updated to consume the scoped response from the refactored store selector.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/store/responseStore.ts` | Refactored to per-request `responses` map; added `setActiveRequestId` |
| `frontend/src/store/requestsStore.ts` | `openRequest` now activates the matching response slot |
| `frontend/src/store/tabsStore.ts` | `setActiveTab` syncs the active response slot |
| `frontend/src/components/ResponseViewer.tsx` | Reads from scoped `responses[activeRequestId]` |
