---
id: I-3QHQZ-7
status: open
implements: FS-3QHQZ
blocked_by: [I-3QHQZ-5, I-X2F2H-1]
labels: [ready-for-agent, blocked]
title: "FS-3QHQZ slice 7: the forest world theme in the field scene (tree stands from server walls, ground, ambient, mist, dressing)"
---
Implements FS-3QHQZ §C (Requirements 22–28)

Agent lane. **Also blocked by FS-X2F2H's client field world scene issue**: the slice that adds
`"field"` to `WorldKind`, carries the field identity on the wire, and draws a field world. Id not
minted yet; add it once FS-X2F2H is sliced. This issue only adds the forest's look to that scene.
Not blocked by the server slices: it consumes `walls[]` as it exists today and is tested against
fixtures.

## Files expected to touch

- `game-client/src/render/world/worldTheme.ts` and its test: `WorldTheme` gains `"forest"`; its
  `WorldThemeLook` entry (no roofs, no indoor mask, no perimeter, forest dressing, forest
  ambient, walls drawn as tree stands).
- `game-client/src/render/world/treeStands.ts` (new) and `treeStands.test.ts`: pure planting of a
  stand per wall rect (about one tree per 80 px cell, jittered, edge trees first, picks hashed
  from rect and world seed, two live to one dead, 400-sprite cap).
- `game-client/src/render/world/ground.ts` and its test: trail dirt on open ground, leaf litter
  under stands, from the exterior ground family.
- `game-client/src/render/lighting/lighting.ts` and its test: a forest ambient between
  `AMBIENT.hub` and `AMBIENT.run`, from `BARROW_HEX`.
- `game-client/src/render/effects/mist.ts` (new) and its test: a drifting low mist overlay,
  static under `prefers-reduced-motion`.
- `game-client/src/render/world/runDressing.ts` and its test, or a sibling `forestDressing.ts`:
  the forest's dressing lean, placed outside the keep-out computed from the broadcast.
- `game-client/src/render/world/scene.ts` and FS-X2F2H's field scene file: select the forest
  theme from the field identity; skip wall pieces for the tree-stand theme; register trees as
  occluders.

## What to Build

When the server says the player is in the Forest field, draw it with the `"forest"` world theme:
every server wall rect becomes a tree stand covering exactly its footprint (what blocks is what
is drawn), the ground is trail dirt and leaf litter, the light is dim but not dark, mist drifts
low, and ferns, stumps, logs and toadstools are strewn off the keep-out. Missing tree sheets fall
back to the existing baked oak and pine.

## Acceptance Criteria

- [ ] The `"forest"` theme is selected only for the Forest field; hub, runs and the Meadows unchanged (existing tests green).
- [ ] Every wall rect is drawn as a tree stand covering its footprint; no wall pieces and no perimeter in the Forest.
- [ ] Stand planting is pure: the same `walls[]` and seed give identical output; tested.
- [ ] ≤ 400 tree sprites for a ≤ 120-rect fixture filling 2 080 × 1 360; huge stands thin their interior first.
- [ ] Live to dead ≈ 2 : 1 across a fixture; trees are occluders.
- [ ] The forest ambient's luminance lies strictly between the hub's and a run's; `BARROW_HEX` only; lint fence green.
- [ ] Mist draws above the ground and below markers; static under reduced motion.
- [ ] Dressing is never inside the keep-out, never interactive, never colliding.
- [ ] Missing tree sheets fall back to `tree_oak` / `tree_pine` without error.
- [ ] Client tests, `tsc` and lint green.

## Blocked By

- I-3QHQZ-5 (tree and dressing sheets)
- FS-X2F2H client field world scene issue (id pending; see above)

## Spec Reference

FS-3QHQZ §C Requirements 22–28; Acceptance Criteria "Forest look (§C)" items 1–9; Edge States
"Client before the tree art", "Huge rect", "Reduced motion"; User Stories 13–16, 22, 23.

## TDD Approach

- RED: a stand-planting determinism and footprint-containment test against fixture `walls[]`.
- GREEN: stands; then the theme entry, ground, ambient, mist, dressing; then scene selection.
