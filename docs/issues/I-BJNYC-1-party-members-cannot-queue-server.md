---
id: I-BJNYC-1
status: open
implements: FS-BJNYC
blocked_by: []
labels: [ready-for-agent]
title: "FS-BJNYC slice 1: find_game from a party member is refused \"Your party enters together.\" (game-service)"
---
Implements FS-BJNYC §Requirements R1

**Lane: human (HITL) — authorised by charter 2026-11-02.** `/develop` may run this slice.
Ships alone, first, before any other FS-BJNYC slice (charter default 1). The client already shows a
refused `find_game` in the server's words (`spireRefusalCopy`), so this slice is user-visible on its
own.

## What to Build

- In the hub's `find_game` case, after the no-character refusal and after an already-delving player
  is resumed (`handlePlayerExistingGame`), and **before** the Spire-gate check: a player who is in a
  party is refused with `h.refuse(conn, action, "Your party enters together.")` and never reaches
  the gear check or the queue.
- Membership is read from the pod's **party cache** on the hub loop (no Redis call), through a
  narrow method the hub owns on its consumer interface (e.g. `inParty(playerID) bool` on
  `partyKeeper`, or a separate one-method interface), implemented by the party registry from the
  cache's `memberOf`.
- `start_solo` is **not** touched here (R2 ships with party entry, I-BJNYC-3).
- A player in no party queues exactly as today.

## Acceptance Criteria

- [ ] A party member's `find_game` is answered with the refusal "Your party enters together." and the player is not queued (`AddPlayer` never called; no gear read).
- [ ] Order under a table test: no character → no-character refusal; already in a run → resumed; party member → party refusal; not at the gate → gate refusal.
- [ ] A player in no party at the gate is queued as before.
- [ ] A party of just the leader is refused too (it is a party).
- [ ] The check makes no Redis call on the loop.
- [ ] `go test ./... -race` on the touched packages green; lint fence passes.

## Blocked By

None

## Spec Reference

FS-BJNYC §Requirements R1; §User Stories 13, 24; §Acceptance Criteria row 1; §Edge States (stale party cache on a just-joined member).

## Files expected to touch (game-server/game-service)

- `internal/gameserver/hub.go` (the `find_game` case ~L424; the refusal constant beside `startSoloQueued`; the consumer interface)
- `internal/gameserver/party_cache.go` and/or `internal/gameserver/party.go` (the membership query). **Collision:** I-NCC9J-9 is editing `party.go` now; prefer `party_cache.go` or a new small file.
- Tests: `internal/gameserver/hub_routing_test.go` or `spire_gate_test.go` (or a new `party_entry_test.go`)

## TDD Approach

- RED: a party member at the Spire gate sends `find_game`; expect the refusal and no queue entry.
- GREEN: the membership query on the hub's interface and the guard in the `find_game` case.
