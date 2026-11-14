---
id: I-QPDKN-13
status: open
implements: FS-QPDKN
blocked_by: [I-QPDKN-12]
labels: [ready-for-agent]
title: "FS-QPDKN party death flow, slice 2: the low spectate row and the ◄ Watching <name> ► switcher"
---
Implements FS-QPDKN §Change: The party death flow and the spectate switcher (R157–R167)

**Lane: AFK (agent), game-client only.** TDD; full vitest, `tsc --noEmit`, `npm run lint`, `npm run lint:fence`
at the end. No screenshots.

## What to Build

While spectating (dead or escaped): LEAVE + SETTLEMENT at the bottom centre, their bottom 70 above the view's
bottom, off the open chat by layout B; the dead spectator's corner LEAVE folded in (`leaveButtonPlace` goes);
the switcher 8 above the row (`hudPanel` backing, vellum name, two `drawHudButton` arrows with drawn
triangles): ► next, ◄ previous, Tab next, `menu_hover`/`menu_click` on release, greyed with one teammate
(`menu_error`). The top-centre "Watching"/"Tab" text goes; the target frame no longer hides while spectating.
SETTLEMENT reopens the record and its close returns to spectating, no card.

## Acceptance Criteria

- [ ] WATCH → row + switcher; next, previous, Tab, greyed with one; their sounds.
- [ ] Reopening the record and closing it returns to spectating with no card.
- [ ] No top text; the target frame follows its own rules while spectating.
- [ ] The row and the switcher meet neither the open chat nor its list, nor the corner row or its label, at
      every logical width 1080–1280; rects pinned at 1080 and 1280.
- [ ] vitest, tsc, lint and the fence pass.

## Blocked By

I-QPDKN-12 (the dead player's row stands only while they watch).
