---
id: I-8AY7S-2
status: done
implements: FS-8AY7S
blocked_by: [I-8AY7S-1]
labels: [ready-for-agent]
title: "FS-8AY7S slice 2: max_mana gear and level growth move the right pool"
---
Implements FS-8AY7S §Requirements 13–15

**Author: agent**

## What to Build

game-service only. Make gear and level growth respect the pool's kind.

- The `max_mana` affix (id and item text unchanged, no items-service change) raises the max of a
  **mana or stamina** pool through the existing `applyMaxima` / `shiftMaximum` rule (gain never
  raises current except on the seating pass; loss lowers current to the new max; 0 stays 0). A
  `parry_charges` pool ignores it; its max stays 3 (`internal/systems/gear.go`).
- Level growth: `ClassGrowth.MaxMana` becomes 0 for warrior and archer (the mage keeps +10). It
  is applied to the pool only when the kind is `mana`, both in `classAtLevel` (seating at a
  level) and in `gainExperience` (level-up in a run). Growth never touches current on a mid-run
  level-up, as today.

## Acceptance Criteria

- [ ] Worn `max_mana` +10: warrior and archer stamina max 110, mage mana max 160; removing it
      returns them to 100 / 150, lowering current to the new max when it was above.
- [ ] Seated with that gear: current is the raised max (seating pass).
- [ ] A `parry_charges` pool with `max_mana` worn: max 3, current unchanged.
- [ ] Mage seated at level 5: mana max 190. Warrior and archer seated at level 5: stamina max 100.
- [ ] Mage levelling 1 → 2 in a run: max +10, current unchanged. Warrior levelling: no change.
- [ ] Class growth rows: warrior and archer `MaxMana` 0; mage 10.
- [ ] `go test -race ./...` green in game-service; `golangci-lint run` clean.

## Blocked By

I-8AY7S-1 (the resource component and its kinds).

## Spec Reference

FS-8AY7S §Requirements 13, 14, 15; §User Stories 17–20; §Edge States "Gear swap mid-run",
"Level-up mid-run".

## TDD Approach

- RED: `internal/systems/gear_test.go`: `max_mana` on a stamina pool, on a mana pool, on a
  `parry_charges` pool; removal lowers current.
- RED: `internal/game/kill_experience_test.go`, `character_seat_test.go`: growth by kind.
- GREEN: kind checks in the gear max shift and in growth; the two class rows.

## Files expected to touch

`game-server/game-service/internal/systems/gear.go`, `internal/systems/gear_test.go`,
`internal/game/session.go` (`Classes` growth rows), `internal/game/class_growth.go`,
`internal/game/kill_experience.go`, `internal/game/kill_experience_test.go`,
`internal/game/character_seat_test.go`, `internal/game/gear_test.go`.
