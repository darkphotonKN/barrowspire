---
id: I-XK2B6-5
status: open
implements: FS-XK2B6
blocked_by: [I-XK2B6-2, I-XK2B6-3, I-XK2B6-4]
labels: [blocked]
title: "FS-XK2B6 slice 5: browser check of the walls on the cell boundary (Nick)"
---
Implements FS-XK2B6 §Acceptance Criteria (By eye), §Open to the owner

**Lane: human (HITL).** No code. The owner looks, and rules on E1, E2 and E3.

## What to Build

Nothing. Play a dungeon floor.

## Acceptance Criteria

- [ ] Walking into a north, south, west and east wall of a room, the body stops at the wall.
- [ ] A doorway looks one cell wide, and walking straight at it goes through.
- [ ] Corners close with one post and nothing sticking out, on outer and inner corners.
- [ ] Past every wall is ink: no floor strip, no lit patch, no fog hanging off a wall.
- [ ] Entering a room, its walls stand whole and the next room's fog ends at its own walls.
- [ ] E1, the cell between a corridor and the room it runs beside, and the corners where the
      outline steps: the full wall there hides who stands behind it. Keep, or draw it low.
- [ ] E2, standing against a south and an east wall: the low wall covers the feet and anything
      lying within about 44 px of that edge. Accepted, or not.
- [ ] E3, the same place: whether the body is drawn over the low wall. Keep today's order, or
      sort an edge piece by its footprint's front corner.
- [ ] The middle of a two-sided wall cell as plain void (R7): fine, or wants art.
- [ ] The village, a field and the Inn look as before.

## Blocked By

I-XK2B6-2, I-XK2B6-3, I-XK2B6-4.

## Spec Reference

FS-XK2B6 Acceptance Criteria "By eye"; Open to the owner E1-E3; R7; user stories 15, 16.
