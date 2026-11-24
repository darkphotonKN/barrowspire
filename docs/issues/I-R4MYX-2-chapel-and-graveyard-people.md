---
id: I-R4MYX-2
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-1]
labels: [ready-for-agent]
title: "FS-R4MYX slice 2: game-service places the Confessor, four worshippers and three outdoor mourners"
---
Implements FS-R4MYX §D Requirements 16–20

**Lane: game-service code (agent, under the charter's bounds only: hub map data and its tests).**

## What to Build

Eight more fixed residents (function `""`, no quarter, no velocity), thirteen in all, per R17:
the Confessor (765, 1210, appearance `confessor`) and four worshippers inside the chapel; three
mourners outdoors in the graveyard (the server knows nothing of the graveyard but their points).

- `hubFixedResidents` gains, in this order: Confessor, Penitent, Chandler, Goodwife, Ploughman,
  Keener, Widower, Veteran, with the FS's points and looks. Names are exact (the client keys by
  them).
- `hubAppearances` (the test's list of looks the client draws) gains `confessor` (R18).
- `TestHubFixedResidents_StandWhereTheMapPutsThem_AndNeverMove`: the thirteen names.
- `TestHubLayout_NobodyIndoors_IsTalkedToThroughAWall`: every fixed resident is indoors (and
  passes R14) **or** outdoors; exactly Keener, Widower and Veteran are outdoors.
- A new test for outdoor fixed residents (R20): outside every footprint, inside the map, more than
  `NPCInteractRange` from every wall of every building, at least `NPCInteractRange` + 40 from every
  function NPC, more than 120 px from every spawn→gate segment.
- `TestHubLayout_EveryoneIndoors_CanBeReachedFromTheDoor` covers the chapel (the Confessor and
  the four worshippers in talk range of ground reached from the east door).
- Rewrite the golden with `-update`.

Expected files:
- `game-server/game-service/internal/game/hub_map.go`
- `game-server/game-service/internal/game/hub_map_test.go`
- `game-client/src/render/world/hubTown.golden.json` (by `-update` only)
- the `slog` line in `InitialHubMapObjects` needs no change (it counts)

Not touched: the client's code, any proto or `NPCState` field.

## Acceptance Criteria

- [ ] Thirteen fixed residents; the eight at the FS's points (or passing ones, noted), never
      moving across 120 ticks; the Confessor's appearance `confessor`, the others existing looks.
- [ ] Go test: the Confessor and the four worshippers are each > `NPCInteractRange` from every
      chapel wall rect and reachable from the east door.
- [ ] Go test: exactly the three mourners stand outdoors, each passing every R20 rule.
- [ ] Golden rewritten by `-update`; `go test ./...` and `make lint` green.
- [ ] Commit notes the final points for I-R4MYX-6 and I-R4MYX-7.

## Blocked By

I-R4MYX-1 (same file, `hub_map.go`, and the chapel's walls the tests measure against)

## Spec Reference

FS-R4MYX §D R16–R20; user stories 8, 10, 11, 18, 29.

## TDD Approach

- RED: the outdoor-resident test with a mourner placed 70 px from the chapel's west wall.
- GREEN: the eight entries at their points; widen the indoors test to "indoors or outdoors".
