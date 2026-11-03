---
id: I-GV8WN-4
status: in-progress
implements: FS-GV8WN
blocked_by: [I-GV8WN-1, I-GV8WN-2]
labels: []
title: "FS-GV8WN slice 4: settlement writes retried until recorded; run end writes per-player pairs and a sweep"
---
Implements FS-GV8WN §C Requirements 8–10, §E Requirements 14–15

**Author: human.** game-server is the owner's hand-coded lane.

## What to Build

Behavior-preserving groundwork: nobody settles early yet, but run end already uses the new shape.

- A **pending settlement** the session holds: the formatted pair plus its derived ids (slice 1).
  Writing it retries the outbox transaction with backoff (e.g. 0.5 s doubling to 30 s) and a
  per-attempt timeout, off the tick and off the hub loop, until it commits. No more
  `context.Background()` and log-only failure in `PublishMatchComplete`.
- The session is not torn down until every pending settlement it holds has committed, players
  present or not. An ended session waiting on writes does not tick.
- `endSession`:
  1. Settle the members not yet settled (all of them, until slice 5), as a `partial=true` pair.
  2. Notify and return players to the hub.
  3. Write the **sweep**: an `items.extracted` with no players, `partial=false`, and no `match.ended`.
  4. Close and shut down.
  5. Hold until committed.

## Acceptance Criteria

- [x] A failing outbox write is retried until it succeeds; the payload and ids are the same on every attempt.
- [x] The tick keeps running while a write is retrying.
- [x] ~~A session holding an uncommitted settlement is not removed until it commits.~~ Replaced by D1: the writer holds it.
- [x] ~~A normal run end writes one `partial=true` pair for its members, then one sweep `items.extracted` with no players and `partial=false`.~~ Replaced by D2: one `partial=false` pair.
- [x] End to end: the items are stored and released exactly as before this slice.
- [x] `go test ./...` passes in game-service.

## Blocked By

I-GV8WN-1 (ids), I-GV8WN-2 (`partial` in the proto and in items-service)

## Spec Reference

FS-GV8WN §C R8–R10, §E R14–R15; user stories 17, 18.

## TDD Approach

- RED: a fake outbox writer failing twice then succeeding → expect three attempts with identical params and one commit.
- GREEN: the retrying writer held by the session.

## Implementation notes (2026-11-03, /develop; Nick approved D1, D2)

- **D1: the writer holds, not the session.** A pod-level `settlementWriter` (`internal/game/settlement_writer.go`), built by `NewService` with `SettlementRetry` (`DefaultSettlementRetry(ctx)` in `config/routes.go`: 0.5 s doubling to 30 s, 5 s per attempt, until the pod's ctx ends). The first attempt runs before `PublishMatchComplete` returns, as before. A failed write is held and retried on the writer's own goroutine. The session is torn down as usual: the formatted pair is all a retry needs. Pod death before commit = rollback, the same as keeping the session would give. Replaces the AC "a session holding an uncommitted settlement is not removed until it commits".
- **D2: the run's end is one pair, `partial=false`** (all members still unsettled; items stores them, then releases the whole run in one transaction). That is today's event, so this slice changes no event shape. A separate sweep could be processed before the pair (retry queue, replicas), release the members' gear, and fence their store out, bringing a drunk potion back. Replaces the AC "one `partial=true` pair, then one sweep". A players-less sweep is needed only once everyone can settle early (slice 5).

## Acceptance walk

- Retried until it succeeds, same payload and ids: MET, `TestPublishMatchComplete_DatabaseDownThenBack_RetriedUntilRecorded`.
- Tick keeps running: MET. Retries run on the writer's goroutine, and the first attempt is on `manageEndSession`'s goroutine, as before, now bounded (`EveryAttempt_HasADeadline`).
- Held until commit: MET via D1 (`DatabaseDownThenBack`, `PodGoingAway_StopsRetrying`).
- Run end shape: per D2, unchanged from today (existing publish and extraction tests).
- End to end as before: MET. `go test ./...` in game-service passes; vet and golangci-lint are clean.

## Code review outcome (2026-11-03)

- Fixed:
  - The writer floors a zero `First` (100 ms) and keeps `Max >= First`, so it never retries back to back.
  - Waits are jittered into [half, whole] of the doubling base.
  - Logging: ERROR when a settlement is first held and when it is given up, WARN for the retries between, INFO when it is recorded after retrying.
  - The pod's end is checked before every attempt, so it never races `select`.
  - `service.Drain()` waits for held settlements; `config/routes.go` shutdown calls it before the downstreams close.
  - Tests:
    - waits doubled, jittered and capped;
    - zero waits never spin;
    - same pair and ids on every attempt;
    - log levels;
    - AllOrNothing drains.
- **R15 order: (b), kept as today** (Nick). See the FS R15 amendment.
- Moved to later slices rather than built now: an on-commit hook (I-GV8WN-8) and an off-tick settle (I-GV8WN-5).
