---
id: I-1J1CB-5
status: done
implements: FS-1J1CB
blocked_by: [I-1J1CB-3]
labels: [blocked]
title: "FS-1J1CB slice 5: bake the Spellwarden and the Pyromancer, each with a larger focus, embers in the gown, through the contact sheet"
---
Implements FS-1J1CB §A (Requirements 3–4), §B (Requirements 9–15)

**Lane: agent** (game-client bake). **HITL gate:** Kranti approves the contact sheet before this
closes.

**Where it runs** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the bake slices (I-1J1CB-3 to -7) run in the worktree
`.claude/worktrees/spec-looks` (branch `feat/spec-looks`, cut from origin/main), where I-1J1CB-1's
guideline amendment already landed. Build and bake there, not in the main checkout. This slice is
bake-only (`tools/bake/`, `public/art/`) and touches no scene, so ADR-0084–0086 change nothing in
it.

## What to Build

Port and finish the mage looks from the variants worktree
(`.claude/worktrees/agent-a490dd31969c4e40e/game-client/tools/bake/page/characters/mageSpecs.js`,
its `cast.js` and `fabrics.js` diffs) into a looks module beside `cast.js` (e.g. `mageLooks.js`).

- **Spellwarden** (R3): variant B: blackened-iron spaulders on both shoulders (three lames, 0.9),
  the gorget, the iron-banded tome. A **ward focus** about 1.5x the sceptre's length in its place:
  an iron haft, an open iron ring at the head round a pale stone lit `necrotic` toward `vellum`,
  low. Same carry and thrust as the sceptre (`WIZARD_STYLE`), grip moved down the longer haft if
  the head would pass through her own head in any clip.
- **Pyromancer** (R4): variant B: the scorched near-black oxblood scapular (dirt 0.5), the singed
  hem. **Embers in the gown's hem texture** as emissive fire-ramp specks (an emissive map on the
  gown's material), never meshes on the hips bone as the variant had. A **fire focus** about 1.5x
  the sceptre: variant C's iron cage and flame, scaled, with its upright hook.
- Two `CAST` rows through slice 3's helper: `char_wizard_spellwarden` / `wizard_spellwarden`,
  `char_wizard_pyromancer` / `wizard_pyromancer`. Bake.
- Every clip passes the leg and cloak guards (R11); the scapular stays cut with
  `skirt({ over })` on the gown. No `KNOWN_CLIPPING` entry.
- The Pyromancer is the look most at risk of R10's floor (near-black on a black gown): lift the
  scapular toward oxblood or let the hair's sheen carry it until the dark-room test passes.
- **Contact sheet** (R12): both looks beside the wizard, every clip × 8 directions, plus the
  dark-room strip. Hold until Kranti approves; tweaks are made here; a look change updates its
  guideline bullet (I-1J1CB-1).

## Acceptance Criteria

- [ ] The manifest carries both sheets, each alone in its group, at 1.5x, with every wizard clip.
- [ ] Both pass the leg and cloak guards on every guarded pose of every clip.
- [ ] The Pyromancer's embers are in the gown's texture; no ember mesh is attached to a body bone.
- [ ] Each focus is about 1.5x the sceptre and never passes through her head or the ground in any
      clip (checked on the contact sheet).
- [ ] Both pass the dark-room test.
- [ ] `char_wizard_base` is unchanged. No raw colour.
- [ ] Kranti approved the contact sheet.
- [ ] `npm test`, `npm run lint` pass.

## Blocked By

I-1J1CB-3.

## Spec Reference

FS-1J1CB §A R3–R4; §B R9–R15; §Acceptance Criteria "The bake"; User Stories 8, 10, 27.

## Files expected to touch

- `game-client/tools/bake/page/characters/mageLooks.js` (new)
- `game-client/tools/bake/page/characters/cast.js` (two `CAST` rows)
- `game-client/tools/bake/page/characters/gear.js` (the two foci)
- `game-client/tools/bake/page/characters/fabrics.js` (look cloths, the ember hem texture)
- `game-client/public/art/wizard_spellwarden-*.png`, `wizard_pyromancer-*.png`, `manifest.json`
- `game-client/tools/bake/review/`

`manifest.json` conflicts with a parallel bake slice are resolved by re-running the bake.

## TDD Approach

- RED: a node test that builds the Pyromancer's rig and finds no emissive mesh parented to `hips`.
- GREEN: the ember hem texture on the gown.
