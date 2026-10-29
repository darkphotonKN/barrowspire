---
id: I-JTNPR-1
status: done
implements: FS-JTNPR
blocked_by: []
labels: [ready-for-agent]
title: "FS-JTNPR slice 1: the Shadow Shot attack row replaces the triple-arrow volley"
---
Implements FS-JTNPR §Requirements 1–7

**Author: agent**

## What to Build

game-service resolves `cast_skill {skill_id: "shadow_shot"}` into one slow, heavy projectile,
and the archer's triple-arrow volley is removed.

- In `internal/systems/combat.go`, add a Shadow Shot row to `attackTable` with FS-JTNPR R1's
  values: one projectile (spread `{0}`), physical, Agility scaling, coefficient 3.2, cooldown
  1.2 s, projectile kind `shadow_shot`, speed 260, range 650, radius 10, cost 40.
- Add `AttackShadowShot AttackKind = "shadow_shot"` in `internal/components/attack.go`; delete
  `AttackTripleArrow` and its row.
- In `skillAliases`, map `shadow_shot` to the new kind; remove `triple_arrow` and
  `multishot_arrow`. Leave the mage's `triple_fireball` / `multishot_fireball` untouched.
- **Cost, and the ordering with FS-8AY7S (R5).** Price the row at 40 in whatever pool the attack
  table charges when this lands:
  - FS-8AY7S's resource not yet landed: `manaCost: 40`, against the archer's 100 mana with no
    regen (two shots a run, an accepted transition state). FS-8AY7S's migration then carries the
    40 across to stamina with the other abilities' costs; say so in the PR so the FS-8AY7S
    implementer sees it.
  - FS-8AY7S's resource already landed: 40 in its cost field, charged against stamina.
- No new component, field or message: the server never learns about the hold (ADR-0030, R4).
  The existing resolve path already refuses a cast inside its cooldown or short of the
  resource, and already gives every projectile the Lantern's pierce through `snapshot`.
- Port the tests that name the volley to Shadow Shot (they keep covering cooldown, cost,
  projectile creation, pierce and kill credit): `internal/systems/combat_test.go`,
  `internal/systems/unique_effects_test.go`, `internal/game/combat_test.go`,
  `internal/game/monster_death_test.go`.

**Ship with I-JTNPR-2 and I-JTNPR-3.** Once this lands, today's client's `triple_arrow` is an
unknown skill, and a `shadow_shot` projectile is drawn as a fireball until I-JTNPR-3 maps it.

## Acceptance Criteria

- [ ] `attackTable` holds the Shadow Shot row with R1's values and no triple-arrow row.
- [ ] `SkillAttackKind("shadow_shot")` returns `AttackShadowShot`; `"triple_arrow"` and
      `"multishot_arrow"` return false.
- [ ] `AttackTripleArrow` no longer exists anywhere in game-service.
- [ ] A cast with the resource and off cooldown creates exactly one `shadow_shot` projectile with
      speed 260, range 650, radius 10, flying toward the target point.
- [ ] The cast spends 40 of the charged pool and starts a 1.2 s cooldown.
- [ ] A cast inside 1.2 s, or with under 40 in the pool, creates nothing, spends nothing and
      starts no cooldown.
- [ ] A hit is physical, Agility-scaled, coefficient 3.2.
- [ ] With the Lantern of the Drowned worn, the bolt hits its first target and one more distinct
      target; without it, it stops at the first.
- [ ] `handleCastSkill(archer, "triple_arrow", …)` returns `ErrUnknownSkill`.
- [ ] Kill credit for a Shadow Shot reaches the archer who fired it, including after their death.
- [ ] No hold-tracking state was added.
- [ ] `go test ./...` and `golangci-lint run` pass in `game-server/game-service`.

## Blocked By

None. (Cost lands in today's mana pool if FS-8AY7S's stamina resource has not landed yet; see
above.)

## Spec Reference

FS-JTNPR §Requirements 1–7; §User Stories 6, 12, 15, 22–25; §Acceptance Criteria "game-service";
§Edge States "Modded client", "Old client after the server ships", "Interim pricing", "Died with
a bolt in flight", "Cursor on the archer". ADR-0030.

## Files expected

- `game-server/game-service/internal/systems/combat.go`
- `game-server/game-service/internal/components/attack.go`
- `game-server/game-service/internal/systems/combat_test.go`
- `game-server/game-service/internal/systems/unique_effects_test.go`
- `game-server/game-service/internal/game/combat_test.go`
- `game-server/game-service/internal/game/monster_death_test.go`

## TDD Approach

- RED: in `combat_test.go`, the alias table case `{"shadow_shot", AttackShadowShot, true}` and
  `{"triple_arrow", _, false}`; a resolve test that one `shadow_shot` intent spawns one
  projectile of kind `shadow_shot` at speed 260 / range 650 / radius 10, spends 40 and sets a
  1.2 s cooldown.
- GREEN: the new kind, row and alias; delete the volley.
- Then port the volley's pierce, kill-credit and handler tests to the new id.
