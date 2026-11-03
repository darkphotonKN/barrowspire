---
id: I-QPDKN-9
status: done
implements: FS-QPDKN
blocked_by: [I-QPDKN-8]
labels: [ready-for-agent]
title: "FS-QPDKN slice 9: an escaped delver who can't come back is released, body kept"
---
Implements FS-QPDKN §Requirements 29–31 (charter addendum 2026-11-03; also the R12/R18/R19/R22/R26 amendment notes)

**Author: agent (charter "死亡斷線視同離開" addendum, Nick approved 2026-11-03: "逃出的人不能離開 是因為斷線被退出隊伍才不得已回村莊的").**
game-service is the owner's hand-coded learning surface: match its style exactly.

## What to Build

An escaped delver who can no longer come back is **released**: when their reconnect grace runs
out (30 s, or 10 s after a going-away close), or at once on a normal close (code 1000). Released
means that the run marks them departed and **keeps their body**, so its end settles their plunder and
experience (R18, R23). Their player record leaves the run, removed as a dropped hub member's is
once their grace ends, so any later connect is fresh and lands in the village. Inside the grace,
nothing changes: a reconnect returns them to the run to watch (R30).

- Session side (`internal/game/session.go`): add a release path beside `Depart` that accepts an
  ESCAPED delver only. `Depart` itself keeps refusing escaped (`ErrEscapedWaits`, R14), and
  `leave_run` from an escaped delver stays refused.
- Grace expiry (`cleanUpPlayerCompletely` in `internal/gameserver/handler.go`): an escaped run
  member is released instead of kept (`awaitingSettlement`). R19 now applies to nobody. If
  `awaitingSettlement` / `forgetIfAwaitingSettlement` become unused for every path, retire them.
- Normal close (`cleanUpClient`): for a record naming a run in which they are escaped, release
  them (body kept) instead of `releaseDeparted` → `leaveCurrentWorld`, which today removes the run
  body and loses the settlement. **This fixes the plunder-loss bug.**
- Leave I-QPDKN-8's dead-delver path (`leaveRunOnDrop`) exactly as it is.
- The release must be visible to whatever hangs off leaving a run (FS-988SM's matched-party
  hook lives on another branch; no dependency). Pre-formed party membership is unchanged
  (ADR-0035).
- Marking the player settling is I-QPDKN-10. Leave one clear call site where the release
  happens so I-10 can hook the mark in.

## Acceptance Criteria

- [ ] An escaped delver whose grace runs out is released: the run marks them departed and keeps
      their body; their player record no longer names the run.
- [ ] An escaped delver's normal close (1000) releases them at once. Their body is still in the
      run's entities afterwards, and the run-end `items.extracted` carries their plunder (pins
      the old bug).
- [ ] A released escaped delver appears in the run-end `match.ended` and run progress exactly as
      if they had stayed.
- [ ] A released escaped delver who connects again before the run ends lands in the village
      (`world_entered` hub) and receives no run state.
- [ ] An escaped delver who reconnects inside their grace is announced the run and receives state
      again.
- [ ] An escaped delver's `leave_run` is still refused.
- [ ] Dead (I-QPDKN-8) and living (R20) drops are unchanged; pinned.
- [ ] The run ends inside an escaped delver's grace: they are settled and taken home as today;
      the expiry then releases nothing.
- [ ] Tests pass (`go test ./...` in game-service); no new `-race` reports in touched code.

## Blocked By

I-QPDKN-8 (the same disconnect code in handler.go; build on `leaveRunOnDrop`)

## Spec Reference

FS-QPDKN §Requirements 29–31; amended R12, R18, R19, R22, R26; stories 18, 29, 31–33; §Acceptance
Criteria "An escaped delver who can't come back is released"; §Edge States "Releasing an
escaped delver".

## TDD Approach

- RED: an escaped delver closes with code 1000; assert their body is still in the run's
  entities and the run-end extraction carries their plunder (fails today: the body is removed).
- RED: an escaped delver's grace expires; assert the record no longer names the run, the body
  stays, and a fresh connect lands in the hub.
- GREEN: a session release for escaped, called from the grace expiry and the normal close.
