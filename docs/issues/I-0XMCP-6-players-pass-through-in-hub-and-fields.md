---
id: I-0XMCP-6
status: open
implements: FS-0XMCP
blocked_by: []
labels: [ready-for-agent]
title: "FS-0XMCP slice 6: players pass through each other in the hub and the fields; runs keep body-blocking (game-service)"
---
Implements FS-0XMCP §Requirements 26–31 (Amendment 2026-10-30)

**Author: agent** (game-service; agent lane by the user's charter instruction for this work)

## What to Build

A crowd at the Spire's door no longer lines up out of the gate's range. In the hub and in field
worlds, two player bodies never push each other; in a Spire run they still do; everything else
collides exactly as today.

- **The rule in the movement system.** `MovementSystem` (`internal/systems/movement.go`) gains
  one world-level setting, fixed when the world is built, that says whether player bodies pass
  through each other (e.g. a `PlayersPassThrough bool` field beside `MapWidth` / `MapHeight`,
  or an equivalent the implementer prefers). When it is set, the body-vs-body step
  (`resolveCollision` inside the 9-cell loop) skips a pair in which **both** bodies carry the
  Player component. Every other pair is resolved as today: player vs monster, player vs
  resident, resident vs resident, monster vs monster. Walls, closed doors, depenetration, the
  edge clamp and the charge (`DashComponent`, which already runs through bodies) are untouched.
- **Keyed on world type, in the session.** `Session.step` (`internal/game/session.go`) builds
  the movement system every tick from `s.mapWidth` / `s.mapHeight`; it also sets the
  pass-through setting from `s.worldType`: on for `types.WorldTypeHub` and
  `types.WorldTypeField`, off for `types.WorldTypeRun`. The world type already reaches the
  session through `WorldBounds.Type` at `newSession` (`HubBounds`, `RunBounds`, and the field's
  bounds in `field_place.go`); no new plumbing from outside the session is needed. Nothing is
  read from client input.
- **Test simplification (optional, same slice).** `TestQueueFindGameFlow`
  (`internal/gameserver/integration_test.go`) was changed by I-0XMCP-4 to walk players to the
  Spire's door one at a time ("Bodies block each other, so they walk in turn"), with a 3 s sleep
  per player. Once crowds pass through, it can send all ten at once and drop the comment and
  the stagger. `headForSpireGate` (`spire_gate_test.go`) and `delve_npc_test.go` use the same
  walk; check whether they relied on the stagger. For race-safe placement in new tests,
  `Session.AddPlayerAt(playerID, character, token, x, y)` seats a body at a point under the
  world's lock (it is what a field return uses), so a test can put a crowd straight onto the
  gate without walking.

**Hard bounds.** No edit under `internal/matchmaker/` or `internal/match_queue/` (user-owned).
No client change and no message change (R31). No change to `GateRange`, `AtGate` or the gate
positions (R30). No change to how runs collide (R27).

## Acceptance Criteria

- [ ] Movement system, pass-through on: a player walking into a standing player passes through; neither is pushed; the walker ends where an unobstructed walk puts it. Holds whichever of the two is moved first.
- [ ] Movement system, pass-through on: a player and a monster still push each other; a player and a resident (NPC with velocity, no Player component) still push each other; a player still stops at a wall and is depenetrated from it.
- [ ] Movement system, pass-through off (a run): the same player-into-player walk stops at `2 × PlayerRadius`; the existing tests in `movement_crowd_test.go`, `movement_test.go` and `movement_bounds_test.go` stay green unchanged.
- [ ] Session level: in a hub session and in a field session, two players seated on the same point stay overlapping after a tick; in a run session they are pushed apart as today.
- [ ] Gameserver level: ten players walking (or seated with `AddPlayerAt` just outside range and walking in) to the Spire gate together all satisfy `AtGate(..., GateDestinationSpire)`, and each one's `find_game` is accepted.
- [ ] The setting is chosen from `s.worldType`, never from anything a client sends.
- [ ] `git diff` shows no change under `internal/matchmaker/`, `internal/match_queue/` or `game-client/`.
- [ ] `go test -race ./...` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/systems/movement.go` (the setting; skip player-vs-player pairs in the body-vs-body loop when it is on)
- `game-server/game-service/internal/systems/movement_crowd_test.go` (or a new `movement_pass_through_test.go`): the system-level cases
- `game-server/game-service/internal/game/session.go` (`step`: set the setting from `s.worldType` where it builds `systems.MovementSystem{...}`)
- A session-level test in `game-server/game-service/internal/game/` (new, e.g. `player_pass_through_test.go`, beside `gate_test.go`)
- `game-server/game-service/internal/gameserver/integration_test.go` (`TestQueueFindGameFlow`: optional simplification), possibly `spire_gate_test.go`

## Blocked By

None. (I-0XMCP-1..5 are done.)

## Spec Reference

FS-0XMCP §Requirements 26–31 (Amendment 2026-10-30); §User Stories 28–32; §Acceptance Criteria
"Added by the 2026-10-30 amendment"; §Edge States (Concurrent, as corrected; players stacked on
one spot; remote players; moving from the hub or a field into a run); §Out of Scope (run
collision, other colliders, widening `GateRange`); §Decision log D17–D19 and "Finding while
implementing I-0XMCP-4". Supersedes FS-29KSH §Requirements 5's player–player push in the hub.

## Notes for the implementer

- Body-vs-body today: `resolveCollision` applies to any `other` with a transform **and** a
  velocity, so players, residents and monsters all push each other through one path. The
  player check has to look at both bodies (`ecs.ComponentTypePlayer`), not just the mover.
- `Session` holds a `movementSystem` field built by `systems.NewMovementSystem()` (run bounds)
  in `newSession`, but `step` ignores it and builds a fresh `systems.MovementSystem{MapWidth,
  MapHeight}` each tick. Set the new setting where `step` builds it. Whether to delete the
  unused field is outside this slice; leave it unless it is in the way.
- Hub ghosts from other pods (FS-JEAVX) are never ECS entities and already collide with nothing.
- `internal/game/session.go` is also being edited by parallel field-death / Forest work; keep
  the change to the one line in `step` to keep the merge small.

## TDD Approach

- RED: system test, pass-through on, walker into a standing player → passes through (fails today: stops at 40 px).
- RED: system test, pass-through on, player into monster / resident → still pushed (guards against over-broad skipping).
- GREEN: the setting and the both-are-players skip in `MovementSystem`.
- RED: session test, two players on one point in a hub and in a field stay overlapping; in a run they separate.
- GREEN: `step` sets the setting from `s.worldType`.
- REFACTOR: simplify `TestQueueFindGameFlow` to a crowd.
