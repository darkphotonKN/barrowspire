---
id: I-1J1CB-13
status: open
implements: FS-1J1CB
blocked_by: [I-1J1CB-12]
labels: [blocked]
title: "FS-1J1CB slice 13: Looks v2, mage: the Spellwarden's iron-shod warding staff and hip tome, the Pyromancer's brazier rod, the mage kit, through the contact sheet"
---
Implements FS-1J1CB §Change: Looks v2: more drastic, more different

**Lane: agent** (game-client bake). **HITL gate:** Kranti approves the mage contact sheet before this
closes. **Serial:** second of the four v2 rebakes. It starts once I-1J1CB-12's bake and manifest
are in. Runs in `.claude/worktrees/passive-tree-v2`.

Builds on I-1J1CB-5's baked Spellwarden and Pyromancer (`mageLooks.js`). This slice's contact sheet
replaces I-1J1CB-5's open gate for those two looks.

## What to Build

**The mage kit (R68, R69):** `mageLooks.js` opens with the mage kit. It holds the shared trims and
wear, and the spec weapons: the warding staff and the brazier rod, with today's `wardFocus`,
`fireFocus`, `FOCUS_TOP` and `FOCUS_BUTT` moved out of `gear.js`. `tome` and `sceptre` stay in
`gear.js`, because the base uses them.

**Spellwarden (R49, R50, R56, R63):** the iron pushed further. She carries an iron-shod warding staff
taller than her crown, with an iron cage closed round the ward stone (the stone's tone kept). The
iron-bound tome hangs from the belt on the left hip, so her left hand is free and opens in the cast.
Add layered trims, straps and wear.

**Pyromancer (R49, R50, R57, R63):** the scorch and singed hem pushed further. She carries a
brazier-headed rod: a short haft about the sceptre's length under an iron fire cage about twice
today's width, with coals and a larger upright flame (the existing upright hook). Fire's ramp only.
The embers stay in the gown's texture (R4).

**Holds (R62, R64–R67):** the staff's thrust, carry and death keys are re-keyed in a look style
beside `FOCUS_STYLE`. The staff's foot stays above the ground and clear of the legs; the head
clears her head on every pose. `WIZARD_STYLE` is unchanged. Tokens only. The guards and the
0.0222 floor hold, and `char_wizard_base` and every other atlas keep their bytes.

**Guideline (R71):** the Mage line's one staff exception (the Spellwarden), the Pyromancer's brazier
rod, R45's focus wording restated, and the two mage bullets.

**Contact sheet (R70):** both looks beside the wizard, every clip × 8 facings, ×2 per look, the
dark-room strip and the outline strip (I-1J1CB-12's tooling).

## Acceptance Criteria

- [ ] The manifest carries `char_wizard_spellwarden` and `char_wizard_pyromancer`, each alone in its
      group, at 1.5x, with every wizard clip.
- [ ] A motion test on the Spellwarden's rig: the staff's head is clear of her head and its foot is
      above the ground plane and clear of both legs on every pose of every clip.
- [ ] The tome rides the hips (no hand holds it); the cast's left hand is free.
- [ ] The Pyromancer's rod has a haft about the sceptre's length (never staff length), and its cage
      is about twice today's width; the flame stays upright in every pose (`mageLooks.test.mjs`).
- [ ] The embers are still in the gown's texture (`embers.test.mjs`).
- [ ] Both looks pass the leg and cloak guards on every guarded pose of every clip; no new
      `KNOWN_CLIPPING` or `MIRRORED_LEGACY` entry.
- [ ] Both `n` idle backs are at or above 0.0222.
- [ ] `git diff --stat public/art/` lists only `wizard_spellwarden-*`, `wizard_pyromancer-*` and
      `manifest.json`.
- [ ] `WIZARD_STYLE` is unchanged; re-keys live in a look style.
- [ ] `mageLooks.js` is a kit plus looks composed from it; the staff and the rod live in it.
- [ ] No raw colour.
- [ ] The guideline carries the Mage, Spellwarden and Pyromancer lines (R71).
- [ ] Kranti approved the mage contact sheet, outline strip included.
- [ ] `npm test` and `npm run lint` pass; `/code-review` run.

## Blocked By

I-1J1CB-12 (the shared bake, manifest and outline tooling; serial order).

## Spec Reference

FS-1J1CB §Change: Looks v2: R49–R52, R53, R56–R57, R62, R63–R67, R68–R69, R70–R71, R72 (R3's and
R4's superseded values, and the staff Out of Scope line for the Spellwarden), R73.

## Files expected to touch

- `game-client/tools/bake/page/characters/mageLooks.js` (the mage kit; both looks)
- `game-client/tools/bake/page/characters/gear.js` (`wardFocus`, `fireFocus`, `FOCUS_TOP`, `FOCUS_BUTT` move out)
- `game-client/tools/bake/page/characters/classStyles.js` (a staff style beside `FOCUS_STYLE`; `FOCUS_DEATH`)
- `game-client/tools/bake/page/characters/fabrics.js` (mage look cloths, wear and seeds)
- `game-client/tools/bake/page/characters/mageLooks.test.mjs`, `embers.test.mjs`, `classMotion.test.mjs`
- `game-client/public/art/wizard_spellwarden-*.png`, `wizard_pyromancer-*.png`, `manifest.json`
- `game-client/docs/design-guideline.md` (Part I: Mage, Spellwarden, Pyromancer)

## TDD Approach

- RED: the staff-clearance motion test against the kit's staff on the current focus keys.
- GREEN: the look style's re-keyed thrust, carry and death; the hip tome; the brazier rod; the bake.
