---
id: I-5FZ4J-5
status: done
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-4]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 5: floor traps, poison and trap detection"
---
Implements FS-5FZ4J §D R23–R31, §I R46 (`traps`), R47 (`poisoned_for`), R48

**Hotspot:** `session.go`, `systems/combat.go` (the hit path), the serializer. One writer at a time.

## What to Build

- Trap placement (R23): the count by floor, the cell rules, at least half off the walk path to the gate where possible.
- The five kinds (R24–R28): fired by a delver's body centre entering the cell (a body-kind hook so a hired ally fires them later, FS-4EC7Z); never by monsters; re-arm 10 s; tripwire once (wakes an ambush, slice 2's wake); the gas vent's cloud cycle; floor-scaled damage through the normal hit path (it breaks a timed interact).
- **Poison** (R29): a status component on the delver (it carries across floors with the body),
  1%/s max health for 60 s, refreshed not stacked, lethal, not a hit (does not break a timed
  interact), cleared on death/escape/leave; a death by trap or poison credits no monster (R31). A
  small cure entry point (`curePoison(entity)`) for FS-9JV5K's antidote and FS-X2CMM's Brew.
- **Detection** (R30) reusing slice 4's: `traps` lists detected traps only, with `armed`,
  `revealed: false`, and a gas vent's `puffed_at` (R48).
- `poisoned_for` on the public player state (R47).

## Acceptance Criteria

- [ ] Trap count per floor (3 on floor 1, 8 on floor 10) and the placement rules over a seed sweep.
- [ ] Each kind fires on a delver entering its cell, never on a monster; damage = the floor's fodder hit × factor; re-arm at 10 s; tripwire spawns an ambush once.
- [ ] Gas vent: first puff on entering the cloud, then every 6 s while anyone stays; each puff poisons everyone in the cloud.
- [ ] Poison: 1%/s for 60 s, refresh not stack, lethal, carried across a `regenerateFloor`, does not cancel a timed open; `curePoison` ends it.
- [ ] An undetected trap is in no state; detected (near or fired), it is in every member's.
- [ ] `make test` and `make check` green.

## Blocked By

I-5FZ4J-4 (detection).

## Spec Reference

FS-5FZ4J §D R23–R31, §I R46–R48.

## TDD Approach

- RED: a delver stepping onto an armed spike plate loses the floor's fodder hit.
- GREEN: the trap system's step check.
