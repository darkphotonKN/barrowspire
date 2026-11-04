---
id: I-MCYWK-1
status: done
implements: FS-MCYWK
blocked_by: []
labels: [ready-for-agent]
title: "FS-MCYWK slice 1: follow a redirect to the server still holding the player, once, with one fallback; a travel's connection is never redirected (game-client)"
---
Implements FS-MCYWK §Requirements C14–C19

**Lane: agent (game-client).** Must merge **before or with** I-MCYWK-2: once the server redirects,
a travel's hub handoff connection without `redirected=1` can be bounced back to the traveller's
old pod (FS-MCYWK R19). On its own this slice changes nothing a player sees: today's server never
sends the redirect and ignores the extra query parameter.

## What to Build

`SocketManager` learns the redirect: `world_handoff {addr, reconnect: true}` sent by a landing
pod as the first and only message on a fresh connection, before it closes it.

- `WorldHandoffPayload` gains `reconnect?: boolean`.
- `dispatch` checks `reconnect === true` **before** the hub and run handoff branches (today the
  message would fall into `handoff()` and be dropped as missing `session_id`).
- On a redirect received on the game's current socket (`this.socket`): detach its handlers (as
  `promote` does to the old socket, so the close is neither a disconnect nor an auth failure) and
  close it, set `serverAddr = addr`, and connect to it as the same player with
  `?token=&name=&redirected=1`. Status goes `connecting` → `connected` on open. Everything the
  holding pod then sends dispatches as on any connection.
- The `redirected=1` flag rides only that connection: `gameUrl()` for `reconnect()` and
  `reconnectIfGone()` stays plain.
- A redirect on a connection the client opened with `redirected=1`, or one with no `addr`, is
  ignored and logged.
- **Fallback, once:** if the redirected socket closes without ever opening, connect once at
  `DEFAULT_SERVER_ADDR` with `redirected=1` and set `serverAddr = DEFAULT_SERVER_ADDR`. If that
  closes without opening too, it is an ordinary disconnect. A redirected socket that opened and
  then closed is an ordinary close (`4001` still calls the auth error handler).
- `hubHandoff()`'s connection URL (a travel, FS-NCC9J R20) gains `&redirected=1`. The run
  `handoff()` URL (`session_id`) is unchanged.

Likely files: `game-client/src/utils/class/SocketManager.ts`,
`game-client/src/utils/class/SocketManager.test.ts` (fake `SocketLike` sockets via the
`createSocket` constructor argument, as the existing handoff tests do),
`game-client/src/assets/types/client.ts`.

## Acceptance Criteria

- [x] A redirect on the current socket opens exactly one new socket at `${addr}?token=…&name=…&redirected=1`, and `getServerAddress()` returns `addr`.
- [x] The landing socket's close after the redirect sets no `disconnected` status and calls no auth error handler.
- [x] `reconnected` and `world_entered` arriving on the redirected socket dispatch as usual (the store's world is set).
- [x] A later `reconnect()` (after that socket closes) opens `${addr}?token=…&name=…` with no `redirected`.
- [x] A redirect arriving on a socket opened with `redirected=1` opens nothing; a redirect with no `addr` opens nothing.
- [x] A redirected socket that closes before opening triggers exactly one socket at `DEFAULT_SERVER_ADDR` with `redirected=1`; `getServerAddress()` is `DEFAULT_SERVER_ADDR`; a second close-before-open opens nothing more and sets `disconnected`.
- [x] A redirected socket that opens and later closes with `4001` calls the auth error handler.
- [x] A travel's hub handoff socket URL carries `redirected=1`; a run handoff's URL is unchanged (existing tests still pass).
- [x] Tests pass (`SocketManager.test.ts`), lint and typecheck clean.

## Blocked By

None

## Spec Reference

FS-MCYWK §Requirements C14–C19; User Stories 1, 2, 5, 10, 11, 12, 14, 15, 22; §Acceptance Criteria → Client; §Edge States "Holding pod is alive but its address is unreachable", "A traveller let go by their old pod", "Messages the client sent on the landing socket".

## TDD Approach

- RED: a fake socket delivers `world_handoff {addr: "ws://pod-a/game/ws", reconnect: true}`; expect one new socket created at `ws://pod-a/game/ws?token=t&name=n&redirected=1` and `getServerAddress()` to be that addr.
- GREEN: the `reconnect` branch in `dispatch` and a `redirect()` that detaches, sets `serverAddr`, and connects with the flag.
