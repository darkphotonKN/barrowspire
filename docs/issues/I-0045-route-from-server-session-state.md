---
id: I-0045
status: done
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

### Scope added after the issue was written

Agreed in-session and recorded here so the acceptance criteria below cover what was actually
built, rather than leaving it to commit messages.

- **Harden every field in `ParsePayload`, not only `session_id`.** The other reads —
  `player_id`, `vx`, `vy`, `entity_id`, `enemy_entity_id`, `item_entity_id` — are bare
  assertions too and panic identically. Two reasons to include them: the five `session_id`
  assertions sit in the same struct literals, so the work touches those lines anyway; and
  removing the old `GetSessionID()` gate lets malformed payloads reach the parser *sooner*, so
  fixing five and leaving six would widen the exposure it was meant to close.

  Severity established while implementing: `ParsePayload` runs in the session's message loop,
  which has **no `recover()`** — the only one (`handler.go:295`) guards the writer goroutine.
  An unrecovered panic in any goroutine takes the whole process down, so one malformed message
  from any authenticated player kills every concurrent world. Under
  [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) that is the hub
  and all runs at once.

  Skill fields (`skill_id`, `target_x`, `target_y`) stay optional, as they already were.

- **Repair the `internal/gameserver` test package.** Found broken at HEAD: three mocks had
  drifted from their interfaces (`mockQueueService` missing `AddPlayer`, `MockEventEmitter`
  returning an `error` the interface does not declare, `MockItemsClient` missing three methods),
  so it had not compiled in some time. Once it did, `TestQueueFindGameFlow` failed because its
  mock queue never matched anyone. Both repaired — otherwise this slice cannot be proven at all.

- **Fix `server.go:194`.** `slog.Info` called with printf verbs, already recorded as a known
  divergence in the service spec. `go test` runs vet, so it blocked the whole package.

- **Read-lock `GetPlayerFromConn` (`server.go:150`).** It takes an exclusive `Lock` to read one
  map entry, and this slice puts it on the routing path for every inbound game action. While
  held it blocks the per-tick broadcast deliveries that read `s.msgChan` under `RLock`
  (`server.go:290, 316`). All four callers only read.

## Acceptance Criteria

- [x] No inbound client message carries `session_id`.
- [x] `grep session_id internal/types/messages.go` returns nothing inside `ParsePayload`.
- [x] A `move` message with no `session_id` in the payload does not panic the server.
- [x] A `move` message carrying a *foreign* session's id is routed to the sender's own session
      regardless of the value — proven **through the live hub loop**, not by asserting on
      `resolveGameSession` alone, and the test verified to go red when routing reads the payload.
- [x] Move, attack, interact, equip/unequip and cast_skill all still work in a run.
- [x] Every field read in `ParsePayload` uses the comma-ok form; no bare type assertion remains.
- [x] A payload missing `player_id`, `vx`, `vy`, `entity_id`, `enemy_entity_id` or
      `item_entity_id` returns an error rather than panicking.
- [x] Routing errors carry no session id or username to the client; detail stays in the log.
- [x] `internal/gameserver` compiles and its tests pass.
- [x] `GetPlayerFromConn` holds a read lock.
- [x] **Revised:** no *new* test failures and no *new* lint findings versus the branch point.
      The original wording — `go test ./...` passes and `golangci-lint run` is clean — is not
      reachable by any single slice: `internal/game`'s
      `TestSession_GameLoopAppliesMovement_Integration` and `cmd/server`'s `log.Printf %w` vet
      failure are both red at HEAD, and `golangci-lint` reports 50 findings across the service
      with no `.golangci.yml` to define the set. Cleaning those is its own work, not this
      slice's. Measured: lint 10 → 10 on the touched packages.

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
