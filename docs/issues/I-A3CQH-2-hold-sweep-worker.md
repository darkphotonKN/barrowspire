---
id: I-A3CQH-2
status: done
implements: FS-A3CQH
blocked_by: [I-A3CQH-1]
labels: []
title: "FS-A3CQH slice 2: the hold sweep runs every 5 minutes and releases expired holds (wallet-service)"
---
Implements FS-A3CQH §Requirements 5–12, 14, §Acceptance Criteria, §Edge States

## What to Build

The running sweep, end to end: expired holds in a live wallet-service are released without anyone
asking.

- **Candidate query** (CQRS read, beside `stale_reserved_holds_query.go`): bid ids of
  `status = 'RESERVED' AND expired_at < NOW()`, `ORDER BY expired_at`, `LIMIT` capped at 100. It
  uses the existing partial index `idx_wallet_holds_sweep`. **No migration.**
  *(Amended 2026-11-05, FS-A3CQH A1: a pass now pages through every candidate, 100 per page,
  `ORDER BY expired_at, bid_id` with a keyset on `(expired_at, bid_id)`, until a short page; was:
  one read capped at 100. Decided by Nick after code review: a corrupt account with ≥100 expired
  holds would otherwise sit at the head of every pass and stall every other release.)*
- **Sweep use case** (`internal/account/usecase/`): one pass. Read the candidates. For each one,
  `FindByBidID` → `Account.ExpireHold(bidID, now)` → `Save`, inside the existing `withRetry`.
  Count releases. Skip `ErrHoldNotExpired` silently. Warn-log and skip any other per-hold failure.
  A failed candidate read is returned as the pass's error. End with one info log carrying the
  released count. The use case declares the narrow interfaces it needs (consumer owns the
  interface).
- **Worker** (ticker, 5 min) following marketplace's `ReconcileHoldsWorker` shape, started in
  `cmd/server/main.go` on the existing `workerCtx`, joined to `workersWg` like the outbox worker,
  stopped by `workerCancel` on shutdown. Wire the use case in `internal/config/services.go`.
- No call to another service, no ledger write, no outbox row, no event (FS §Req 12).

## Acceptance Criteria

- [ ] The query returns only `RESERVED` holds with `expired_at < NOW()`, oldest expiry first, at
      most 100. Pinned against the database in the repository-test style the package already
      uses, or flagged if no DB-backed test harness exists for queries.
      *(Amended 2026-11-05, FS-A3CQH A1: check instead that the query returns one page of the
      size asked, ordered by `(expired_at, bid_id)`, starting after the keyset position, and that
      a pass keeps reading pages until a short one; was: at most 100 per pass.)*
- [ ] A pass releases every expired candidate and logs one info line with the released count
      (0 when none).
- [ ] A candidate the aggregate answers `ErrHoldNotExpired` for is skipped, not released and not
      counted as a failure.
- [ ] A candidate whose load or save fails (including `ErrMaxRetries`) is warn-logged and skipped;
      the other candidates in the pass are still processed.
- [ ] A failed candidate read returns an error from the pass; the worker logs it and keeps ticking.
- [ ] A candidate already `RELEASED` or `COMMITTED` by the time it is loaded is a no-op (an OCC
      race lost to a commit, a release or another replica).
- [ ] The worker ticks every 5 minutes in wallet-service's process and returns when the worker
      context is cancelled, releasing its wait-group slot.
- [ ] No other service is called; no ledger, outbox or event row is written.
- [ ] `go test ./...` in `game-server/wallet-service` passes; `go vet` clean.

## Blocked By

I-A3CQH-1 (`Account.ExpireHold`, `ErrHoldNotExpired`)

## Spec Reference

FS-A3CQH §Requirements 5–12 and 14; User Stories 1, 2, 8, 11–17; the query, pass and worker rows
of §Acceptance Criteria; §Edge States (nothing expired, backlog, clock disagreement, replicas,
corrupt account, database down, shutdown).

Files expected: `game-server/wallet-service/internal/account/query/expired_holds_query.go` (+ test),
`internal/account/usecase/expire_holds_usecase.go` (+ test), a worker file (e.g.
`internal/account/worker/hold_sweeper.go`, a new package), `internal/config/services.go`,
`cmd/server/main.go`.

## TDD Approach

- RED: a pass over a fake candidate reader returning one expired bid id and a fake repository
  holding its account ends with that hold `RELEASED` and a released count of 1.
- GREEN: the use case loop; then the skip and failure rows as their own failing cases, then the
  query, then the worker's stop-on-cancel.
