---
id: I-QPDKN-5
status: open
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN slice 5: resolved delvers survive a disconnect until the run settles"
---
Implements FS-QPDKN §Requirements 18–20

**Author: human (hand-coded, human lane). Agent: tests only.**

## What to Build

Today a member whose connection drops past its reconnect grace is deleted from `s.players` and
their body is removed from their world (`cleanUpPlayerCompletely` → `releaseDeparted` →
`leaveCurrentWorld`). For a **resolved** member of a run (dead, escaped, or left behind) that
loses their settlement: an escaped member's plunder never reaches `items.extracted`, a dead
member drops out of `match.ended`. Keep them until the run ends.

- **Grace end, resolved member of a run:** keep the record and the body. Do not delete from
  `s.players`, do not `RemovePlayer` from the run. The connection is already unmapped; they
  receive nothing until they reconnect.
- **Grace end, member in play:** unchanged (removed from the run; last one out shuts it down).
- **Grace end, member in the hub:** unchanged.
- **Reconnect before run end:** the ordinary reconnect path finds `CurrentGameSessionId`
  naming the run and announces it (`announceCurrentWorld`); they are back in the run, out of
  play, receiving state. If `leave_run` (I-QPDKN-3) has landed, a dead member may leave from
  there.
- **Run end:** after settlement and the return (`ReturnPlayersToHub`), delete the records of
  members who are still disconnected. A kept record whose member never came back must not
  outlive the run. Where this runs (the end path, or `CloseSession`) is yours; it must not
  delete a record whose member reconnected meanwhile.
- **The race** (FS-QPDKN §Edge States "Disconnects", [OD]): the run ends before the grace ends.
  The end path moves the member home (their record names the run, so R22 applies) and the hub
  seats a body for them. The grace timer then fires and finds a record naming the **hub**. It
  must not remove that hub body on the strength of a drop that happened in the run. Simplest:
  the grace cleanup treats "resolved in a run at the time of the drop" as kept (R19), and the
  run end's deletion handles records of members still disconnected. Pick one rule and test the
  race explicitly.
- A dead member disconnecting **after** having left early (I-QPDKN-3) is a hub member; unchanged.

## Acceptance Criteria

- [ ] An escaped member who drops past the grace keeps their body and record; the run-end
      `items.extracted` includes their plunder and `match.ended` has them as escaped; their
      record is gone after run end.
- [ ] A dead member who drops past the grace is in `match.ended` with their elimination position.
- [ ] A resolved member who reconnects before run end is announced the run and receives state.
- [ ] A resolved member who reconnects after run end connects fresh, in no run.
- [ ] A member in play who drops past the grace is removed from the run (unchanged).
- [ ] A hub member who drops past the grace is removed from the hub (unchanged).
- [ ] Run ends before the grace ends: the member is in the hub afterwards with one body, and
      the late grace timer removes nothing.
- [ ] The last in-play member dropping past the grace ends the run and settles the kept
      resolved members.
- [ ] `go test -race ./internal/...` green; `golangci-lint run` clean.

## Blocked By

None. Shares `handler.go` / `server.go` with I-QPDKN-3; both human lane, land one before
starting the other.

## Spec Reference

FS-QPDKN §Requirements 18 (the disconnect half), 19, 20; §User Stories 7, 18, 19, 20, 22, 25;
§Edge States "Disconnects".

## TDD Approach (agent writes these, red first, then hands over)

- RED (gameserver): `TestGraceEnd_KeepsResolvedRunMember`,
  `TestGraceEnd_RemovesInPlayMember` (pins today's behavior),
  `TestRunEnd_SettlesKeptMemberAndDeletesRecord`, `TestReconnect_BeforeRunEnd_LandsInRun`,
  `TestRunEndsBeforeGrace_LateTimerRemovesNothing`.
- GREEN: the resolved check in `cleanUpPlayerCompletely`, the run-end deletion, the race rule.
