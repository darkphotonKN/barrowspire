---
id: I-BJNYC-7
status: done
implements: FS-BJNYC
blocked_by: [I-BJNYC-3]
labels: [ready-for-agent]
title: "FS-BJNYC slice 7: the leader dropping inside the party's run passes the lead to the earliest-joined member at once (game-service)"
---
Implements FS-BJNYC §Requirements R16, R17

**Lane: human (HITL) — authorised by charter 2026-11-02.** `/develop` may run this slice.

## What to Build

- When the leader's connection drops while they are in their party's run (the run record from
  I-BJNYC-3), the earliest-joined other member becomes leader **at once**, by the existing transfer
  script, not after the reconnect grace and not after FS-NCC9J's away timeout. Every member is told
  as for any leader change.
- The reconnect grace is otherwise unchanged: the old leader keeps their seat for the grace and,
  reconnecting within it, comes back as a member.
- A party of one has nobody to pass to: nothing happens beyond the grace.
- Not affected by the instance lock (succession is never refused).

## Acceptance Criteria

- [ ] Leader drops in the party's run → the earliest-joined other member is leader immediately; every member gets the update.
- [ ] Every other member also disconnected → the earliest-joined other member still takes the lead.
- [ ] Old leader reconnects within the grace → seated back in the run as a member.
- [ ] Party of one → no transfer; grace as today.
- [ ] A leader dropping outside a party run (town, field) → FS-NCC9J's rules, unchanged.
- [ ] Works while the lock (I-BJNYC-6) is in force, if that slice has landed.
- [ ] `go test ./... -race` on the touched packages green; lint fence passes.

## Blocked By

I-BJNYC-3 (the run's party record).

## Spec Reference

FS-BJNYC §Requirements R16, R17; §User Stories 20, 21; §Acceptance Criteria row 14; §Edge States (party of one, everyone else disconnected).

## Files expected to touch (game-server/game-service)

- `internal/gameserver/handler.go` (the drop path ~L300–345, which starts the grace)
- `internal/gameserver/party_entry.go` (who led the party's run; pick the earliest-joined successor)
- `internal/gameserver/party.go` (call the transfer through the registry's async path). **Collision:** I-NCC9J-9 is editing it now.
- Tests: `internal/gameserver/party_entry_test.go`, `reconnect_test.go`

## TDD Approach

- RED: two-member party in its run; the leader's connection drops; expect the other member leader before the grace ends.
- GREEN: drop hook → registry transfer to the earliest-joined member.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Open for Nick: a leader who left the run early and drops in the town keeps the lead; a normal close (1000) in the run is a leave, not a drop.
