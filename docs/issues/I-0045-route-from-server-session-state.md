---
id: I-0045
status: in-progress
implements: FS-0008
blocked_by: []
labels: [ready-for-agent]
title: "FS-0008 slice 1: route client messages from server-held session state"
---
Implements FS-0008 §Requirements 16-17, §WebSocket message surface

**Author: agent**

## What to Build

Stop asking the client which world its messages belong to. The server already knows.

Today `hub.go:78` reads `session_id` out of every inbound payload and calls
`GetGameSession(sessionID)` to route. Meanwhile `handler.go:510` and `hub.go:259` route from
`Player.CurrentGameSessionId` — the server's own record, set at `server.go:181`. Two parallel
routing mechanisms that must agree, and where they disagree the client's value wins, which means
a client currently decides which world its messages are delivered to.

- **Server:** route on `Player.CurrentGameSessionId`. Remove `session_id` from inbound payload
  parsing entirely — `PlayerSessionPayload.SessionID` and the five unchecked type assertions
  that populate it (`internal/types/messages.go:73` move, `:87` interact, `:100` attack, `:113`
  equip/unequip, `:130` cast_skill). They are **deleted with the field, not patched**: each is a
  bare `m.Payload["session_id"].(string)` that panics on a nil value, against root CLAUDE.md's
  "no panic for error handling".
- **Client:** `SocketManager` stops auto-injecting `session_id` into outbound payloads.
  `gameStore.sessionId` stays for now — it is still set from `game_found` and read by scenes.
- **Outbound is untouched.** State broadcasts keep carrying `session_id`.

Behaviour-preserving: a player in a run sends the same actions and gets the same results. This
lands first so the hub is built on the corrected shape rather than on one already known to be
wrong.

## Acceptance Criteria

- [ ] No inbound client message carries `session_id`.
- [ ] `grep session_id internal/types/messages.go` returns nothing inside `ParsePayload`.
- [ ] A `move` message with no `session_id` in the payload does not panic the server.
- [ ] A `move` message carrying a *foreign* session's id is routed to the sender's own session
      regardless of the value.
- [ ] Move, attack, interact, equip/unequip and cast_skill all still work in a run.
- [ ] `go test ./...` passes and `golangci-lint run` is clean.

## Blocked By

None.

## Spec Reference

FS-0008 §Requirements 16-17; §WebSocket message surface (inbound table — `session_id` removed
from `move`, `interact`, `attack`, `equip`/`unequip`, `cast_skill`).

Rationale and rejected alternatives: FS-0008 §Design decisions D9, §Rejected alternatives
("Keep `session_id` inbound…", "Replace `session_id` with a `world {type, id}` object…",
"Deferring the routing fix to a separate issue").

## TDD Approach

- RED: a table test over `ParsePayload` feeding each action a payload with **no** `session_id`
  key; today every row panics.
- GREEN: the field and its assertions are gone, so every row parses.
- RED: a routing test where the inbound payload names session B while the player's
  `CurrentGameSessionId` is A; assert the message reaches A.
