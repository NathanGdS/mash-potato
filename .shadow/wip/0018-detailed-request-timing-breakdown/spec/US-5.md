# US-5: Extend `responseStore` to expose timing data

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** US-4

---

## Description

As the response state layer, I want the `responseStore` Zustand store to carry the `timing` field from the backend `ResponseResult` so that any component subscribing to the store can render timing data without additional data fetching.

---

## Acceptance Criteria

- [ ] `responseStore` state interface adds `timing: TimingPhases | undefined`.
- [ ] Initial state sets `timing: undefined`.
- [ ] The action that receives the `ResponseResult` from the Wails binding maps `result.timing` into store state (no transformation — pass-through).
- [ ] When a new request is initiated (loading state), `timing` is reset to `undefined` to prevent stale data from a previous response being shown.
- [ ] Selectors / exported state consumers can access `timing` without runtime errors when it is `undefined`.
- [ ] `npm run build` passes with zero TypeScript errors.

---

## Files to Modify

| File | Change |
|---|---|
| `frontend/src/store/responseStore.ts` | Add `timing: TimingPhases | undefined` to state; map from `ResponseResult`; reset on new request |

---

## Notes

- No data transformation is needed: the Go struct fields are serialized by Wails as camelCase JSON, matching the TypeScript interface defined in US-4.
- `timing` must be reset to `undefined` — not to a zero `TimingPhases` object — so components can distinguish "no data" from "data with all-zero phases".
- Existing `responseStore` tests should be extended to verify that `timing` is present after a successful response and absent after a reset.
