---
id: I-XK2B6-5
status: open
implements: FS-XK2B6
blocked_by: [I-XK2B6-2, I-XK2B6-3, I-XK2B6-4]
labels: [blocked]
title: "FS-XK2B6 slice 5: browser check of the walls on the cell boundary (Nick)"
---
Implements FS-XK2B6 §Acceptance Criteria (By eye), §The owner's rulings

**Lane: human (HITL).** No code. The owner looks. E1, E2 and E3 were ruled on 2026-11-11 (FS-XK2B6
*The owner's rulings*, ADR-0074) and are built; what is left of them here is to see them, and E2's
second look.

## What to Build

Nothing. Play a dungeon floor.

## Acceptance Criteria

- [ ] Walking into a north, south, west and east wall of a room, the body stops at the wall.
- [ ] A doorway looks one cell wide, and walking straight at it goes through.
- [ ] Corners close with one post and nothing sticking out, on outer and inner corners.
- [ ] Past every wall is ink: no floor strip, no lit patch, no fog hanging off a wall.
- [ ] Entering a room, its walls stand whole and the next room's fog ends at its own walls.
- [ ] E1, the cell between a corridor and the room it runs beside, and the corners where the
      outline steps: both walls are low, and nobody standing there is hidden.
- [ ] E1, where a straight wall drops from full height to low: a post stands at the change and it
      reads as one wall.
- [ ] E3, standing against a south and an east wall: the body is drawn behind the low wall.
      Against a north and a west wall it is drawn in front, as before.
- [ ] E2, the same place: the low wall covers the feet and anything lying within about 44 px of
      that edge. Accepted for v1; decide here whether anything changes.
- [ ] The middle of a two-sided wall cell as plain void (R7): fine, or wants art.
- [ ] The village, a field and the Inn look as before.

## Blocked By

I-XK2B6-2, I-XK2B6-3, I-XK2B6-4.

## Spec Reference

FS-XK2B6 Acceptance Criteria "By eye"; The owner's rulings E1-E3; R7; user stories 15, 16, 20, 21.
