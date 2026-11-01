---
id: I-9PN7X-1
status: done
implements: FS-9PN7X
blocked_by: []
labels: [ready-for-agent]
title: "FS-9PN7X slice 1: bake the building exterior pieces, stone cap and dark openings, and amend the guideline (PAUSE: owner approves the contact sheet)"
---
Implements FS-9PN7X §0, §B.4, §F

**Author: agent** (charter: agent lane, client)

> **PAUSE POINT.** This slice ends with a contact sheet the **owner** approves. No slice wires
> these sheets into a scene (I-9PN7X-5, I-9PN7X-6) until the owner has said yes. On a rejection,
> rework and rebake here; the wiring slices stay blocked.

## What to Build

Every new sheet FS-9PN7X needs, authored in code and baked through the existing tool
(`game-client/tools/bake`, `npm run bake`, FS-2325V §B), plus the design guideline amendment that
goes with them. Names are pinned by FS §F so I-9PN7X-4 can build against them in parallel.

1. **Timber exterior wall pieces** (§F.2): `wall_exterior_{plain,brace,window}_{x,y}`. Full
   height (`WALL_BACK`), same tile span, anchor and origin as `wall_back_*`, the camera-facing
   face the building's outward surface. No interior dressing, no torch, **no declared light**;
   the window is shuttered or dark.
2. **Masonry exterior wall pieces** (§F.2): `tower_wall_exterior_{plain,pillar}_{x,y}`, the same
   rules against `tower_wall_back_*`. No sconce, banner or cobweb; no light.
3. **Stone cap** (§F.3, §B.4): `tower_cap`, a one-tile flat masonry slab drawn at the back walls'
   top, variants like a ground tile. **One cap for every floor band** [charter default: the band
   look is not a tint].
4. **Dark opening frames** (§F.4): `door_dark_{x,y}` (timber) and `tower_door_dark_{x,y}`
   (masonry): a full-height frame (lintel and reveals) sized to the run door width (50 world px)
   with flat darkness inside from the darkest `BARROW` token.
5. Everything in **one new atlas group, `building`** (not "exterior": that word names the run
   theme, CONTEXT.md), added to `reviewSheets` in `tools/bake/bake.mjs` so the contact sheet shows
   it. Additive only. Fidelity matches the shipped world sheets (same palette ramp, light
   direction, contact shadow; design guideline Part I); a type's exterior and interior pieces
   read as one building. Exterior corners reuse `post_back` / `tower_post_back` (§B.2): no new
   post sheet; if the contact sheet shows the back post cannot serve, flag it to the owner rather
   than baking one silently.
6. **Design guideline amendment** (§0.6, §F.6) in `game-client/docs/design-guideline.md`:
   rewrite the "Occlusion is cut-away, then fade" bullet (~l.87) and add a building-exterior
   section. Nothing else in the guideline changes.
7. Run `npm run bake`; compose a review image that shows, per building type, the exterior pieces
   beside the matching back/front pieces and a mock closed block (four walls + roof or cap + dark
   opening). Hand back `tools/bake/review/contact-sheet.png` (gitignored) and stop for the owner.

## Files (expected)

- `game-client/tools/bake/page/models/exterior.js` (new; keeps `architecture.js` and `tower.js`
  byte-stable). Import shared helpers from them; do not edit them unless a helper must be
  exported (additive only).
- `game-client/tools/bake/page/catalogue.js` (additive: the `building` group).
- `game-client/tools/bake/bake.mjs` (additive: `reviewSheets` includes group `building`).
- `game-client/tools/bake/page/materials.js`, `palette.js` (additive only, and only if needed).
- `game-client/public/art/building-0.png` (new), `game-client/public/art/manifest.json`
  (additive entries only; never hand-merged).
- `game-client/src/render/art/manifest.test.ts` (assertions for the new sheets).
- `game-client/docs/design-guideline.md` (the two places in §F.6 only).

Not touched: anything under `game-client/src/` other than `manifest.test.ts`, `src/utils/theme.ts`,
any scene, `game-server/**`.

## Acceptance Criteria

- [ ] Every sheet in FS-9PN7X §F.2–§F.4 is in `manifest.json` in group `building`, each with
      `source: "authored: tools/bake/page/models/exterior.js#…"`.
- [ ] Exterior wall pieces share the heights, span and anchor of the matching back pieces and
      declare no light (asserted in `manifest.test.ts`).
- [ ] Every pre-existing atlas `sha256` and sheet entry is unchanged; the manifest diff is
      additive only.
- [ ] No hex literal in new bake code; no new token in `src/utils/theme.ts`.
- [ ] `npm run bake -- --check` exits 0 after the committed bake.
- [ ] The design guideline's occlusion rule is rewritten and a building-exterior section added,
      citing ADR-0036 and FS-9PN7X; no other guideline change (`git diff` shows only those).
- [ ] The contact sheet is handed back and **the owner has approved it** (record the approval in
      this issue before closing).
- [ ] On Node 22 (`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`), `npm test`,
      `npm run lint` and `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` is empty.

## Blocked By

None. Runs in parallel with I-9PN7X-2, I-9PN7X-3 and I-9PN7X-4.

## Spec Reference

FS-9PN7X §0 (client only, built in code, tokens only, deterministic, guideline scope), §B.2 (posts
reused), §B.4 (one cap), §F.1–§F.6 (sheets, atlas, fidelity, review gate, guideline). User stories
1, 5, 13, 21, 22, 23.

## TDD Approach

- RED: `manifest.test.ts` expects every §F sheet in group `building` with an `authored:` source,
  no light on exterior pieces, and dimensions equal to the matching back pieces. It fails until the
  bake lands.
- GREEN: `models/exterior.js`, the catalogue entries, then `npm run bake`.

## Owner approval

Contact sheet approved by the owner 2026-11-01 ('looks good'); timber gable infill added after
review, approved pieces unchanged.

## Owner-approved deviations

- **Gables.** Timber exteriors close their roof's gable ends under the roof (`roof_gable_{x,y}`,
  `models/building.js#timberGable`), added after the contact-sheet review; the approved pieces are
  unchanged. Recorded in the guideline's "Building exteriors" section.
- **Model file name.** `tools/bake/page/models/exterior.js` is now `models/building.js` (review
  round 1: bare "exterior" names the run theme, CONTEXT.md). Only the manifest's `source` strings
  moved; every sheet name and atlas byte is unchanged (`npm run bake -- --check`: no changes).
