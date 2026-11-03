---
id: I-GV8WN-7
status: in-progress
implements: FS-GV8WN
blocked_by: [I-GV8WN-5]
labels: []
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

## Implementation notes (2026-11-04, /develop; Nick approved the plan and the ESC-menu Leave)

- `Session.Depart` no longer refuses an escaped delver. `ErrEscapedWaits`, `ErrNotEscaped`, `Session.Release` and `Session.Escaped` are gone. Two things follow with no further code:
  - `leave_run` is accepted (R16).
  - A drop is a leave (R17). `leaveRunOnDrop` already goes through `LeaveRun` → `Depart`, and only the escaped refusal had stopped it.
- Removed (server):
  - `internal/settling`;
  - `gameserver/settling.go` (`settlingKeeper`, `settledRunEmitter`, `WithSettling`) and its tests;
  - `releaseEscaped`;
  - the `settling` checks at queue, solo, party and field entry, `settlingRefusal`, `errEnterFieldSettling` and `PartyNoticeSettling`;
  - the routes wiring.
- `releaseDeparted` now just removes the body. `cleanUpPlayerCompletely` keeps any resolved member, dead or escaped, whose drop could not be a leave (no hub).
- Client:
  - the `settling` copy is removed from `partyNotice` and `fieldRefusals`, with its tests and the three HubScene settling tests;
  - the ESC menu offers Leave to any resolved player, escaped included (`runMenuChoices({ resolved })`; `MenuState` drops `escaped`).
- Follow-up, not done here: `awaitingSettlement` (resolved members kept past their grace until the run ends) no longer serves settlement, since everyone settles at resolution. It could be simplified. FS R17 did not list it.

## Acceptance walk

- An escaped player's `leave_run` returns them to the hub with `world_entered`: MET, gameserver `TestLeaveRun_AcceptedAfterEscape` and game `TestDepart_ResolvedDelver_EscapedOrDead_Leaves`.
- An escaped player who disconnects is out of the run at once, and a reconnect lands in the village: MET, `TestDeadDrop_LeavesTheRunAtOnce/escaped,*` (record names the hub, held for the hub's grace or gone on a normal close) and `TestDeadDrop_ReconnectBeforeRunEnd_LandsInTheHub/escaped`, which actually reconnects and is announced the hub.
- No code path reads or writes `settling:`, and entry is never refused with `settling`: MET. The package and every check are deleted, and a grep finds no settling refusal in server or client.
- An in-play player's disconnect still gets its 30 s grace: MET, `TestDeadDrop_LivingDelverDropUnchanged`, `TestGraceEnd_RemovesInPlayMember`.
- `go test ./...` passes in game-service; game-client vitest, tsc and lint pass.

## Code review outcome (2026-11-04; Nick: 好)

- Stale and orphaned comments fixed:
  - the removed `Settling` lines left on `EnterField`/`CreateGameSession`;
  - `leaveRunOnDrop` no longer says escaped players are refused, and its log reads "Resolved delver dropped";
  - `hub.go`, `fields.go` (R35 reference), `constants/game.go` refusal order, test file headers and docs;
  - client `partyNotice`, `fieldRefusals` and test leftovers.
- `escapedLocked` → `outOfPlayLocked(playerID) error`, since only `Depart` used it and the bool was unused. `entryRead` is gone, so the party entry reads `partystore.Arrival` directly.
- Tests:
  - an escaped player's drop, then a real reconnect before the run ends, is announced the hub;
  - an escaped member kept past the grace (no hub) reconnects into the run;
  - an escaped member who leaves early is told off the matched party (the leader gets `left`).
- FS Edge State added: an escaped player whose drop cannot be a leave is kept like a dead one.
- Left for domain-model: game-service CONTEXT.md (**Settling**, **Released escapee**) and the name `awaitingSettlement`, which no longer serves settlement.
