# Feature: 0018 - Detailed Request Timing Breakdown

**Phase ID:** 0018
**Status:** IN PROGRESS
**Branch:** feature/time-breakdown

---

## Feature Summary

Instrument the HTTP client with `httptrace` hooks to capture per-phase timing data (DNS lookup, TCP handshake, TLS handshake, TTFB, download). Surface the data in a waterfall visualization tab inside `ResponseViewer`, persist timing to request history, and provide full test coverage for both Go and TypeScript layers.

---

## User Stories

- [ ] US-1: Define `TimingPhases` Go struct and extend `ResponseResult`
- [ ] US-2: Instrument `httpclient` with `httptrace` hooks
- [ ] US-3: Persist timing data to `request_history`
- [ ] US-4: Extend TypeScript types for timing
- [ ] US-5: Extend `responseStore` to expose timing data
- [ ] US-6: Build `TimingWaterfall` component
- [ ] US-7: Add Timing tab to `ResponseViewer`
- [ ] US-8: Add CSS timing variables and accessible styles
- [ ] US-9: Go unit tests for `TimingPhases`
- [ ] US-10: Frontend unit tests for `TimingWaterfall`

---

## Dependency Graph

```
US-1 ──► US-2 ──► US-9
US-3            (independent)
US-4 ──► US-5
US-4 ──► US-6 ──► US-7
US-8            (independent)
US-10 depends on US-6
```

---

## Sign-Off

- **Spec-Engineer:** Approved ✓
- **Implementation Status:** Pending
