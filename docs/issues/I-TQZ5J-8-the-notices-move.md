---
id: I-TQZ5J-8
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-4]
labels: [ready-for-agent]
title: "FS-TQZ5J A2: the screen notices move into the UI scene, as typed messages drawn with today's look and timing"
---
Implements FS-TQZ5J §Amendment A2 (R28, R33–R35)

**Lane: AFK (agent).** game-client only. No look or timing change; the notices now stand over the
interface and every piece still in a world (R35, named for the owner).

## What to Build

- The interface carries a notice as plain data (R33): `notice({ text, look })`, `look` the town's
  line, the field's line, or the run's notification with its backing colour.
- The UI scene draws each with today's look, place, depth and timing on its own clock: the town's
  (`HubScene.notice`) and the field's (`FieldScene.notice`) at y 72, depth 1000, 3.2 s; the run's
  (`BarrowspireScene.showNotification`) at y 100, depth 2000, 1 s then a 2 s fade.
- Every path that raises one today raises it through the interface: the worlds' refusals and server
  messages, `HubGear`'s, `EquipmentHud`'s and `fieldPiles`' `port.notice`.
- A world's notices are taken down as it leaves (R34); they hold under the disconnect notice with
  the UI scene (R5).

## Acceptance Criteria

- [ ] A2's notice criteria: no world scene draws a notice of its own; the message is plain data; a
      notice said just before a world switch is gone in the next world.
- [ ] Every test of a notice's words and when it is said (refusals, `port.notice`, the run's server
      notices) still passes, moved with the code where it read a world scene's text objects.
- [ ] Before/after screenshots (R23) against 74ecdf3c in the harness: each look, mid-hold and
      mid-fade for the run's; the run's notification said with the menu open; at render scale 1, 1.5
      and 2, windowed and fullscreen. Pixel-equal, or each difference named for I-TQZ5J-5. The corner
      row's 119 and I-TQZ5J-4's menu set stay pixel-equal.
- [ ] The depth cases of R35 for the notices screenshotted and named.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-4: the run's notifications join the menu in the popup band (2000), where their order
against it is settled once the menu is the UI scene's. Touches the three world scenes; if run beside
I-TQZ5J-7, the later one rebases.

## Spec Reference

FS-TQZ5J §Amendment A2 (R28, R33–R35, its acceptance criteria and edge states); R5, R23, R24.

## TDD Approach

- RED: over a fake bridge and a fake clock, a town notice draws one line at (centre, 72), depth
  1000, gone at 3.2 s; a run notice draws at (centre, 100), depth 2000, its backing colour, full at
  1 s and gone at 3 s; a world leaving takes its notices down; `HubGear`'s `port.notice` reaches the
  bridge.
- GREEN: the bridge's `notice`, the UI scene's notice layer, the worlds' `notice` and
  `showNotification` routed through it.
