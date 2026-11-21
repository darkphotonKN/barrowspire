---
id: I-1J1CB-7
status: in-progress
implements: FS-1J1CB
blocked_by: [I-1J1CB-3]
labels: [blocked]
title: "FS-1J1CB slice 7: bake the Duelist (wrapped robe, off-shoulder half-cloak) and the Sellsword (buff coat over black), through the contact sheet"
---
Implements FS-1J1CB §A (Requirements 7–8), §B (Requirements 9–15)

**Lane: agent** (game-client bake). **HITL gate:** Kranti approves the contact sheet before this
closes.

**Where it runs** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the bake slices (I-1J1CB-3 to -7) run in the worktree
`.claude/worktrees/spec-looks` (branch `feat/spec-looks`, cut from origin/main), where I-1J1CB-1's
guideline amendment already landed. Build and bake there, not in the main checkout. This slice is
bake-only (`tools/bake/`, `public/art/`) and touches no scene, so ADR-0084–0086 change nothing in
it.

## What to Build

Port and finish the mercenary looks from the variants worktree
(`.claude/worktrees/agent-abd20d643496d2bff/game-client/tools/bake/page/characters/mercSpecs.js`,
its `cast.js` and `fabrics.js` diffs) into a looks module beside `cast.js` (e.g. `mercLooks.js`).

- **Duelist** (R7): variant A's slate-black half-cloak from the **left** shoulder in place of the
  left spaulder, rebuilt **on cloak bones** (skinned like the knight's cloak, an arc on the off
  side), never rigid on the chest. The quilted arming coat replaced by a **wrapped robe**: closed
  left over right in a deep V to the sash, sleeves wide to the forearm, skirts split at the sides
  to mid-calf over the tall boots, in faded madder. A wide slate-black sash wound twice. The
  vambrace, blade, hair and beard stay. "Almost" samurai: no lacing, no topknot.
- **Sellsword** (R8): variant B's buff-leather coat buckled in brass, a spaulder on both shoulders,
  the purse, with the arming coat and sash dyed a charcoal black (never pure black).
- Two `CAST` rows: `char_mercenary_duelist` / `mercenary_duelist`, `char_mercenary_sellsword` /
  `mercenary_sellsword`, with the mercenary's sheet options (its `parry` clip included). Bake.
- Every clip passes the leg and cloak guards (R11): the robe's skirts are a `skirt` with the legs
  `under` them; the half-cloak passes the cloak guard. No `KNOWN_CLIPPING` entry. Watch the wide
  sleeves against the blade in the cut and the riposte on the contact sheet.
- **Contact sheet** (R12): both looks beside the mercenary, every clip (parry included) × 8
  directions, plus the dark-room strip. Hold until Kranti approves; tweaks are made here; a look
  change updates its guideline bullet (I-1J1CB-1).

## Acceptance Criteria

- [ ] The manifest carries both sheets, each alone in its group, at 1.5x, with every mercenary
      clip including `parry`.
- [ ] Both pass the leg and cloak guards on every guarded pose of every clip; the half-cloak is
      skinned to cloak bones.
- [ ] The Sellsword's coat and sash carry no madder tone.
- [ ] Both pass the dark-room test.
- [ ] `char_mercenary_base` is unchanged. No raw colour.
- [ ] Kranti approved the contact sheet.
- [ ] `npm test`, `npm run lint` pass.

## Blocked By

I-1J1CB-3.

## Spec Reference

FS-1J1CB §A R7–R8; §B R9–R15; §Acceptance Criteria "The bake" (half-cloak on cloak bones); User
Stories 18–19, 27.

## Files expected to touch

- `game-client/tools/bake/page/characters/mercLooks.js` (new)
- `game-client/tools/bake/page/characters/cast.js` (two `CAST` rows)
- `game-client/tools/bake/page/characters/anatomy.js` (a half-cloak arc on `cloak`, a wrapped
  front on the robe, if not expressible with today's options)
- `game-client/tools/bake/page/characters/gear.js`, `fabrics.js`
- `game-client/public/art/mercenary_duelist-*.png`, `mercenary_sellsword-*.png`, `manifest.json`
- `game-client/tools/bake/review/`

`manifest.json` conflicts with a parallel bake slice are resolved by re-running the bake.

## TDD Approach

- RED: a node test building the Duelist's rig and finding the half-cloak's mesh skinned (a
  `SkinnedMesh` on cloak bones), not attached to `chest`.
- GREEN: the half-cloak on cloak bones.
