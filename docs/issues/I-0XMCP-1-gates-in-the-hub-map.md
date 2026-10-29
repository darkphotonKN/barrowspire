---
id: I-0XMCP-1
status: done
implements: FS-0XMCP
blocked_by: []
labels: [ready-for-agent]
title: "FS-0XMCP slice 1: gates in the hub map, broadcast, and the at-gate query (game-service)"
---
Implements FS-0XMCP §Requirements 1–7

**Author: agent** (game-service; the user moved this work to the agent lane: "no hand coded here, all agents now")

## What to Build

The three gates exist on the server as hub map data, reach every hub client, and the server can
answer "is this player at that gate". No behaviour changes yet: nothing reads the query, and
`find_game` / `start_solo` are untouched in this slice.

- **Map data.** A `hubGates` table in `internal/game/hub_map.go` beside `hubNPCs`: Spire gate
  (1000, 50), Forest gate (40, 400) arrival (180, 400), Meadows gate (1960, 360) arrival
  (1820, 360). `GateRange = 80` in `common/constants/game.go`. Built in `InitialHubMapObjects`.
- **ECS.** A `Gate` component (pure data: destination `spire | forest | meadows`, arrival point;
  no methods beyond `Type()`), `ComponentTypeGate`, and a factory that gives each gate a
  transform and an interactable range. Not an NPC.
- **Broadcast.** `GateState {entity_id, destination, position, range}` and a `gates` list in
  the client state, hub only (`omitempty`, absent from a run's state). Arrival points never
  leave the server.
- **The at-gate query.** One method on the hub session (e.g. `(*Session).AtGate(playerID,
  destination) bool`): true when the player's body is in this world and within the gate's
  range of its position, measured from the session's own entities under its lock. Also a way
  to read a gate's arrival point by destination, for FS-X2F2H.

**Hard bound:** no change to `internal/matchmaker`, `internal/match_queue`, or their wiring.

## Acceptance Criteria

- [ ] The hub holds exactly three gates with the FS §Requirements 2 positions, identical across two `NewServer` instances.
- [ ] Every gate's range circle is clear of every `hubBuildings` footprint; every arrival point is outside its gate's range and outside every building; every gate is reachable from the spawn on foot (table-driven test over the three gates).
- [ ] The hub's serialized state has `gates` with the four fields; a run's serialized state has no `gates` key.
- [ ] `AtGate` is true at the gate's position and at exactly its range, false one px beyond, false for a player not in this world (unknown id, or a run's session).
- [ ] `go test -race ./internal/...` green with `AtGate` called concurrently with the hub ticking.
- [ ] No new test failures and no new lint findings versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/components/gate.go` (new)
- `game-server/game-service/internal/ecs/entity.go` (`ComponentTypeGate`)
- `game-server/game-service/common/constants/game.go` (`GateRange`)
- `game-server/game-service/internal/game/hub_map.go` (`hubGates`, build them)
- `game-server/game-service/internal/game/factory.go` (`CreateGateEntity`)
- `game-server/game-service/internal/game/session.go` (`AtGate`, arrival lookup)
- `game-server/game-service/internal/types/game.go`, `internal/types/messages.go` (`GateState`, `Gates`)
- `game-server/game-service/internal/serializer/state_serializer.go`
- Tests: `internal/gameserver/hub_gates_test.go` (new), plus test files beside the code in `internal/game/` and `internal/serializer/`

## Blocked By

None

## Spec Reference

FS-0XMCP §Requirements 1–7; §User Stories 21, 22, 24, 26; §Acceptance Criteria 1–4;
§Edge States (arrival from a field; player in a field is at no gate); §Decision log D11, D14.

## TDD Approach

- RED: two servers' hubs list the same three gates at the same positions.
- RED: `AtGate` boundary table (at, on range, beyond, other world, unknown).
- RED: run state JSON has no `gates` key; hub state has three.
- GREEN: map data, component, factory, serializer, query.
