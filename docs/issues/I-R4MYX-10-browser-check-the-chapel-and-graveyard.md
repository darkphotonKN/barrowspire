---
id: I-R4MYX-10
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-1, I-R4MYX-2, I-R4MYX-3, I-R4MYX-4, I-R4MYX-5, I-R4MYX-6, I-R4MYX-7, I-R4MYX-8, I-R4MYX-9, I-R4MYX-11, I-R4MYX-12, I-R4MYX-13]
labels: []
title: "FS-R4MYX slice 10: Nick's browser check of the chapel and the graveyard (HITL)"
---
Implements FS-R4MYX §Acceptance Criteria (whole FS), §User Stories 1–26, 31–34

**Lane: HITL (Nick).** No code. Restart game-service and the client (the map size changed).

## Files it expects to touch

- This issue file (ticks) and, on a pass, the FS's status flip and the two thin lines' checkboxes
  by `spec-update`. No code.

## What to Check

- From the square: the chapel lower-left, its door facing down-right, the path leading to it and
  on to the graveyard's gap; the town's old roads and buildings where they were.
- The chapel from outside: weathered stone, the roof, the belfry and its bent cross by the door;
  is the aged tint right, too dark, too green?
- Inside: the roof lifts; the aisle from the door to the altar, three pews a side, the dais, the
  lectern, the two candelabra lit and the room dim; the Confessor behind the altar facing the door;
  four worshippers at the pews facing the altar. Pews and altar solid, the side aisles walkable.
- Talk to all eight; tweak any line in `src/scenes/townLines.ts` (FS-R4MYX R34).
- The graveyard: whole, cracked, leaning and broken stones, the fresh and withered flowers, the
  two mounds, the cross, the dead trees, the broken wall with its gap; the three mourners facing
  their graves. Does it read dark-fantasy enough? Too sparse, too neat?
- The minimap: the chapel solid with its door notched on the east side; the whole town a little
  smaller than before.
- At the new south edge: nothing odd (no hard line through the graveyard, the camera stops well).

### Second look (after I-R4MYX-11 to I-R4MYX-13, the owner's first-look feedback, FS-R4MYX F1–F6)

First look, 2026-11-24: graveyard too close and behind the chapel, too small; NPCs hidden under
houses; the chapel should look like a European church (whiter walls, crosses outside); the inside
cramped; the priest in front of the dais. Folded into FS-R4MYX (provenance note, R39–R42) and
sliced into I-R4MYX-11 to I-R4MYX-13. Restart game-service and the client again (the map grew).

- The graveyard: up-left of the chapel on screen, none of it hidden behind the roof; about twice
  the size; 24 stones, three fresh mounds, two crosses, three dead trees, the gap toward the path.
  Big enough now?
- Walk the town: no townsperson outdoors (the Elder, the mourners, the wanderers; the Woodcutter
  and the Bellringer now in the east field) ever drawn hidden under a building.
- The chapel from outside: whitewashed walls aged with grime and moss, pointed lancet windows,
  buttresses, the slate roof with a rose window and a cross on each gable, the pointed door, the
  wayside cross by the path, the belfry by the door. White enough, European enough, still dark
  fantasy? Is the roof's tint (if kept) right?
- Where the chapel sits: below and a little left of the square now (it moved right so the
  graveyard fits left of it). Acceptable?
- Inside: roomier; long pews, a wide aisle; the Confessor in front of the dais facing the door,
  walked up to from the aisle; the candelabra still the only light.
- Dressing south of the spawn (crates, signpost, the south-west stall and woodpile): any hidden
  behind the bigger chapel's roof that should not be? (R39 covers people and graves only.)
- The minimap: the chapel's notch and the town a little smaller again.

## Acceptance Criteria

- [ ] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-R4MYX-1 to I-R4MYX-9 (first look, done 2026-11-24), I-R4MYX-11 to I-R4MYX-13 (second look)
