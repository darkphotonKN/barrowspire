---
id: I-T3DWX-1
status: done
implements: FS-T3DWX
blocked_by: []
labels: [ready-for-agent]
title: "FS-T3DWX slice 1: fullscreen moves from the corner button into the OPTIONS panel"
---
Implements FS-T3DWX §Requirements (A, B, C, D), §Acceptance Criteria, §Edge States

**Lane: AFK (agent).** game-client only.

## What to Build

The whole move, in one slice: no state ships with two fullscreen controls or none.

- The page lends the game frame's fullscreen control (`fullscreenOf(document,
  keyboardLockOf(navigator))` bound to the frame, or `null`) to the new game's registry. The
  town, the field and the run read it as they open the OPTIONS panel (R12).
- The OPTIONS panel gets a **Fullscreen** row under Sound effects: Off / On, the state's word
  amber, a `pointerup` toggles it, it redraws on every fullscreen change while open, and it is
  absent with no control (R4–R11).
- `GameFrame` drops the button. `FullscreenButton.tsx`, its test, its CSS, `fullscreenHintSide`
  and the DOM-only helpers in `fullscreen.ts` are deleted. The HUD layout round the footprint
  stays (R1–R3).
- The guideline and `CONTEXT.md` stop placing a button on the canvas (R13).

## Acceptance Criteria

- [ ] Every FS-T3DWX acceptance criterion but the owner's browser check, each named by a test or
      by the diff.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None

## Spec Reference

FS-T3DWX §Requirements 1–13, User Stories 1–15, §Acceptance Criteria (all but the browser check),
§Edge States.

## TDD Approach

- RED: `optionsPanel.test.ts`. Given a fullscreen control, the panel draws a third row,
  Fullscreen, with Off/On, and a `pointerup` on `options-fullscreen` calls `toggle`.
- GREEN: a toggle row kind in `showOptionsPanel`, and `fullscreen` on `OptionsPanelSpec`.
- Then: the redraw on watch, no row with no control, the registry bridge and the scenes passing
  it, and `GameFrame` without the button.
