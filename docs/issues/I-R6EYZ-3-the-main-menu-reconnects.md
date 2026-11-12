---
id: I-R6EYZ-3
status: done
implements: FS-R6EYZ
blocked_by: [I-R6EYZ-1]
labels: [ready-for-agent]
title: "FS-R6EYZ slice 3: the main menu reconnects, and offers RECONNECT while the server is out of reach (game-client)"
---
Implements FS-R6EYZ §C (R14–R17)

**Author: agent.** game-client only.

## What to Build

1. `SocketManager.reconnectFromMenu()`: a plain reconnect to `serverAddr` as the same player;
   if that socket closes without opening and `serverAddr` is not the default, one more at
   `DEFAULT_SERVER_ADDR`, which becomes `serverAddr`.
2. The menu's connection view, Phaser-free (suggested `src/scenes/menuConnection.ts`): per status,
   the button's words, whether it presses and what it does (enter / reconnect / nothing), and the
   status line; and the arrival rule (reconnect when down).
3. `MainMenuScene` reads both: reconnects on create when the socket is down, and its primary
   button reconnects while down.

## Acceptance Criteria

- [x] The menu coming up with the socket disconnected or in error reconnects once; open or connecting, it does nothing.
- [x] While down the primary button reads "RECONNECT" and pressing it reconnects; connected it reads "ENTER THE TOWN" and enters; connecting it reads "CONNECTING..." and does nothing.
- [x] The menu's reconnect goes to `serverAddr` without `redirected=1`; if that closes unopened and is not the default, one more at `DEFAULT_SERVER_ADDR`, then `serverAddr`; at the default already, no second try.
- [x] Whole client suite, `tsc --noEmit -p .` and lint green.

## Blocked By

I-R6EYZ-1 (same file, `SocketManager.ts`)

## Spec Reference

FS-R6EYZ §C R14–R17; Acceptance Criteria "The menu"; Edge States (server still down, server
restarted, dropped in a field, the menu up when the connection is lost).

## Files it expects to touch

`game-client/src/utils/class/SocketManager.ts` (+ test), `src/scenes/menuConnection.ts` (+ test,
new), `src/scenes/MainMenuScene.ts`.

## TDD Approach

- RED: after a handoff moved `serverAddr` to a host, `reconnectFromMenu()` opens a plain socket there, and on its unopened close one at the default.
- GREEN: `reconnectFromMenu` on `connect`'s `closedUnopened`; then the menu view table.
