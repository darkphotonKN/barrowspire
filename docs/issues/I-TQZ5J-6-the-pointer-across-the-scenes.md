---
id: I-TQZ5J-6
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-3]
labels: [ready-for-agent]
title: "FS-TQZ5J A1: the pointer across the scenes: a world's press stays the world's, a UI press lets go of the text field, every move reaches the world"
---
Implements FS-TQZ5J §Amendment A1 (R25–R27)

**Lane: AFK (agent).** game-client only. Restores today's behaviour (parity) in three cross-scene
pointer cases I-TQZ5J-3 found; the rules hold for every later UI-scene piece.

## What to Build

- **R25, a world's press is the world's.** The UI scene takes its cameras out of Phaser's hit test
  (`Camera.inputEnabled`) from a press it had nothing of its own under until no pointer is down
  (its release, its next move, or its next frame), so Phaser hands the world every move and the
  release of its own press, over the row or off the canvas.
- **R26, a UI press lets go of the text field.** On a press Phaser lists one of its pieces under, the
  UI scene blurs the focused element inside the game's frame (`letGoOfGameField` in `gameFocus.ts`,
  beside `takeFocusOnPress`), after the piece has answered.
- **R27, every move reaches the world.** A move the UI scene took (over a piece, or leaving one) is
  handed through the UI bridge to the world reported, which runs it through its own InputPlugin pass
  (`InputPlugin.update`, pinned to Phaser 4.2.1's source), its cameras out over a UI piece.
  `reportWorld` gives every world this, so no world scene changes.
- Phaser-free rules (`src/ui/uiScenePointer.ts`), the UI scene wiring them to its own scene-wide
  `pointerdown`, `pointerup`, `pointerupoutside`, `pointermove`, `pointerout` and its update.

## Acceptance Criteria

- [ ] The amendment's acceptance criteria, each with its harness evidence before (74ecdf3c) vs after.
- [ ] The corner row's 119 before/after parity shots stay pixel-equal.
- [ ] No keyboard or pointer `stopPropagation`; `globalTopOnly` untouched; the ESC menu and the
      dialogue untouched.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-3 (the row in the UI scene, where the cases arise).

## Spec Reference

FS-TQZ5J §Amendment A1 (R25–R27, its acceptance criteria and edge states); R7, R14, R15, R21.

## TDD Approach

- RED: `uiScenePointer.test.ts` (each rule over stand-ins, and Phaser 4.2.1's input pinned from its
  source), `gameFocus.test.ts` (`letGoOfGameField`), `uiBridge.test.ts` (a move handed to the world
  reported runs through its own pass), `UIScene.test.ts` (the wiring); the harness's
  `pointer.mjs` shows the three cases before vs after.
- GREEN: the rules module, the bridge's `moved` and the world's `hearMove`, the UI scene's wiring.
