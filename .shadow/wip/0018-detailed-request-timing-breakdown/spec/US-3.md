# US-3: Persist timing data to `request_history`

**Feature:** 0019 - Detailed Request Timing Breakdown
**Status:** [ ] Pending
**Dependencies:** None (independent; can run in parallel with US-1/US-2)

---

## Description

As the persistence layer, I want the `request_history` table to store per-phase timing data as a JSON blob so that history entries carry full timing information for later inspection.

---

## Acceptance Criteria

- [ ] A schema migration in `db/db.go` adds column `timing_json TEXT` to `request_history`.
- [ ] Migration is idempotent: detects existing column via `PRAGMA table_info(request_history)` and skips `ALTER TABLE` if the column already exists.
- [ ] `db/history.go` serializes `TimingPhases` to JSON and writes the result into `timing_json` on every `SaveHistory` call.
- [ ] `db/history.go` deserializes `timing_json` back into `TimingPhases` on every `GetHistory` / `ListHistory` call; a missing or empty column value produces a zero-value `TimingPhases`.
- [ ] The `HistoryEntry` struct in `db/history.go` gains a `Timing TimingPhases` field.
- [ ] Existing history rows with `NULL` `timing_json` are handled gracefully (no crash, zero `TimingPhases` returned).
- [ ] `go build ./...` and `go test ./db/...` pass.

---

## Files to Modify

| File | Change |
|---|---|
| `db/db.go` | Add idempotent migration for `timing_json TEXT` column on `request_history` |
| `db/history.go` | Add `Timing TimingPhases` to `HistoryEntry`; serialize on write; deserialize on read |

---

## Notes

- JSON column format: `{"dns_lookup":12,"tcp_handshake":34,"tls_handshake":0,"ttfb":120,"download":45}` (snake_case, matching Go `json` struct tags).
- `json.Marshal` / `json.Unmarshal` are sufficient; no external dependency needed.
- `TimingPhases` type reference must be imported from `httpclient` package or defined in a shared location if circular imports arise. Prefer duplicating the struct definition in `db/history.go` with a type alias comment if cross-package import causes a cycle.
