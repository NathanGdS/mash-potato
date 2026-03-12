# 0002 — Environments

## Description
Adds environment management to Mash Potato. Users can create named environments (e.g. dev, staging, prod), define key-value variables within them, select an active environment globally, and use `{{variable}}` syntax in requests. Variables are interpolated at send time before the HTTP request is dispatched.

## Tech Context
- **Backend**: New SQLite tables `environments` and `environment_variables`. New exported methods on `App` struct: `CreateEnvironment`, `ListEnvironments`, `DeleteEnvironment`, `SetVariable`, `GetVariables`, `GetActiveEnvironment`, `SetActiveEnvironment`. Interpolation logic lives in `httpclient/` or a new `interpolator.go`.
- **Frontend**: New Zustand store `environmentsStore`. New UI components: environment selector dropdown in top bar, environment editor panel/modal with a key-value table. `{{var}}` syntax accepted in all request fields (URL, headers, params, body) without escaping.
- **Wails bindings**: Run `wails generate module` (or `wails dev`) after adding new `App` methods to regenerate `frontend/src/wailsjs/go/`.
- **Tests**: Go unit tests for DB layer and interpolation; Vitest tests for Zustand store actions.

## Out of Scope
- Phase 3 features: extracting variables from responses, right-click context menus, auto-populating variables from response values.
- Environment import/export.
- Secret/masked variable support.
- Per-request environment override.
