---
id: I-HF0WW-9
status: in-progress
implements: FS-HF0WW
blocked_by: []
labels: [ready-for-agent]
title: "FS-HF0WW slice 9: the hub folk's legs stay under their clothes: the four folk sheets on the garment weighting, the thighs drawn in under a closed garment, off both legacy lists, re-baked (game-client)"
---
Implements FS-HF0WW §Change: The folk's legs stay under their clothes (R40–R49)

**Lane: agent (AFK), then HITL.** Charter "NPC 腿部重繪", approved by the owner (「核准」,
2026-11-12). The bake tool and the folk atlas only; no server, no game logic.

## What to Build

1. A test that builds the four folk sheets with `folk.js` and poses them exactly as the bake does
   (the bake page's `characterPoses`, moved to a Node-importable `characters/poses.js` that
   `page/main.js` imports), and runs the leg-clearance guard on them with no exemption.
2. `folk.js`: every folk garment without `mirrored`; the trousered resident's tunic and the
   spirewarden's hauberk with the thighs drawn in under them (`legs({ under })`, the garment's
   own options); the quartermaster's legs as built (his apron covers only their front, R41).
3. `clearance.js`: the folk off `KNOWN_CLIPPING` and `MIRRORED_LEGACY`.
4. Re-bake with `npm run bake`; commit only the folk page(s) and `manifest.json`.
5. Contact sheets per folk sheet, old beside new, idle and walk, 8 facings, and an animated
   preview, for the owner.

## Acceptance Criteria

- [x] Each folk sheet asks for no `mirrored` garment and is on neither legacy list (seen red).
- [x] The trousered resident, the spirewarden and the quartermaster keep every leg within 1 px of
      the cloth through idle and walk in every palette (seen red: 4.42, 8.70, 8.25 px).
- [x] `KNOWN_CLIPPING` = troll, zombie, ghost; `MIRRORED_LEGACY` = those + ghoul, demon.
- [x] Only `folk-*` and the folk entries of `manifest.json` change; `npm run bake -- --check`
      reports no changes after the last commit.
- [x] The whole client vitest suite, `npx tsc --noEmit -p .` and `npm run lint` pass.
- [ ] HITL: the owner approves each folk sheet's contact sheet (old beside new, idle and walk, 8
      facings).

## Round 2 (2026-11-12)

The owner, after playing the round-1 bake: "NPC 腿部重繪 還是有一點破圖 尤其是npc quartermaster" (the
NPC leg redraw still breaks up a little, especially the quartermaster). R46-R49.

6. `clearance.js`: R28's camera check (`seenThroughCloth`, from `clearance.test.mjs`), so the
   folk test runs it on each folk sheet.
7. `folk.js`: the quartermaster's breeches seat, his thighs drawn in under it, his apron following
   the thighs by 0.5 (R47, R48).
8. Re-bake; old-beside-new contact sheets, an animated preview and a 4x zoom of his legs and apron.

- [x] No folk's hip, thigh or knee is seen through its clothes from the bake camera, idle and walk,
      every palette (seen red: the quartermaster 165-176 vertex-facings a pose at rest, 215 at
      walk frame 0; the other three 0).
- [x] The quartermaster's breeches seat never comes out through his apron (seen red at 1.24 px
      with the seat set 0.02 H forward).
- [x] Only `folk-0` and the folk entries of `manifest.json` change; `npm run bake -- --check`
      reports no changes after the last commit.
- [x] The whole client vitest suite, `npx tsc --noEmit -p .` and `npm run lint` pass.
- [ ] HITL: the owner approves the quartermaster's sheet (old beside new, idle and walk, 8
      facings, the 4x zoom of his legs and apron).

## Blocked By
None

## Spec Reference
FS-HF0WW §Change: The folk's legs stay under their clothes: R40–R49, every acceptance criterion.

## TDD Approach
- RED: `characters/folk.test.mjs` on today's `folk.js`: all four mirrored and listed; the guard
  without exemption fails three of them by 4.42, 8.70 and 8.25 px.
- GREEN: the weighting and thigh fix in `folk.js`, the lists shrunk in `clearance.js`.
- Round 2 RED: `folk.test.mjs` runs R28's camera check on the four folk sheets: the quartermaster
  seen through his clothes in every pose; the seat-under-apron test fails with no seat.
- Round 2 GREEN: the breeches seat and the apron's follow in `folk.js`.
