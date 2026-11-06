---
id: I-HF0WW-7
status: done
implements: FS-HF0WW
blocked_by: []
labels: []
title: "FS-HF0WW slice 7: every class's thighs inside its garment at rest; the leg guard measures absolute clearance, the waistband and belts, to one baked px (game-client)"
---
Implements FS-HF0WW §R19

**Lane: agent (AFK).** Nick approved the fix on 2026-11-06: the upper thighs showed as dark
wedges at both sides of the waist on all four classes, even through the mage's robe
(「腿部太粗了 連法師穿袍子都會看到」). Branch `fix/client-archer-hem-clearance`.

## What to Build

- `anatomy.js` `legs(rig, mat, { under })`: given the garment's `skirt` options, every bind-pose
  leg vertex the garment covers that lies past its wall less 0.012 H is pulled in toward its axis
  to that line (`rig.js` `place`; frames, UVs and weights stay the unmoved tube's). Nothing under
  the hem moves and nothing already inside moves. The four classes pass their garment; every
  other `legs()` caller does not, so their sheets stay pixel-identical. `skirt` and the slimming
  read the garment's rings from one `skirtRings`.
- `clearance.js`: score each leg vertex by how far it lies outside the cloth (absolute, not
  relative to rest); measure from the garment's top ring, so the waistband band counts; take a
  belt or sash (`belt`, `sash` tag their band as cover) as cover over its height; hold a sheet to
  `CLEARANCE_PX` = 1 baked px, `clearanceLimit(scale)` = 1 px at 1x, 0.5 px at 2x.
  `KNOWN_CLIPPING` and `MIRRORED_LEGACY` unchanged: the legacy sheets measure the same worst
  under the absolute measure as before (their worst is in motion), so their ceilings stand.
- Re-bake; FS-HF0WW R17/R19 and the guideline rule "Legs stay inside the garment" reworded.

## Acceptance Criteria

- [x] The new guard fails main's four classes (worst 1x px: knight 1.28, archer 1.69 against
      0.5, mage 1.43, mercenary 1.72) and passes the fix (knight 0.20, archer 0.47, mage 0.85,
      mercenary 0.40); in the bind pose every class's legs are 0.8 to 1.0 1x px inside.
- [x] The old guard passed both, so it never saw the wedges.
- [x] No leg vertex under any hem moved; UVs and skin weights are unchanged.
- [x] Every sheet other than the four classes is pixel- and metadata-identical (171 sheets, 2487
      frames); the archer stays 2x and trimmed; the four classes keep frame size, anchor, crown
      and mean.
- [x] `npm run bake -- --check` reports no changes; `npx tsc --noEmit`, `npx vitest run`,
      `npm run lint`, `npm run lint:fence` pass.
- [x] `clearance.test.mjs`: the rest-pose wedges fail and pass once drawn in; the waistband is
      measured and a belt over it is cover; one baked px at 1x and 2x; `legs({ under })` moves
      only what would show.
- [x] On screen (own dev server, FieldScene, render scale 2): the archer's tunic shows its belt
      all round with no wedges at the waist, standing and walking in e, se, s, sw, w.

## Blocked By

None (I-HF0WW-3 and I-HF0WW-4 are done).

## Spec Reference

FS-HF0WW §C R17, R19; acceptance line "The bake fails a character sheet with a leg more than
one baked px…"; user stories 13–14.

## Commits

c9095ce9 (tests), fa349f73 (fix), f737f4b7 (re-bake), and the docs commit that adds this file.

## Residual

The mage's forward knee still meets the robe's front in walk frames 0 and 4 (0.85 1x px, under
the 1x limit; also on main, where it merged with the waist wedge): a small patch in false
colour, dark breeches on the dark gown when lit.
