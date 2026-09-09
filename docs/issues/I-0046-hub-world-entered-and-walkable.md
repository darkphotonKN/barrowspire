---
id: I-0046
status: open
implements: FS-0008
blocked_by: [I-0045]
labels: [blocked]
title: "FS-0008 slice 2: enter the hub and walk around with other players visible"
---
Implements FS-0008 §Requirements 1-3, 5, 7-8, 15, 18-19, 34-36

**Author: agent**

## What to Build

The walking skeleton: a second world type, and a client that is *told* which one it is in.

- **Server:** build exactly one hub `Session` at startup and keep it for the life of the
  process — its own `EntityManager`, its own goroutines, 30 Hz like a run. Map is **2000×1000**
  with boundary walls, defined by hub-owned map data, not `InitialMapObjects`. Movement uses the
  existing `MovementSystem`. **No items, containers, doors, switches or escape doors** — the hub
  broadcast carries players only (NPCs arrive in I-0050/I-0052). Nothing is written to the
  database; player position is never persisted.
- **Protocol:** one outbound message telling a client which world it is in, carrying the world's
  session id and its **type** (`hub` or `run`). This slice fires it on hub entry. State
  broadcasts gain the world type and keep `session_id`. `Player.CurrentGameSessionId` is set to
  the hub session on connect, before the first broadcast, so it is never `uuid.Nil` for a
  connected player.
- **Client:** main menu keeps character select/create unchanged; pressing start now leads to the
  hub. New Phaser hub scene rendering the map and players, with a camera that follows the player
  across 2000×1000 (viewport is 1080×720). The client updates its current world and switches
  scenes in **exactly one place**, on the world identity message — never inferred from broadcast
  shape.

The map is bare in this slice. Buildings and dressing are I-0047.

**Decide and proceed** (marked AFK deliberately): pick the fixed spawn point and record it in
the map data. Somewhere with room around it, since every returning player lands there.

## Implementation notes (from planning, before any code)

Established by reading the code, so the next person does not re-derive it.

### Decided: connecting is not entering

FS **R19** says `Player.CurrentGameSessionId` is set to the hub session *on connect*. Implement
it differently, deliberately: the WebSocket opens in `BootScene`, which is **before character
select**. Taken literally, a player would stand in the hub, visible to everyone, while still
picking a character — and the client would switch scenes straight past the selection screen.

So **connecting and entering are two things**:

```
BootScene opens the WS      → connected, in no world
MainMenu character select   → still in no world
    │ presses enter
    ▼
client sends an enter action → server builds the ECS entity, adds them to the hub
    ← world identity message → client switches to the hub scene
```

`CurrentGameSessionId` stays `uuid.Nil` through character select, and routing refuses those
messages with `errPlayerNotInSession` — the path built in I-0045 exists for exactly this state.

R19's *intent* was that routing always has an answer. It does: the answer for a player who has
not entered is "you are in no world", which is correct rather than missing. The FS is a
write-once work order and is not edited here; the divergence is called out in the
acceptance-criteria walk at close.

### `RulesSystem` would otherwise end the hub every tick

It ends a session at `activePlayers <= 1`, which the hub trips constantly. **No change to
`RulesSystem` is needed**: it returns early when `matchProgressComp == nil`, and the
MatchProgress entity is created by `InitialSystems()`. The hub simply does not call
`InitialSystems()`, and is immune. `InteractionSystem`, `EliminationSystem` and
`ProjectileSystem` all no-op on a hub with no openables, no damage and no projectiles, so the
tick loop needs no hub-specific branch.

### `connToPlayer` holds a *copy* of the player

`MapConnToPlayer(conn, player types.Player)` takes the player **by value** and stores
`s.connToPlayer[conn] = &player`, so it is **not** the same object as `s.players[memberID]`.
This is why `CreateGameSession` sets `CurrentGameSessionId` twice (`server.go:180` and `:186`).
Joining the hub has to update both the same way, or routing reads a stale copy.

### `broadcastFullState` already carries a data race

It spawns a goroutine per player per tick (`session.go:764`), and `go test -race` reports a real
race between it and `Session.AddPlayer` (`session.go:619`) reached from `CreateGameSession`.
Pre-existing and not this slice's to fix, but the hub broadcasts down the same path, so the
blast radius grows here. Worth its own issue.

## Acceptance Criteria

- [ ] Starting from the main menu lands the player in the hub, not in a queue.
- [ ] Two clients logged in as different players see each other move in real time.
- [ ] The map is 2000×1000; the camera follows the player and the map scrolls.
- [ ] Walking into a boundary wall stops the player; the map cannot be left.
- [ ] The world identity message arrives on hub entry and carries type `hub`.
- [ ] The client's scene switch happens in one place, keyed on that message.
- [ ] The hub broadcast carries no items, containers, doors, switches or escape doors.
- [ ] `Player.CurrentGameSessionId` is non-nil for a connected player before the first broadcast.
- [ ] Nothing about the hub reaches the database.
- [ ] `go test ./...` passes and `golangci-lint run` is clean.

## Blocked By

I-0045 — routing must already come from server state, or the hub inherits the client-trusting
route this feature exists to remove.

## Spec Reference

FS-0008 §Requirements 1-3, 5, 7-8 (hub world), 15, 18-19 (world identity), 34-36 (client).
Constraint: ADR-0015 — the hub and every run share one process and one client connection.

## TDD Approach

- RED: assert the server holds two sessions after startup with no players connected — one hub,
  zero runs. Today it holds none.
- GREEN: hub session built at startup.
- RED: connect a client and assert a world identity message with type `hub` is received before
  any state broadcast.
