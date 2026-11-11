---
id: I-56CKV-3
status: open
implements: FS-56CKV
blocked_by: [I-56CKV-1, I-56CKV-2]
labels: [blocked]
title: "FS-56CKV slice 3: the dev position readout in the minimap's bottom-left corner, 10 px and dim, under the top-right column where no minimap is shown (game-client)"
---
Implements FS-56CKV §C

## Files it expects to touch

- `game-client/src/scenes/BarrowspireScene.ts` (`createPositionReadout`, and wherever slice 2
  re-lays the column)
- `game-client/src/scenes/BarrowspireScene.test.ts`
- `game-client/src/ui/positionReadout.ts`, `game-client/src/ui/positionReadout.test.ts` (its look's
  constants and a pure placement: inside a minimap rect, or under the column)
- `game-client/src/ui/minimap.ts`, `game-client/src/ui/minimap.test.ts` (only if the readout's
  corner is exposed from the minimap's constants)
- the column helper from slice 2, if it gained one

## What to Build

Move the readout off the top left. With a minimap shown, it stands inside the frame at the
bottom-left, its left and bottom edges 4 px inside the panel, at 10 px, no backing, a HUD text
token at a partial alpha (≥ 3:1 over the darkest vignetted backing under it), at a depth over the
minimap's. With no minimap shown, it stands 4 px under the top-right column's last line,
right-aligned, same look. It follows the column on M, floor change and resize, re-crispened.
Production builds still create none.

## Acceptance Criteria

- [ ] FS-56CKV §Acceptance Criteria, the readout items: place, size, no backing, depth and contrast inside the minimap; on the fixture floor its widest text ("X: 5760 Y: 3840") lies below the floor diamond's lower-left edge; under the column with no minimap shown, moving with it; none in a production build.
- [ ] Nothing is drawn at the top left for it any more, in any world.
- [ ] Typecheck and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

- I-56CKV-1 (the vignette its contrast is measured over)
- I-56CKV-2 (the column it stands under where no minimap is shown)

## Spec Reference

FS-56CKV §C.14–§C.19; User Stories 16–19. §C.18 was a charter default awaiting the owner's
confirmation (FS-56CKV Edge States, "the readout without a minimap"); the owner confirmed it on
2026-11-12 ("好"), recorded in the FS's amendment of that date.

## TDD Approach

- RED: a pure placement test: given the minimap rect at (854, 44) the readout's bottom-left is (858, 148); given no minimap and the column's last line ending at y 92, its top is 96 and its right edge on the column's x.
- GREEN: the placement, then the scene's text restyled and placed by it.
