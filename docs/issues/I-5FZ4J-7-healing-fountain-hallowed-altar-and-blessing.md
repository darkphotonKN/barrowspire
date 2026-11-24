---
id: I-5FZ4J-7
status: done
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-6]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 7: the healing fountain, the hallowed altar and the Blessing"
---
Implements FS-5FZ4J §G R40–R44, §I R46 (`fountain`, `hallowed_altar`), R47 (`blessed`)

**Hotspot:** `session.go`, the run plan beside `tome.go`, `systems/resource.go`, `monster_drops.go`. One writer at a time.

## What to Build

- **The fountain** (R40–R41): ~50% of floors 2+, a room per the rules and excluded from monster
  population, the pool (150% of the highest max health in play at the build), 4%/s within 2 cells,
  nothing drawn at full health, dry at 0. Name the "respite room" exclusion so FS-9JV5K's merchant
  room reuses it.
- **The hallowed altar** (R42–R43): a run-plan roll at run creation beside the tome plan (30%,
  floor 2..height−1, 50% hidden: the floor asks the layout for one more hidden room), placed as the
  tome's altar is; a 2 s `pray` timed interact (slice 4's generalised timed open); every party
  member in play on the floor gains the Blessing; `altar_prayed` after. A distinct entity kind from
  the Altar of Consecration.
- **The Blessing** (R44): a delver component kept across floors, lost on death; +5% to resource
  regen summed beside the passive bonus (never written into it); kill drop chance ×1.10 for kills
  credited to a blessed killer. `blessed` on the public player state.

## Acceptance Criteria

- [ ] Fountain odds over a seed sweep (none on floor 1 or the top), its room holds no monster, heals 4%/s within 2 cells, draws nothing at full health, dry at 0.
- [ ] Altar plan: 30% of runs, floor in 2..height−1, half the time in a hidden room; placed on its floor.
- [ ] A completed prayer blesses every party member in play on the floor; a second interact replies `altar_prayed`.
- [ ] Blessing: regen × 1.05, a blessed killer's drop chance × 1.10, kept across a floor change, gone on death.
- [ ] `make test` and `make check` green.

## Blocked By

I-5FZ4J-6.

## Spec Reference

FS-5FZ4J §G R40–R44, §I R46–R47.

## TDD Approach

- RED: a delver at half health within 2 cells of a full fountain gains 4% of max health over one second.
- GREEN: the fountain system.
