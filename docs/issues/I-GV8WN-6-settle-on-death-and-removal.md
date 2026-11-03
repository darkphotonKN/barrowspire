---
id: I-GV8WN-6
status: in-progress
implements: FS-GV8WN
blocked_by: [I-GV8WN-4]
labels: []
title: "FS-GV8WN slice 6: a player is settled at death, and at removal after an in-play disconnect"
---
Implements FS-GV8WN §A Requirements 1–4 (death, removal)

**Author: human.** game-server is the owner's hand-coded lane.

## What to Build

- On death (incl. by choice, FS-9K8EZ, and a player left behind on a lower floor, FS-F6F88),
  snapshot the body as a death: safe items only (`safeItems`), consumed ids, experience so far.
  One `partial=true` pair for that player, through the session's pending settlements.
- On removal after an in-play disconnect outlives its grace (FS-QPDKN R20): the same as a death
  (Nick, 2026-11-03). This now deletes the potions they drank, which today stay.
- Apply progress to the village seat at once; mark settled so the run's end skips them.

## Acceptance Criteria

- [ ] Death writes that player's pair at death with only safe items and their consumed ids.
- [ ] A death by choice and a player left behind on a lower floor settle the same way.
- [ ] Removal after the grace writes that player's pair at removal, settled as a death; a potion they drank is deleted.
- [ ] Their village seat shows their progress at once.
- [ ] The run's end does not list them again.
- [ ] `go test ./...` passes in game-service.

## Blocked By

I-GV8WN-4

## Spec Reference

FS-GV8WN §A R1–R4 (death, removal); user stories 4, 12.

## TDD Approach

- RED: session test: a player dies → the fake writer receives one pair with their safe items only.
- GREEN: settle from the elimination path and from the grace-expiry removal.

## Implementation notes (2026-11-03, built with I-GV8WN-5)

- Death settles from `recordEliminations` (on the tick), after the fall is recorded, as a death: `safeItems` plus consumed ids.
- Removal settles from `Session.RemovePlayer` before the body goes, as a death (`settleDeath`), so unsafe finds are lost and drunk potions deleted. *(Code review: the first version read the body off the tick. That was wrong, because a body in its grace is still in play and the tick grants it experience. Settle-and-remove now runs on the tick; see I-GV8WN-5's review outcome.)*
- A member who resolved first (death, then drop) is settled once: `TestSettleOnResolve_ResolvedThenRemoved_SettledOnce`.

## Acceptance walk

- Death settles at death with safe items and consumed ids: MET, `TestSettleOnResolve_Death_SettlesOnTheTickTheyFall`; consumed ids in `TestEndSession_ResolvedRun_PublishesEachDelversConsumedItems` (the fallen delver's own pair).
- Death by choice settles the same: MET via the elimination path (`TestForfeitRun_*` in gameserver now assert the forfeiter's own settlement).
- Left behind on a lower floor: MET by the death path. `LeftBehind` is set only on a body already eliminated when the party changes floor (`session.go`, floor change, `IsEliminated`), so that player was settled at their death, before being left behind.
- Removal after the grace settles as a death and deletes their drunk potion: MET, `TestSettleOnResolve_RemovedInPlay_LosesFindsCarriesWhatTheyDrank` (unsafe ring and potion lost, consumed id carried) and `TestSettleOnResolve_RemovedFromATickingRun_SettledOnTheTick`.
- Seat shows progress at once: MET (`ApplyRunProgress` in `settle`; the removed member's progress in game `TestEndSession_RunProgress_ReachesTheHostBeforeHome`).
- The run's end does not list them again: MET (as I-GV8WN-5).
- `go test ./...`: see I-GV8WN-5.
