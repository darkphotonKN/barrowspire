---
id: I-QPDKN-8
status: done
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN slice 8: a dead delver's disconnect is a leave"
---
Implements FS-QPDKN §Requirements 25–28 (amended 2026-11-03; also the R12/R18/R19 amendment notes)

**Author: agent (charter "死亡斷線視同離開", Nick approved 2026-11-03).** game-service is
the owner's hand-coded learning surface: match its style exactly.

## What to Build

Nick's rule: "他斷線就當他按下離開了". When a **dead** delver's connection closes, the server
runs the existing leave path (`Server.LeaveRun`, R13/R14) at once, instead of holding them in
the run for the reconnect grace (R19, which now covers escaped delvers only).

- **Where:** `internal/gameserver/handler.go`, `handleReadError`. Every close lands there:
  - the normal-close branch (code 1000, which goes to `cleanUpClient`);
  - the going-away and abnormal branches (which go to `holdForReconnect` and the grace).

  For a member whose record names a run in which the run would let them leave (dead, or left
  behind, not escaped, not in play: exactly what `Session.Depart` accepts), call the same
  `LeaveRun` the `leave_run` action uses, *before* the existing branch runs. Then:
  - **Normal close (1000):** the record now names the hub, so `cleanUpClient` →
    `releaseDeparted` → `leaveCurrentWorld` removes their **hub** body, not the run body. The
    run keeps the body for settlement (R18). Today this branch removes the run body, so a dead
    delver's normal close dropped them from settlement. This slice fixes that for dead delvers.
  - **Going-away or abnormal:** hold them for the hub grace as any hub member (record names the
    hub, `ConnectState` reconnecting). Grace end deletes the record and removes the hub body. A
    reconnect within the grace is announced the hub (`announceCurrentWorld`).
- **Refused leave (R26):** if `LeaveRun` refuses (still in play, escaped, no run,
  `errHubMissing`), fall through to today's handling unchanged. Log `errHubMissing` at Warn;
  the others are expected and quiet.
- **Idempotent with `leave_run` (R27):** a `leave_run` that arrives after the drop finds the
  record naming the hub and is refused as today (not in a run). Make sure no error reply is
  written to the closed connection, and that a drop after a `leave_run` simply sees a hub member.
- **Order with the party hook:** `parties.dropped` (FS-BJNYC R17, leader hand-off) must see the
  world the member was in when they dropped. Keep it reading the run for a dead member who drops,
  or prove the hand-off still happens. Note: on the unmerged `feat/party-auto-match` branch,
  `LeaveRun` also triggers the matched-party leave (FS-988SM). Don't add that here (R28).
- **Unchanged:** `LeaveRun` itself, `Session.Depart`, settlement (`items.extracted`,
  `match.ended`, run progress), the escaped rule (R19), the in-play rule (R20), and the client.

## Acceptance Criteria

- [ ] A dead delver whose connection drops (abnormal close) is marked departed in the run at
      once, their body stays in the run's entities, and their record names the hub. No
      run-side grace hold or `awaitingSettlement` entry is made for them.
- [ ] The same for a going-away close (1001) and for a normal close (1000). After the normal
      close, the run body is still present and the hub body is gone.
- [ ] At run end, that delver is in `match.ended` with their elimination position and in run
      progress with their experience, the same as a `leave_run` leaver (FS-QPDKN R23).
- [ ] A dead delver who reconnects before the run ends is sent `world_entered` with
      `world_type: "hub"` and receives no run state or `end_game`.
- [ ] A dead delver who reconnects after the hub grace is a fresh connect in the hub.
- [ ] `leave_run` then drop, and drop then `leave_run`: one departure, one hub body, no write to
      a closed connection, no panic.
- [ ] A delver left behind on a lower floor (FS-F6F88) is treated as dead by this rule.
- [ ] An escaped delver's drop is unchanged: kept for settlement past the grace, and a reconnect
      before run end returns them to the run (existing I-QPDKN-5 tests stay green).
- [ ] A living delver's drop is unchanged: grace, then removed (existing tests stay green).
- [ ] A dead party leader who drops in a party run still hands the lead on (FS-BJNYC R17).
- [ ] Tests pass. No new `-race` reports in code this slice touches. The ~60 pre-existing
      serializer and writer reports are known.

## Blocked By

None

## Spec Reference

FS-QPDKN §Requirements 25–28. Also the 2026-11-03 amendments to R12, R18 and R19, stories
18 and 26–30, the "A dead delver's disconnect is a leave" acceptance criteria, and the Edge
States under "A dead delver's disconnect".

## TDD Approach

- RED: a two-delver run test. Kill delver A, then close A's connection abnormally. Assert A's
  record names the hub and A's body is still in the run. Today it fails: A is held in the run
  and kept for settlement.
- RED: the same with a normal close. Assert the run body survives. Today it fails:
  `cleanUpClient` removes it.
- GREEN: in `handleReadError`, try `LeaveRun` for a member whose run would let them depart,
  before the existing branches.
- Files: `internal/gameserver/handler.go` (`handleReadError`, `cleanUpClient` and
  `holdForReconnect` interplay), `internal/gameserver/server.go` (`LeaveRun`, read only), plus
  tests next to the existing disconnect and QPDKN tests in `internal/gameserver`.
