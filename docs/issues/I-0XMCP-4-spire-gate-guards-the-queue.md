---
id: I-0XMCP-4
status: open
implements: FS-0XMCP
blocked_by: [I-0XMCP-1, I-0XMCP-3]
labels: [blocked]
title: "FS-0XMCP slice 4: find_game and start_solo only from the Spire gate; the Warden becomes a storyteller (game-service)"
---
Implements FS-0XMCP §Requirements 12–14, 23

**Author: agent** (game-service; agent lane by the user's instruction)

## What to Build

The server enforces the walk, and stops calling the Warden the queue.

- **The guard.** In `internal/gameserver/hub.go`, the `find_game` and `start_solo` cases refuse
  a player not at the Spire gate with *"Walk to the Spire's door first."* via the existing
  `refuse` (an error on the same action). Order in each case: the existing no-character
  refusal → the existing `handlePlayerExistingGame` resume → **the gate check** → the existing
  queue / solo logic, unchanged. The check goes through one new consumer-owned method on the
  hub's `SessionManager` interface (e.g. `AtSpireGate(player) bool`), implemented on `Server`
  by asking the hub session's `AtGate` from I-0XMCP-1.
- **Not gated:** `leave_queue`, `leave_hub`, `enter_hub`, anything else.
- **The Warden.** `Spirewarden`'s function becomes `storyteller` (`NPCFunctionStoryteller`,
  doc: tells the hub's story, opens nothing); `NPCFunctionDelve` is removed. Name, place and
  look unchanged. Update the existing delve-NPC tests to the new function.

**Hard bound:** this is the Warden's trigger moving, not a matchmaker change. No edit to
`internal/matchmaker`, `internal/match_queue`, the bodies of `AddPlayer` /
`RemovePlayerFromQueue` / `IsQueued`, or how they are wired in `server.go` / `cmd`. The calls to
them in `hub.go` stay byte-identical; the guard is an early `continue` before them.

**Finding carried from the FS:** there was no server-side proximity check for the Warden to
move; the old distance check was client-only (`NPC_TALK_RANGE`). This slice adds the first one,
at the gate.

## Acceptance Criteria

- [ ] `find_game` from a hub player away from the Spire gate is refused with the walk message; the player is not queued; `AddPlayer` is never called (mock queue service).
- [ ] `start_solo` away from the gate is refused with the walk message; no session is created.
- [ ] Both succeed exactly as before for a player standing at the gate.
- [ ] Both still resume a player already in a run, regardless of their last hub position.
- [ ] `leave_queue` from anywhere in the hub still leaves the queue.
- [ ] The hub's function NPCs are `storyteller` and `storekeeper`; `NPCFunctionDelve` no longer exists.
- [ ] `git diff` shows no change under `internal/matchmaker/` or `internal/match_queue/`.
- [ ] `go test -race ./...` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/gameserver/hub.go` (guard in two cases, `SessionManager` method, refusal string)
- `game-server/game-service/internal/gameserver/server.go` (implement the method via the hub session)
- `game-server/game-service/internal/components/npc.go` (`NPCFunctionStoryteller`, drop `NPCFunctionDelve`)
- `game-server/game-service/internal/game/hub_map.go` (the Warden's function)
- `game-server/game-service/internal/gameserver/delve_npc_test.go` (update), `spire_gate_test.go` (new)
- Test doubles in `internal/gameserver` that implement `SessionManager`, if any

## Blocked By

- I-0XMCP-1: the at-gate query.
- I-0XMCP-3: the client must already open the delve panel at the gate, or this guard leaves no way into the Spire.

## Spec Reference

FS-0XMCP §Requirements 12–14, 23; §User Stories 20, 23; §Acceptance Criteria 7–10, 16;
§Edge States (lag at the boundary, already in a run, match found away from the door,
unauthorized client, player in a field); §Decision log D7, D15, and "Finding while specifying D7".

## TDD Approach

- RED: `find_game` from the spawn → refusal, not queued.
- RED: `start_solo` from the spawn → refusal, no run.
- RED: at the gate → both behave as today; in a run → resume.
- GREEN: the guard and the `Server` method; then the Warden rename, with the NPC test updated first.
