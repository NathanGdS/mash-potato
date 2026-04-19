# US-2: Instrument `httpclient` with `httptrace` hooks

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** US-1

---

## Description

As the HTTP client subsystem, I want `httptrace.ClientTrace` hooks attached to every outgoing request context so that nanosecond-precision timestamps are captured for each network phase and converted into the `TimingPhases` struct before returning `ResponseResult`.

---

## Acceptance Criteria

- [ ] `net/http/httptrace` imported and a `ClientTrace` struct is instantiated per request in `httpclient/client.go`.
- [ ] The following hook callbacks record `time.Now()` into local variables:
  - `DNSStart` / `DNSDone` → `dnsStart`, `dnsDone`
  - `ConnectStart` / `ConnectDone` → `connectStart`, `connectDone`
  - `TLSHandshakeStart` / `TLSHandshakeDone` → `tlsStart`, `tlsDone`
  - `GotFirstResponseByte` → `firstByte`
  - `WroteRequest` → `wroteRequest` (used as download-phase start)
- [ ] A `ms(start, end time.Time) int64` helper (unexported) computes `end.Sub(start).Milliseconds()` and clamps negative results to `0`.
- [ ] `TimingPhases` is populated before `ResponseResult` is returned:
  - `DNSLookup  = ms(dnsStart, dnsDone)`
  - `TCPHandshake = ms(connectStart, connectDone)`
  - `TLSHandshake = ms(tlsStart, tlsDone)` (zero when TLS hooks not fired)
  - `TTFB = ms(wroteRequest, firstByte)`
  - `Download = ms(firstByte, responseBodyReadDone)`
- [ ] No negative values appear in any field (clamped).
- [ ] HTTP (non-TLS) requests produce `TLSHandshake == 0`.
- [ ] Connection-reuse scenarios produce `DNSLookup == 0` and `TCPHandshake == 0`.
- [ ] `go build ./...` passes; existing `httpclient` tests continue to pass.

---

## Files to Modify

| File | Change |
|---|---|
| `httpclient/client.go` | Add `httptrace` import; attach `ClientTrace` to request context; add `ms()` helper; populate `ResponseResult.Timing` |

---

## Notes

- The `ClientTrace` must be attached via `httptrace.WithClientTrace(ctx, trace)` before the `http.NewRequestWithContext` call.
- Hook closures capture local `time.Time` variables by pointer; zero-value `time.Time` is safe (hooks not fired → fields remain zero → `ms()` returns 0 after clamp).
- `responseBodyReadDone` timestamp must be recorded immediately after `io.ReadAll(resp.Body)` completes.
- Do not introduce goroutine synchronization — all hooks fire on the same goroutine as the HTTP round-trip.
