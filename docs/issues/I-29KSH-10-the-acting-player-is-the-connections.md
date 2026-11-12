---
id: I-29KSH-10
status: in-progress
implements: FS-29KSH
blocked_by: []
labels: [ready-for-agent]
title: "FS-29KSH change: the acting player is the connection's (server + client)"
---
Implements FS-29KSH §Change: The acting player is the connection's

**Lane: game-service and game-client.** The owner asked for the server change (2026-11-12,
"前端不傳player id 由後端自己取得"); game-service is written for it. The world acts for the
connection's player on every in-world action and never reads the payload's `player_id`; the
client stops sending it. Rule: ADR-0079.

## Deploy order

**Deploy game-service before the client.** The new server accepts old clients (it ignores
`player_id`); a new client against an old server has every `move`, `interact`, `attack`,
`cast_skill`, `equip` and `unequip` refused, because the old server still requires it.

## What to Build

1. The message hub hands the world the connection's player with each routed message (R37).
2. Every world handler acts for that player only; `ParsePayload` reads no `player_id` (R38).
3. Refusals answer that player (R39). `drink_potion` stays as it is (R41).
4. `SocketManager` stops injecting `player_id`; the outgoing payload types lose it (R40).

## Acceptance Criteria

See FS-29KSH §Change: The acting player is the connection's §Acceptance Criteria.

## Spec Reference

FS-29KSH §Change: The acting player is the connection's: Requirements 37–41, Edge States, Deploy
order. ADR-0079.

## TDD Approach

- RED: `internal/gameserver/acting_player_test.go` drives the live hub with two members in one
  run; `SocketManager.test.ts` reads every outgoing message off the wire.
- GREEN: the hub stamps the player on the routed package; the session reads it; `encode` stops
  merging the member id.
