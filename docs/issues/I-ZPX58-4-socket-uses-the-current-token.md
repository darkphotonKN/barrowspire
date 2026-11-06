---
id: I-ZPX58-4
status: done
implements: FS-ZPX58
blocked_by: [I-ZPX58-3]
labels: []
title: "FS-ZPX58 slice 4: every game-socket URL carries the current token, and a 4001 renews and reconnects once (game-client)"
---
Implements FS-ZPX58 §D (Requirements 20–21)

**Lane: agent (approved by Nick).** game-client `SocketManager`, `BootScene`.

## What to Build

- `SocketManager` reads the token from a source at each open (connect, reconnect, run handoff,
  hub handoff) instead of the copy taken at first connect.
- On a 4001 close of the game socket: renew once, reconnect; refused renewal or a second 4001
  before open → the existing auth-error callback. An opened socket resets the allowance.
- `BootScene` wires the store's access token as the source and the session renewal.

## Acceptance Criteria

- [x] SocketManager tests: each URL takes the current token; 4001 → renew → reconnect;
      refused → auth error; 4001 twice → auth error.
- [x] Full vitest and `tsc --noEmit` green.

## Blocked By

I-ZPX58-3 (the renewal).

## Spec Reference

FS-ZPX58 §Requirements D, E.
