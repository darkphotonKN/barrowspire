---
id: I-MQYEX-1
status: open
implements: FS-MQYEX
blocked_by: []
labels: [ready-for-agent]
title: "FS-MQYEX slice 1: a shut run container opens through a timed open, and its owner's state says so (server)"
---
Implements FS-MQYEX §Requirements 1–5, 18–20

**Lane: game-server (game-service), asked for by the charter.** In a run, a reach for a shut chest
or sack starts the player's timed open instead of opening it. The tick counts it, and after 1.5 s
the container opens exactly as an open does today. The player's own `current_player` carries
`timed_open` while it runs. Nothing cancels it yet (slice 2), and one container still takes the
per-container throttle (slice 3). With this slice alone the game plays: the client already waits
for the state that shows the container open (FS-KE075 §J R60).

## Files owned

- `game-server/game-service/internal/components/` (new: the timed open as pure data on the player's body: the container, the time counted, where the body stood)
- `game-server/game-service/internal/ecs/entity.go` (one `ComponentType` constant). **Not in the charter's named package list; see the FS hand-back note. If the coordinator rules it out, keep the timed opens in a `Session` map instead.**
- `game-server/game-service/internal/systems/` (new system: counts each timed open and reports which completed) and its test
- `game-server/game-service/internal/game/session.go`: `handleInteract`'s container branch and `step`. **Hotspot: touch only these.**
- `game-server/game-service/internal/game/` (new file: the duration constant, and today's open, `IsOpen` plus the first-open roll, lifted into one function both paths call)
- `game-server/game-service/internal/types/` (`CurrentPlayerState`, `BackendGameState`: the `timed_open` part)
- `game-server/game-service/internal/serializer/state_serializer.go` and a test beside it. **Also outside the named package list; it is where every `current_player` part is filled.**
- the run tests that open a chest with one `handleInteract` and expect it open (`container_roll_test.go`, `guarded_chest_test.go`, `session_test.go`, `monster_drops_test.go` and neighbours): give them one helper that reaches and steps the timed open through

## What to Build

1. The timed open as data on the player's body, and a system that counts simulation time on it each tick, after movement and combat (R4, D6).
2. `handleInteract`, container branch, run world, container shut: after today's range and guard checks, start the timed open and return; no `IsOpen`, no roll, no reply (R2, R3). The start hands off no 100 ms hold of the container; the player's own 100 ms hold is taken as an open takes it today (D12). Every other path is untouched: an open container, a drop pile, and any container in a hub or field world (R1).
3. On completion, the one shared open function runs: open, roll once on the first open, an empty roll stays open (R5).
4. `timed_open` `{entity_id, elapsed, duration}` on the recipient's own `current_player`, absent with none and in hub and field states; nothing on other players or on `containers[]` (R18–R20).
5. The duration is one named constant, 1.5 s (D15).

## Acceptance Criteria

- [ ] In a run, a reach for a shut chest in reach with no guard leaves it shut and unrolled; it is open and rolled on the 45th tick after the reach and not on the 44th. A sack does the same.
- [ ] In a run, a reach for a drop pile, and for an open chest, behave as before and start no timed open.
- [ ] In a hub world and in a field world, a reach for a shut container opens it on that reach.
- [ ] A guarded chest whose guard stands is refused `container_guarded` and starts none; with every guard dead the same reach starts one and it completes. A reach from out of range is refused as before and starts none.
- [ ] The owner's `current_player` carries `timed_open` with `elapsed` rising tick to tick and `duration` 1.5; it is absent with none, from every other player's entry, and in hub and field states; `containers[]` entries are unchanged.
- [ ] `go test -race ./internal/game/... ./internal/systems/... ./internal/serializer/...` passes; `go vet` and the linter are clean.

## Blocked By

None.

## Spec Reference

FS-MQYEX §Requirements 1–5 (§A), 18–20 (§C); Decisions L1, L2, L4, L5, L6, D2, D6, D10, D15; User Stories 1, 7–13, 26–28; Acceptance Criteria (Server) lines 1–5 and the `timed_open` line; Edge States (an empty roll, a player out of play reaches).

## TDD Approach

- RED: a run test that reaches for a shut chest and asserts it is still shut and unrolled after the reach, then open after 45 steps.
- GREEN: the start in `handleInteract`, the counting system, the shared open.
- Then RED/GREEN for the hub and field paths staying instant, and for `timed_open` in the serializer.
