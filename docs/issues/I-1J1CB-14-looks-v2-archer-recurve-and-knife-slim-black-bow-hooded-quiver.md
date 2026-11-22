---
id: I-1J1CB-14
status: in-progress
implements: FS-1J1CB
blocked_by: [I-1J1CB-13]
labels: [blocked]
title: "FS-1J1CB slice 14: Looks v2, archer: the Hunter's heavy recurve and skinning knife, the Shadow Ranger's slim black longbow and hooded quiver, the archer kit, through the contact sheet"
---
Implements FS-1J1CB §Change: Looks v2: more drastic, more different

**Lane: agent** (game-client bake). **HITL gate:** Kranti approves the archer contact sheet before
this closes. **Serial:** third of the four v2 rebakes. It starts once I-1J1CB-13's bake and manifest
are in. Runs in `.claude/worktrees/passive-tree-v2`.

Builds on I-1J1CB-6's baked Hunter and Shadow Ranger (`archerLooks.js`). This slice's contact sheet
replaces I-1J1CB-6's open gate for those two looks.

## What to Build

**The archer kit (R68, R69):** `archerLooks.js` opens with the archer kit. It holds the shared trims
and wear, and the spec gear: the heavy recurve, the slim blackened longbow, the skinning knife and
its sheath, and the hooded quiver. `longbow` and `quiver` stay in `gear.js`, because the base uses
them. The kit's bows plug into `cast.js` `bowInHand` through the look's `weapon` swap, so the live
string and the draw solve (`draw.js`) keep working.

**Hunter (R49, R50, R58, R63):** the pelt, jerkin and bare head pushed further. She carries a heavy
recurve shorter than the longbow, with thick limbs, curled horn-capped tips and a grip wrap. A
skinning knife in a sheath rides the belt, clear of the draw. Add layered trims, lacing and wear.

**Shadow Ranger (R49, R50, R59, R63):** the soot pushed further. She carries a slim blackened
longbow at the longbow's length with a darker string, and a hooded quiver whose mouth hides the
fletching. If the hood darkens her back, it is lifted toward slate until the floor holds.

**Holds (R62, R64–R67):** draw and carry re-keys go in the look's style, never in `ARCHER_STYLE`.
The quiver rides over the cloak. Tokens only. The guards and the 0.0222 floor hold, and
`char_archer_base` and every other atlas keep their bytes.

**Guideline (R71):** the Archer line (the Hunter's recurve and knife; the Shadow Ranger's slim
longbow and hooded quiver, an exception to the fletching rule) and the two archer bullets.

**Contact sheet (R70):** both looks beside the ranger, every clip × 8 facings, ×2 per look, the
dark-room strip and the outline strip.

## Acceptance Criteria

- [ ] The manifest carries `char_archer_hunter` and `char_archer_shadow_ranger`, each alone in its
      group, at 1.5x, with every archer clip.
- [ ] On both looks the string follows the right hand while a clip draws, and an arrow is on it
      when nocked (a test on each rig's `fx.draw` / `fx.arrow` poses).
- [ ] The Hunter's bow is shorter than the longbow, and its knife's sheath stays clear of the bow
      hand on every pose.
- [ ] The Shadow Ranger's quiver is hooded and still rides over the cloak (`archerLooks.test.mjs`'s
      quiver-over-cloak test holds).
- [ ] Both looks pass the leg and cloak guards on every guarded pose of every clip; no new
      `KNOWN_CLIPPING` or `MIRRORED_LEGACY` entry.
- [ ] Both `n` idle backs are at or above 0.0222.
- [ ] `git diff --stat public/art/` lists only `archer_hunter-*`, `archer_shadow_ranger-*` and
      `manifest.json`.
- [ ] `ARCHER_STYLE` is unchanged; re-keys live in a look style.
- [ ] `archerLooks.js` is a kit plus looks composed from it.
- [ ] No raw colour.
- [ ] The guideline carries the Archer, Hunter and Shadow Ranger lines (R71).
- [ ] Kranti approved the archer contact sheet, outline strip included.
- [ ] `npm test` and `npm run lint` pass; `/code-review` run.

## Blocked By

I-1J1CB-13 (serial order: shared `cast.js`, `gear.js`, `classStyles.js` and manifest).

## Spec Reference

FS-1J1CB §Change: Looks v2: R49–R52, R53, R58–R59, R62, R63–R67, R68–R69, R70–R71, R72 (R5's
superseded bow), R73.

## Files expected to touch

- `game-client/tools/bake/page/characters/archerLooks.js` (the archer kit; both looks)
- `game-client/tools/bake/page/characters/gear.js` (`longbow` options the kit's bows need, if any)
- `game-client/tools/bake/page/characters/cast.js` (`bowInHand` taking a look's bow, if the swap needs it)
- `game-client/tools/bake/page/characters/draw.js` (nock points from the recurve, if needed)
- `game-client/tools/bake/page/characters/classStyles.js` (an archer look style, if a re-key is needed)
- `game-client/tools/bake/page/characters/fabrics.js` (archer look cloths, wear and seeds)
- `game-client/tools/bake/page/characters/archerLooks.test.mjs`, `classMotion.test.mjs`
- `game-client/public/art/archer_hunter-*.png`, `archer_shadow_ranger-*.png`, `manifest.json`
- `game-client/docs/design-guideline.md` (Part I: Archer, Hunter, Shadow Ranger)

## TDD Approach

- RED: a string-follows-draw test on each look's rig with the kit's bow swapped in.
- GREEN: the kit's bows wired through `bowInHand`; the knife and the hooded quiver; the bake.
