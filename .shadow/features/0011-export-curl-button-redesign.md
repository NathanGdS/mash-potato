# 0011 — Export & cURL Button Redesign

**Status**: Complete
**Archived**: 2026-03-24
**User Stories**: 4 / 4

---

## Summary

Redesigned the Export (collection) and Copy as cURL (request) context-menu actions across `CollectionItem`, `FolderItem`, and `Sidebar` to be visually polished and consistent with the app's design token system. Each action now carries an inline SVG icon, uses ghost/secondary visual weight at rest, and has full hover/active/disabled interactive states defined in CSS. The `rb-save-toast` coupling to `ResponseBody` was eliminated by introducing scoped toast classes, and the Sidebar's keyboard emoji was replaced with a proper accessible SVG button.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Button Relocation | ✅ |
| US-2 | Visual Consistency | ✅ |
| US-3 | Inline SVG Icons | ✅ |
| US-4 | Interactive States | ✅ |

---

## Implementation Details

### US-1 — Button Relocation
No positional changes were needed for Export or Copy as cURL — both were already in the correct context menus. The focus was on ensuring consistency: both `CollectionItem` and `FolderItem` were updated in parallel so the cURL action is styled and structured identically in both locations. The Sidebar's Import from cURL button was updated from a raw `⌨` emoji to a proper SVG button with `title` and `aria-label` attributes.

### US-2 — Visual Consistency
All context-menu action items now use CSS design tokens exclusively (`--color-*`, `--radius-*`, `--spacing-*`, `--space-*`). The visual weight is secondary/ghost: no background fill at rest, with a subtle hover fill. The `rb-save-toast` class was removed from both `CollectionItem` and `FolderItem` and replaced with scoped classes (`collection-curl-toast` and `context-menu-toast` respectively), fully decoupling toast feedback from `ResponseBody`'s styles. The Sidebar Import button received the `sidebar-new-btn--icon` modifier to normalize sizing for the SVG icon.

### US-3 — Inline SVG Icons
- **Export** (CollectionItem): download-arrow SVG icon (15px, `currentColor`), communicating "save outward".
- **Copy as cURL** (CollectionItem + FolderItem): terminal/code icon — `>_` prompt motif in CollectionItem, `</>` chevron-slash motif in FolderItem (both 14–15px).
- **Import from cURL** (Sidebar): inline SVG terminal/import icon (16px) replacing the `⌨` emoji, with `aria-label` and `title` for accessibility.
- All SVG icons are inline within JSX, use `currentColor`, and are vertically centered with label text via `display: flex; align-items: center; gap: var(--space-2)`.

### US-4 — Interactive States
Full CSS interactive state coverage added across all redesigned elements:
- `:hover` — `background: var(--bg-secondary)`, `cursor: pointer`
- `:active` — slightly darker fill (e.g. `var(--bg-primary)`) for click feedback
- `:disabled` / `[disabled]` — `opacity: 0.45`, `cursor: not-allowed`, `pointer-events: none`
- Toast visibility: `setTimeout(2000)` preserved unchanged in both `CollectionItem` and `FolderItem`; new scoped toast classes use design-token colors and a slide-up entrance animation.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/CollectionItem.tsx` | Added download-arrow SVG to Export button; added `>_` terminal SVG to cURL button; replaced `rb-save-toast` with `collection-curl-toast`; added modifier classes `--export` and `--curl` |
| `frontend/src/components/FolderItem.tsx` | Added `</>` code SVG to cURL button; replaced `rb-save-toast` with `context-menu-toast`; added `--curl` modifier class |
| `frontend/src/components/Sidebar.tsx` | Replaced `⌨` emoji with inline SVG terminal/import icon; added `aria-label` and `title`; added `sidebar-new-btn--icon` modifier |
| `frontend/src/components/Sidebar.css` | Added `.context-menu-icon`, `.request-context-menu-item--curl`, `.request-context-menu-item--export`, `.collection-curl-toast`, `.context-menu-toast` rules; added `:hover`, `:active`, `:disabled` states for all redesigned elements; added `.sidebar-new-btn--icon` and updated `.sidebar-new-btn` base for flex alignment |
