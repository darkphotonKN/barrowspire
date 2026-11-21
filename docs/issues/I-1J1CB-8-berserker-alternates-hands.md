---
id: I-1J1CB-8
status: done
implements: FS-1J1CB
blocked_by: [I-1J1CB-2]
labels: [blocked]
title: "FS-1J1CB slice 8: a Berserker's successive swings alternate hands, from the sheet's off-hand clips"
---
Implements FS-1J1CB §D (Requirements 29–30), §I (Requirement 48)

**Lane: agent** (game-client). No server change.

## What to Build

- `CharacterAnimator` / `CharacterMotion` (`src/render/art/character.ts`, `animationSelect.ts`):
  on a sheet that carries `attack_offhand`, each attack the animator plays takes the other hand
  from the one before, right first after the animator is built. The walking and backpedalling
  variants (`walk_attack_offhand`, `backpedal_attack_offhand`) follow the swing's hand. A charge
  (`swing.charge`, played whole as `attack`) and the tree ability's attack alternate the same way.
- A sheet without `attack_offhand` plays exactly as today.
- An animator rebuilt by I-1J1CB-2's swap starts again on the right hand (accepted: R30).
- Testable on a fixture manifest; seen in game once I-1J1CB-4's sheet is baked.
- **Placement (ADR-0086)** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the animator drives world bodies (Decision 2.1); no change in
  `UIScene` or `src/ui/`. The party busts in `UIScene` idle only and never attack, so they are
  unaffected.

## Acceptance Criteria

- [ ] Three successive attacks on a fixture sheet with `attack_offhand` play `attack`,
      `attack_offhand`, `attack`.
- [ ] An attack while walking on the off hand plays `walk_attack_offhand`; while backpedalling,
      `backpedal_attack_offhand`.
- [ ] An attack cut short by the next still alternates.
- [ ] A charge alternates with the slashes around it.
- [ ] A sheet without the off-hand clips plays `attack` every time.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` pass.

## Blocked By

I-1J1CB-2 (the sheet rule by spec; both edit `animationSelect.ts`). I-1J1CB-4 bakes the clips;
not a blocker for the code, which runs on a fixture.

## Spec Reference

FS-1J1CB §D R29–R30; §Acceptance Criteria "Berserker swing"; §Edge States (attack cut short, seen
mid-session); User Story 6.

## Files expected to touch

- `game-client/src/render/art/character.ts` (+ `character.test.ts`)
- `game-client/src/render/art/animationSelect.ts` (+ `animationSelect.test.ts`)

## TDD Approach

- RED: `character.test.ts`: a fixture sheet with `attack` and `attack_offhand`; three `attack()`
  calls at 0, 500 and 1000 ms play the clips right, left, right.
- GREEN: a per-animator hand toggle and the clip name choice.
