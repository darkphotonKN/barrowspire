---
id: I-R6EYZ-1
status: done
implements: FS-R6EYZ
blocked_by: []
labels: [ready-for-agent]
title: "FS-R6EYZ slice 1: the socket tells a lost connection, and only a lost one (game-client)"
---
Implements FS-R6EYZ §A (R1–R5)

**Author: agent.** game-client only. Nothing is drawn by this slice: it gives slice 2 the one
signal it raises the notice on.

## What to Build

`SocketManager.onConnectionLost(listener)` → removal. In `attach`'s `onclose`, the fall-through
(the game's current socket closing, not `4001`, not the redirect's `closedUnopened`) tells every
listener once, unless a run or hub handoff is pending; the status still goes `disconnected`. A lost
connection forgets `handoffSessionId`.

## Acceptance Criteria

- [x] An ordinary close of the open game socket (`1006`, `1001`, `1012`, a server's `1000`) tells the listeners once; a removed listener is not told.
- [x] A socket that never opened and closes tells them.
- [x] `disconnect()` followed by the browser's close tells nothing.
- [x] A `4001` close tells nothing, with a renewer and without one.
- [x] A redirect: the landing socket's close tells nothing; the redirected socket closing unopened tells nothing; the default-address try closing unopened too tells them.
- [x] A promoted handoff: the old socket's close tells nothing.
- [x] A close while a run handoff or a hub handoff is pending tells nothing; a failed handoff's reconnect that then closes tells them.
- [x] After a lost connection, a `world_handoff` to the run last handed off to is followed.
- [x] The status still goes `disconnected`.
- [x] Whole client suite, `tsc --noEmit -p .` and lint green.

## Blocked By

None

## Spec Reference

FS-R6EYZ §A R1–R5; Acceptance Criteria "The signal"; Edge States (a lost connection during a
handoff, signed out elsewhere).

## Files it expects to touch

`game-client/src/utils/class/SocketManager.ts` (+ test).

## TDD Approach

- RED: a table of closes (ordinary open, never opened, after `disconnect()`, `4001` both ways, redirect landing, redirect unopened, promoted handoff, pending handoffs) and whether each tells the lost listener.
- GREEN: the listener set and the one call in the fall-through, gated on `!this.pending`.
