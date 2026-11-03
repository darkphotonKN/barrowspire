---
id: I-NV54P-2
status: done
implements: FS-NV54P
blocked_by: [I-NV54P-1]
labels: []
title: "FS-NV54P slice 2: A bag ring compares with both worn rings (game-client)"
---
Implements FS-NV54P §B R8, R10, §C R14, §D R17–R19

The user's ring rule on top of slice 1's compare row: a ring is compared with `ring_1` and
`ring_2`, each worn ring its own captioned tip, and the three-tip row kept on screen.

## What to Build

- A bag ring under Shift compares with both ring slots (R8, via `getValidSlotsForItem`): one worn
  tip per ring slot that holds a ring, in slot order, `ring_1` before `ring_2` (R10, R17).
- Captions "Worn · Ring 1" and "Worn · Ring 2" (R14), in slice 1's caption style; one ring worn →
  only that ring's tip, with its own caption; no ring worn → the hovered tip alone.
- The three-tip row (hovered + two worn) through slice 1's placement: flips whole near the right
  edge, pushed in from the right where neither side fits, left edge kept on a screen narrower than
  the row (R18–R19, edge state "Both rings worn, ring hovered near the right edge").
- Expected to be data and tests on slice 1's machinery; if slice 1 already covers rings through
  `getValidSlotsForItem`, this slice is the captions and the tests that pin the ring cases.

## Acceptance Criteria

- [ ] Both rings worn, a bag ring hovered with Shift: two worn tips, "Worn · Ring 1" then "Worn · Ring 2", after the hovered tip.
- [ ] Only `ring_2` worn: one worn tip captioned "Worn · Ring 2" (likewise for `ring_1` alone).
- [ ] No ring worn: the hovered ring's tip alone.
- [ ] Three-tip row placement cases (right of pointer, flipped, pushed in, narrow screen) keep every tip on screen per R19, left edge winning.
- [ ] Shift over a worn ring slot adds nothing.
- [ ] Tests pass (vitest, next to the code); typecheck and lint clean.

## Blocked By

I-NV54P-1 (the Shift trigger, the caption option, the tip row and its placement).

## Spec Reference

FS-NV54P §B R8 (ring → both ring slots), R10 (empty ring slot contributes nothing), §C R14 (ring
captions), §D R17–R19 (slot order, three-tip row on screen); User Stories 2–3; Edge State "Both
rings worn, ring hovered near the right edge".

Files expected: `game-client/src/ui/GearOverlay.ts`, `game-client/src/ui/GearOverlay.test.ts`,
`game-client/src/ui/gearOverlayLayout.test.ts`.

## TDD Approach

- RED: hover a bag ring with both rings worn and Shift down; expect "WORN · RING 1" and
  "WORN · RING 2" captions and both worn rings' names, in that order left to right.
- GREEN: caption by target slot (`ring_1` → "Worn · Ring 1", `ring_2` → "Worn · Ring 2", else
  "Worn").
