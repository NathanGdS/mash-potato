# 0020 — Variable Hover Tooltip

**Feature ID**: 0020  
**Feature Name**: Variable Hover Tooltip  
**Completion Date**: 2026-04-19  
**Status**: Archived

## Overview

When the user hovers over a `{{variable}}` token in any input that supports variable interpolation, a tooltip card appears showing the variable name, its resolved value from the active environment (with Global fallback), and an inline environment switcher.

**Target inputs**: UrlBar, KeyValueTable → VarValueInput, AuthEditor → VarInput, BodyEditor (raw + json modes).

## Implemented User Stories

All 6 user stories completed successfully:

### US-1: Create `useVarHoverTooltip` hook
- **Status**: ✓ Done
- **Files**: `frontend/src/hooks/useVarHoverTooltip.ts`
- **Summary**: Hook pierces the input overlay via pointer-events toggle, resolves variable values from active then global env, and debounces dismiss by 150 ms with full cleanup on unmount.
- **Key Implementation**:
  - Reads activeEnvironmentId, globalEnvironmentId, and variables from useEnvironmentsStore (no prop drilling)
  - On mousemove: temporarily sets pointer-events none on inputRef, calls document.elementFromPoint, restores pointer-events
  - Resolves value: active env first, falls back to global, returns '—' if not found
  - tooltipState.anchorRect is DOMRect of matched span element
  - tooltipState.isPassword reflects isPassword option
  - On mouseleave: waits 150ms before nullifying tooltipState
  - Dismiss timer cancellation on mouse re-entry
  - All setTimeout timers cleared on unmount

### US-2: Create `VarTooltip` component
- **Status**: ✓ Done
- **Files**: `frontend/src/components/VarTooltip.tsx`, `frontend/src/components/VarTooltip.css`
- **Summary**: Fixed 6 review issues: (1) position:fixed confirmed in CSS; (2) hardcoded TOOLTIP_HEIGHT removed — flip uses spaceBelow vs spaceAbove comparison; (3) lazy useState initializer eliminates render flash at {0,0}; (4) handleEnvChange is now async with try/catch; (5) role='tooltip' removed (card contains interactive select); (6) Env row moved from var-tooltip__body into new var-tooltip__footer with border-top separator.
- **Key Implementation**:
  - Portal-rendered via ReactDOM.createPortal into document.body
  - Card absolutely positioned using anchorRect — flips above when insufficient space below
  - Card header renders variable name as {{varName}}
  - Card body renders 'Value:' label followed by resolvedValue; shows '••••••' when isPassword true
  - Card footer renders 'Env:' label with select populated from useEnvironmentsStore.environments
  - Select pre-selects activeEnvironmentId; onChange calls useEnvironmentsStore.setActiveEnvironment(id)
  - onMouseEnter/Leave props suspend/resume dismiss timer
  - CSS uses scoped class names under .var-tooltip prefix

### US-3: Integrate hover tooltip into `UrlBar`
- **Status**: ✓ Done
- **Files**: `frontend/src/components/UrlBar.tsx` (modified), `frontend/src/hooks/useVarHoverTooltip.ts` (updated)
- **Summary**: Integrated useVarHoverTooltip and VarTooltip into UrlBar: added data-var-name to var-token spans, spread wrapperProps onto the wrapper div, and conditionally rendered VarTooltip with cancelDismiss wired to onMouseEnter. Also added cancelDismiss to useVarHoverTooltip return type to enable timer-cancel-only semantics from the tooltip.
- **Key Implementation**:
  - Each var-token span in url-bar-mirror-inner has data-var-name set to variable name (without braces)
  - Hovering {{variable}} span shows VarTooltip with correct resolved value
  - Tooltip reflects active env, falls back to Global, shows '—' when undefined
  - Environment switcher in tooltip updates displayed value immediately on change
  - Mouse leaving both token and tooltip dismisses tooltip after 150ms
  - Existing autocomplete behavior unchanged

### US-4: Integrate hover tooltip into `KeyValueTable → VarValueInput`
- **Status**: ✓ Done
- **Files**: `frontend/src/components/KeyValueTable.tsx` (modified)
- **Summary**: Added data-var-name to var-token spans, integrated useVarHoverTooltip into VarValueInput, spread wrapperProps onto kv-value-wrapper, and rendered VarTooltip conditionally with correct onMouseEnter/onMouseLeave wiring.
- **Key Implementation**:
  - Each var-token span in kv-value-mirror-inner has data-var-name set to variable name (without braces)
  - Hovering {{variable}} span in a value cell shows VarTooltip with correct resolved value
  - Tooltip reflects active env, falls back to Global, shows '—' when undefined
  - Environment switcher in tooltip updates displayed value immediately on change
  - Mouse leaving both token and tooltip dismisses tooltip after 150ms
  - Key cells (plain kv-input) unaffected — no tooltip, no behavior change
  - Existing autocomplete behavior unchanged

### US-5: Integrate hover tooltip into `AuthEditor → VarInput`
- **Status**: ✓ Done
- **Files**: `frontend/src/components/AuthEditor.tsx` (modified), and supporting hook/component updates
- **Summary**: Removed resolvedValue from VarHoverTooltipState and VarTooltip props; VarTooltip now subscribes directly to environmentsStore and computes resolvedValue reactively via useMemo, so the displayed value updates immediately when the environment switcher changes.
- **Key Implementation**:
  - VarInput renders mirror overlay containing var-token spans with data-var-name attributes
  - Hovering {{variable}} token shows VarTooltip with correct resolved value
  - type='password' fields display '••••••' in tooltip — actual secret never shown in plaintext
  - type='text' fields display the real resolved value
  - Tooltip reflects active env, falls back to Global, shows '—' when undefined
  - Environment switcher in tooltip updates displayed value immediately on change
  - Mouse leaving both token and tooltip dismisses tooltip after 150ms
  - Existing autocomplete behavior unchanged

### US-6: Integrate hover tooltip into `BodyEditor` (raw + json modes)
- **Status**: ✓ Done
- **Files**: `frontend/src/components/BodyEditor.tsx` (modified), `frontend/src/utils/jsonHighlighter.tsx` (modified)
- **Summary**: Extended JsonHighlighted with optional annotateVarTokens prop that sets data-var-name on valid {{var}} spans (excluding triple-brace); BodyEditor now calls useVarHoverTooltip unconditionally, spreads wrapperProps onto the wrapper div, annotates raw-mode var-token spans with data-var-name, and renders VarTooltip when tooltipState is non-null for json/raw modes.
- **Key Implementation**:
  - raw mode: hovering {{variable}} token shows VarTooltip with correct resolved value
  - json mode: hovering valid {{variable}} token inside a string value shows VarTooltip
  - json mode: hovering bare { or } JSON syntax character does NOT show tooltip
  - json mode: triple-brace or adjacent-brace sequences do NOT trigger tooltip
  - Tooltip reflects active env, falls back to Global, shows '—' when undefined
  - Environment switcher in tooltip updates displayed value immediately on change
  - Mouse leaving both token and tooltip dismisses tooltip after 150ms
  - none/form-data/urlencoded modes: no tooltip rendered, no behavior change
  - Ctrl+Alt+L beautify shortcut continues to work in json mode
  - Existing autocomplete behavior unchanged

## Implementation Details

### New Components and Hooks
- **`useVarHoverTooltip` hook**: Manages tooltip state and timer-based dismiss logic. Handles pointer-events piercing to detect hovers over mirror spans.
- **`VarTooltip` component**: Portal-rendered tooltip card with environment switcher. Updates display reactively when environment changes.

### Modified Components
- **UrlBar.tsx**: Added tooltip integration to URL input with variable hover detection
- **KeyValueTable.tsx**: Added tooltip integration to value cells (headers, params, body form fields)
- **AuthEditor.tsx**: Added tooltip integration to auth fields with password masking support
- **BodyEditor.tsx**: Added tooltip integration for raw and JSON body modes
- **jsonHighlighter.tsx**: Extended with annotateVarTokens option to tag variable spans

### Architecture Pattern
The feature uses a consistent pattern across all inputs:
1. Mirror overlay contains var-token spans with `data-var-name` attributes
2. `useVarHoverTooltip` hook detects hovers via pointer-events pierce
3. Resolved value is computed reactively from active → global environment
4. `VarTooltip` provides visual feedback and environment switcher
5. 150ms dismiss delay with mouse re-entry cancellation prevents flicker

## Code Quality
- No any-type casts across all files
- Full TypeScript strict mode compliance
- Reusable hook pattern for consistency
- Portal-based rendering for proper z-layering
- Reactive value updates on environment change
- Complete cleanup on component unmount

## Testing Coverage
All acceptance criteria validated:
- Variable detection in all input types
- Environment fallback logic (active → global → undefined)
- Password field masking in tooltip
- Dismiss timer behavior with 150ms delay
- Mouse re-entry timer cancellation
- Environment switcher reactivity
- Compatibility with existing autocomplete features

## Files Modified/Created

**New Files**:
- frontend/src/hooks/useVarHoverTooltip.ts
- frontend/src/components/VarTooltip.tsx
- frontend/src/components/VarTooltip.css

**Modified Files**:
- frontend/src/components/UrlBar.tsx
- frontend/src/components/KeyValueTable.tsx
- frontend/src/components/AuthEditor.tsx
- frontend/src/components/BodyEditor.tsx
- frontend/src/utils/jsonHighlighter.tsx

## Completion Notes

Feature 0020 was completed successfully on 2026-04-19 with all 6 user stories delivered and merged. The implementation provides a consistent hover tooltip experience across all variable-enabled inputs in the Mash Potato API client, enhancing user visibility into variable resolution and environment switching.
