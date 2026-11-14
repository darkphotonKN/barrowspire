---
id: I-TQZ5J-41
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-40]
labels: [ready-for-agent]
title: "FS-TQZ5J batch 4, slice 2: the owner's look-and-feel and listening check of the mailbox (HITL)"
---
Implements FS-TQZ5J §Change: Batch 4: the mailbox (the owner's check, R108)

**Lane: HITL (Nick).** Restart the client only. No server change. No parity shots (the owner,
2026-11-14: 「不用比對 我測的時候再看就好」).

## What to Check

In the town, windowed and fullscreen, at render scale 1 and 1.5/2:

- [ ] The envelope in the corner row's Mailbox slot, its count badge, its glow and `notify` on a new
      letter, its "Mailbox" label and `menu_hover`, as before.
- [ ] The envelope opens and closes the letter panel (`mailbox_open` / `mailbox_close`); its ×, Esc
      (letter first) close it; refused under a dialogue and the menu (`menu_error`).
- [ ] The letter panel's list, letter, scroll (wheel, the body's thumb), Enclosed row, item tips and Take,
      as before.
- [ ] Opening the letter panel closes the inventory, the character panel, the stash and the party panel
      with `mailbox_open` alone; opening any of them, or the menu, closes the letter panel.
- [ ] R108: the letter panel now draws over the party frames where they meet (its left edge at 1×
      windowed), and a press, hover or wheel there is the panel's (no Travel). Accept or ask.
- [ ] A press on the letter panel while chat is typing lets the chat go, its draft kept.
- [ ] Outside the town the greyed Mailbox, "Mailbox · town only", as before.
- [ ] The minimap, the map name, the run's top-right column, the target frame and the arrival card are
      unchanged (they stayed in the world).

## Where each mailbox sound plays after batch 4

| Sound | Where | When (unchanged; now played by the UI scene's piece) |
|---|---|---|
| `mailbox_open` / `mailbox_close` | envelope, letter panel | the envelope's press, the panel's ×, Esc; none for a game-made close |
| `menu_hover` | envelope | the pointer onto it |
| `menu_error` | envelope | a press refused (dialogue, menu) |
| `notify` | envelope | it glows for a newer letter |

## Blocked By

I-TQZ5J-40.

## Spec Reference

FS-TQZ5J §Change: Batch 4: the mailbox; FS-WDM0X S1–S9, O1.
