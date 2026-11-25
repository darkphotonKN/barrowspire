---
id: I-KE075-13
status: open
implements: FS-KE075
blocked_by: [I-KE075-11]
labels: [ready-for-agent]
title: "FS-KE075 slice 13: fewer large packs: a brute and 0–1 fodder, corridors 1–3, top-up 2, treasure two at 25%, floor held to 8–18 (game-service)"
---
Implements FS-KE075 §Change: Room variety (§N, R82–R83)

**Lane: agent (AFK), game-service (charter child B).**

## What to Build

`HallPackFodderMin/Max` 0/1, `CorridorMonstersMin/Max` 1/3, `RoomMonstersTopUpMax` 2,
`TreasureGuardPackShare` 0.25 with `TreasureGuardPackMin/Max` 2/2, `DungeonMonstersMin/Max` 8/18.
A hall pack of a lone brute is a whole pack (no "short" warning). The population tests follow.

## Acceptance Criteria

- [ ] Across many builds: hall packs 1–2, corridors 1–3, treasure rooms 1–2 elites, a top-up never past 2
- [ ] The floor's total besides a demon stays within 8–18
- [ ] `go test ./...` in game-service passes

## Blocked By

I-KE075-11

## TDD Approach

- RED: the population tests' bounds at the new values
- GREEN: the tuning values
