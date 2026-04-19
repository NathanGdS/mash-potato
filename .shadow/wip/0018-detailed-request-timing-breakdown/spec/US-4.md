# US-4: Extend TypeScript types for timing

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** None

---

## Description

As the frontend type system, I want a `TimingPhases` TypeScript interface defined and the existing `ResponseResult` type extended with an optional `timing` field so that all downstream stores and components are type-safe.

---

## Acceptance Criteria

- [ ] `TimingPhases` interface added to `frontend/src/types/` with the following `number` fields:
  - `dnsLookup`
  - `tcpHandshake`
  - `tlsHandshake`
  - `ttfb`
  - `download`
- [ ] `ResponseResult` type (in `frontend/src/types/`) gains `timing?: TimingPhases` (optional to maintain backward compatibility with callers that do not yet supply timing).
- [ ] `TimingPhases` exported from the types barrel index (if one exists) so it is importable as `import { TimingPhases } from '../types'`.
- [ ] `npm run build` passes with zero TypeScript errors.
- [ ] No runtime logic introduced in this story.

---

## Files to Modify / Create

| File | Change |
|---|---|
| `frontend/src/types/` (existing type file or new `Timing.ts`) | Add `TimingPhases` interface |
| `frontend/src/types/` (`ResponseResult` type file) | Add `timing?: TimingPhases` field |
| `frontend/src/types/index.ts` (if barrel exists) | Export `TimingPhases` |

---

## Notes

- Field naming convention follows the existing camelCase pattern used in the frontend (e.g., `dnsLookup` not `dns_lookup`).
- The Wails auto-generated bindings in `frontend/src/wailsjs/go/` will also need to be regenerated (`wails generate module`) to reflect the new Go struct fields — this happens automatically on `wails dev` but should be noted for CI.
- Keep `timing` optional (`?`) so that history entries loaded from before this feature was deployed deserialize safely without crashing.
