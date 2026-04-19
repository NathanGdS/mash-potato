# US-9: Go unit tests for `TimingPhases`

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** US-1, US-2

---

## Description

As the Go test suite, I want table-driven unit tests for the `ms()` helper and `TimingPhases` population logic so that edge cases (negative durations, zero TLS, connection reuse) are verified automatically in CI.

---

## Acceptance Criteria

- [ ] Test file `httpclient/client_test.go` (new or extended) contains tests for the `ms()` helper:
  - Negative duration input → result is `0`
  - Zero duration input → result is `0`
  - Positive duration input → result matches `(end - start).Milliseconds()`
- [ ] Tests for `TimingPhases` population via an HTTPS request simulation:
  - All five fields non-zero
  - `TLSHandshake > 0`
- [ ] Tests for HTTP (non-TLS) request simulation:
  - `TLSHandshake == 0`
  - All other applicable fields non-zero
- [ ] Tests for connection-reuse simulation:
  - `DNSLookup == 0`
  - `TCPHandshake == 0`
  - `TTFB > 0` and `Download > 0` (phases that still apply on reused connections)
- [ ] All tests pass with `go test ./httpclient/...`.
- [ ] No external test dependencies introduced beyond the standard library and existing test helpers.

---

## Files to Modify / Create

| File | Change |
|---|---|
| `httpclient/client_test.go` | Add table-driven tests for `ms()` and `TimingPhases` population |

---

## Notes

- The `ms()` helper is unexported; tests must be in the same `httpclient` package (black-box test via `package httpclient_test` is not feasible for unexported symbols — use `package httpclient`).
- For `TimingPhases` population tests, use `net/http/httptest.NewServer` to spin up a local HTTP/HTTPS server with controlled behavior rather than mocking the `http.Client`.
- For TLS tests, `httptest.NewTLSServer` provides a self-signed cert; configure the client to trust it.
- For connection-reuse tests, send two sequential requests to the same `httptest` server — the second request will reuse the connection, causing DNS and TCP hooks not to fire.
- Do not use `time.Sleep` or real network calls in tests.
