---
id: I-84N1G-1
status: done
implements: FS-84N1G
blocked_by: []
labels: [ready-for-agent]
title: "FS-84N1G slice 1: the controls panel wears every window's frame and ×; H and the × sound as a dialog"
---
Implements FS-84N1G §Requirements C, D (R11, R13–R15)

**Lane: AFK (agent).** game-client only.

## What to Build

- `drawControlsPanel` draws the panel with `drawPanelFrame` (carved ground, double rule, studs, ×) in
  place of its ink ground; the title, rows, hint and size unchanged (R13).
- The × lights under the pointer and closes the panel on the release, its hit over the panel's ground
  (R14, R15).
- H's open plays `dialog_open`, its close `dialog_cancel`; the × plays `dialog_cancel`; each through the
  UI scene's act, one sound (R11).

## Acceptance Criteria

- [ ] The panel's frame is `drawPanelFrame`'s; its rows and size are unchanged.
- [ ] The ×: lit on hover, a release closes the panel with `dialog_cancel`; no cursor of its own.
- [ ] H opens with `dialog_open`, closes with `dialog_cancel`; refused H plays nothing.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None.

## Spec Reference

FS-84N1G R11, R13–R15, R19.

## TDD Approach

- RED: the controls slot's H plays `dialog_open` then `dialog_cancel`; the piece's × closes it.
- GREEN: the slot plays through the act; the piece draws the frame and hangs the × hit.
