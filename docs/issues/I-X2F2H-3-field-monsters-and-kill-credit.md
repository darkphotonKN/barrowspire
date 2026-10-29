---
id: I-X2F2H-3
status: open
implements: FS-X2F2H
blocked_by: [I-X2F2H-1]
labels: [blocked]
title: "FS-X2F2H slice 3: boars roam the Meadows, respawn at their points, and only the killer earns the XP (game-service + game-client)"
---
Implements FS-X2F2H §A (Requirement 6), §D (Requirements 26–30), §E (Requirements 36–37), §H (Requirement 56)

**Author: agent.** This is FS-X2F2H's **field monster** slice: FS-3QHQZ's
I-3QHQZ-3 feeds the Forest's spawn points and roster into the spawn path made here.

## What to Build

**game-service**

1. **Monsters tick in fields** (FS §A R6): flip slice 1's switch so monster AI, monster death and
   kill records run in `field` worlds as in runs.
2. **The boar archetype** (FS §E R37): `MonsterArchetypeBoar = "boar"`, a `monsterSheets` row
   (HP 36, damage 5, attack interval 1.2 s, wind-up 0.45 s, range 45, move 140, defense 2, MR 0,
   aggro 200, leash 450), a `killExperienceBase` row of 8, and a field elite prefix list (`Old`,
   `Scarred`, `Great`) used instead of `ElitePrefixes` for field creatures. All starting values in
   `monster_tuning.go`.
3. **Field tuning** (FS §E R36): stat factor 0.75, the Meadows level band 1–4, respawn 45 s, as
   constants beside the Spire's, carried on the field place.
4. **Spawn points** (FS §D R26–R27): at boot every Meadows spawn point (slice 1's map data) holds
   one monster; a point holds at most one, living or dead. 45 s after its monster dies, the point
   rolls a new one; while a player in play is within `MonsterDelverExclusion` of the point, it
   waits and retries each second. One field spawn path, fed by the place's creature table, so
   FS-3QHQZ plugs its roster in.
5. **Rolling** (FS §D R28–R29): archetype from the creature table, level uniform in the band, elite
   with `eliteChance(1)` read live; stats = `statsAt(level)` × the stat factor (HP and damage at
   least 1), then `.elite()` on top for an elite. The factor is applied in one function, never
   as a second sheet. Not party-scaled.
6. **Kill credit** (FS §D R30): a field kill consumer gives the kill's XP (the Spire's
   `killExperience`) to the killer's body only, if it is in this field, alive or fallen; nobody
   else. It tallies the visit's XP per member, so slice 6 can take and settle it. The run's
   party-wide `KillExperience` is unchanged.

**game-client**

7. `FieldScene` draws monsters, their plates and HP bars, attacks and projectiles, and lets the
   player target and strike, **shared with the run scene, never copied** (FS §H R56): extract
   what `FieldScene` needs from `BarrowspireScene` into shared modules, or share by composition;
   run behaviour unchanged. The boar draws with the fallback look until slice 8 bakes it.
   Run-only surfaces (result card, escape, stairs and floor HUD, die-by-choice, leave-run) never
   appear in a field.

**Hard bounds:** no matchmaker / match queue change, no HTTP endpoint, no migration.

## Acceptance Criteria

- [ ] A booted Meadows has one boar on every spawn point, levels in 1–4.
- [ ] A field boar's HP, damage, defense and MR equal `statsAt(level)` × 0.75 (rounded, HP/damage ≥ 1); an elite's HP and damage are that × the Spire's elite multipliers (table test against the live functions, not copied numbers).
- [ ] Changing the Spire's `eliteChance` in a test changes the field's elite rate with no field edit.
- [ ] A point refills 45 s after its boar dies, and waits while a player stands within the exclusion radius.
- [ ] Only the killer gains XP from a field kill; another player beside them gains nothing; a killer who left gains nothing; a run's kill still awards the whole party.
- [ ] Field monsters attack and are killed; corpses lie and clear as in runs.
- [ ] Client: monsters draw and can be fought in `FieldScene`; `BarrowspireScene` tests unchanged and green; no run-only surface in a field.
- [ ] `go test ./...`, `golangci-lint run`, `npm test`, lint: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/components/monster.go` (`MonsterArchetypeBoar`)
- `game-server/game-service/internal/game/monster_tuning.go` (boar sheet, XP base, field factors, prefixes)
- `game-server/game-service/internal/game/field_population.go` (new: spawn points, respawn, field roll) and test
- `game-server/game-service/internal/game/field_kill_experience.go` (new: killer-only consumer, visit tally) and test
- `game-server/game-service/internal/game/session.go` (monster systems on for `field`, subscribe the field consumers)
- `game-server/game-service/internal/game/field_place.go` (creature table, band, stat factor on the place)
- `game-client/src/scenes/FieldScene.ts`, `FieldScene.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (only to extract shared combat / monster drawing) and any new shared module beside `src/render/creatures/`

## Blocked By

- I-X2F2H-1: the field world, its place data and `FieldScene`.

## Spec Reference

FS-X2F2H §A R6; §D R26–R30; §E R36–R37; §H R56; User Stories 10, 13, 14, 17; Acceptance
Criteria 15, 17, 19, 22; Edge States "Empty field", "Killer dies", "Kill by a projectile after
the shooter left", "Character at the level cap"; Decision log D12, D14–D16, D24, D26.

## TDD Approach

- RED: field roll stats table against `statsAt` × 0.75 and `.elite()`.
- RED: killer-only XP with two players in the field.
- RED: respawn timer and the exclusion wait, with an injected clock.
- GREEN: population, consumer, the switch.
