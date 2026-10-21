---
id: I-K2HKP-5
status: open
implements: FS-K2HKP
blocked_by: []
labels: [ready-for-agent]
title: "FS-K2HKP slice 2 finish: run id, step names, queue leftovers, R7a, pod:alive on shutdown"
---
Implements FS-K2HKP §Requirements (R3, R6, R7a, R14, R17)

## What to Build

**Agent lane.** Finishes slice 2 (I-K2HKP-2). The matchmaker and match queue are Kranti's
hand-coded work; this delegation covers ONLY the items below. Code lives in
`game-server/game-service`: `internal/matchmaker/matchmaker.go`, `internal/match_queue/redis.go`,
`internal/handoff/redis.go`, `internal/gameserver/` (hub + server), `cmd/server/main.go`.

1. **Run id (R17).** Add `RunID uuid.UUID` (json `"run_id"`) to `MatchStart`, generated once per
   match in `MatchLoop`.
2. **Step values (R17).** `MatchStepCreate = "create"`, `MatchStepHandoff = "handoff"`. The Go
   constant names stay. The channel is already `matchstart:pod:{podID}`, which the FS now matches.
3. **R7a.** Refuse `enter_hub` as a **different** character while the player is queued (the same
   character is fine), with an error message telling them to leave the queue first. Guard in
   `messageHub.enterHub` / `Server.EnterHub`. Use what this pod already knows about its queued
   players before adding a Redis round trip.
4. **R3.** On graceful shutdown, stop `heartbeatLoop` first, then `DEL pod:alive:{podID}` with a
   fresh short-timeout context, because the root context is already cancelled by then.
5. **Test build.** `internal/matchmaker/matchmaker_test.go:72` still calls the old 3-argument
   `NewMatchmaker`. Update it to the 4-argument form (queue + announcer) with a fake announcer.
6. **R14 corrupt entry.** In `matchmakeScript`'s corrupt/podless-entry branch, `HDEL` that
   player's entry so they can queue again. The push-back of the others is unchanged.
7. **R6 stale leftover.** In `queueScript`, when `HSETNX` fails, decode the existing entry. If it
   is corrupt, or `EXISTS pod:alive:<its pod>` is 0, `HSET` the new entry and keep the player's
   list position: `RPUSH` only if `LPOS queue <id>` finds them missing. Otherwise return
   `ErrPlayerAlreadyQueued`. Add the same Redis Cluster key-building comment that
   `matchmakeScript` has. `queueScript` will need the `pod:alive:` prefix passed as an ARGV,
   like `matchmakeScript`.

## Acceptance Criteria

- [ ] `MatchStart` carries a `run_id` that is unique per match.
- [ ] Step values on the wire are `"create"` and `"handoff"`.
- [ ] `enter_hub` with a different character while queued is refused, and the same character
      is allowed.
- [ ] After graceful shutdown, `pod:alive:{podID}` is gone and no heartbeat recreates it.
- [ ] A popped player with a corrupt or podless entry has their entry deleted, and the others
      are restored in order (miniredis test).
- [ ] Queueing over a stale entry (dead pod or corrupt) overwrites it and keeps list position.
      Over a live entry it is refused (miniredis tests, `FastForward` for expiry).
- [ ] `go build ./...` and `go test ./...` pass in `game-service`.

## Out of Scope

- No `AcquireLock` anywhere (R11 amended: no matcher lock).
- Nothing from slice 3: the hub still drops non-local matched players, and the handoff case
  stays a log.
- No hub backplane (FS-JEAVX).

## Blocked By

None (I-K2HKP-1 is done).

## Spec Reference

FS-K2HKP §Requirements 3, 6 (amended), 7a, 14 (amended), 17; §Edge States (replica crash
leftovers, malformed queue entry, queued player switches character).

## TDD Approach

- RED: miniredis test where the player is queued from a pod whose `pod:alive` has expired, then
  queues again from a live pod. Expect the entry to be overwritten with the new pod, the queue
  length unchanged, and the player in the same position.
- GREEN: the `queueScript` stale-entry branch.

Commits are authored by Kranti, with no Co-Authored-By trailer.
