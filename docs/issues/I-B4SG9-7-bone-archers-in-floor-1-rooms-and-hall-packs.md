---
id: I-B4SG9-7
status: done
implements: FS-B4SG9
blocked_by: [I-B4SG9-3, I-B4SG9-4, I-B4SG9-6]
labels: []
title: "FS-B4SG9 slice 7: Bone Archers take ghouls' places in floor 1's rooms and hall packs, and the hall's archer guards its chest"
---
Implements FS-B4SG9 §B (R14–R19)

**Type:** AFK. **Merges last:** this is the slice that makes archers appear, so the AI
(I-B4SG9-3), the flight (I-B4SG9-4) and the look (I-B4SG9-6) land first; a client without them
draws an archer as a troll and its arrow as a fireball.

**Hotspot:** `dungeon_population.go` and `monster_tuning.go`. A sibling item of the same charter
(the chest-open channel) works on the chest path on another branch: this slice does not edit
`guarded_chests.go`, the interact handler or the client's chest code, and puts its guard test in
a file of its own.

## Files owned

- `game-server/game-service/internal/game/dungeon_population.go` (`single` for ordinary rooms and top-ups; `hallPack`)
- `game-server/game-service/internal/game/monster_tuning.go` (the share and the per-pack count, as named constants beside the dungeon population's)
- Tests: `internal/game/dungeon_population_test.go`; a new `internal/game/bone_archer_guard_test.go`

Not owned: `monster_population.go` `rollArchetype` and `spireNonTrollMix`. Corridors and treasure
guards roll through them and must stay as they are (R17), as must every floor of depth 2 and up.

## What to Build

On a dungeon floor of **depth 1** only (R14; every Spire floor is a dungeon, so this is a depth
test):

- **Ordinary rooms** (R15): each monster rolled for an ordinary room, a top-up included, that
  comes up a ghoul is a Bone Archer instead with probability 0.25, rolled independently. Trolls,
  Barrow Thralls and Spire Wraiths are untouched.
- **Hall packs** (R16): the first of the pack's ghouls is a Bone Archer, rolled for level and
  elite as that ghoul would be. The pack is 1 troll, 1 Bone Archer, 1–3 ghouls. A short pack
  keeps its archer for as long as it fits any ghoul-slot member.
- **Never** in a corridor or among a treasure room's guards (R17), on depth ≥ 2, or on a floor 1
  built of buildings after a failed generation.
- **Guard** (R18): nothing to build. The archer is placed with the hall-pack role, so the hall's
  chest already waits on it. The test proves it.
- Counts, spacing, exclusion and trim are unchanged (R19).

## Acceptance Criteria

- [ ] Over many seeded floor-1 populations, the share of ordinary-room ghoul rolls that are Bone
      Archers is near 0.25, and the troll, Barrow Thrall and Spire Wraith shares are unchanged.
- [ ] Every placed hall pack that fitted at least one of its ghouls holds exactly one Bone Archer;
      a short pack keeps it; the pack's size range is unchanged.
- [ ] No Bone Archer is ever placed in a corridor, as a treasure guard, on a floor of depth ≥ 2, or
      on a floor 1 without a dungeon layout.
- [ ] A hall's chest refuses with `container_guarded` while only the hall's Bone Archer stands, and
      opens once it is dead. The existing guarded-chest tests pass unchanged.
- [ ] The floor total stays within 45–70; the existing population tests and the population
      benchmark still pass.
- [ ] Setting the share constant to 1 in a local build makes every ordinary-room ghoul an archer.
- [ ] `go test ./...` and `golangci-lint run` pass in game-service.

## Blocked By

I-B4SG9-3, I-B4SG9-4, I-B4SG9-6

## Spec Reference

FS-B4SG9 §B R14–R19; user stories 1, 13, 17, 18, 21; edge states "Hall pack with no room for any
ghoul", "Elite hall archer", "A room that rolls only non-ghouls", "Old client, new server".

## TDD Approach

- RED: a seeded floor-1 population holds one Bone Archer per hall pack and none in corridors or
  treasure rooms; a depth-2 population holds none.
- GREEN: the turn in `single` and the first ghoul of `hallPack`, behind the depth test.
