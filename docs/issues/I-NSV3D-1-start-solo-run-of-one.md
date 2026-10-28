---
id: I-NSV3D-1
status: in-progress
implements: FS-NSV3D
blocked_by: []
labels: [ready-for-agent]
title: "FS-NSV3D slice 1: start_solo, the hub starts a run of one"
---
Implements FS-NSV3D §Requirements 8–15, §WebSocket message surface

**Author: human (hand-coded, human lane). Agent: tests only.**

## What to Build

A new inbound action, `start_solo`, handled on the message hub's loop beside `find_game`
(`internal/gameserver/hub.go`). It builds a run for the sender alone, at once, without the
queue.

- `ActionStartSolo = "start_solo"` beside `ActionFindGame` in the constants.
- Routed on the sender's record (`GetPlayerFromConn`); the payload is ignored.
- **Refuse**, with an error reply on the `start_solo` action (top-level `Error`,
  `payload.message`) and nothing changed:
  - no character in play on the record → FS-BDA7X R6's copy, "Enter the hub with a character
    first." (same branch `find_game` has);
  - queued (`queue.QueuedCharacter` finds an entry) → "Leave the queue first.";
  - record in no world → refused as `find_game` would be.
  - An unreadable queue (`QueuedCharacter` errors, e.g. Redis down) counts as "not queued",
    as `EnterHub` already treats it (FS-K2HKP R7a note); log and continue. **[OD]**
- **Already in a run** (record names a run that exists, not the hub): answer
  `world_entered(run)` for that run and create nothing, exactly as `handlePlayerExistingGame`
  does for `find_game`. A record naming a run that no longer exists is cleared and treated as
  not in a run (same as `find_game`).
- **Otherwise create**: `CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers:
  []*types.Player{player}})` (no handoff players), then `worldEnteredMessage(session)` to the
  sender. The hub removal, seating with gear, first-floor build for a party of one and monster
  level = the delver's level all come from `CreateGameSession` as for a match; nothing new
  there.
- `queue.PlayerJoinQueue` is never called on this path; no matchmaker, Redis or handoff
  involvement.
- Everything downstream is untouched: the end rule (a roster of one ends when that delver
  resolves), return to the hub, `PublishMatchComplete` with one player.

## Acceptance Criteria

- [ ] `start_solo` from a hub member with a character in play: a run exists whose roster is that
      member only; they are no longer in the hub; they received `world_entered(run)`; the mock
      queue's `PlayerJoinQueue` was never called.
- [ ] `start_solo` with no character in play: error reply with R6's copy; still in the hub; no run.
- [ ] `start_solo` while queued: error reply "Leave the queue first."; still queued, still in
      the hub; no run.
- [ ] `start_solo` while already in a run: `world_entered` for that run; no second run.
- [ ] `start_solo` with an unreadable queue: proceeds to create (logged).
- [ ] A solo run ends when its one delver's health reaches 0: `end_game` to them,
      `ReturnPlayersToHub`, `PublishMatchComplete` with one player.
- [ ] `go test -race ./internal/...` green; `golangci-lint run` clean.

## Blocked By

None.

## Spec Reference

FS-NSV3D §Requirements 8, 9, 10, 11, 12, 13, 14, 15; §WebSocket message surface; §User Stories
3, 7, 8, 11, 12, 14; §Edge States "Starting", "The run", "Concurrent".

## TDD Approach (agent writes these, red first, then hands over)

- RED (`internal/gameserver/start_solo_test.go`, built on `enterHub` from `world_switch_test.go`,
  the mock queue from `integration_test.go` with a `queuedErr`/queued-player knob, and the
  message hub driven via `GetServerChan()` as in `TestQueueFindGameFlow`; use the string
  `"start_solo"` so the file compiles today and fails on assertion):
  `TestStartSolo_CreatesARunOfOne`, `TestStartSolo_RefusedWithoutCharacter`,
  `TestStartSolo_RefusedWhileQueued`, `TestStartSolo_ResumesAnExistingRun`,
  `TestStartSolo_UnreadableQueueDoesNotBlock`, `TestSoloRun_EndsWhenTheDelverDies`.
- GREEN: the hub case, the constant, the guards.
