---
id: I-1D6BX-3
status: done
implements: FS-1D6BX
blocked_by: [I-1D6BX-2]
labels: [ready-for-agent]
title: "FS-1D6BX slice 3: the container view's coffer and bone-heap faces"
---
Implements FS-1D6BX §Requirements 15–17

The container view picks its face by the opened container's kind. A chest opens into the
**coffer**, a sack into the **satchel** (unchanged), a drop pile into the **bone heap**. The
coffer and bone heap pop in with no opening animation. Everything else about looting is identical.

## Files owned

- `game-client/src/ui/ContainerView.ts` (the face is chosen on `open(entityId, kind)`; the satchel path is unchanged)
- `game-client/src/ui/coffer.ts`, `game-client/src/ui/boneHeap.ts` (new: code-drawn textures in the shape of `ui/satchel.ts`, same `BODY_W` × `BODY_H` footprint, D8)
- `game-client/src/scenes/BarrowspireScene.ts`: only the calls that open the container view (pass the kind). **Hotspot: slice 2 must have landed first.**
- `game-client/src/scenes/fieldPiles.ts`: only the `satchel.open` calls (pass the kind) and the `PileSatchel` port
- `game-client/src/utils/canvasPalette.ts` (only new palette entries the faces need)
- `ContainerView.test.ts`, `fieldPiles.test.ts`

## What to Build

1. Code-draw the two new faces (R15, D4, D10). **Coffer:** a square open wooden box, iron-banded
   like the baked chest, seen from the front and slightly above the front rim, with its dark inner
   floor where the items sit. **Bone heap:** a low heap of bones and skulls in the drop pile's
   `dropPileBone` palette, with the items resting on top. Both follow the Bone & Soot / Ultima
   Online fidelity bar in `game-client/docs/design-guideline.md` and are built in code, never
   sourced.
2. `ContainerView.open` takes the kind. The coffer and bone heap appear without a flap or lid
   tween and without an icon drop stagger tied to a flap. A plain pop-in is fine, as long as no
   part of the container opens. The satchel keeps its exact animation.
3. Every face keeps the satchel's slots, hit-testing, hover tips, level mark, `mayTake`,
   `lootMessage`, pending guard, "Rummaging..." and "(Picked clean)" (R16, D9). An unknown kind
   opens the coffer (D2, through slice 2's helper).
4. Produce a contact sheet (a screenshot grid of the three faces with items, plus empty) for
   Kranti's approval (D10). Put it under `game-client/tools/bake/review/` or the scratchpad, and
   report the path.

## Acceptance Criteria

- [ ] Phaser-free rule tests: the face chosen per kind (chest → coffer, sack → satchel, drop_pile → bone heap, unknown → coffer).
- [ ] Hit-testing, slot positions and the pending guard are identical across faces (the same tests parameterised by face).
- [ ] Only the satchel face runs an opening tween (test the face's `animatesOpen` flag or equivalent).
- [ ] An empty container shows "(Picked clean)" in every face.
- [ ] A contact sheet is produced, its path reported, and the look gated on Kranti.
- [ ] `npm test`, `npm run lint` and `npx tsc --noEmit` are green.

## Blocked By

- I-1D6BX-2 (the sack kind, the kind helper and the `BarrowspireScene` / `fieldPiles` edits this slice builds on)

## Spec Reference

FS-1D6BX §Requirements 15–17, User Stories 5–11, 16, 22, Edge States (empty, boss pile, floor change).

## TDD Approach

- RED: the face-per-kind rule test.
- GREEN: a `containerFace(kind)` rule and the two textures.
