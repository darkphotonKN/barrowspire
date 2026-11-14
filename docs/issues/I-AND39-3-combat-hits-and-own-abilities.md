---
id: I-AND39-3
status: done
implements: FS-AND39
blocked_by: [I-AND39-1]
labels: [ready-for-agent]
title: "FS-AND39 slice 3: hits and the player's own abilities sound, in the run and the field (game-client)"
---
Implements FS-AND39 §Requirements A

**Lane: agent.** Hotspots: `BarrowspireScene.ts` and `FieldScene.ts`. In the run, touch only
`monsterEffects` (~959), the `CombatLook` wiring (~875–898) and the own-health check (~3893). In
the field, touch only the `fieldCombatOnScene(...)` call (~338), to hand over the player.

## What to Build

- `hit_monster` (R2): `MonsterEffects` gains a hit hook, called from `MonsterRoster.sync` where
  `hit` is true. The run's `monsterEffects` and the field's (`fieldCombat.ts` ~216) play
  `hit_monster`.
- `hit_player` (R3):
  - run: beside the own-body flash at BarrowspireScene ~3893;
  - field: in `FieldCombat`'s state read (~110), for the own entry only (`me`), never a teammate's.
- Abilities (R4): `PlayerCombat` reports `dash`, `triple_fireball`, `shadow_shot` and `parry`
  through one hook of their own, called once at each send. It is not `look.fireball`, which the
  primary shares. The run's and the field's look play the matching effect.

## Acceptance Criteria

- [ ] Every criterion under *Combat (run and field)* in FS-AND39.
- [ ] `monsters.test.ts`, `playerCombat.test.ts` and `fieldCombat.test.ts` cover the hooks. The
      roster test covers: a shown drop, a first-seen monster, a hidden monster, two in one state.
      The combat test covers each class's cast and each silent case. The field test covers own
      vs teammate.
- [ ] Tests pass: full vitest, tsc, lint, lint:fence.

## Blocked By

I-AND39-1 (the player in each scene)

## Spec Reference

FS-AND39 §Requirements R1–R4; user stories 1–9, 22.

## Files it expects to touch

- `game-client/src/render/creatures/monsters.ts` (+ test)
- `game-client/src/render/combat/playerCombat.ts` (+ test)
- `game-client/src/scenes/fieldCombat.ts` (+ test)
- `game-client/src/scenes/FieldScene.ts` (~338 only)
- `game-client/src/scenes/BarrowspireScene.ts` (~875–898, ~959, ~3893 only) (+ `BarrowspireScene.test.ts` if a scene test is needed)
