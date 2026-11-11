---
id: I-B4SG9-9
status: open
implements: FS-B4SG9
blocked_by: []
labels: [ready-for-agent]
title: "FS-B4SG9 slice 9: Bone Archers on every dungeon floor, placed by floor 1's rules"
---
Implements FS-B4SG9 §B (R14 as amended 2026-11-12, R15–R19)

**Type:** AFK. The owner's change of 2026-11-12, "弓箭手可以套用到其他樓層": the depth test that
kept Bone Archers to floor 1 goes. I-B4SG9-7 built the rule; this slice only widens where it
applies. No client change: the client draws a `bone_archer` on any floor already.

## Files owned

- `game-server/game-service/internal/game/dungeon_population.go` (`single`, `hallPack`, the
  depth test `hasBoneArchers`)
- `game-server/game-service/internal/game/monster_tuning.go` (the comments on
  `BoneArcherRoomShare`, `HallPackBoneArchers` and `spireNonTrollMix`; no value changes)
- Tests: `internal/game/dungeon_population_test.go`

Not owned: `monster_population.go` `rollArchetype` and `spireNonTrollMix`'s values, the
guarded-chest rule, the client, proto, the gateway, any database.

## What to Build

On **every** dungeon floor, floor 1 and every Spire floor above it, the top floor included (R14):

- **Ordinary rooms** (R15): a monster rolled for an ordinary room, a top-up included, that comes
  up a ghoul is a Bone Archer instead at `BoneArcherRoomShare` (0.25), on a draw of its own.
- **Hall packs** (R16): the first of the pack's ghouls is a Bone Archer, so it is one of the hall
  chest's guards (R18).
- **Never** in a corridor or among treasure guards (R17), and never on a floor of buildings left by
  a failed generation, at any depth (R14).
- Levels, elites, experience and drops are each floor's rules for a ghoul there; no number is new.

## Acceptance Criteria

- [ ] On floors 2 and up, over many seeded floors, the share of ordinary-room ghoul rolls that are
      Bone Archers is near 0.25, and the troll (that floor's share), Barrow Thrall and Spire Wraith
      shares are unchanged.
- [ ] On floors 2 and up, every placed hall pack that fitted any ghoul holds exactly one Bone
      Archer, and a short pack keeps it, as on floor 1.
- [ ] No Bone Archer in a corridor or among treasure guards on any floor, and none on a floor of
      buildings at depth 1 or above.
- [ ] Floor 1 places exactly what it placed before: a same-seed comparison before and after is
      identical on floor 1.
- [ ] On floors 2 and up, a same-seed comparison before and after shows that only ghoul rolls in
      ordinary rooms and hall packs changed (some are now Bone Archers): the non-ghoul archetypes,
      every other monster's spot, level and elite, the treasure guards and the demons are the same
      once the room turn's own draw is aligned.
- [ ] The existing floor-1 population and guarded-chest tests pass unchanged.
- [ ] `go build ./...`, `go vet ./...`, `go test ./...` and `golangci-lint run` pass in
      game-service.

## Blocked By

None

## Spec Reference

FS-B4SG9 §B R14 (amended 2026-11-12), R15–R19; user stories 1, 17; acceptance criteria "On seeded
dungeon floors…", "Every placed hall pack…", "No Bone Archer is ever placed…"; edge states "Floors 2
and up", "A floor of buildings, any depth".

## TDD Approach

- RED: the short-pack test's floor-2 row expects the archer; a depth-2+ build test expects archers
  at their share, one per hall pack and none in corridors or among treasure guards; the fallback
  test keeps "none" on a floor of buildings at depth 1 and 2.
- GREEN: drop the depth test from `single` and `hallPack`.
