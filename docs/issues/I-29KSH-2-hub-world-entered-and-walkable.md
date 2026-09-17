---
id: I-29KSH-2
status: done
implements: FS-29KSH
blocked_by: [I-29KSH-1]
labels: [blocked]
title: "FS-29KSH slice 2: enter the hub and walk around with other players visible"
---
Implements FS-29KSH §Requirements 1-3, 5, 7-8, 15, 18-19, 34-36

**Author: agent**

## What to Build

The walking skeleton: a second world type, and a client that is *told* which one it is in.

- **Server:** build exactly one hub `Session` at startup and keep it for the life of the
  process — its own `EntityManager`, its own goroutines, 30 Hz like a run. Map is **2000×1000**
  with boundary walls, defined by hub-owned map data, not `InitialMapObjects`. Movement uses the
  existing `MovementSystem`. **No items, containers, doors, switches or escape doors** — the hub
  broadcast carries players only (NPCs arrive in I-29KSH-6/I-29KSH-8). Nothing is written to the
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

The map is bare in this slice. Buildings and dressing are I-29KSH-3.

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
messages with `errPlayerNotInSession` — the path built in I-29KSH-1 exists for exactly this state.

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

- [x] Starting from the main menu lands the player in the hub, not in a queue.
- [x] Two clients logged in as different players see each other move in real time.
- [x] The map is 2000×1000; the camera follows the player and the map scrolls.
- [x] Walking into a boundary wall stops the player; the map cannot be left.
- [x] The world identity message arrives on hub entry and carries type `hub`.
- [x] The client's scene switch happens in one place, keyed on that message.
- [x] The hub broadcast carries no items, containers, doors, switches or escape doors.
- [x] `Player.CurrentGameSessionId` is non-nil for a connected player before the first broadcast.
- [x] Nothing about the hub reaches the database.
- [x] `go test ./...` passes and `golangci-lint run` is clean.

### Found by playing it, not by the tests

The suite was green on every unit before any of these surfaced. Recorded because
the pattern matters more than the list: each one is a seam between parts that were
individually correct.

1. **The chosen character never arrived.** enter_hub did not read class or name
   from its payload the way find_game does, so everyone entered as an empty class.
2. **Delvers were circles.** characterTextures already generated the sprites the
   character-select screen previews; the scene simply had not been wired to them.
3. **Arrivals scattered.** HubSpawnX/Y were declared and used nowhere, and AddPlayer
   scattered players across a run's map size rather than the world's own.
4. **Movement juddered.** Broadcast positions were applied directly, so sprites
   teleported at 30Hz under a 60fps redraw. The run scene had always eased toward
   them; the hub now does too.
5. **Entering twice gave you two bodies**, and three times gave three. A run hid
   this because its cleanup is discarding the whole world.
6. **Leaving never worked at all** — RemovePlayer read the entity-keyed map with a
   player id, so it always missed and returned. Predates the hub; invisible until
   a world stopped being thrown away.
7. **Fixing that would have destroyed the hub** when its last player left, because
   an empty session is shut down. An empty hub is not a finished hub.
8. **Refreshing dropped you into the run scene.** Reconnection sent game_found
   unconditionally, true while a run was the only world. It now announces the world
   the player is actually in — and leaving the hub is final, so a refresh there
   returns to the menu to walk back in.

## Blocked By

I-29KSH-1 — routing must already come from server state, or the hub inherits the client-trusting
route this feature exists to remove.

## Spec Reference

FS-29KSH §Requirements 1-3, 5, 7-8 (hub world), 15, 18-19 (world identity), 34-36 (client).
Constraint: ADR-0015 — the hub and every run share one process and one client connection.

## TDD Approach

- RED: assert the server holds two sessions after startup with no players connected — one hub,
  zero runs. Today it holds none.
- GREEN: hub session built at startup.
- RED: connect a client and assert a world identity message with type `hub` is received before
  any state broadcast.
