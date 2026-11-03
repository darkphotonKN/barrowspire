---
id: I-GV8WN-5
status: in-progress
implements: FS-GV8WN
blocked_by: [I-GV8WN-4]
labels: []
title: "FS-GV8WN slice 5: an escaped player is settled the moment they escape"
---
Implements FS-GV8WN §A Requirements 1–5 (escape)

**Author: human.** game-server is the owner's hand-coded lane.

## What to Build

- On the escape tick (`handlePlayerEscape`), snapshot the player's body (everything worn and
  carried, finds included, consumed ids, experience so far) and hand it to the session as a
  pending settlement (slice 4): one `partial=true` pair for that player only.
- Apply their progress to their village seat at once (`ApplyRunProgress`).
- Mark them settled. `endSession` (slice 4) skips settled members. The body stays in the world (the
  escaped player still receives their own state, FS-QPDKN R24) but is never part of a later event.

## Acceptance Criteria

- [ ] Escaping writes one pair for that player only, on the escape tick, with all their items and consumed ids.
- [ ] Their village seat shows the new level and experience at once.
- [ ] The run's end does not list them again; the run is still swept (one `partial=false` pair for whoever is left, or a players-less sweep when nobody is; see D3 below).
- [ ] A teammate still delving keeps their IN_RUN gear untouched.
- [ ] Two-player run, one escapes and one dies later: one grant and one notification per player (character- and notification-service unchanged).
- [ ] `go test ./...` passes in game-service.

## Blocked By

I-GV8WN-4

## Spec Reference

FS-GV8WN §A R1–R5 (escape); user stories 1, 13, 15, 21, 22.

## TDD Approach

- RED: session test: a player reaches the escape door → the fake writer receives one pair naming only them.
- GREEN: settle from `handlePlayerEscape`; the settled set consulted by `endSession`.

## Notes from I-GV8WN-4 (2026-11-03)

- Settle through the service's `settlementWriter` (held and retried until commit), keyed `newSettlementIDs(run, member)`.
- **D3 (open, decide here):** once every member can settle early, the run's end has nobody left and writes a players-less `partial=false` sweep. That sweep can be processed before a member's partial settlement that is still retrying (retry queue, replicas): it releases their gear, and their fenced store and consumed delete then miss, bringing a drunk potion back. The options: the sweep excludes members already settled (an items change, e.g. an `except_members` list), or accept it under ADR-0040's lite residual (it needs a consumer delay, and the R26 counter would show it).
- **Off the tick.** `settlementWriter.settle` makes its first attempt on the caller's goroutine and can block for up to `AttemptTimeout` (5 s). `handlePlayerEscape` runs on the tick, so it must not call `settle` directly. Hand the formatted pair to the writer asynchronously instead, for example a `settleAsync` that goes straight to the held-and-retried path. Don't block the tick.
- "hand it to the session" above now reads "hand it to the service's settlement writer" (D1).

## Implementation notes (2026-11-03, /develop with I-GV8WN-6)

- **D3 → (i)** (Nick): the run's end names the settled (`ItemsExtractedEvent.settled_member_ids = 6`), and items' whole-run release becomes `ReleaseRunExceptTx`, which skips them. When nobody is left, the run's end is a players-less sweep (`sweepMemberKey`) with no match.ended.
- `EventEmitter.PublishSettlement` plus `service.PublishSettlement`: one partial pair under `newSettlementIDs(run, member)`, written through `settlementWriter.settleLater`. Every attempt runs off the caller's goroutine, so the tick never waits.
- Session (`internal/game/settle_on_resolve.go`): `settle(playerID, asDeath)` is once per member (`settled` set). It snapshots through the shared `rawPlayerStateOf`, applies the member's progress to their seat (`ApplyRunProgress`), and places them with `finalPositionLocked`: 1 for an escape, otherwise seats less their fall's order. `endSession` names the settled and marks the rest settled (`settleRemaining`), so returning players home settles nobody again.
- Existing tests rewritten to the new split: a fallen, forfeited, left or removed member now appears in their own settlement, not the run's end. That covers game `consumed_extraction` and `run_progress`, and gameserver `dead_disconnect`, `resolved_disconnect`, `forfeit_run`, `leave_run`, `start_solo` and `run_progress`. The spies embed `settlementLog`.

## Acceptance walk

- Escape writes one pair for that player only, on the escape tick: MET, `TestSettleOnResolve_Escape_SettlesThatPlayerAtOnce` (session) + `TestPublishSettlement_OnePlayer_PartialPairUnderTheirIDs` (pair, partial, ids).
- Village seat at once: MET, the same escape test (progress applied).
- The run's end does not list them again; the run is still swept: MET, `TestSettleOnResolve_RunEnd_OnlyTheUnsettledNamingTheSettled`, `TestPublishMatchComplete_NobodyLeft_SweepOnly`, `TestPublishMatchComplete_SomeSettled_NamesThemOnTheWholeRunEvent`, and items `TestProcessItemsExtracted_WholeRun_SkipsSettledMembers` plus a schema subtest.
- A teammate's IN_RUN gear untouched: MET, items partial tests (slice 2) plus the new schema subtest.
- One grant and one notification per player: MET. `TestSettleOnResolve_EachMemberInExactlyOnePair` runs through the real publisher and counts one match.ended and one items.extracted entry per member. Character and notification are unchanged.
- `go test ./...`: game-service, items-service and common pass. gameserver hit the known flakes I-UNANCHORED-3 and HandoffRefusals once each; both passed on rerun.

## Code review outcome (2026-11-03; Nick: 好, after checking each fix against the intended flow)

- **HIGH fixed: a member was marked settled before their snapshot existed.** `takeSettlementLocked` now snapshots and marks in one step under the world's lock, and a failed snapshot is not marked: the run's end settles that member (FS Edge States).
- **Body read off the tick fixed.** `RemovePlayer` queues settle-and-remove on the tick (`queueIntent`) whenever a tick runs. The body is still in play, so the tick may be writing its experience or health. With no tick running, both happen in place. `go test -race ./internal/game/` is clean.
- **The last in-play member's drop now ends the run through its end rule**, so it is swept. The member is still seated until the tick removes them, so the handler does not shut the run down bare. `TestGraceEnd_LastInPlayMemberEndsTheRunAndSettlesTheKept` passes.
- **Writer:** `drain()` stops admitting new settlements (`draining` plus `mu`), so `held.Add` never races `Wait`. A refused settlement is logged and rolls back.
- **`ApplyRunProgress` kept synchronous** (an in-memory record update under a short lock, no I/O). Its doc comments now say it is called from the tick. Kept synchronous so a Leave right after an escape seats at the new level.
- `asDeath bool` is replaced by `settleEscape` and `settleDeath` (a `takenOut` item picker). `rawPlayerStateOf` takes the held items. `endSession` reads and takes over `settled` in one step (`beginRunEndSettlement`). `extractionScope` gains constructors. The items godoc placement is fixed.
- New tests:
  - escape carries finds;
  - removal loses finds and carries drunk potions;
  - removal on a ticking run happens on the tick;
  - a failed snapshot is left for the run's end;
  - two fall on one tick;
  - each member is in exactly one pair;
  - the writer refuses once draining.
- Four gameserver tests now wait for the tick-applied removal (`awaitRemoved`).
- Correction to the earlier walk: "the run is still swept" was not true for the last member's bare cleanup path before this fix. It is true now.
- Left for domain-model: game-service CONTEXT.md still describes the released escapee and settling, and lacks "settled member" and "sweep".
