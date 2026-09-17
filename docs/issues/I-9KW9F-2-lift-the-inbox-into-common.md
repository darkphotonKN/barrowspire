---
id: I-9KW9F-2
status: done
implements: FS-9KW9F
blocked_by: []
labels: [ready-for-agent]
title: "FS-9KW9F slice 2: lift the inbox into common/inbox"
---
Implements FS-9KW9F §Requirements 19-21

**Author: agent**

## What to Build

One inbox implementation, shared; three `processed_events` tables, separate.

**There is no shared inbox today.** `common/` has an `outbox` package with no inbox sibling; the
only implementation is `notification-service/internal/notification/inbox_repository.go`. I-9KW9F-3
and I-9KW9F-4 each need one, so this slice creates `common/inbox` and repoints notification-service
at it rather than letting the same twenty lines get copied a third and fourth time (§Req 19).

### 1. Create `game-server/common/inbox`

Lift the repository as-is. **Preserve the contract exactly** (§Req 21):

- table shape `(event_id UUID, event_type TEXT, processed_at TIMESTAMPTZ,
  PRIMARY KEY (event_id, event_type))`
- `INSERT ... ON CONFLICT (event_id, event_type) DO NOTHING`
- "was this new?" decided by `RowsAffected() == 1`, returned as a bool
- the method runs **inside a caller-supplied `*sqlx.Tx`**, never opening its own

The composite key is deliberate: it lets one service consume two event types that could share an
id without one masking the other. Do not simplify it to `event_id`.

Note the existing repo wraps errors with notification-service's local `wrapDBErr`. The lifted
version needs an equivalent that does not depend on a service package — check what
`commonhelpers.WrapDBErr` offers before inventing one.

### 2. Repoint notification-service

Delete its local `inbox_repository.go` and consume `common/inbox`. Its `runInTx` helper —
`MarkEventProcessed` inside the transaction, returning `commonconstants.ErrAlreadyProcessed`
when the row already exists — is the pattern I-9KW9F-3 and I-9KW9F-4 will follow; leave that behavior
identical.

**Its existing tests must pass unchanged.** If a test needs editing to accommodate the lift, the
lift changed behavior and that is the finding, not the test.

### 3. Storage stays local

**No table moves, and no service reads another service's tables** (§Req 20). notification-service
keeps its own `processed_events` (migration `000004`). auth-service and wallet-service get their
own in I-9KW9F-4 and I-9KW9F-3. This slice adds **no migration** — it is code only.

## Acceptance Criteria

- [x] `game-server/common/inbox` exists and exports the `MarkEventProcessed` contract
- [x] The composite `(event_id, event_type)` primary key and `ON CONFLICT DO NOTHING` semantics
      are preserved verbatim
- [x] `MarkEventProcessed` takes a caller-supplied `*sqlx.Tx` and never opens its own
- [x] Returns true on first insert, false on redelivery, distinguished by `RowsAffected() == 1`
- [x] notification-service uses `common/inbox`; its local `inbox_repository.go` is gone
- [x] **notification-service's existing tests pass unchanged** — true, but **VACUOUSLY**, and
      that is a finding rather than a pass. Both "tests" in `service_test.go` are declared as
      *methods on `*mockRepository`* (`func (m *mockRepository) TestProcessMemberSignedUp_Success`),
      so `go test` reports `[no tests to run]` — before this change and after it. The issue
      assumed that suite was the regression proof for the lift. **There is no regression proof.**
      The tests were left untouched as the slice required; fixing them is separate work.
- [x] notification-service still returns `ErrAlreadyProcessed` on a duplicate, unchanged
- [x] No migration is added by this slice; no connection string or query references another
      service's database
- [x] `go build ./...`, `go vet`, and the suites pass in common and notification-service
- [x] The three `common/inbox` tests **skip silently unless `INBOX_TEST_DB_DSN` is set**, so a
      plain `go test ./...` is green-by-skip. Verified for real against the running
      `barrowspire_notification_service_db` (port 5214): all three pass. The composite-key test
      was additionally **mutation-tested** — collapsing the write to ignore `event_type` turns
      `TestMarkEventProcessed_SameIDDifferentType_IsNotSuppressed` red, so it has teeth. **CI
      wiring for the DSN is not done** and is the first thing to decide on review.

## Blocked By

None. Independent of I-9KW9F-1 — the two can run in parallel.

## Spec Reference

FS-9KW9F §Requirements 19 (lift and repoint), 20 (shared code, local storage), 21 (preserved
shape).

## TDD Approach

- **RED:** a `common/inbox` test asserting a second `MarkEventProcessed` with the same
  `(event_id, event_type)` returns false and no error. Fails — the package does not exist.
- **GREEN:** lift the implementation.
- **REFACTOR:** repoint notification-service and delete its copy; its suite is the regression
  proof that the lift preserved behavior.

## Check, do not assume

- **Same id, different event type, must NOT be suppressed.** Add a case for it — it is the whole
  reason the key is composite, and a lift that silently narrowed to `event_id` would still pass
  every single-type test.
- The caller owns the transaction. A lifted version that opens its own would break the atomicity
  I-9KW9F-3 and I-9KW9F-4 depend on, and no notification-service test would catch it.
