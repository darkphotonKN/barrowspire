---
id: I-C8VM7-8
status: done
implements: FS-C8VM7
blocked_by: [I-C8VM7-7]
labels: []
title: "FS-C8VM7 slice 8: a floor's pool art is fetched when its map arrives, and what the new pool does not name is evicted"
---
Implements FS-C8VM7 §G (R40, R42-R43); Implements ADR-0081

**Type:** AFK. **Hotspot (client):** `sceneArt.ts`, `phaser.ts`, `BarrowspireScene.ts`. Runs
alongside I-C8VM7-9 if it keeps out of `monsters.ts` beyond the roster's re-dress hook.
Its server counterpart, the `enemy_pool` field, is I-C8VM7-4; this slice builds against the spec.

## Files expected to touch

- `game-client/src/types/gameState.ts` (the floor map's optional `enemy_pool: string[]`)
- `game-client/src/render/art/sceneArt.ts` (variant groups marked floor-scoped; the groups a pool names)
- `game-client/src/render/art/phaser.ts` (`onDemandArt`: fetch a list of groups; call off a download a new pool does not name)
- `game-client/src/render/art/evict.ts` (evict named variant groups, animations first, mid-scene)
- `game-client/src/scenes/BarrowspireScene.ts` (on a new floor's map: prefetch the pool's groups not held, evict the held variant groups it does not name)
- Tests: `src/render/art/sceneArt.test.ts`, `src/render/art/evict.test.ts`, `src/render/art/phaser.test.ts`, `src/scenes/BarrowspireScene.test.ts`

## What to Build

- R42: on a floor map for a new floor, queue the groups of `enemy_pool`'s archetypes not held,
  no bar or fade. A snapshot-listed variant not held and not in the pool (a champion) is fetched
  on its first listing (ADR-0071 Decision 2, already wired by I-C8VM7-7).
- R43: on the same map, evict every held variant group the new pool does not name; keep a group
  both name; call off a download the new pool does not name; never touch the blood demon's group.
- A map without `enemy_pool` changes nothing: sight-only fetching, no per-floor eviction.
- A failed group keeps its stand-in with one warning; the next floor naming it asks again.

## Acceptance Criteria

- [ ] A new floor map queues exactly the pool's groups not held, and evicts the held variant groups it does not name; a shared group is kept; the blood demon's group is untouched.
- [ ] A download for a group the new pool drops is called off and lands nothing.
- [ ] A map without `enemy_pool` neither fetches nor evicts.
- [ ] A re-sent map for the same floor (ADR-0060's re-request) does not refetch or evict.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Bounds

Client only. No HTTP contract change; generated client untouched.

## Blocked By

I-C8VM7-7

## Spec Reference

FS-C8VM7 §G R40, R42-R43; ADR-0081 Decisions 2-4, 6; §Edge States (lost map, older server, failed group, floor change mid-download, leaving the run); user story 25; acceptance criteria "Client" 5, 7.

## TDD Approach

- RED: with groups `ghast` and `shade` held, a floor map naming `ghast` and `ogre` queues `ogre` and evicts `shade`.
- GREEN: the floor-scoped table, the fetch-many, the evict-named, the scene hook.
