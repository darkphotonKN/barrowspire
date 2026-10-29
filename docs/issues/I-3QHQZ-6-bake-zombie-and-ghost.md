---
id: I-3QHQZ-6
status: open
implements: FS-3QHQZ
blocked_by: [I-3QHQZ-5]
labels: [ready-for-agent]
title: "FS-3QHQZ slice 6: zombie and ghost baked on the shared rig and drawn as monsters"
---
Implements FS-3QHQZ §C (Requirements 29, 30)

Agent lane. **Ends at a HITL gate:** the owner approves the contact sheet (2 creatures × 8
directions × idle, walk, attack, death, at game scale) before this issue closes. Independent of
the server: until the server sends `zombie` / `ghost`, nothing draws them, and until these sheets
exist those archetypes fall back to the troll look. Blocked by slice 5 only to serialize the
`catalogue.js` / `manifest.json` rewrite.

## Files expected to touch

- `game-client/tools/bake/page/characters/`: zombie and ghost builders (new module(s) or
  `cast.js`), their materials and clips, `CAST` entries `creature_zombie_base` and
  `creature_ghost_base`, grouped as the bake groups fodder.
- `game-client/tools/bake/page/catalogue.js` (only if registration needs it).
- `game-client/public/art/`: rebaked atlas page(s), additive `manifest.json` entries.
- `game-client/src/render/creatures/monsters.ts` and `monsters.test.ts`: `MONSTER_LOOKS.zombie`
  and `MONSTER_LOOKS.ghost`, both `tier: "fodder"`.
- `game-client/src/types/gameState.ts`: `MonsterArchetype` gains `"zombie" | "ghost"`.
- `game-client/src/render/art/manifest.test.ts`.

## What to Build

- **Zombie:** a shambling, hunched corpse in a rotted burial shroud, one arm longer and heavier,
  head lolling, earth and moss on grave-rot skin; a slow, dragging walk; a readable raised-arm
  wind-up; its death folds and collapses.
- **Ghost:** pale, thin and translucent (body alpha ≈ 0.6 baked into the sheet), legs fading
  below the knee, long reaching arms; its ember-red eyes stay opaque. It must not read as
  FS-Q14EV's wraith (dark, ragged, opaque). Its death thins and dissolves.
- Both obey "Enemy design language": grave materials from the cold end of `BARROW`, ember-red
  eyes as the one emissive (marker material), a silhouette that breaks the human line, fodder
  size 0.85–1.0 × player height, no gore.

## Acceptance Criteria

- [ ] `creature_zombie_base` and `creature_ghost_base` baked, 8 directions × idle/walk/attack/death, in the manifest.
- [ ] `monsterLook("zombie")` / `monsterLook("ghost")` return their sheets at fodder tier; an unknown archetype still falls back to the troll (test).
- [ ] `MonsterArchetype` includes both; `tsc` and the test suite green.
- [ ] The ghost's body is translucent and its eyes are not.
- [ ] Contact sheet produced; **owner approval recorded** before close.

## Blocked By

I-3QHQZ-5 (serializes the bake catalogue and manifest rewrite)

## Spec Reference

FS-3QHQZ §C Requirements 29, 30; Acceptance Criteria "Forest look (§C)" items on `MONSTER_LOOKS`
and contact sheets; Edge States "Client before the creature art"; User Stories 17, 18, 30, 31.

## TDD Approach

- RED: `monsterLook("zombie")` expects `creature_zombie_base` at fodder tier.
- GREEN: add the looks; then bake.
