---
id: I-3QHQZ-2
status: open
implements: FS-3QHQZ
blocked_by: [I-3QHQZ-1]
labels: [ready-for-agent, blocked]
title: "FS-3QHQZ slice 2: the Forlorn Forest field world built from the generator at pod boot (walls, bounds, entrance)"
---
Implements FS-3QHQZ §B (Requirements 9–14, 20, 21)

Agent lane. **Also blocked by FS-X2F2H's field-world-core issue**: the slice that adds the
`field` world kind, creates the pod's field worlds at boot, and enters and leaves a field through
its entrance gate by a local world switch. Its id was not minted when this issue was written; add
it to `blocked_by` once FS-X2F2H is sliced. This issue consumes that path and never builds a
second one.

## Files expected to touch

- `game-server/game-service/common/constants/game.go`: `ForestMapWidth = 2080`,
  `ForestMapHeight = 1360`, beside `MapWidth` / `HubMapWidth`.
- `game-server/game-service/internal/game/forest_map.go` (new) and `forest_map_test.go`: build
  the Forest's map objects from a `levelgen.Layout` (walls via `CreateWallEntity`, one house id
  per rect; occupied areas recorded; entrance gate and respawn point at the layout's entrance).
- `game-server/game-service/internal/game/session.go`: only a `ForestBounds()` beside
  `HubBounds()`, if FS-X2F2H's field bounds do not already cover it.
- `game-server/game-service/internal/gameserver/server.go`: only the line(s) in FS-X2F2H's
  field-world boot path that build the Forest from `levelgen.Generate(levelgen.ForestParams,
  seed)` with a freshly drawn boot seed, log seed and attempt, and return a wrapped error on
  failure.
- Matching tests in `internal/game/` and `internal/gameserver/`.

Never touch `internal/matchmaker`, `internal/match_queue` or their wiring. No HTTP endpoint, no
RPC, no migration, no new message type.

## What to Build

1. At pod boot, where FS-X2F2H creates the field worlds, draw a seed (outside `levelgen`),
   generate the Forest layout and build the Forest field world from it, 2 080 × 1 360 px. Log
   `seed`, `attempt` and session id at `slog.Info`. A generator error fails the server's
   construction with a wrapped error (no `panic`).
2. Map the layout onto existing world construction: every `Rect` becomes one `CreateWallEntity`
   with its own house id; nothing on a wall; every placed object appended to the occupied areas.
   Build no building, door, escape door, switch or stairs.
3. Place FS-X2F2H's field entrance gate at `Layout.Entrance` (east side) and the respawn point
   beside it on open ground.
4. Keep the built `Layout` with the Forest's map builder so slices 3 and 4 place spawn points and
   chests from `DeadEnds` / `Open` without regenerating.

## Acceptance Criteria

- [ ] Each pod builds one Forest at boot, 2 080 × 1 360 px, seed and attempt logged; it is never rebuilt while the pod runs.
- [ ] Given a fixed seed, the Forest's wall entities equal the layout's rects one to one, broadcast in `walls[]`, count ≤ 120.
- [ ] No building, door, escape door, switch or stairs entity exists in the Forest.
- [ ] The entrance gate stands at the layout entrance on the east side; respawn on open ground beside it.
- [ ] A forced generator error makes server construction return a wrapped error.
- [ ] A player in the Forest collides with its walls (existing MovementSystem) and is clamped at its bounds.
- [ ] Nothing under `internal/matchmaker` or `internal/match_queue` changes.
- [ ] `go test ./...` and `golangci-lint run` green in game-service.

## Blocked By

- I-3QHQZ-1 (the generator)
- FS-X2F2H field-world-core issue (id pending; see above)

## Spec Reference

FS-3QHQZ §B Requirements 9–14, 20, 21; Acceptance Criteria "Forest world (§B)" items 1–4 and the
last; Edge States "Generator boxed in", "Pod restart", "Players on different pods"; User Stories
1–3, 19–21, 26, 28, 29.

## TDD Approach

- RED: build the Forest from a fixed-seed layout and assert wall entity count and positions equal
  the layout's rects.
- GREEN: the `forest_map.go` mapping; then the boot wiring with an injected seed source for the
  test.
