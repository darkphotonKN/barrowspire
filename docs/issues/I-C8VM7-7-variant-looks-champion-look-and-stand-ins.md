---
id: I-C8VM7-7
status: open
implements: FS-C8VM7
blocked_by: []
labels: [ready-for-agent]
title: "FS-C8VM7 slice 7: the client draws every variant, its stand-in until its art lands, and a champion at boss size"
---
Implements FS-C8VM7 §F (R34-R35), §G (R41, R44)

**Type:** AFK. **Hotspot (client):** `monsters.ts`, `sceneArt.ts`, `gameState.ts`; I-C8VM7-8 and
-9 extend them after this lands. Built against the spec's wire; runs alongside every server slice.

## Files expected to touch

- `game-client/src/types/gameState.ts` (the `MonsterArchetype` union: every R3 and R8 id)
- `game-client/src/render/creatures/monsters.ts` (a `MONSTER_LOOKS` row per new archetype at its family's tier; a per-look `aim` override, the ogre family at 1.5; a `boss: true` monster whose look is not boss tier drawn at the boss aim with the boss plate)
- `game-client/src/render/art/sceneArt.ts` (an on-demand row per variant group and archetype, with its stand-in: the family's tier-1 archetype; goblin → ghoul, ogre → troll, dark warrior → ghoul; `standIn.tint` optional for the old families)
- `game-client/src/utils/canvasPalette.ts` (stand-in tints for the goblin, ogre and dark warrior, from `BARROW` tokens only)
- Tests: `src/render/creatures/monsters.test.ts`, `src/render/art/sceneArt.test.ts`

## What to Build

- R34: every new archetype has a look, `creature_<archetype>_base`, at fodder (ghoul, skeleton,
  thrall, ghost, goblin families) or brute (troll, ogre, dark warrior); the ogre family at the
  brute band's top; an unknown archetype still draws as the troll.
- R35: a champion (`boss: true`, look not boss tier) draws its own sheet at the boss tier's aim
  with the boss plate, its server name, level and bar as every boss.
- R41/R44: each variant group is an on-demand row; until its group is in, the variant draws its
  stand-in at its own tier (a champion at boss tier), never the placeholder. The existing
  sight-triggered fetch (ADR-0071) applies; floor-scoped fetch and eviction are I-C8VM7-8.

## Acceptance Criteria

- [ ] Every R3/R8 archetype has a look at its family's tier; the ogre family's scale is the brute band's top; an unknown archetype draws as the troll.
- [ ] A `boss: true` Ghast draws `creature_ghast_base` (or its stand-in) at the boss aim with the boss plate.
- [ ] A variant whose group is not in draws its stand-in (the goblin, ogre and dark warrior their named ones, tinted), never the placeholder; the coverage test holds every variant row to a stand-in on `creatures`.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Bounds

Client only. No HTTP contract change; generated client untouched.

## Blocked By

None

## Spec Reference

FS-C8VM7 §F R34-R35, §G R41, R44; ADR-0081 Decisions 1, 5; user stories 4, 16, 24; acceptance criteria "Client" 1-2, 6.

## TDD Approach

- RED: `monsterLook("ogre_mauler")` is brute at aim 1.5; `drawnLook("goblin_reaver", artWithout)` is the ghoul under the goblin tint; a boss Ghast scales to the boss aim.
- GREEN: the rows, the aim override, the champion rule, the on-demand rows.
