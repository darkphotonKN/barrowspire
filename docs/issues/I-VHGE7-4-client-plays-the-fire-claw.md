---
id: I-VHGE7-4
status: done
implements: FS-VHGE7
blocked_by: []
labels: [ready-for-agent]
title: "FS-VHGE7 slice 4: the client plays a demon's fire claw: claw clip (attack fallback), flame trail, flash, boss engagement (game-client)"
---
Implements FS-VHGE7 §D (Requirements 31–34)

**Author: agent.**

## What to Build

1. `MonsterAction` gains `"claw"`, `CharacterAnimation` gains `"claw"`, and `ACTION_CLIPS.claw =
   "claw"`. A sheet without a `claw` clip plays its `attack` clip, so the claw shows on today's
   demon sheet before I-VHGE7-6 bakes the clip (R31).
2. A claw effects-table entry citing FS-VHGE7: a flame trail swept along the facing from the
   existing `fx_ember` / `fx_fire_core` textures, plus one ember transient light. `BARROW` ember
   tokens only, never amber; ≤ 250 ms; no shake (R32).
3. The monster roster fires the effect once on a shown monster's transition into `claw`, never
   per tick and never for a hidden one (R33).
4. `engages` counts `claw` like `attack` (R34).

## Acceptance Criteria

- [ ] The FS §Acceptance Criteria "Client" items about the claw: clip mapping with attack fallback; table entry passes `table.test.ts`; once per transition; none when hidden; `engages` on `claw`.
- [ ] A reconnect mid-`claw` replays no stale effect.
- [ ] `npm test` and lint pass in game-client.

## Files expected to touch

- `game-client/src/types/gameState.ts`
- `game-client/src/render/art/animationSelect.ts`, `game-client/src/render/art/character.ts` (only if the fallback lives there)
- `game-client/src/render/creatures/monsters.ts`, `monsters.test.ts`
- `game-client/src/render/creatures/targetPick.ts`, `targetPick.test.ts`
- `game-client/src/render/effects/table.ts`, `table.test.ts`, a new `game-client/src/render/effects/demonClaw.ts` + test
- `game-client/src/scenes/BarrowspireScene.ts` (only if the roster needs the effects runtime handed in)

## Blocked By

None. It is built against the FS's `claw` value. Verify end to end once I-VHGE7-2 is merged.
Coordination: it shares `gameState.ts` and `monsters.ts` with I-VHGE7-3, so serialize the two in
one lane.

## Spec Reference

FS-VHGE7 §D R31–34; User Stories 15, 16, 21, 28; Edge States "Client before the bake", "Hidden
demon", "Reconnect".

## TDD Approach

- RED: `monsterClip({ action: "claw" })` → `claw`, and the roster plays the claw effect once across
  two `claw` snapshots.
- GREEN: the union values, the mapping and fallback, the table entry and the transition hook.
