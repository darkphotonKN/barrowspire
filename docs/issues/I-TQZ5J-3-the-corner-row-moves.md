---
id: I-TQZ5J-3
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-1, I-TQZ5J-2]
labels: [ready-for-agent]
title: "FS-TQZ5J slice 3: the corner row moves into the UI scene"
---
Implements FS-TQZ5J §Requirements C (R13–R15), §Requirements F (R23, R24)

**Lane: AFK (agent).** game-client only. No behaviour or look change.

## What to Build

- The UI scene builds the corner row from the world report, per world (R13): the town's four with
  its Mailbox slot left to the hub's own envelope; a field's and the run's four plus the greyed
  Mailbox; rebuilt on a world change.
- Presses (R14): Menu stays the world's menu path until slice 4 (a `toggleMenu` request for this
  slice only, removed by slice 4); Inventory, Character, Party send `toggle`. The refusals read the
  report (the menu's state, a dialogue).
- The worlds stop constructing `HudCorner` and stop testing `corner.covers` in their click paths
  (R15).
- **Until slice 4, the menu is still the world's**, and its blocker sits under the UI scene. Today
  that blocker covers every icon but Menu (FS-3EBCA R18: 「menu開啟時其他都不能按」), so while the
  world reports its menu open the row's other icons take no hover and no press (no label, no
  brightening); Menu still closes the menu. The world's blocker no longer needs `through` for the
  icon: the icon is in the scene above. Slice 4 removes this stopgap when the menu and its blocker
  join the row in the UI scene.

## Acceptance Criteria

- [ ] Every acceptance criterion of FS-3EBCA (and its § Changes) still holds; its tests pass, moved
      with the code where they tested a world scene.
- [ ] A press on the row reaches no world handler; a press beside it does (FS-TQZ5J R7).
- [ ] Before/after screenshots (R23): the row in the town, a field and the run, at render scale 1,
      1.5 and 2, windowed and fullscreen, idle and each icon hovered (its label), and the greyed
      Mailbox. Pixel-equal, or each difference named for I-TQZ5J-5.
- [ ] The depth check (R24): the gear overlay's tips (2200) and flash (2300), the party panel
      (1110), the run's controls panel (1200) and resolved card (1500), the settlement record
      (1600), the letter panel (1800) and notifications (2000) are each shown not to overlap the
      row, or the overlap is screenshotted before and after and named for I-TQZ5J-5.
- [ ] No world scene constructs `HudCorner`.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-1, I-TQZ5J-2 (serialized: every move slice edits the three world scenes). **Do not start
until `feat/client-tower-music` and `feat/client-enlarged-map-labels-inside` are both merged to
main.**

## Spec Reference

FS-TQZ5J §Requirements C (R13–R15), F (R23, R24); §User Stories 1, 2, 3, 9, 14; § Spike
findings (a).

## Screenshots

Taken the same way before (main) and after (the branch): the live client on the local stack driven
by playwright-core `channel: "chrome"`, same view size and state. If the agent cannot run the
stack, it says so and hands the set to I-TQZ5J-5.

## TDD Approach

- RED: the UI scene builds the town's row without a Mailbox and the field's and run's with the
  greyed one, from a report; Inventory sends `toggle: inventory`; with the world's menu reported
  open, Inventory neither lights nor sends and Menu still does; Party is refused under a dialogue.
- GREEN: the row in the UI scene, the worlds' row and `covers` checks removed.
