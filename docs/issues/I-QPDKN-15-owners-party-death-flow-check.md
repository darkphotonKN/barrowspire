---
id: I-QPDKN-15
status: open
implements: FS-QPDKN
blocked_by: [I-QPDKN-12, I-QPDKN-13, I-QPDKN-14]
labels: []
title: "FS-QPDKN party death flow, slice 4: the owner's look and listening check (HITL)"
---
Implements FS-QPDKN §Change: The party death flow and the spectate switcher (the owner's check)

**Lane: HITL (Nick).** Restart the client only. No screenshots (the owner's rule, 2026-11-14). Two browsers, a
party of two or three, in the tower.

## The look changes to check

- [ ] **The record alone.** Die with a teammate still in play: only the settlement record pops up (one
      `dialog_open`). No "The barrow keeps you" card and no bottom-centre button under it (was: the card under
      the record and SETTLEMENT in the row).
- [ ] **CLOSE brings the card.** The record's CLOSE puts up the card with WATCH and LEAVE, heard as `dialog_open`
      alone (no `menu_click` with it). No SETTLEMENT while the card is up.
- [ ] **The card's LEAVE** takes you to the village, as before.
- [ ] **WATCH** takes the card down; LEAVE and SETTLEMENT stand side by side at the bottom centre, lower than the
      old row: y 612–650 at 720 tall (was y 466–504 for SETTLEMENT; the dead player's LEAVE was in the
      bottom-right corner, which is gone). At 1080: LEAVE 442–536, SETTLEMENT 544–688; at 1280: 517–611 and
      619–763. They stay right of the open chat window (from 442), clear of the corner icons and their labels.
- [ ] **The switcher** "◄ Watching <name> ►" stands 8 above them (y 576–604 at 720 tall), centred on them (565 at
      1080, 640 at 1280), its width the name's words plus 76: a dark HUD-panel strip, the name in vellum 14 px,
      each arrow a brass-outlined square with an amber triangle. Check it reads as neutral HUD and the arrows as
      the only amber in it.
- [ ] **Switching.** ► goes to the next teammate, ◄ to the previous, round at the ends; Tab still goes to the next.
      Each live arrow: `menu_hover` on the hover, `menu_click` on the release. With one teammate in play both
      arrows are greyed (faint outline and triangle): no hover sound, `menu_error` on a press, nothing changes.
      The bone hand stays over them.
- [ ] **No text at the top centre** while watching ("Watching <name>" and "Tab: next player" are gone).
- [ ] **The target frame** (floor 1's monster frame at the top centre) now shows while you watch, by its own rules
      (was hidden while spectating).
- [ ] **SETTLEMENT while watching** reopens the record (`dialog_open`); CLOSE (or SETTLEMENT again, `menu_click`)
      returns to watching: no card again, the row and the switcher as they were.
- [ ] **An escaped player who watches** gets the same: their LEAVE and SETTLEMENT move down to the spectate row and
      the switcher stands over them (was: LEAVE and SETTLEMENT stayed 200 above the bottom and the name at the
      top). Before WATCH, their WATCH, LEAVE, SETTLEMENT row is as before.
- [ ] **The own bars stay.** After a death, the top-left Health bar stays up at 0 and the mana / stamina / parry
      bar as it was, with the potion cell beside them, frozen (was: all three hidden); watching a teammate never
      shows the teammate's values there. After an escape they stay too, frozen as at the escape. The level bar,
      the ability card and the controls badge are as before; a field's bars still hide while you lie fallen.
- [ ] **Unchanged:** a solo death and a solo escape (the record alone, its CLOSE `menu_click`, the town held
      behind it); the last of a party to resolve.
- [ ] Resize the window while watching (or toggle fullscreen): the row and the switcher go back to their places.

## Sounds (where each plays)

| Moment | Sound |
|---|---|
| The record pops up at the death | `dialog_open` (once, as before) |
| The record's CLOSE that brings the card | `dialog_open` alone |
| Any other close of the record (CLOSE, SETTLEMENT taking it down) | `menu_click` |
| SETTLEMENT bringing the record back | `dialog_open` |
| WATCH, LEAVE, SETTLEMENT hover / press | `menu_hover` / `menu_click` |
| A dimmed LEAVE (leave pending) press | `menu_error` |
| ◄ or ► hover / release (live) | `menu_hover` / `menu_click` |
| ◄ or ► press (greyed, one teammate) | `menu_error`, no hover |
| Tab | nothing |
