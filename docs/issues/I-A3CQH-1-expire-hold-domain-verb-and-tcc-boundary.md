---
id: I-A3CQH-1
status: done
implements: FS-A3CQH
blocked_by: []
labels: [ready-for-agent]
title: "FS-A3CQH slice 1: Account.ExpireHold and the TCC boundary it shares with CommitHold (wallet-service)"
---
Implements FS-A3CQH §Requirements 1–4, 13, §Acceptance Criteria, §Edge States

## What to Build

The hold sweep's only write, and the guarantees that make it a correct TCC Cancel. Domain only:
no query, no worker.

- `Account.ExpireHold(bidID, now)` in `internal/account/domain/account/account.go`, with a new
  sentinel `ErrHoldNotExpired` in `errors.go`:
  - `RESERVED` and `now.After(expiredAt)` → `RELEASED` (`updatedAt = now`), and the account's
    `updatedAt` too;
  - `RESERVED`, not yet expired → `ErrHoldNotExpired`, nothing changes;
  - `RELEASED` or `COMMITTED` → no change, nil error. The caller must be able to tell this from a
    release (return value or snapshot comparison, implementer's choice, used by slice 2's count);
  - unknown bid → `ErrHoldNotFound`.
- Use the **same expiry predicate** as `CommitHold` (`now.After(expiredAt)`), so the boundary is
  one rule (FS §Req 2). No change to the hold FSM's status set (FS §Req 4).
- Domain tests pinning the TCC behavior. Test the TCC rules, not the implementation.

## Acceptance Criteria

- [ ] Expired `RESERVED` hold → `RELEASED`; available gold rises by its amount.
- [ ] Not-yet-expired `RESERVED` hold → `ErrHoldNotExpired`; hold and account unchanged.
- [ ] `COMMITTED` hold → unchanged, no error (no Cancel after Confirm).
- [ ] `RELEASED` hold → unchanged, no error (idempotent).
- [ ] Unknown bid id → `ErrHoldNotFound`.
- [ ] Anti-hanging: after `ExpireHold`, `PlaceHold` with the same bid id and amount →
      `ErrBidAlreadyHeld`, no new hold.
- [ ] Boundary: at `now == expiredAt`, `CommitHold` succeeds and `ExpireHold` refuses; one
      nanosecond later, `CommitHold` → `ErrHoldExpired` and `ExpireHold` releases.
- [ ] D11: on an expired hold, `CommitHold` → `ErrHoldExpired` before and after `ExpireHold`
      (never `ErrInvalidHoldTransition`).
- [ ] `ReleaseHold` on a swept hold → nil, no change (the existing release paths stay no-ops).
- [ ] `go test ./...` in `game-server/wallet-service` passes.

## Blocked By

None

## Spec Reference

FS-A3CQH §Requirements 1 (TCC Cancel rules), 2 (one boundary at `expired_at`), 3 (the verb), 4 (no
new status), 13 (outcome unchanged, D11); User Stories 3–7, 9, 10; the domain rows of §Acceptance
Criteria.

Files expected: `game-server/wallet-service/internal/account/domain/account/account.go`,
`errors.go`, `account_test.go` (or a new `expire_hold_test.go` beside it).

## TDD Approach

- RED: `ExpireHold` on a `RESERVED` hold with `expiredAt` one minute before `now` leaves it
  `RELEASED` (fails to compile, then fails).
- GREEN: the verb with the shared `now.After(expiredAt)` predicate; then each remaining criterion
  as its own failing case first.
