---
id: I-HF0WW-9
status: in-progress
implements: FS-HF0WW
blocked_by: []
labels: [ready-for-agent]
title: "FS-HF0WW slice 9: the hub folk's legs stay under their clothes: the four folk sheets on the garment weighting, the thighs drawn in under a closed garment, off both legacy lists, re-baked (game-client)"
---
Implements FS-HF0WW §Change: The folk's legs stay under their clothes (R40–R45)

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

## Blocked By
None

## Spec Reference
FS-HF0WW §Change: The folk's legs stay under their clothes: R40–R45, every acceptance criterion.

## TDD Approach
- RED: `characters/folk.test.mjs` on today's `folk.js`: all four mirrored and listed; the guard
  without exemption fails three of them by 4.42, 8.70 and 8.25 px.
- GREEN: the weighting and thigh fix in `folk.js`, the lists shrunk in `clearance.js`.
