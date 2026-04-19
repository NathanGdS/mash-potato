# US-6: Build `TimingWaterfall` component

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** US-4

---

## Description

As a user reviewing an HTTP response, I want a waterfall chart component that visually decomposes response time into individual network phases so that I can diagnose latency bottlenecks at a glance.

---

## Acceptance Criteria

- [ ] New file `frontend/src/components/TimingWaterfall.tsx` created.
- [ ] Component accepts a single prop: `timing: TimingPhases`.
- [ ] A `buildPhaseRows` pure function (exportable for testing) computes an ordered array of phase row objects:
  - Each row: `{ label: string; color: string; durationMs: number; offsetMs: number }`
  - Phase order: DNS Lookup → TCP Handshake → TLS Handshake → TTFB → Download
  - `offsetMs` is the cumulative sum of all preceding phases' `durationMs`.
  - TLS Handshake row is **omitted** when `timing.tlsHandshake === 0`.
- [ ] Total row at the bottom displays `sum of all phase durations` in ms.
- [ ] Each phase bar width is computed as a CSS percentage of the total duration: `(durationMs / totalMs) * 100%`.
- [ ] Minimum visual bar width: `4px` (applied via CSS `min-width: 4px` on the bar element).
- [ ] Phase bar color uses the CSS custom property defined in US-8 (e.g., `var(--timing-dns)`).
- [ ] When `timing.dnsLookup === 0 && timing.tcpHandshake === 0` and total > 0, a "Connection reused" note is rendered beneath the waterfall table.
- [ ] Each bar element has an `aria-label` attribute: `"{Phase Name}: {durationMs}ms"`.
- [ ] On bar hover, a tooltip displays: phase name, start offset (ms), and duration (ms).
- [ ] Right-aligned `{durationMs}ms` text label is shown for each row.
- [ ] `npm run build` passes with zero TypeScript errors.

---

## Files to Create / Modify

| File | Change |
|---|---|
| `frontend/src/components/TimingWaterfall.tsx` | New component (NEW FILE) |

---

## Notes

- `buildPhaseRows` must be a named export from `TimingWaterfall.tsx` so Vitest tests (US-10) can import and unit test it in isolation without mounting the component.
- Tooltip implementation: prefer a simple CSS-driven tooltip (`title` attribute or a CSS `:hover` pseudo-element overlay) rather than a third-party tooltip library, to avoid new dependencies.
- When `totalMs === 0` (all phases zero), render a single row with the message "No timing data available" instead of an empty table.
- The "Connection reused" note should be styled as a muted/secondary text element, not as an error or warning.
