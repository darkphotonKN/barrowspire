---
id: I-GV8WN-7
status: open
implements: FS-GV8WN
blocked_by: [I-GV8WN-5]
labels: [blocked]
title: "FS-GV8WN slice 7: an escaped player may leave; a settled player's disconnect is a leave; settling removed"
---
Implements FS-GV8WN §F Requirements 16–17

**Author: human.** game-server is the owner's hand-coded lane.

## What to Build

- `leave_run` from an escaped player is accepted as a dead player's is (FS-QPDKN R10–R14). Remove
  `ErrEscapedWaits` and its hub mapping (`hub.go`). A leave is accepted whether or not the
  settlement has committed yet; the session keeps the pending write.
- An escaped player's disconnect is a leave, like a dead one's (FS-QPDKN R25): no reconnect grace.
- Delete what FS-QPDKN R18/R29–R36 added for escaped players: the escaped grace and the release
  (`releaseEscaped`), `Session.Release`, `internal/settling`, the `settling:<playerID>` key, the
  `settling` entry refusals (queue, solo, party `settling` code, field `settling` reason), and their
  tests.
- The in-play disconnect grace is unchanged (R18).

## Acceptance Criteria

- [ ] An escaped player's `leave_run` returns them to the hub with `world_entered`.
- [ ] An escaped player who disconnects is out of the run at once; a reconnect lands in the village.
- [ ] No code path reads or writes `settling:`; entry is never refused with `settling`.
- [ ] An in-play player's disconnect still gets its 30 s grace and can reconnect into the run.
- [ ] `go test ./...` passes in game-service.

## Blocked By

I-GV8WN-5 (escape must settle at once before the wait can go)

## Spec Reference

FS-GV8WN §F R16–R17; user stories 2, 11. Supersedes FS-QPDKN R14 (escaped part), R18, R29–R36.
The client copy for `settling` (I-QPDKN-11) becomes dead and is removed in I-GV8WN-10.

## TDD Approach

- RED: handler test: an escaped player sends `leave_run` → expect `world_entered` (hub), not the `ErrEscapedWaits` refusal.
- GREEN: drop the escaped refusal in the depart path; then delete the settling package with its tests.

## Notes from earlier slices (2026-11-03)

- From I-GV8WN-10: the client's ESC menu still offers an escaped player only Back (`runMenuChoices` in `game-client/src/ui/party.ts`, whose comment says the escaped wait for the run's end). Once this slice accepts the escaped leave, add Leave there too (client follow-up).
- Moved here from I-GV8WN-10 (code review): remove the client `settling` copy **in the same change** as the server side: `game-client/src/ui/partyNotice.ts` (copy + `PARTY_ENTER_REFUSALS` entry) and its test, `src/scenes/fieldRefusals.ts` `settling` reason and its test, and the 3 settling tests in `src/scenes/HubScene.test.ts`.
