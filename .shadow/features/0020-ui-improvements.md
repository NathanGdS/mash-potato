# 0022 — UI Improvements

**Feature ID**: 0022  
**Feature Name**: UI Improvements  
**Completion Date**: 2026-04-20  
**Status**: Archived

## Overview

Nine independent UI enhancements to improve discoverability, usability, and polish across the Mash Potato desktop API client. Improvements span the sidebar, tab bar, editor panels, and top toolbar. Plus 4 quality-fix stories addressing code issues found in post-implementation review.

## Implemented User Stories

All 13 user stories completed successfully:

### US-1: Light-Mode Sidebar Separator
- **Status**: ✓ Done
- **Files**: `frontend/src/components/Sidebar.css`
- **Summary**: Added `border-right: 1px solid var(--border)` to `.sidebar` so the sidebar/editor boundary is visible in light mode without affecting dark mode appearance.

### US-2: Resizable Sidebar Panel
- **Status**: ✓ Done
- **Files**: `frontend/src/App.tsx`, `frontend/src/App.css`
- **Summary**: Implemented drag-resize for the sidebar using the existing App.tsx drag pattern. Min 180px, max 480px, default 240px. Width persists to localStorage under `mash-potato:sidebar-width`. Added `.app-divider--vertical` CSS modifier.

### US-3: Import Modal with Type Selection
- **Status**: ✓ Done
- **Files**: `frontend/src/components/ImportModal.tsx` (new), `frontend/src/components/ImportModal.css` (new), `frontend/src/components/Sidebar.tsx`
- **Summary**: Replaced direct file-dialog trigger with an ImportModal offering "Import Collection" and "Import from cURL" choices. Modal reuses NewCollectionModal patterns (backdrop, Escape, outside-click).

### US-4: Tab Context Menu (Right-Click)
- **Status**: ✓ Done
- **Files**: `frontend/src/store/tabsStore.ts`, `frontend/src/components/TabBar.tsx`, `frontend/src/components/ContextMenu.tsx` (new), `frontend/src/components/ContextMenu.css` (new), `frontend/src/utils/tabActivation.ts` (new)
- **Summary**: Right-clicking a tab opens a context menu with Close, Close Others, Close to the Right, Close to the Left, and Close All actions. Added bulk-close actions to tabsStore. Menu dismisses on outside-click and Escape.

### US-5: Search Trigger Icon
- **Status**: ✓ Done
- **Files**: `frontend/src/App.tsx`
- **Summary**: Added a Search icon button in the top toolbar, placed before the Environments button. Click triggers SearchPalette. Tooltip shows "Search (Ctrl+K)". Existing Ctrl+K shortcut unaffected.

### US-6: Scrollable Tests Tab
- **Status**: ✓ Done
- **Files**: `frontend/src/components/TestsEditor.tsx`, `frontend/src/components/TestsEditor.css`
- **Summary**: Assertion list now scrolls vertically with `overflow-y: auto; flex: 1; min-height: 0`. The "+ Add Test" button is pinned outside the scroll area. Works correctly with 1, 5, and 20+ assertions.

### US-7: JavaScript Formatting in Scripts Tab
- **Status**: ✓ Done
- **Files**: `frontend/src/components/ScriptEditor.tsx`, `frontend/src/components/ScriptEditor.css`
- **Summary**: Added a format button (AlignLeft icon) in the top-right corner of the script editor. Uses `js-beautify` for formatting. Syntax errors display an inline error message below the editor and do not modify the editor content.

### US-8: Tests Tab Documentation Modal
- **Status**: ✓ Done
- **Files**: `frontend/src/components/RequestEditor.tsx`, `frontend/src/components/TestDocsModal.tsx` (new), `frontend/src/components/TestDocsModal.css` (new)
- **Summary**: Added a "?" icon next to the Tests tab label that opens a TestDocsModal. Modal covers all 4 assertion types (status, body, header, jsonBody) with descriptions, syntax, and worked examples. Uses createPortal + backdrop-click + Escape key pattern.

### US-9: Timeout Input Discoverability
- **Status**: ✓ Done
- **Files**: `frontend/src/components/RequestEditor.tsx`, `frontend/src/components/RequestEditor.css`
- **Summary**: Added Clock icon before the timeout input, title="Request timeout in seconds", placeholder="30", aria-label="Timeout in seconds", and a CSS tooltip "Max wait time. Default: 30s" on hover. URL bar layout unaffected.

### US-10: Fix Tab Context Menu — Duplicated Logic & Redundant Store Calls
- **Status**: ✓ Done
- **Files**: `frontend/src/components/ContextMenu.tsx`, `frontend/src/components/TabBar.tsx`, `frontend/src/utils/tabActivation.ts`
- **Summary**: Extracted shared `activateTabAfterClose` utility. Removed duplicated activation logic from ContextMenu handlers. handleClose uses the same activation pattern as TabBar.handleClose.

### US-11: Fix Tab Context Menu — Viewport Boundary Detection
- **Status**: ✓ Done
- **Files**: `frontend/src/components/ContextMenu.tsx`
- **Summary**: Added `useLayoutEffect` with `getBoundingClientRect()` to measure menu dimensions after mount. Repositions menu if it overflows the viewport (right/bottom edges), with 8px padding. No layout shift or flicker.

### US-12: Fix TestsEditor — React Anti-Patterns
- **Status**: ✓ Done
- **Files**: `frontend/src/components/TestsEditor.tsx`
- **Summary**: Removed `useCallback` wrappers from all handlers. Replaced `document.querySelectorAll` focus management with React refs array (`useRef<HTMLInputElement[]>`). Replaced index-as-key with stable unique IDs via `nextIdRef` counter. All keyboard behavior (Enter/Backspace) preserved.

### US-13: Fix ImportModal — CSS Coupling
- **Status**: ✓ Done
- **Files**: `frontend/src/components/Modal.css` (new), `frontend/src/components/NewCollectionModal.css`, `frontend/src/components/NewCollectionModal.tsx`, `frontend/src/components/ImportModal.tsx`
- **Summary**: Extracted shared modal classes (`.modal-backdrop`, `.modal-box`, `.modal-title`, `.btn`, `.btn--primary`, `.btn--secondary`, `.modal-field`, `.modal-label`, `.modal-input`, `.modal-actions`) into `Modal.css`. Both `NewCollectionModal.tsx` and `ImportModal.tsx` now import from `Modal.css`. `NewCollectionModal.css` is now empty. No duplicate CSS rules.

## Files Modified/Created

**New Files**:
- frontend/src/components/ImportModal.tsx
- frontend/src/components/ImportModal.css
- frontend/src/components/ContextMenu.tsx
- frontend/src/components/ContextMenu.css
- frontend/src/components/TestDocsModal.tsx
- frontend/src/components/TestDocsModal.css
- frontend/src/components/Modal.css
- frontend/src/utils/tabActivation.ts

**Modified Files**:
- frontend/src/App.tsx
- frontend/src/App.css
- frontend/src/components/Sidebar.tsx
- frontend/src/components/Sidebar.css
- frontend/src/components/TabBar.tsx
- frontend/src/components/TestsEditor.tsx
- frontend/src/components/TestsEditor.css
- frontend/src/components/ScriptEditor.tsx
- frontend/src/components/ScriptEditor.css
- frontend/src/components/RequestEditor.tsx
- frontend/src/components/RequestEditor.css
- frontend/src/components/NewCollectionModal.tsx
- frontend/src/components/NewCollectionModal.css
- frontend/src/store/tabsStore.ts

## Completion Notes

Feature 0022 was completed successfully on 2026-04-20 with all 13 user stories delivered. The implementation covers nine UX enhancements and four code quality fixes, all scoped to the frontend layer with no changes to the Go backend or Wails bindings.