---
id: I-QPDKN-3
status: in-progress
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN slice 3: leave_run, a dead delver returns to the hub early"
---
Implements FS-QPDKN §Requirements 13–14, 18, 21–23, §WebSocket message surface

**Author: human (hand-coded, human lane). Agent: tests only.**

## What to Build

A new inbound action, `leave_run`, that moves a dead delver from the run to the hub at once,
while the run keeps their body so settlement at run end is unchanged.

- **Accept** `leave_run` (no payload; routed on the member's record like every world action,
  FS-29KSH R16) only from a member whose record names a run and whose body in that run is
  dead or left behind (out of play and not escaped). Answer with `world_entered(hub)` after
  seating them in the hub (same path `ReturnPlayersToHub` uses for one member: hub
  `AddPlayer`, `setCurrentWorld`).
- **Refuse** it from anyone else, with an error reply on the `leave_run` action and no change:
  a member in play, an escaped member, a member in the hub, a member in no world.
- **The body stays.** Do not `RemovePlayer` from the run. The run-end snapshot
  (`getRawMatchState`, `runProgress`, `eliminations`) still includes them; their elimination
  index and `match.ended` entry are what they would have been.
- **R21, recipients.** Once a member has left, the run must not send them per-tick state,
  `end_game`, or anything else. The run's recipient set must be "members whose record names
  this run", not "entities in the world". `broadcastFullState` and `notifyPlayersOfGameEnd`
  both iterate `playerIDToEntitiesID` today; find one seam that both go through.
- **R22, the return.** `ReturnPlayersToHub` moves a member only if their record's
  `CurrentGameSessionId` is this run. A member who left may already be in the hub, queued, or
  in a new run; the old run's end must not touch them. `ApplyRunProgress` is unaffected (it
  already matches on character).
- `leave_run` racing the run's end on the same tick: whichever lands first wins; the other is
  a no-op or an error (FS-QPDKN §Edge States "Leaving").
- Register the action constant alongside `leave_queue`; add it to the client's `ActionType`
  map in `game-client/src/assets/types/client.ts` so slice 4 can send it (type only, no UI).

## Acceptance Criteria

- [ ] A dead member's `leave_run` is answered with `world_entered(hub)`; their record names the
      hub; the hub has their body; the run still has their body.
- [ ] A left-behind member's `leave_run` is accepted the same way.
- [ ] An in-play member's `leave_run` is refused with an error on `leave_run`; they stay in play.
- [ ] An escaped member's `leave_run` is refused; they stay in the run.
- [ ] A hub member's `leave_run` is refused.
- [ ] After leaving, the run's state broadcast and `end_game` do not reach the leaver's
      connection; the remaining member still receives both.
- [ ] At run end, a member who left and is now in a different session is not moved and receives
      no `world_entered` from the old run; a member still in the run is moved as today.
- [ ] A member who left appears in `match.ended` with their elimination position and in run
      progress with their experience.
- [ ] With one member left in play after the other left, the run continues and ends once when
      that member resolves.
- [ ] `go test -race ./internal/...` green; `golangci-lint run` clean.

## Blocked By

None. Shares `handler.go` / `server.go` / `session.go` with I-QPDKN-5; both are human lane, so
order them as you like, but land one before starting the other.

## Spec Reference

FS-QPDKN §Requirements 13, 14, 18 (the leave half), 21, 22, 23; §WebSocket message surface;
§User Stories 2, 15, 16, 17, 21–25; §Edge States "Leaving", "Concurrent".

## TDD Approach (agent writes these, red first, then hands over)

- RED (gameserver): `TestLeaveRun_DeadDelverGoesHomeAndBodyStays`,
  `TestLeaveRun_RefusedWhileInPlay`, `TestLeaveRun_RefusedAfterEscape`,
  `TestRunEnd_SkipsMembersWhoLeft` (member moved to a second run is untouched),
  `TestRunBroadcast_SkipsMembersWhoLeft`.
- GREEN: the message-hub case, the recipient seam, the guarded `ReturnPlayersToHub`.
