---
id: I-Q14EV-3
status: in-progress
implements: FS-Q14EV
blocked_by: []
labels: [ready-for-agent]
title: "Content for FS-Q14EV: Barrow Thrall and Spire Wraith baked recolours"
---
Content: FS-Q14EV

Two data entries under the baked roster, for FS-M8CSE §H R37-R40. **Ends at a HITL gate:** the owner
approves the contact sheet before I-M8CSE-5 starts.

## Files owned

- `game-client/tools/bake/page/characters/forlorn.js` (recolour builders over `zombie` and `ghost`)
- `game-client/tools/bake/page/characters/cast.js` (two `CAST` rows, group `creatures`)
- `game-client/public/art/`: the regenerated `creatures-*` pages and `manifest.json`
- `game-client/tools/bake/review/`: the two contact sheets
- `game-client/src/render/art/manifest.test.ts`, if it pins the group's sheet list

## What to Build

Bake `creature_barrow_thrall_base` (the zombie in grave-ash) and `creature_spire_wraith_base` (the ghost
in bone-white), same rigs, clips and baked translucence as their source. Build, never source.

- Group `creatures`, not `fodder` (R38, charter default): BarrowspireScene already holds it, about
  40 MB more per run. `SCENE_ART` does not change. The ghoul and troll frames may repack; their keys
  stay.
- Colours are existing `BARROW` tokens only, no new palette rule (R39, charter default). If neither
  recolour reads on the contact sheet, stop and escalate.
- No `MonsterLook.tint`: it overrides the elite wash and can only darken (ruled out at lock).

## Acceptance Criteria

- [ ] Both sheets are in `manifest.json` on `creatures` pages, with every clip their sources have.
- [ ] No new token in `src/utils/theme.ts` or the guideline.
- [ ] A contact sheet of both, beside the Forest's zombie and ghost, goes to the owner in the final report (R40). It is the art gate.
- [ ] `npm test` passes.

## Blocked By

None. Blocks I-M8CSE-5.

## Spec Reference

FS-M8CSE §H R37-R40; FS-Q14EV (the roster and its contact-sheet gate, ADR-0021).
