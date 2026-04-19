# Feature 0018: Detailed Request Timing Breakdown

**Archived:** 2026-04-18  
**Status:** COMPLETED  
**Feature ID:** 0018

---

## Summary

Instrumented the HTTP client with `httptrace` hooks to capture per-phase timing data (DNS lookup, TCP handshake, TLS handshake, TTFB, download). Surfaced the data in a waterfall visualization tab inside `ResponseViewer`, persisted timing to request history, and provided full test coverage for both Go and TypeScript layers.

---

## User Stories Implemented

1. **US-1: Define `TimingPhases` Go struct and extend `ResponseResult`**
   - Created `TimingPhases` struct in httpclient package with fields: `dns_lookup`, `tcp_handshake`, `tls_handshake`, `ttfb`, `download`
   - Extended `ResponseResult` to include `TimingPhases`

2. **US-2: Instrument `httpclient` with `httptrace` hooks**
   - Implemented `net/http/httptrace` instrumentation in `ExecuteRequest`
   - Captured per-phase timing data via trace hooks (ConnectStart, ConnectDone, TLSHandshakeStart, TLSHandshakeDone, GotFirstResponseByte, BodyReadDone)
   - Properly handled connection reuse scenarios (zero DNS/TCP on reused connections)

3. **US-3: Persist timing data to `request_history`**
   - Extended `request_history` schema to include timing JSON column
   - Implemented persistence of timing data on request execution
   - Enabled historical tracking of request performance across executions

4. **US-4: Extend TypeScript types for timing**
   - Created `frontend/src/types/timing.ts` with TypeScript interface for `TimingPhases`
   - Generated Wails bindings include timing data in response types

5. **US-5: Extend `responseStore` to expose timing data**
   - Updated Zustand store to handle timing data from HTTP responses
   - Made timing metrics accessible to UI components

6. **US-6: Build `TimingWaterfall` component**
   - Created React component `TimingWaterfall.tsx` with waterfall visualization
   - Implemented `buildPhaseRows` function for phase row calculation
   - Shows sequential phase bars with accurate offset positioning
   - Displays "Connection reused" badge when applicable
   - Shows "No timing data available" when no timing data exists

7. **US-7: Add Timing tab to `ResponseViewer`**
   - Integrated `TimingWaterfall` component as new tab in `ResponseViewer`
   - Tab displays only when timing data is available
   - Consistent with existing response tabs (Body, Headers)

8. **US-8: Add CSS timing variables and accessible styles**
   - Added CSS custom properties for phase colors: `--timing-dns`, `--timing-tcp`, `--timing-tls`, `--timing-ttfb`, `--timing-dl`
   - Styled waterfall visualization with accessible contrast ratios
   - Implemented responsive layout and tooltips for phase details

9. **US-9: Go unit tests for `TimingPhases`**
   - Test file: `httpclient/client_test.go`
   - Tests for `ms()` helper: negative, zero, and positive durations
   - HTTPS timing tests with all phases non-zero and TLS > 0
   - HTTP timing tests with TLS handshake zero
   - Connection reuse tests with DNS and TCP zero on second request
   - All tests pass with `go test ./httpclient/...`

10. **US-10: Frontend unit tests for `TimingWaterfall`**
    - Test file: `frontend/src/components/TimingWaterfall.test.tsx`
    - `buildPhaseRows` unit tests for HTTPS, HTTP, and reused connections
    - Render tests for waterfall visualization
    - Tests for "No timing data available" message
    - Tests for "Connection reused" badge
    - All 234 tests passing across all test files

---

## Key Files Changed

### Backend (Go)
- `httpclient/client.go` — HTTP tracing instrumentation
- `httpclient/client_test.go` — Unit tests for timing phases
- `db/db.go` — Schema extension for timing
- `db/history.go` — Persistence layer for timing data
- `app.go` — Response handling with timing

### Frontend (TypeScript/React)
- `frontend/src/types/timing.ts` — TypeScript type definitions
- `frontend/src/components/TimingWaterfall.tsx` — Waterfall visualization component
- `frontend/src/components/TimingWaterfall.test.tsx` — Component tests
- `frontend/src/components/ResponseViewer.tsx` — New Timing tab integration
- `frontend/src/store/responseStore.ts` — Timing data exposure
- `frontend/src/tokens.css` — CSS timing variables
- `frontend/src/App.css` — Waterfall styles

### Tests
- Go: `httpclient/client_test.go` — 4 new timing test cases
- Frontend: `frontend/src/components/TimingWaterfall.test.tsx` — 14 test cases covering all scenarios

---

## Test Coverage Summary

**Go Tests:** All passing
- `TestMs_NegativeDuration_ReturnsZero`
- `TestMs_ZeroDuration_ReturnsZero`
- `TestMs_PositiveDuration_MatchesMilliseconds`
- `TestTimingPhases_HTTPS_TLSHookFires`
- `TestTimingPhases_HTTPS_ViaExecuteRequest_AllPhasesNonZero`
- `TestTimingPhases_HTTP_TLSHandshakeIsZero`
- `TestTimingPhases_ConnectionReuse_SecondRequestSkipsDNSAndTCP`

**Frontend Tests:** All 234 tests passing
- `buildPhaseRows` unit tests (5 tests)
- `TimingWaterfall` component render tests (9+ tests)

---

## Technical Implementation Details

### Timing Phases Architecture
The feature captures five distinct timing phases:
1. **DNS Lookup** — Time from request start to DNS resolution complete
2. **TCP Handshake** — Time for TCP connection establishment
3. **TLS Handshake** — Time for TLS negotiation (zero for HTTP)
4. **TTFB** — Time to first byte (server processing + response header transmission)
5. **Download** — Time to receive full response body

### Connection Reuse Detection
When a connection is reused (HTTP Keep-Alive), DNS and TCP phases are zero. The waterfall visualization correctly handles this by:
- Omitting DNS/TCP rows from the visual
- Adjusting offset calculations accordingly
- Displaying "Connection reused" badge on total row

### Waterfall Visualization
- Bar widths proportional to phase duration
- Color-coded bars for visual distinction
- Tooltips showing offset and duration
- Cumulative offset display
- Total duration sum at bottom
- Accessible aria-labels for screen readers

---

## Completion Status

✅ All 10 user stories completed  
✅ All acceptance criteria met  
✅ Go test suite passing (60ms runtime)  
✅ Frontend test suite passing (234 tests)  
✅ Build verified (go build ./... passes)  
✅ Code review approved  
✅ Ready for merge to master  

---

## Notes

- The `ms()` helper rounds durations down to millisecond precision (sub-ms durations may show as 0)
- For testing, `httptest.NewTLSServer` with self-signed certs simulates TLS handshakes
- Connection reuse tests use HTTP Keep-Alive via shared `http.DefaultTransport` across sequential requests
- CSS timing variables follow the pattern `--timing-{phase}` for easy customization
