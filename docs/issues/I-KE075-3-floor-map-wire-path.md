---
id: I-KE075-3
status: open
implements: FS-KE075
blocked_by: [I-KE075-2]
labels: [blocked]
title: "FS-KE075 slice 3: the floor_map message on entry, floor change, reconnect and request; walls leave run snapshots; the client builds walls and map size from it (game-service + game-client)"
---
Implements FS-KE075 §F (Requirements 31–35), §H Requirements 40–43, 49

**Lane: agent (AFK), game-service (agreed in the charter) and game-client.**

## What to Build

Server: a `floor_map` outbound message (size; walls in today's `WallState`; `cell_size` and `regions` only when the floor has them, so none yet), sent after every `world_entered` for the run (entry, handoff host pod, reconnect at `hub.go:1216`), to every recipient on a floor change after the rebuild and before the first broadcast (loop goroutine), and in answer to a new inbound `request_floor_map` (≤ 1/s per connection, ignored outside a run). Run snapshots drop the `walls` key on every floor; hub and field snapshots keep it.

Client: the `floor_map` type and handler; the latest map kept per session in the game-session store; the run scene builds walls and reads its map size only from the map (no 1440/960 left: camera, ground, perimeter, dressing, blackout, light-map); a snapshot whose floor has no map applies its dynamic entities but the floor waits; `request_floor_map` after 1 s and every second while missing; a lower-floor snapshot after the map is dropped; the floor-change veil stays up until the new map is built.

Before the first client change, capture headless-browser screenshots of a floor-2 and a floor-3 fixture state on the current code; they are the identity fixtures for this slice and slice 5.

## Files (expected)

- `internal/types/messages.go` (`floor_map`, `request_floor_map`; `walls` omitted in run state)
- `internal/serializer/state_serializer.go` (no walls in run state)
- `internal/game/session.go` (floor-map builder; send on floor change in `applyRequestedFloorChange`)
- `internal/gameserver/hub.go`, `party_entry.go`, `handler.go` (send after `world_entered`; inbound request with rate limit)
- serializer and session tests; `floor_test.go`, `stairs_test.go`, `session_test.go:172-174`, `integration_test.go:136-137`
- `game-client/src/types/gameState.ts` and the WS message types
- the game-session store and the WS message router
- `game-client/src/scenes/BarrowspireScene.ts` (map size, walls from the map, rebuild on map, veil wait, request timer)
- `game-client` tests that pin 1440 (perimeter, runDressing, worldTheme, viewport, iso, markers, LightMap) moved to read a fixture map
- new headless screenshot fixtures for floors 2 and 3

## Acceptance Criteria

- [ ] A member gets `floor_map` after every `world_entered` for the run; every recipient gets it on a floor change before the new floor's first state
- [ ] `request_floor_map` answered at most once per second; ignored outside a run
- [ ] Run snapshots have no `walls` key on any floor; hub and field snapshots keep theirs
- [ ] Floor 2–3 map walls equal what the snapshot used to carry, `house_id` included
- [ ] Client: map before create, after create, or after the first snapshot all build the floor once; a withheld map is requested after 1 s and every second; a late old-floor snapshot is dropped
- [ ] No map size is hard-coded in the run scene
- [ ] Floors 2–3 screenshots match the captures; `scenes/__snapshots__` unchanged
- [ ] `go test ./...`, `golangci-lint run`, typecheck and vitest pass

## Blocked By

I-KE075-2

## Spec Reference

FS-KE075 §F.31–35, §H.40–43, §H.49. ADR-0060 Decisions 1–3, 8.

## TDD Approach

- RED: a session test that a floor change enqueues `floor_map` before the next state, and a client test that a snapshot without a map does not build the floor
- GREEN: the message, the sends, the store and the scene's map-driven build
