# US-8: Add CSS timing variables and accessible styles

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** None (independent)

---

## Description

As the design system, I want a consistent set of CSS custom properties and accessible waterfall bar styles defined globally so that the `TimingWaterfall` component renders correctly in both light and dark themes without hardcoded color values.

---

## Acceptance Criteria

- [ ] Five CSS custom properties added to the `:root` selector in the global stylesheet:
  - `--timing-dns: #a855f7` (purple)
  - `--timing-tcp: #3b82f6` (blue)
  - `--timing-tls: #14b8a6` (teal)
  - `--timing-ttfb: #f97316` (orange)
  - `--timing-dl: #22c55e` (green)
- [ ] A `.timing-bar` CSS class (or equivalent utility class used by `TimingWaterfall`) defines:
  - `min-width: 4px` (visual floor so zero-duration phases are not invisible)
  - `height` consistent with the row height
  - `border-radius` for pill/rounded appearance (match existing app aesthetic)
  - `transition: width 0.2s ease` for smooth rendering on tab switch
- [ ] Each bar element in `TimingWaterfall` carries an `aria-label` attribute (enforced by US-6 AC, confirmed accessible here).
- [ ] Colors are specified only as CSS custom properties — no hex values hardcoded inside `.tsx` files.
- [ ] The variables do not conflict with any existing CSS custom property names in the project.
- [ ] `npm run build` passes with zero errors.

---

## Files to Modify / Create

| File | Change |
|---|---|
| Global stylesheet (`frontend/src/index.css` or equivalent) | Add five `--timing-*` custom properties to `:root`; add `.timing-bar` class |

---

## Notes

- The exact global stylesheet filename should be confirmed by reading `frontend/src/main.tsx` or `frontend/src/App.tsx` to identify the imported CSS entry point.
- Do not create a separate `TimingWaterfall.css` file — the custom properties must be global (`:root`) so they are accessible across the app. Component-specific layout styles may live in a scoped CSS module or inline styles if needed.
- Verify that dark-mode styles (if the app uses a `[data-theme="dark"]` or `.dark` selector) do not need overridden values for the timing colors — the chosen palette has sufficient contrast on both light and dark backgrounds.
