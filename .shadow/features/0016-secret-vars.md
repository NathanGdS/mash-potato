# Feature Archive: 0017 - Encrypted Secret Variables

**Phase ID:** 0017
**Status:** COMPLETED
**Completion Date:** 2026-04-01
**Duration:** 5 days (Mar 31 - Apr 01)

---

## Feature Summary

Implemented end-to-end encryption for sensitive environment variables in Mash Potato. Users can now mark variables as "secret," which are encrypted with AES-256-GCM using OS keychain-managed keys, masked in the UI with a 5-second reveal timeout, and fully redacted from request history logs.

---

## Implemented User Stories

### US-1: Encryption Module (AES-256-GCM with OS Keychain)
- New package: `encryption/vars.go`
- `GetOrCreateKey()` retrieves/generates 32-byte AES key from OS keychain
- Fallback to MAC-address-derived key in headless environments
- `EncryptValue()` generates random nonce, returns `enc:` prefixed base64 blob
- `DecryptValue()` decrypts with typed error handling for key loss detection
- Full test coverage including round-trip, tampering detection, wrong key scenarios
- Status: ✓ COMPLETE

### US-2: Database Schema Migration
- `ALTER TABLE environment_variables ADD COLUMN is_secret BOOLEAN NOT NULL DEFAULT 0`
- Idempotent migration: detects existing column and skips gracefully
- Integrated into `db/db.go` initialization sequence
- Status: ✓ COMPLETE

### US-3: Database Layer - Encrypted Read/Write
- `EnvVariable` struct gains `IsSecret bool` field (JSON: `is_secret`)
- All SELECT queries include `is_secret` column
- On read: values starting with `enc:` are decrypted transparently
- Failed decryption sets transient `Broken: true` flag for UI recovery
- Callers pass pre-encrypted values (encryption happens at App layer)
- Updated `db/environments.go` with `key []byte` parameter threading
- Status: ✓ COMPLETE

### US-4: Application Methods for Secret Management
- `App.encKey` field caches encryption key from keychain (or fallback)
- `SetSecretVariable(envId, key, value)` encrypts value and stores with `is_secret=1`
- `GetDecryptedVariable(envId, key)` fetches and decrypts with error handling
- `ToggleVariableSecret(varId, isSecret)` converts plaintext ↔ encrypted
- `RotateVarEncryptionKey()` re-encrypts all secrets (manual/CLI only)
- No secret values logged; graceful fallback on keychain unavailability
- Status: ✓ COMPLETE

### US-5: Interpolator Secret Tracking
- New `InterpolationResult` struct: `{Value string; UsedSecretValues []string}`
- Interpolation function updated to accept `secrets map[string]bool`
- Secret variable plaintext values tracked for redaction
- Non-secret substitutions incur no performance overhead
- All callers in `app.go` and `httpclient/client.go` updated
- Test coverage for secret/non-secret tracking
- Status: ✓ COMPLETE

### US-6: HTTP Client Redaction
- `UsedSecretValues` from interpolation passed to HTTP client
- Secret values replaced with `[REDACTED]` in history storage
- JSON bodies: exact string token replacement (`"<secret>"` → `"[REDACTED]"`)
- Non-JSON bodies: `strings.ReplaceAll` fallback
- In-memory response for UI unaffected; only history storage redacted
- No-op path when `UsedSecretValues` is empty
- Status: ✓ COMPLETE

### US-7: TypeScript Type Updates
- `EnvVariable` interface gains `isSecret: boolean`
- `broken?: boolean` optional field for decryption-failure recovery
- `npm run build` passes with zero type errors
- Type safety enforced throughout frontend
- Status: ✓ COMPLETE

### US-8: Zustand Store Integration
- `environmentsStore.ts` persists `isSecret` flag in state
- `toggleVariableSecret(varId, isSecret)` action calls Wails binding and re-fetches
- New variable creation defaults `isSecret: false`
- No plaintext buffering beyond Go backend response
- Store actions include error handling (consistent with existing patterns)
- Unit tests mock Wails binding and verify action dispatch
- Status: ✓ COMPLETE

### US-9: EnvironmentPanel UI - Lock Toggle & Masked Display
- Row layout: `[Key] [Value/••••••👁] [🔒] [delete]`
- Lock icon toggle converts variable state (secret ↔ plaintext)
- Secret values display as `••••••` (masked span, not password input)
- Eye icon reveals plaintext for exactly 5 seconds, auto-re-masks
- Lock icon SVG visually distinguishes locked/unlocked states
- `secret-value-masked` CSS class: monospace, letter-spacing, user-select: none
- Unmount cleanup via `useRef`/`useEffect` teardown
- Test coverage: masking render, eye-reveal timer, unmount cleanup
- Status: ✓ COMPLETE

### US-10: Key Loss Recovery UI
- Broken variables render with red border, warning icon, "Decryption failed — re-enter value"
- Value input editable: new entry calls `SetSecretVariable()` to re-encrypt
- Broken state clears after successful re-save
- Banner message: "One or more secret variables could not be decrypted..."
- Broken variables do not block other functionality
- Test coverage for broken variable render and re-entry flow
- Status: ✓ COMPLETE

---

## Test Results

### Go Tests
- `encryption` package: **PASS** (8/8 tests, 0.194s)
  - Round-trip encrypt/decrypt
  - Plaintext pass-through
  - Tamper detection
  - MAC address fallback key

- `db` package: **PASS** (all tests including environment variable CRUD)

- `httpclient` package: **PASS** (request execution, redaction handling)

### Frontend Tests
- **Total: 209 tests PASS** (14 test files, 3.20s)
  - `EnvironmentPanel.test.tsx`: 27 tests (secret toggle, masking, eye reveal, broken state)
  - `SaveVarDialog.test.tsx`: 24 tests
  - `environmentsStore.test.ts`: 19 tests (including toggle action)
  - All other component and store tests passing

---

## Architecture Notes

### Key Storage
- **Primary**: OS keychain (`service="mash-potato"`, `account="vars-key"`)
- **Fallback**: MAC address + app-name hash (SHA-256) for headless/CI environments
- **Caching**: Key cached in `App.encKey` at startup (no repeated keychain queries)

### Encryption
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Nonce**: 12 random bytes per encryption
- **Storage**: `enc:` + base64(nonce + ciphertext) — belt-and-suspenders format
- **Decryption Failure**: Transient `Broken` flag allows UI recovery, not persisted

### History & Logs
- Secret values **never appear** in plaintext in history or logs
- Request history redacts with `[REDACTED]` before persistence
- Sensitive method bodies (`SetSecretVariable`, `GetDecryptedVariable`) exclude secret values from logging

### Frontend Display
- **Masked**: `••••••` using CSS span (not `<input type="password">`)
- **Reveal**: Eye icon shows plaintext for 5s with automatic re-mask
- **Locked State**: Lock icon toggle with SVG visual distinction
- **Recovery**: Inline re-entry for broken variables detected on load

---

## Files Modified

### Go
- `app.go` — Added App.encKey, SetSecretVariable, GetDecryptedVariable, ToggleVariableSecret, RotateVarEncryptionKey
- `db/db.go` — Schema migration for is_secret column
- `db/environments.go` — Decryption on read, IsSecret field, Broken flag
- `encryption/vars.go` — New AES-256-GCM package (NEW FILE)
- `encryption/vars_test.go` — Full test coverage (NEW FILE)
- `interpolator.go` — InterpolationResult struct, secret tracking
- `interpolator_test.go` — Tests for secret tracking
- `httpclient/client.go` — Redaction logic for history storage
- `httpclient/client_test.go` — Redaction tests

### TypeScript/React
- `frontend/src/types/Environment.ts` — Added isSecret, broken? to EnvVariable
- `frontend/src/store/environmentsStore.ts` — isSecret persistence, toggleVariableSecret action
- `frontend/src/store/environmentsStore.test.ts` — Tests for toggle action
- `frontend/src/components/EnvironmentPanel.tsx` — Lock toggle, masked display, eye reveal, broken state UI
- `frontend/src/components/EnvironmentPanel.css` — secret-value-masked styling, lock/eye icon styles
- `frontend/src/components/EnvironmentPanel.test.tsx` — Tests for all UI behaviors
- `frontend/wailsjs/` — Auto-generated Wails bindings (regenerated)

### Build
- `go.mod`, `go.sum` — Added dependency: `github.com/zalando/go-keyring`

---

## Deployment Notes

1. **Database Migration**: On first run, `is_secret` column is added to existing `environment_variables` tables (idempotent).
2. **Keychain Fallback**: Headless/CI environments use MAC-address-derived key; visible `WARN` logged.
3. **Key Rotation**: `RotateVarEncryptionKey()` is available as a Go method but not exposed to UI (manual/CLI operation).
4. **History Redaction**: Applies to all new requests sent after this feature is deployed.
5. **Backward Compatibility**: Plaintext variables (is_secret=0) continue to work; no breaking changes to API.

---

## Known Limitations & Future Work

- Key rotation UI not implemented (manual operation only)
- History redaction only applies to response bodies and headers (not request history display optimization planned)
- Secrets cannot be imported/exported via backup (placeholder for future feature)
- Single keychain key per app (multi-user/multi-key rotation planned separately)

---

## Sign-Off

- **Feature ID**: 0017
- **Spec-Engineer**: Approved ✓
- **Review-Agent**: Approved ✓
- **Implementation Status**: All 10 US complete, all tests passing
- **Ready for Release**: YES
