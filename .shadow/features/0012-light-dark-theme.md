# 0012 — Light / Dark Theme Toggle + Custom Accent Color

**Status**: Complete
**Archived**: 2026-03-25
**User Stories**: 7 / 7

---

## Summary

Introduced a full theming system with Dark, Light, and System (OS-preference) modes plus 8 accent color presets. Theme and accent are applied via `data-theme` / `data-accent` attributes on `<body>`, persisted through the existing `settings` table, and restored on startup without any flash of the wrong theme via an inline `<script>` in `index.html`. A slide-in Settings drawer (accessed via a gear icon in the Sidebar footer) gives users immediate live-preview control over theme and accent. All color differences are CSS-only — no JS color calculations or inline styles.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | No-Flash Theme Init | ✅ |
| US-2 | Settings Store | ✅ |
| US-3 | Theme Context & Provider | ✅ |
| US-4 | CSS Theme Files | ✅ |
| US-5 | Settings Panel Drawer | ✅ |
| US-6 | Syntax Highlight Light Theme | ✅ |
| US-7 | Panel Dismiss & Integration | ✅ |

---

## Implementation Details

**US-1 — No-Flash Theme Init**
An inline `<script>` was added to `index.html` before the Vite bundle tag. It reads `localStorage` keys `mp_theme` and `mp_accent`, resolves `'system'` via `window.matchMedia('(prefers-color-scheme: dark)')`, and sets `data-theme` / `data-accent` on `document.body` synchronously before React mounts. Falls back to `'dark'` / `'blue'` if keys are absent.

**US-2 — Settings Store**
Created `frontend/src/store/settingsStore.ts` as a Zustand store exposing `theme`, `accentColor`, `loaded`, `loadSettings`, `setTheme`, and `setAccentColor`. Reads from the Go backend via `GetSetting('theme')` and `GetSetting('accent_color')` on load; persists writes via `SetSetting` and mirrors to `localStorage` for the fast-path init script.

**US-3 — Theme Context & Provider**
Created `frontend/src/context/ThemeContext.tsx` with a `ThemeProvider` component and `useTheme()` hook. The provider calls `settingsStore.loadSettings()` on mount, syncs `data-theme` and `data-accent` attributes, and attaches a `matchMedia` change listener for System mode (cleaned up on unmount). `main.tsx` was updated to wrap `<App>` with `<ThemeProvider>`.

**US-4 — CSS Theme Files**
- `frontend/src/styles/themes/dark.css` — all `--bg-*` and `--color-*` tokens under `:root[data-theme='dark']`
- `frontend/src/styles/themes/light.css` — same token set under `:root[data-theme='light']` with WCAG AA-compliant contrast ratios; includes syntax highlight token overrides
- `frontend/src/styles/accents.css` — `--color-accent` and `--color-accent-hover` for all 8 presets (`blue`, `purple`, `green`, `orange`, `red`, `teal`, `pink`, `yellow`) under `:root[data-accent='X']`
- Audited existing CSS files (`App.css`, `tokens.css`, `Sidebar.css`, `VarPopover.css`, `SaveVarDialog.css`, `NewCollectionModal.css`) and replaced hardcoded accent hex values with `var(--color-accent)` / `var(--color-accent-hover)`.

**US-5 — Settings Panel Drawer**
Created `frontend/src/components/SettingsPanel.tsx` — a 320px slide-in drawer that overlays content (does not push layout). Accepts `isOpen` and `onClose` props. Contains a theme section with three icon buttons (moon/sun/monitor) and an accent section with 8 circular swatches in a 2×4 grid; all changes apply immediately via `useTheme()`. Slide animation uses CSS `transform: translateX` transition. `Sidebar.tsx` received a gear icon in its footer that toggles the panel.

**US-6 — Syntax Highlight Light Theme**
Audited `frontend/src/utils/jsonHighlighter.ts` — refactored syntax token colors to use CSS custom properties instead of hardcoded hex values. Added corresponding light-theme overrides for each token class (`--syntax-string`, `--syntax-number`, `--syntax-key`, `--syntax-boolean`, `--syntax-null`) in `light.css`, ensuring sufficient contrast on the light `--bg-primary` background.

**US-7 — Panel Dismiss & Integration**
`SettingsPanel.tsx` includes a `useEffect` keydown listener that closes the panel on `Escape`. A backdrop overlay div behind the drawer closes it on click (with `stopPropagation` on the drawer element). `settingsOpen` state is managed in `App.tsx`, which mounts `<SettingsPanel>` and wires its toggle to the Sidebar gear icon prop.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/index.html` | Added no-flash inline `<script>` for theme/accent init |
| `frontend/src/main.tsx` | Wrapped `<App>` with `<ThemeProvider>` |
| `frontend/src/App.tsx` | Added `settingsOpen` state, mounted `<SettingsPanel>`, imported theme CSS files |
| `frontend/src/App.css` | Updated to use CSS variable tokens |
| `frontend/src/tokens.css` | Updated hardcoded accent values → CSS variables |
| `frontend/src/store/settingsStore.ts` | New — Zustand settings store |
| `frontend/src/context/ThemeContext.tsx` | New — `ThemeProvider` and `useTheme()` hook |
| `frontend/src/styles/themes/dark.css` | New — dark theme token definitions |
| `frontend/src/styles/themes/light.css` | New — light theme tokens + syntax overrides |
| `frontend/src/styles/accents.css` | New — 8 accent color presets |
| `frontend/src/components/SettingsPanel.tsx` | New — slide-in settings drawer |
| `frontend/src/components/SettingsPanel.css` | New — drawer layout and animation styles |
| `frontend/src/components/Sidebar.tsx` | Added gear icon footer button |
| `frontend/src/components/Sidebar.css` | Updated for gear icon and CSS variable usage |
| `frontend/src/components/VarPopover.css` | Replaced hardcoded accent colors |
| `frontend/src/components/SaveVarDialog.css` | Replaced hardcoded accent colors |
| `frontend/src/components/NewCollectionModal.css` | Replaced hardcoded accent colors |
