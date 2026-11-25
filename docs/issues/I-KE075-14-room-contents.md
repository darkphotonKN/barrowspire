---
id: I-KE075-14
status: done
implements: FS-KE075
blocked_by: [I-KE075-12, I-KE075-13]
labels: [blocked]
title: "FS-KE075 slice 14: room contents: quiet, monsters or a decision for every ordinary room; monsters, containers and traps placed by it; quiet_rooms on the floor map (game-service)"
---
Implements FS-KE075 §Change: Room variety (§M, R77–R81; §O R84)

**Lane: agent (AFK), game-service (charter child B).**

## What to Build

When a dungeon floor is planned (after its seals, respites and encounter), each room is given its
contents (R77): role rooms and claimed decision rooms roll nothing; ordinary rooms roll quiet 30 /
monsters 40 / decision 30, a decision trap 40 / chest-or-sack 60. Population places rolled monsters
only in monsters rooms (a hall's pack in a hall), top-ups only there (R79). Containers: treasure chests
plus one in each chest-or-sack room (R81). Traps: one per trap room first, the rest on trap rooms and
corridors, none elsewhere (R80). The floor map carries `quiet_rooms` (R84).

## Acceptance Criteria

- [x] Every room has contents; ordinary rooms near 30/40/30 and decisions near 40/60 across many builds
- [x] No rolled monster outside a monsters room or a treasure room at the build
- [x] Containers only in treasure and chest-or-sack rooms, one each; traps only in trap rooms and corridors
- [x] `quiet_rooms` on the dungeon floor map; absent on a floor of buildings
- [x] FS-5FZ4J and FS-4EC7Z tests pass (no trap in the encounter's room, dead ends kept)
- [x] `go test ./...` in game-service passes

## Blocked By

I-KE075-12, I-KE075-13

## TDD Approach

- RED: `rollRoomContents` gives role and claimed rooms no roll and every other room one of the four
- GREEN: the roll, then population, containers and traps each reading it, one test at a time
