---
id: I-BJNYC-6
status: open
implements: FS-BJNYC
blocked_by: [I-BJNYC-3]
labels: [ready-for-agent]
title: "FS-BJNYC slice 6: leave, kick and transfer refused locked while the party is in its run (game-service)"
---
Implements FS-BJNYC §Requirements R19

**Lane: human (HITL) — authorised by charter 2026-11-02.** `/develop` may run this slice.
Nick: "在副本不能退出 除非斷線脫離就當他死了 隊長也不能踢人". ADR-0035.

## What to Build

- The registry's `locked(ctx, p)` seam (false today) answers from the pod's record of the party's
  run (I-BJNYC-3, R14): true from the moment the party-entry run starts until that run ends.
- `party_leave`, `party_kick`, `party_transfer` from any member are then refused `locked`
  (existing code and copy), including from a member who left the run early and stands in the town.
- The record is released when the run ends; afterwards the actions work again.
- `party_enter` from a leader whose party is still in its run is refused `locked` (R5.3), through
  the same seam.
- Succession is never refused by the lock (that is I-BJNYC-7).

## Acceptance Criteria

- [ ] During the party's run, `party_leave`, `party_kick` and `party_transfer` are refused `locked`, for members inside the run and for one back in the town early.
- [ ] After the run ends, all three work again.
- [ ] A party not in a run is unaffected (today's behaviour).
- [ ] `party_enter` during the party's run is refused `locked`.
- [ ] No Redis change; the lock reads pod memory only.
- [ ] `go test ./... -race` on the touched packages green; lint fence passes.

## Blocked By

I-BJNYC-3 (the run's party record).

## Spec Reference

FS-BJNYC §Requirements R19, R5.3; §User Stories 18, 19, 25; §Acceptance Criteria row 13; §Edge States (member who left early, pod stops during the run, member reconnects to another pod).

## Files expected to touch (game-server/game-service)

- `internal/gameserver/party.go` (`locked`, ~L706). **Collision:** I-NCC9J-9 is editing it now.
- `internal/gameserver/party_entry.go` (the run record and its release)
- `internal/gameserver/server.go` (the run-end hook that releases the record)
- Tests: `internal/gameserver/party_test.go` / `party_entry_test.go`

## TDD Approach

- RED: a party in its run; each of leave/kick/transfer is refused `locked`.
- GREEN: `locked` reads the run record; release on run end.
