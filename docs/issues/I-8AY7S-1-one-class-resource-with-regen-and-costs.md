---
id: I-8AY7S-1
status: done
implements: FS-8AY7S
blocked_by: []
labels: [ready-for-agent]
title: "FS-8AY7S slice 1: one class resource per delver, regenerating, paying for abilities"
---
Implements FS-8AY7S §Requirements 1–12

**Author: agent**

## What to Build

game-service only. Replace the shared mana pool with one generic class resource per delver,
give it regen, and price every ability in it.

- A resource component (pure data): `kind` (`mana` | `stamina` | `parry_charges`), `current`,
  `max`, `regenPerSecond`. It replaces `ManaComponent` and `ComponentTypeMana`
  (`internal/components/mana.go`, `internal/ecs/entity.go`); every reference moves to it.
  `current` must hold fractions exactly enough that 30 ticks at 20/s read 20 on the wire, never 19
  (FS §Requirements 5): pick a representation that cannot drift (e.g. sub-units) rather than a
  bare float sum.
- `ClassConfig` carries the resource instead of `Mana`, and names its **ability** (the attack
  row its right-click resolves to). `Classes` in `internal/game/session.go`: warrior and archer
  stamina 100, regen 20; mage mana 150, regen 4 (FS §Requirements 3). Abilities: warrior `dash`,
  mage `triple_fireball`, archer `triple_arrow` (FS §Requirements 12). The `parry_charges` kind
  (max 3, regen 0, seated at 0) exists and is unit-tested, but no class uses it yet (FS-MAMHR adds
  the mercenary).
- Seating (`CreatePlayerEntity`, `classAtLevel`): stamina and mana seated full, parry charges at 0
  (FS §Requirements 4).
- A regen system, run once per tick in `Session.step`, raising each in-play delver's pool by
  `regen × deltaTime`, capped at max; delvers not in play (`systems.InPlay` false) do not regen
  (FS §Requirements 5–6).
- `attackSpec.manaCost` becomes `cost`, paid from the caster's pool whatever its kind
  (`internal/systems/combat.go` `resolve`): `dash` 25, `triple_fireball` 15, `triple_arrow` 10,
  everything else 0 (FS §Requirements 8–10). Unaffordable → return before any effect, cost or
  cooldown, as today. Shadow Shot's 40 is FS-JTNPR's row to add; leave a comment at the table only
  if it helps, no row.
- Mechanical carry-over so the build stays green, **behaviour unchanged for now**: the gear
  system's max shift and level growth (`class_growth.go`, `kill_experience.go`) act on the new
  pool exactly as they acted on mana; the serializer fills the existing `current_mana` /
  `max_mana` from the pool (rounded down). Slices 2 and 3 change those rules and the wire.

## Acceptance Criteria

- [ ] `ManaComponent` / `ComponentTypeMana` no longer exist; every delver has exactly one
      resource component; monsters have none.
- [ ] Seated level-1 warrior and archer: stamina 100/100, regen 20; mage: mana 150/150, regen 4.
- [ ] A test delver with a `parry_charges` pool (max 3, regen 0) is seated at 0 and is unchanged
      after any number of ticks.
- [ ] Warrior at 0 stamina: 20 after exactly 30 ticks at 1/30 s, 100 after 150 ticks, never above
      max; mage at 0 mana: 4 after 30 ticks.
- [ ] Dead, escaped and left-behind delvers do not regen.
- [ ] Costs: `dash` 25, `triple_fireball` 15, `triple_arrow` 10; `slash`, `arrow`, `fireball` 0.
- [ ] Warrior with 24 stamina casts `dash`: no charge starts, stamina stays 24, no cooldown set.
      With 25: the charge starts, exactly 25 is subtracted, the cooldown is set.
- [ ] A full-stamina warrior dashes 4 times (cooldowns elapsed between) and the 5th is refused
      until regen covers it.
- [ ] A targeted cast that resolves to nothing still costs nothing (today's rule).
- [ ] Each class config names its ability; a test reads the ability's cost for each class.
- [ ] Existing gear, growth and serializer tests pass with the pool standing in for mana.
- [ ] `go test -race ./...` green in game-service; `golangci-lint run` clean.

## Blocked By

None.

## Spec Reference

FS-8AY7S §Requirements 1–12; §User Stories 1–6, 21, 24, 27, 28; §Edge States "Unaffordable
press", "Exactly enough", "Regen at max", "Floor change", "Death", "Escape / left behind",
"Modded client casting another class's skill".

## TDD Approach

- RED: `internal/systems/resource_test.go`: a warrior-shaped entity at 0 stamina, 30 ticks of
  the regen system at 1/30 s, assert 20 read through the same rounding the wire will use; a
  `parry_charges` pool unchanged; a dead delver unchanged.
- RED: `internal/systems/combat_test.go` / `dash_test.go`: 24 vs 25 stamina dash; costs per row.
- RED: `internal/game/session_test.go` (or `character_seat_test.go`): seated pools per class.
- GREEN: the component, the class rows, the regen system wired into `step`, the cost check.

## Files expected to touch

`internal/components/mana.go` (removed) → `internal/components/resource.go` (new),
`internal/ecs/entity.go`, `internal/game/factory.go`, `internal/game/session.go` (`Classes`,
`step`), `internal/game/class_growth.go`, `internal/game/kill_experience.go`,
`internal/systems/resource.go` (new) + `resource_test.go` (new), `internal/systems/combat.go`,
`internal/systems/gear.go`, `internal/components/gear_bonus.go` (field names only, if renamed),
`internal/serializer/state_serializer.go`, and the tests that build mana today:
`internal/systems/{combat,dash,gear}_test.go`,
`internal/game/{combat,gear,kill_experience,character_seat,loot_roll}_test.go`. All under
`game-server/game-service/`.
