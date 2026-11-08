---
id: I-VHGE7-3
status: done
implements: FS-VHGE7
blocked_by: []
labels: [ready-for-agent]
title: "FS-VHGE7 slice 3: the client draws the blood demon at boss size with its plate and target frame, tinted placeholder (game-client)"
---
Implements FS-VHGE7 §C (Requirements 26–30)

**Author: agent.**

## What to Build

1. `MonsterArchetype` gains `"blood_demon"` (R26).
2. A `canvasPalette` token in the oxblood family for the placeholder wash, citing FS-VHGE7
   (ADR-0013, no literal colour) (R27).
3. `MONSTER_LOOKS.blood_demon = { sheet: "creature_demon_base", tier: "boss", tint: <token> }`
   until I-VHGE7-6 swaps in its own sheet (R27).
4. The plate reads `Blood Demon · Lv N`, and the target frame and boss engagement pick it up as a
   boss through `boss: true`. Add tests only where the existing code is archetype-agnostic. No new
   rule for two bosses (R28, R29).
5. The run's scene-art test lists `blood_demon` among the run's archetypes (R30).

## Acceptance Criteria

- [ ] `monsterLook("blood_demon")` is boss tier on `creature_demon_base` with the new token tint, and a test pins it.
- [ ] A blood demon and a green demon in one snapshot are both drawn at boss size and read as different, by the tint.
- [ ] Nameplate `Blood Demon · Lv N`. The target frame names the hovered one of two bosses, else the first engaged.
- [ ] The token is a `BARROW` derivation, and the styling fence test passes.
- [ ] `npm test` and lint pass in game-client.

## Files expected to touch

- `game-client/src/types/gameState.ts`
- `game-client/src/utils/canvasPalette.ts`
- `game-client/src/render/creatures/monsters.ts`, `monsters.test.ts`
- `game-client/src/render/creatures/targetPick.test.ts`, `game-client/src/ui/targetFrame.test.ts`
- `game-client/src/render/art/sceneArt.test.ts`

## Blocked By

None. It is built against the FS's wire values. Verify end to end once I-VHGE7-1 is merged.
Coordination: it shares `gameState.ts` and `monsters.ts` with I-VHGE7-4, so serialize the two in
one lane.

## Spec Reference

FS-VHGE7 §C R26–30; User Stories 3, 4, 19, 20, 28; Edge States "Client before the bake",
"Old client, new server", "Hidden demon".

## TDD Approach

- RED: `monsterLook("blood_demon")` is boss tier and tinted, not the troll fallback.
- GREEN: the union value, the token and the look entry.
