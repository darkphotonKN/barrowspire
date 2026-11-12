---
id: I-P0HSP-2
status: open
implements: FS-P0HSP
blocked_by: [I-P0HSP-1]
labels: [blocked]
title: "FS-P0HSP slice 2: the town's map marks: tower, teleport, chest, bag, scroll, lozenge, side by side where they would overlap (game-client)"
---
Implements FS-P0HSP §C

## Files it expects to touch

- `game-client/src/ui/minimap.ts` + `minimap.test.ts`: the new glyph art (tower, teleport, chest, bag,
  scroll, lozenge) beside the run's three, drawn by the same ring-then-ink rects; the side-by-side
  rule for overlapping marks.
- The town plan module from slice 1 + its test: marks from `gates` (in this build), `npcs` by
  `function`, and `HUB_STASH_CHEST`.
- `game-client/src/scenes/HubScene.ts`: hand the plan the npcs and gates each state; the marks redraw
  only when they change.

## What to Build

The town's marks, each a 9 × 9 amber glyph on its 1 px ring at the normal size in every mode: a
tower at the Spire gate, a teleport mark at the Forest and Meadows gates (and the dev test room's in
a dev build), a chest at the stash chest, a bag at the storekeeper (the Quartermaster), a scroll at
the storyteller (the Elder), a lozenge at an NPC with any other function. Nothing for an NPC with no
function, the Inn, the Smithy, the mailbox, the market or dressing. Where two marks' boxes would
overlap (the stash chest and the Quartermaster), they stand side by side in the table's order, 1 px
apart, centred on their seats' mean, inside the rim.

## Acceptance Criteria

- [ ] FS-P0HSP §Acceptance Criteria: the town's marks (which, where, glyph, ring, contrast, whole px,
      inside the rim, the six glyphs distinct), the side-by-side rule at normal and enlarged size and
      on the overlay's scale.
- [ ] Marks redraw only on a change of the marks, not as the player walks (counted).
- [ ] The run's three glyphs unchanged px for px (the run's tests pass as written).
- [ ] Typecheck, lint and the full vitest suite pass.

## Blocked By

I-P0HSP-1

## Spec Reference

FS-P0HSP §C.14, §C.15, §C.17–§C.20; User Stories 3–8.

## TDD Approach

- RED: a hub state with the three gates, the Elder, the Quartermaster and an ambient NPC yields a
  tower, two teleports, a scroll, a bag and a chest, and nothing for the ambient NPC; the chest and
  the bag, 5 × 4 px apart on the normal map, are seated 10 px apart on one row.
- GREEN: the marks in the plan, then the glyph art and the side-by-side seating.
