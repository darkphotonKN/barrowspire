---
id: I-F6F88-5
status: done
implements: FS-F6F88
blocked_by: []
labels: [ready-for-agent]
title: "The party spawns together at one random point on every floor"
---
Implements FS-F6F88 §Requirements 15 (living delvers are moved to the new floor) — amended by user decision 2026-10-10.

**Domain:** game-service. · **Lane:** agent. · **Commits:** 0eecacc, 9a2db9e on `fix/item-auth-floor-spawn`.

## User decision (2026-10-10)
There is no party system yet, so everyone in a run is the party. On every floor, including floor 1 at run start, the party appears **together** at one random spawn point. Stairs stay randomly placed. (Previously each delver got an independent random spawn, which scattered the party.)

## What was built
- `gatherParty()` picks one valid point (occupied-area check like stairs: random tries, then a floor scan, then map centre; never fails) and lays living, non-escaped delvers out in a small grid around it.
- Floor build order: layout objects and stairs, then the party, then monsters, so monster clearance (≥350 px) is measured from where the party stands.
- `settlePartyOnNewFloor` no longer moves anyone; it still clears intents, zeroes velocity and marks the dead as left behind.
- Known gap: a delver added after a floor is built still gets an independent spawn until the next climb (the matchmaker does not do this today).

## Acceptance Criteria
- [x] On floor 1 and after a climb, all living delvers stand within a small radius of one point, on open ground, without overlapping.
- [x] Monsters spawn clear of where the party stands.
