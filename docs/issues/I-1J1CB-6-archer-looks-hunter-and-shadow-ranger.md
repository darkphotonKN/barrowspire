---
id: I-1J1CB-6
status: in-progress
implements: FS-1J1CB
blocked_by: [I-1J1CB-3]
labels: [blocked]
title: "FS-1J1CB slice 6: bake the Hunter (pelt, hide, no hood, no green) and the Shadow Ranger (soot-black, back lifted), through the contact sheet"
---
Implements FS-1J1CB §A (Requirements 5–6), §B (Requirements 9–15)

**Lane: agent** (game-client bake). **HITL gate:** Kranti approves the contact sheet before this
closes.

**Where it runs** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the bake slices (I-1J1CB-3 to -7) run in the worktree
`.claude/worktrees/spec-looks` (branch `feat/spec-looks`, cut from origin/main), where I-1J1CB-1's
guideline amendment already landed. Build and bake there, not in the main checkout. This slice is
bake-only (`tools/bake/`, `public/art/`) and touches no scene, so ADR-0084–0086 change nothing in
it.

## What to Build

Port and finish the archer looks from the variants worktree
(`.claude/worktrees/agent-a46e3b70610818163/game-client/tools/bake/page/characters/archerLooks.js`,
its `cast.js`, `gear.js`, `anatomy.js` and `fabrics.js` diffs) into a looks module beside
`cast.js` (e.g. `archerLooks.js`).

- **Hunter** (R5): variant A's grey-brown wolf pelt; variant C's laced hide jerkin, high goose
  fletching and horn nock caps; the cloak and capelet in undyed grey-brown wool (no Nightwood
  green anywhere). **No cowl**: the head is `head()` + `face()` with brown hair loose to the
  collar, unbearded. Check the quiver still rides over the cloak (FS-HF0WW) with the cowl gone.
- **Shadow Ranger** (R6): variant A: cowl, capelet and cloak in cold soot-black, the buff leather
  a cold grey, bracers, boots and fletching black. **Lift the back** until slice 3's dark-room test
  passes: the soot toward slate, or a lighter turned edge on the cowl and the cloak's hem; keep it
  black at a glance on the contact sheet.
- Two `CAST` rows: `char_archer_hunter` / `archer_hunter`, `char_archer_shadow_ranger` /
  `archer_shadow_ranger`, with the archer's `RUNNING_CLASS_ANIMATIONS` at 1.5x. Bake.
- Every clip passes the leg and cloak guards (R11). The pelt and jerkin stay above the hips or are
  cut on the tunic's rig. No `KNOWN_CLIPPING` entry.
- **Contact sheet** (R12): both looks beside the archer, every clip × 8 directions, plus the
  dark-room strip. Hold until Kranti approves; tweaks are made here; a look change updates its
  guideline bullet (I-1J1CB-1).

## Acceptance Criteria

- [ ] The manifest carries both sheets, each alone in its group, at 1.5x, with every archer clip.
- [ ] Both pass the leg and cloak guards on every guarded pose of every clip.
- [ ] The Hunter's sheet has no cowl and no Nightwood green tone; its head is the shared face.
- [ ] Both pass the dark-room test; the Shadow Ranger's back clears the floor.
- [ ] `char_archer_base` is unchanged. No raw colour.
- [ ] Kranti approved the contact sheet.
- [ ] `npm test`, `npm run lint` pass.

## Blocked By

I-1J1CB-3.

## Spec Reference

FS-1J1CB §A R5–R6; §B R9–R15; §Acceptance Criteria "The bake"; User Stories 11–13, 27.

## Files expected to touch

- `game-client/tools/bake/page/characters/archerLooks.js` (new)
- `game-client/tools/bake/page/characters/cast.js` (two `CAST` rows)
- `game-client/tools/bake/page/characters/gear.js` (fletching length, nock caps, if not hooks)
- `game-client/tools/bake/page/characters/anatomy.js` (only if the look hooks need it)
- `game-client/tools/bake/page/characters/fabrics.js`
- `game-client/public/art/archer_hunter-*.png`, `archer_shadow_ranger-*.png`, `manifest.json`
- `game-client/tools/bake/review/`

`manifest.json` conflicts with a parallel bake slice are resolved by re-running the bake.

## TDD Approach

- RED: the dark-room test against a first Shadow Ranger bake with variant A's soot unlifted.
- GREEN: the lift.
