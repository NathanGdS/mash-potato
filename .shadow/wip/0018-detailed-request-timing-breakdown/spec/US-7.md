# US-7: Add Timing tab to `ResponseViewer`

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** US-6

---

## Description

As a user, I want a "Timing" tab in the response panel so that I can switch to the waterfall view without leaving the response area.

---

## Acceptance Criteria

- [ ] `frontend/src/components/ResponseViewer.tsx` adds a "Timing" tab to the existing tab bar alongside "Body", "Headers", etc.
- [ ] When the "Timing" tab is active, `<TimingWaterfall timing={result.timing} />` is rendered in the tab panel.
- [ ] When `result.timing` is `undefined`, the Timing tab panel renders a placeholder message: "Send a request to see timing data."
- [ ] The Timing tab is always visible in the tab bar (not conditional on `timing` being defined) so users know the feature exists.
- [ ] Switching between tabs does not cause any existing tab behavior to break.
- [ ] `npm run build` passes with zero TypeScript errors.

---

## Files to Modify

| File | Change |
|---|---|
| `frontend/src/components/ResponseViewer.tsx` | Add "Timing" tab entry; render `TimingWaterfall` when active |

---

## Notes

- The "Timing" tab should be the last tab in the tab bar (after "Headers") to avoid disrupting the existing user mental model.
- `result` here refers to the response object read from `responseStore`; ensure `timing` is accessed via optional chaining (`result?.timing`) to avoid runtime errors when no request has been sent yet.
- No new CSS file is required for this story — layout within the tab panel inherits existing ResponseViewer panel styles.
