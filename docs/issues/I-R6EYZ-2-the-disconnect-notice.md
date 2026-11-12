---
id: I-R6EYZ-2
status: done
implements: FS-R6EYZ
blocked_by: [I-R6EYZ-1]
labels: [ready-for-agent]
title: "FS-R6EYZ slice 2: the disconnect notice over a still world, and Return to menu (game-client)"
---
Implements FS-R6EYZ §B (R6–R13)

**Author: agent.** game-client only.

## What to Build

1. A Phaser-free controller (suggested `src/components/disconnectNotice.ts`) over the game's
   scene manager: on a lost connection, start the notice scene if a world scene is starting or
   running and the notice is not up; pause every running world scene while it is up; Return to
   menu takes it down, stops every world scene and the menu started, running or paused, and starts
   `MainMenuScene`. It closes no socket. Bound to the socket per game in `PhaserGame` and let go
   in its cleanup.
2. The notice's layout and words (suggested `src/ui/disconnectNoticeLayout.ts`): the dim, the
   panel centred in the view, the title, the line and the button.
3. The notice scene (suggested `src/scenes/DisconnectNoticeScene.ts`), last in the game's scene
   list: draws the dim, the carved panel and the button; pauses world scenes as they come each
   frame; hides Phaser's DOM layer and blurs a focused field, giving the layer back on its end;
   relays out on a view change.

## Acceptance Criteria

- [x] A lost connection with a world scene starting or running raises the notice; with only the menu, character creation, boot or preload up, it does not.
- [x] A second lost connection while the notice is up raises no second one.
- [x] After the game's watch is let go, a lost connection raises nothing.
- [x] The notice shows "Disconnected", "The connection to the server was lost." and "Return to menu", centred at 1080 and 1280 wide, and is laid out again on a view change.
- [x] While up: every running world scene is paused, one that comes up later too; the DOM layer is hidden and a focused field blurred; the layer comes back when the notice goes.
- [x] Return to menu takes the notice down, stops every world scene and menu started, running or paused, starts the main menu, and closes no socket.
- [x] No key, outside click or timer takes the notice down.
- [x] Tokens only (the lint fence), the body serif, the carved panel.
- [x] Whole client suite, `tsc --noEmit -p .` and lint green.

## Blocked By

I-R6EYZ-1

## Spec Reference

FS-R6EYZ §B R6–R13; Acceptance Criteria "The notice"; Edge States (two tabs, a scene still
loading, a socket reconnected under the notice, the settlement record, leaving /game).

## Files it expects to touch

`game-client/src/components/disconnectNotice.ts` (+ test, new), `src/ui/disconnectNoticeLayout.ts`
(+ test, new), `src/scenes/DisconnectNoticeScene.ts` (+ test, new), `src/components/PhaserGame.tsx`.

## TDD Approach

- RED: the controller over a fake scene manager: a loss with the town running starts the notice; a second loss starts nothing; a loss with only the menu up starts nothing; Return to menu stops the paused run and starts the menu.
- GREEN: the controller, then the layout, then the scene that draws them.
