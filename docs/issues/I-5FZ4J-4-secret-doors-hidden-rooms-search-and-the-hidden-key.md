---
id: I-5FZ4J-4
status: done
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-3]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 4: secret doors, hidden rooms, search, the floor map's omission and re-send, and the Hidden Key seal"
---
Implements FS-5FZ4J §E R32, §F R35–R39, §I R46 (secret_door barriers, shrine and stair_key pieces), R49, R50

**Hotspot:** `session.go`, the timed open (`systems/timed_open.go`, `game/timed_open.go`), the
serializer and `floor_map.go`. One writer at a time.

## What to Build

- The game draws R35's hidden-room count per floor band and asks the layout for them (plus the
  Hidden Key's and, in slice 7, the altar's). Secret doors are barriers over the layout's door
  cells, shut, blocking bodies and monster paths.
- **Detection** (R38, the same rule as traps' R30): within 2 cells of an in-play delver → detected
  for the run; never serialized before. Build the detection so traps (slice 5) reuse it.
- **Search**: the FS-MQYEX timed open generalised to a target kind (`search`, and `pray` for
  slice 7): 2 s, the same cancel rules, one per player, first to finish opens the door for
  everyone. `current_player.timed_open` gains `target_kind` (R49). `door_open` refusal.
- **The floor map** omits unopened hidden rooms' regions and the secret door cells (cut from their
  corridor segment's rects) (R37, R50); opening a door republishes it and sends it to every member.
- **Contents** (R39): a better chest (one rarity step up from a chest's roll, capped), or a lore
  shrine (`shrine` reply), no monsters in hidden rooms, no other containers there.
- **The Hidden Key** kind joins the draw (R32): the key in its own hidden room, taking it (`key_carried`, an ambush), the gate interact with the key breaking the seal.

## Acceptance Criteria

- [ ] An undetected secret door is in no state; within 2 cells it is in every member's `barriers`.
- [ ] A 2 s search opens the door; moving or a hit cancels it; two searchers, the first finish wins.
- [ ] The floor map omits the room and the door cells before, includes them after, and is re-sent on the opening tick.
- [ ] A better chest's roll is one rarity step up (test with a fixed roll); a shrine replies `shrine`.
- [ ] Hidden Key: taking the key sets `key_carried` and wakes an ambush; the gate with the key breaks the seal and opens.
- [ ] Hidden room counts per band over a seed sweep.
- [ ] `make test` and `make check` green.

## Blocked By

I-5FZ4J-3.

## Spec Reference

FS-5FZ4J §E R32, §F R35–R39, §I R46, R49, R50.

## TDD Approach

- RED: a state frame for a delver 3 cells from a secret door has no `secret_door` barrier; at 2 cells it has one.
- GREEN: the detection set + serializer filter.
