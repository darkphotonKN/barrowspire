---
id: I-KYPQ9-7
status: done
implements: FS-KYPQ9
blocked_by: []
labels: [ready-for-agent]
title: "FS-KYPQ9 slice 7: the pressed bone hand on a left press, and the bone hand on the menus"
---
Implements FS-KYPQ9 §Change: The pressed hand, and the hand on the menus

**One slice, client only.** The bake and the wiring ship together: the pointer look falls back to
the plain hand without the new sheet (P9), but the slice is not done until the sheet is baked.

## What to Build

- **Bake** (P1–P3): `cursor_hand_pressed` in `tools/bake/page/models/cursors.js`, the bone hand's
  shapes posed pressed (variant A), registered in `CURSORS`; re-bake `fx-0` and the manifest with
  `npm run bake`, and show every other frame's pixels unchanged.
- **One pointer look per game** (P4–P6, P9, P10), Phaser-free, in `src/render/cursors/`: state
  `{ base: hand | strike | browser, pressed }`, written through the game's input manager's
  `setDefaultCursor` (a scene stop puts back the manager's default, so a raw canvas write would not
  stick). The press is watched on the page's pointer events, installed once per game on the game
  registry and taken off on the game's destroy. Each cursor's CSS is made once.
- **The scenes** (P5, P7, P8): the run's and the field's strike-mark swaps and the town's hand go
  through the pointer look; the main menu, character creation and the disconnect notice ask it for
  the hand; the town's and the field's stop leaves the hand instead of the browser's cursor. Keep the
  scene diffs small (the branch merges into feat/client-ui-scene).

## Acceptance Criteria
- [x] Every criterion of FS-KYPQ9 §Change: The pressed hand, and the hand on the menus, but the
      manual check.
- [x] Every hover keeps the bone hand (`boneHand.test.ts`) still holds.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By
None

## Spec Reference
FS-KYPQ9 §Change: The pressed hand, and the hand on the menus: P1–P10, its acceptance criteria and
edge states.

## TDD Approach
- RED: `manifest.test.ts` asks for `cursor_hand_pressed` with the hand's anchor; `pointerLook.test.ts`
  presses and releases a pointer look on stand-in page events; the scene tests ask the pointer look,
  not `setDefaultCursor`.
- GREEN: the bake, `PointerLook`, the scenes.
