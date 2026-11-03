---
id: I-QPDKN-10
status: done
implements: FS-QPDKN
blocked_by: [I-QPDKN-9]
labels: [ready-for-agent]
title: "FS-QPDKN slice 10: a settling player can't enter any world that takes their gear"
---
Implements FS-QPDKN §Requirements 32–36, §WebSocket message surface (charter addendum 2026-11-03)

**Author: agent (charter "死亡斷線視同離開" addendum, Nick approved 2026-11-03).** game-service is
the owner's hand-coded learning surface: match its style exactly.

## What to Build

When the run's pod releases an escaped delver (I-QPDKN-9), it marks them **settling**. Every pod
then refuses that player any entry that checks out their gear, until the run settles. Reason:
their plunder lands in their BAG at settlement (items-service `storeExtractedPlayerItems` →
`LocationBag`), so the bag must not be checked out into another world meanwhile (FS-18Z5F).

- A small Redis wrapper on the pod's existing go-redis client, following `internal/partypresence`:
  - `Mark(playerID)` writes `settling:<playerID>` with TTL 90 s;
  - a refresh, every 30 s while the run lives, for the run's released set;
  - `Clear(playerID)` deletes it;
  - `Settling(playerID) (bool, error)` reads it.
  Consumer-owned interfaces at the call sites; inject it through the server's options like the
  presence index.
- Write the mark at I-QPDKN-9's release call site. A write failure logs a Warn and does not block.
- Delete the marks of a run's released members when the run ends, after its settlement events are
  written. A delete failure is left to the TTL.
- Entry guards (each on its existing refusal path):
  - `find_game` and `start_solo` (hub.go): the text "Your plunder is still being counted. Wait for
    the delve to end."
  - Field entry (`Server.EnterField` / `fieldRefusal`): reason `settling` and the same text.
  - Party instance entry (FS-BJNYC, party_entry.go): refused if ANY member is settling, with a new
    `party_notice` code `settling` (common/constants) to the one who pressed.
- An unreadable mark lets the entry go ahead, with a Warn (R35). Dead, living and
  reconnected-in-grace players are never marked (R36).

## Acceptance Criteria

- [ ] While `settling:<playerID>` exists, their `find_game` and `start_solo` are refused with the
      settling text, and they are not queued or seated.
- [ ] While it exists, their field entry is refused with reason `settling` and the same text.
- [ ] While any member of a pre-formed party is settling, the party's instance entry is refused
      with `party_notice` `settling` to the presser.
- [ ] The check holds on every pod: a settling player on another pod is refused there too (a
      two-pod test on miniredis).
- [ ] When the run ends and its settlement events are written, the key is deleted, and the same
      player's `find_game` then queues them.
- [ ] The run's pod refreshes the key while the run lives. Without a refresh it lapses after its
      TTL (90 s).
- [ ] A Redis read failure lets the entry go ahead with a Warn; a write failure logs a Warn.
- [ ] A dead delver's drop (I-QPDKN-8) never marks anyone.
- [ ] Tests pass (`go test ./...` in game-service); no new `-race` reports in touched code.

## Blocked By

I-QPDKN-9 (the release call site the mark hooks into)

## Spec Reference

FS-QPDKN §Requirements 32–36, §WebSocket message surface (settling text, field reason, party
notice code); stories 34–37; §Acceptance Criteria "Settling"; §Edge States "Settling".

## TDD Approach

- RED: mark a player settling, send `find_game`, and assert the refusal text and no queue entry.
- RED: on two pods sharing miniredis, mark the player on pod A and refuse their field entry on pod B.
- GREEN: the wrapper plus the four guards; the mark and the clear at release and at run end.
