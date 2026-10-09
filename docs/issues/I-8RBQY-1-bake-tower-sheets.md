---
id: I-8RBQY-1
status: done
implements: FS-8RBQY
blocked_by: []
labels: [ready-for-agent]
title: "FS-8RBQY slice 1: bake the tower sheets (flags and planks, partition and perimeter walls, dressing, spiral stairs)"
---
Implements FS-8RBQY §0, §D, §E.1–§E.3

**First slice: the bake.** Every tower sheet is authored and baked here, so slices 2 and 3 only
wire art that already exists. It ends with a contact sheet that the coordinator reviews against
the reference (the shipped baked look, design guideline Part I). There is no owner HITL gate.

> Coordination: siblings are editing `game-server/**` and `src/render/effects/**` concurrently.
> This slice touches neither. If other bake work lands on the branch first, rebake from the
> merged tree. Never hand-merge `manifest.json`.

## Files owned

- `game-client/tools/bake/page/models/tower.js` (new): partition wall pieces and posts,
  perimeter wall pieces and posts, the dressing props, and the spiral stairs.
- `game-client/tools/bake/page/ground.js`: additive only. New materials `flags`, `planks`,
  `dressed`, and the `flags`/`dirt` transition. Existing materials stay byte-identical.
- `game-client/tools/bake/page/catalogue.js`: additive only. A `tower` group registering every
  new sheet.
- `game-client/tools/bake/page/materials.js`: additive only, and only if a new surface helper is
  needed.
- `game-client/public/art/tower-0.png` (new) and `game-client/public/art/manifest.json`
  (additive entries only).
- `game-client/tools/bake/review/contact-sheet.png` (regenerated).
- `game-client/src/render/art/manifest.test.ts`: assertions for the new sheets.

Not owned: `src/utils/theme.ts` (no new token), any existing model module, anything under `src/`
other than `manifest.test.ts`.

## What to Build

1. **Ground tiles** (FS-8RBQY §D.2): `ground_flags` (worn cut-stone flags, mortar, grime),
   `ground_planks` (old timber planks), `ground_dressed` (dressed stone), each `kind: "tile"`
   with 4 variants, and the transition `ground_flags_dirt` with the 8 edges of
   `ground_grass_dirt`. Barrow earth reuses `ground_dirt`. All periodic, like the existing
   materials.
2. **Partition wall pieces** (§D.3): `tower_wall_back_{plain,pillar,sconce,banner,cobweb}_{x,y}`,
   `tower_wall_front_{plain,pillar}_{x,y}`, `tower_post_{back,front}`, in masonry. Same heights
   (`WALL_BACK`/`WALL_FRONT`), tile span and anchor as today's `wall_*`/`post_*`, so `cutWall`
   geometry is unchanged. The sconce pieces declare a warm light, placed like
   `wall_back_torch_*`'s.
3. **Perimeter wall pieces** (§D.4): `tower_perimeter_back_{plain,slit}_{x,y}`,
   `tower_perimeter_front_plain_{x,y}`, `tower_perimeter_post_{back,front}`. Thicker and taller
   than a partition. The slit pieces show a narrow cold-lit opening and declare a faint cold
   light (a cool token blend, lower intensity than a sconce).
4. **Dressing props** (§D.5): `rubble`, `bone_pile`, `broken_crate`, `roots`, `chains` (a floor
   heap of chain and manacles). Low and ground-hugging, no light. `brazier` is reused as it
   ships, not rebaked.
5. **Spiral stairs** (§E.1–§E.3): `stairs_spiral`, a spiral stone stair winding up around a
   newel, its upper turns fading into darkness. Amber trim on the lowest treads from the `amber`
   token (the interactable cue). It declares a dim warm light.
6. Everything goes into atlas group `tower` (§D.1). Colours are `BARROW` tokens and blends only
   (§0.3). Fidelity matches the shipped world sheets: same palette ramp, light direction and
   contact shadow (§D.6).
7. Run `npm run bake` and hand back `tools/bake/review/contact-sheet.png` for the coordinator's
   review (§D.7). On a rejection, rework and rebake.

## Acceptance Criteria

- [ ] Every sheet in FS-8RBQY §D.2–§D.5 and `stairs_spiral` is in `manifest.json` in group
      `tower`, each with `source: "authored: tools/bake/page/…"`.
- [ ] Sconce, slit and `stairs_spiral` sheets declare a light. Dressing sheets declare none.
- [ ] Partition pieces share the heights, span and anchor of the matching `wall_*`/`post_*`
      entries (asserted in `manifest.test.ts`).
- [ ] Every pre-existing atlas `sha256` and every pre-existing sheet entry is unchanged. The
      manifest diff is additive only, and the new sheets fit one 4096² page (`tower-0.png`).
- [ ] No hex literal in new bake code. No new token in `src/utils/theme.ts`.
- [ ] `npm run bake -- --check` exits 0 after the committed bake (the bake is deterministic).
- [ ] `tools/bake/review/contact-sheet.png` shows every new sheet, and the coordinator has
      reviewed it against the shipped baked look (design guideline Part I).
- [ ] On Node 22 (`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`), `npm test`,
      `npm run lint` and `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` shows nothing from this slice.

## Blocked By

None.

## Spec Reference

FS-8RBQY §0 (boundary: client only, authored in code, token-only, deterministic), §D (baked
tower sheets, atlas group, fidelity, contact sheet), §E.1–§E.3 (stairs art, amber cue, its
light). User stories 4, 8, 9, 20, 22, 25, 26.

## TDD Approach

- RED: `manifest.test.ts` expects each new sheet in group `tower` with an `authored:` source, the
  declared lights on sconce, slit and `stairs_spiral`, and partition dimensions matching
  `wall_*`. It fails until the bake lands.
- GREEN: the models, the ground materials and the catalogue entries, then `npm run bake`.
