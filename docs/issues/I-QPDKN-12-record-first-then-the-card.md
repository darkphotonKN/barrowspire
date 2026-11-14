---
id: I-QPDKN-12
status: done
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN party death flow, slice 1: the record first, its CLOSE brings the card"
---
Implements FS-QPDKN §Change: The party death flow and the spectate switcher (R150–R156)

**Lane: AFK (agent), game-client only.** TDD; full vitest, `tsc --noEmit`, `npm run lint`, `npm run lint:fence`
at the end. No screenshots (the owner's rule).

## What to Build

For a dead player with a teammate in play: the record alone first; the card only once the record is not up
(its first CLOSE); no SETTLEMENT and no row while the card is up or before it; the CLOSE that brings the card
plays `dialog_open` alone (the run plays the record close's sound; the UI scene's record slot only requests the
close and keeps the hover). A death seen before any record keeps today's card at once.

## Acceptance Criteria

- [x] death → record only (one `dialog_open`, no card, no row) → CLOSE → the card with WATCH and LEAVE, no
      SETTLEMENT, CLOSE heard as `dialog_open` alone.
- [x] The card's LEAVE sends `leave_run`; every other record close plays `menu_click`.
- [x] A death shown before any record: the card at once, as today.
- [x] Solo death and solo escape as today; the record slot's Close requests the close and plays nothing itself.
- [x] vitest, tsc, lint and the fence pass.

## Blocked By

None.
