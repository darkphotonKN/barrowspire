---
id: I-MMA2H-3
status: open
implements: FS-MMA2H
blocked_by: [I-MMA2H-1]
labels: [ready-for-agent]
title: "FS-MMA2H slice 3: every town door gap and the Inn's partition gap are 80 px wide (game-service)"
---
Implements FS-MMA2H §C

**Unblocked 2026-11-11: the owner answered D1 with (b)** (FS-MMA2H §C, Decision D1; ADR-0073). The
Inn's partition stays at x 505-525; the Inn's street gap is 80 px at x 525-605, 15 px east of
centre; nothing indoors moves. Every other town building's gap is centred.

**Lane: agent (AFK), by charter.** Merges as a pair with I-MMA2H-4: rewriting the
golden turns the client's town suites red until its mirror follows.

## Files owned

- `game-server/game-service/internal/game/hub_map.go` (`hubDoorWidth` reading the run door's width;
  the Inn's data only as D1 settled, its street gap at x 525-605; comments that say "50" or "a run door wide")
- `game-server/game-service/internal/game/hub_map_test.go` (`runDoorWidth`), `hub_town_golden_test.go`
- `game-client/src/render/world/hubTown.golden.json`, written by
  `go test ./internal/game -run TestHubTown_MatchesTheGolden -update`, never by hand

## What to Build

The hub's gap is the run door's width (R2), so each town building's south wall and the Inn's
partition are cut around 80 px gaps (R9). No wall stands in a gap (R10), with the Inn's street door
laid out as D1 says: at x 525-605. Every FS-B0H2D rule stated by the gap holds as written (R11). Then the golden
is rewritten by its test (R12).

## Acceptance Criteria

- [ ] Each town building's south wall has a centred 80 px gap (the Inn's at x 525-605, D1), and the
      Inn's partition an 80 px gap centred on its depth; the hub has no door entity.
- [ ] Go test: no wall, partition or furnishing of a building overlaps one of its door gaps.
- [ ] The existing hub layout tests pass at 80: lanes, ground in front of each door, reachability,
      no talking through a wall, furnishing clearances.
- [ ] The door width is defined once in game-service; no other non-test source holds it as a number.
- [ ] `go test ./...` in game-service passes with the rewritten golden.

## Blocked By

- I-MMA2H-1 (the one named width).
- Owner decision D1: answered 2026-11-11, (b).

Blocks I-MMA2H-4.

## Spec Reference

FS-MMA2H §C R9-R12, Decision D1; §A R2, R3; user stories 3, 4, 13.

## TDD Approach

- RED: `runDoorWidth` in `hub_map_test.go` becomes 80; the gap tests and the Inn's partition test
  go red.
- GREEN: the hub reads the shared width; the Inn follows D1; then `-update` the golden.
