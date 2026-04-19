# US-1: Define `TimingPhases` Go struct and extend `ResponseResult`

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** None

---

## Description

As the HTTP client subsystem, I want a `TimingPhases` struct to be defined and embedded in `ResponseResult` so that per-phase timing data has a canonical Go type and all downstream consumers (app layer, history, tests) share a single definition.

---

## Acceptance Criteria

- [ ] `TimingPhases` struct declared in `httpclient/client.go` with the following `int64` fields (values in milliseconds):
  - `DNSLookup`
  - `TCPHandshake`
  - `TLSHandshake`
  - `TTFB`
  - `Download`
- [ ] `ResponseResult` struct gains a `Timing TimingPhases` field.
- [ ] All existing callers of `ResponseResult` compile without modification (zero-value of `TimingPhases` is safe).
- [ ] No new exported functions or packages introduced in this story.
- [ ] `go build ./...` passes with zero errors.

---

## Files to Modify

| File | Change |
|---|---|
| `httpclient/client.go` | Add `TimingPhases` struct; add `Timing TimingPhases` field to `ResponseResult` |

---

## Notes

- All fields are `int64` (milliseconds). Nanosecond precision is captured by the instrumentation layer (US-2) and converted to ms before storage.
- The zero value of each field (`0`) is semantically meaningful: a `TLSHandshake` of `0` indicates no TLS was used or the connection was reused — the waterfall UI (US-6) uses this to conditionally omit the TLS row.
