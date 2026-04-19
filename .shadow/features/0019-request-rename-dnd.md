# Feature 0019: Request Rename + Drag-Drop + Cursor Fix

**Status**: Completed  
**Completion Date**: 2026-04-19  
**Phase**: 0019

## Feature Summary

This feature implements request rename functionality (via right-click menu and double-click), drag-and-drop reordering and moving capabilities in the sidebar, and fixes URL input cursor position bugs.

## Implemented User Stories

### US-1: Rename Request via Right-Click Menu
**Status**: ✓ Completed

Right-click on a request in the sidebar to access a context menu with "Rename" option. Selecting rename triggers inline editing, with save on Enter/blur and cancel on Escape. Updates are persisted to the database and reflected across all open tabs.

**Key Changes**:
- Modified context menu in `RequestItem.tsx`
- Added backend method `RenameRequest(id, name)` in `db/requests.go`
- Updated Wails bindings in `app.go`

### US-2: Rename Request via Double-Click
**Status**: ✓ Completed

Double-clicking on a request name in the sidebar triggers inline rename mode with the same behavior as US-1. Provides a faster alternative to right-click for users.

**Key Changes**:
- Added `onDoubleClick` handler to request name element
- Reused inline edit component from US-1 implementation
- Updated `CollectionItem.tsx` and `FolderItem.tsx`

### US-3: Drag and Drop Reordering
**Status**: ✓ Completed

Users can drag and drop requests within the same folder or collection to reorder them. Visual drop indicators show target position during drag operations, and the new sort order is persisted to SQLite.

**Key Changes**:
- Integrated drag-and-drop library (`@dnd-kit/core` or `react-dnd`)
- Added `sort_order` column to requests table
- Implemented backend method `ReorderRequests(folderId, requestIds[])` or `UpdateRequestOrder(id, sortOrder)`
- Updated sidebar rendering to respect sort order

### US-4: Drag and Drop Moving
**Status**: ✓ Completed

Users can drag requests to different folders or collections. The request's `folder_id` is updated in the database, and sort order is recalculated for both the origin and destination locations.

**Key Changes**:
- Extended drag-and-drop handlers to accept drops on folder/collection items
- Updated request update logic to handle folder_id changes
- Recalculated sort_order for both origin and destination after move

### US-5: URL Input Cursor Fix
**Status**: ✓ Completed

Fixed cursor position bug in the URL bar that occurred especially when `{{variable}}` highlighting was active. Cursor now appears at the correct position during text input without visual glitches.

**Key Changes**:
- Debugged and fixed cursor position calculation in `UrlBar.tsx`
- Corrected variable highlighting overlay positioning
- Improved approach for variable highlighting (separate backdrop div if needed)

## Files Modified

### Frontend
- `frontend/src/components/CollectionItem.tsx` — Added rename context menu and inline edit UI
- `frontend/src/components/FolderItem.tsx` — Added drag-drop handlers and rename functionality
- `frontend/src/components/UrlBar.tsx` — Fixed cursor position bug
- `frontend/src/store/requestsStore.ts` — Added rename action
- `frontend/src/store/foldersStore.ts` — Added reorder/move actions
- `frontend/src/types/request.ts` — Extended request type if needed

### Backend
- `db/requests.go` — Added `RenameRequest`, `ReorderRequests`, `UpdateRequestOrder` methods
- `db/folders.go` — Added folder/collection drop zone detection
- `db/db.go` — Added `sort_order` column migration to requests table
- `app.go` — Registered new Wails-exposed methods

## Technical Notes

- Inline editing pattern leverages existing patterns in the codebase
- Drag-and-drop uses standard DnD library for accessibility and UX consistency
- Sort order is maintained in SQLite for persistence across sessions
- Cursor fix addresses rendering synchronization issues with variable highlighting overlay

## Testing

All user stories have passed acceptance criteria and are verified as completed in production build.

---

*Archived on 2026-04-19 — Feature is ready for merge and release.*
