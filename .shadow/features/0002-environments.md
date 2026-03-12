# 0002 — Environments

**Status**: Complete
**Archived**: 2026-03-12
**User Stories**: 5 / 5

---

## Summary

Adds full environment management to Mash Potato. Users can create named environments (e.g. dev, staging, prod), define key-value variables within them, select one as globally active via a top-bar dropdown, and use `{{variable}}` syntax in any request field. Variables are interpolated server-side (Go) at send time — resolved values are never persisted.

---

## User Stories

| ID | Title | Status |
|----|-------|--------|
| US-1 | Create Environment | ✅ |
| US-2 | Add Environment Variables | ✅ |
| US-3 | Select Active Environment | ✅ |
| US-4 | Use Variables in Requests | ✅ |
| US-5 | Variable Interpolation | ✅ |

---

## Implementation Details

### DB Layer
- Added `environments` table (`id`, `name`, `created_at`) and `environment_variables` table (`id`, `environment_id FK`, `key`, `value`) with `ON DELETE CASCADE` in `db/db.go`.
- Added `db/settings.go` with `GetSetting` / `SetSetting` backed by a `settings(key, value)` table; used to persist `active_environment_id`.
- `db/environments.go` implements `CreateEnvironment`, `ListEnvironments`, `RenameEnvironment`, `DeleteEnvironment`, `SetVariable`, `GetVariables`, `DeleteVariable`.
- Full Go test suite added in `db/environments_test.go`, `db/settings_test.go`, and `db/setup_test.go`.

### Backend
- `app.go` exposes all environment and settings DB functions as Wails-bound methods.
- New `interpolator.go` implements `Interpolate(template string, vars map[string]string) string` using the regex `\{\{([^}]+)\}\}`. Missing keys are left as-is.
- `App.SendRequest` resolves the active environment variables and runs interpolation on URL, header values, param values, and body before dispatching the HTTP request.
- `interpolator_test.go` covers single/multiple vars, missing key passthrough, empty template, and special characters.

### Frontend
- `frontend/src/types/environment.ts` — `Environment` and `EnvVariable` TypeScript interfaces.
- `frontend/src/store/environmentsStore.ts` — Zustand store with `environments`, `activeEnvironmentId`, and actions (`fetchEnvironments`, `createEnvironment`, `deleteEnvironment`, `setActiveEnvironment`, `fetchVariables`, `setVariable`, `deleteVariable`). Vitest tests in `environmentsStore.test.ts`.
- `frontend/src/components/EnvironmentPanel.tsx` + `.css` — modal panel for listing environments and editing their key-value variables.
- `frontend/src/components/EnvironmentSelector.tsx` — top-bar dropdown to pick the active environment (highlighted in orange); pre-fetches env variables on mount.
- `frontend/src/App.tsx` + `UrlBar.tsx` — integrated selector and panel into app layout; `{{var}}` syntax accepted in all input fields without escaping.
- `frontend/src/hooks/useVarAutocomplete.ts` — detects `{{` typing and drives autocomplete.
- `frontend/src/components/VarPopover.tsx` + `.css` — autocomplete dropdown listing variables from the active environment.
- `frontend/src/utils/varSegments.ts` — `parseVarSegments` splits text into plain/variable segments for inline highlighting.
- `frontend/src/App.css` + component files — `{{variable}}` tokens rendered in orange in URL bar, headers, params, and body editor.
- Wails bindings regenerated in `frontend/src/wailsjs/go/`.

---

## Files Changed

| File | Change |
|------|--------|
| `db/db.go` | Added `environments`, `environment_variables`, and `settings` table migrations |
| `db/environments.go` | New — environment and variable CRUD |
| `db/settings.go` | New — generic key-value settings store |
| `db/environments_test.go` | New — DB tests for environments and variables |
| `db/settings_test.go` | New — DB tests for settings |
| `db/setup_test.go` | New — shared test DB setup helper |
| `app.go` | Added environment/settings/interpolation App methods |
| `interpolator.go` | New — `{{var}}` interpolation engine |
| `interpolator_test.go` | New — interpolation unit tests |
| `frontend/src/types/environment.ts` | New — TypeScript interfaces |
| `frontend/src/store/environmentsStore.ts` | New — Zustand environments store |
| `frontend/src/store/environmentsStore.test.ts` | New — store tests |
| `frontend/src/components/EnvironmentPanel.tsx` | New — environment editor modal |
| `frontend/src/components/EnvironmentPanel.css` | New — panel styles |
| `frontend/src/components/EnvironmentSelector.tsx` | New — active environment dropdown |
| `frontend/src/hooks/useVarAutocomplete.ts` | New — `{{` autocomplete hook |
| `frontend/src/components/VarPopover.tsx` | New — autocomplete popover |
| `frontend/src/components/VarPopover.css` | New — popover styles |
| `frontend/src/utils/varSegments.ts` | New — segment parser for token highlighting |
| `frontend/src/components/UrlBar.tsx` | Updated — variable highlighting + autocomplete |
| `frontend/src/components/KeyValueTable.tsx` | Updated — variable highlighting + autocomplete |
| `frontend/src/components/BodyEditor.tsx` | Updated — variable highlighting + autocomplete |
| `frontend/src/App.tsx` | Updated — integrated selector and panel |
| `frontend/src/App.css` | Updated — orange token highlight styles |
| `frontend/src/wailsjs/go/` | Regenerated Wails bindings |
