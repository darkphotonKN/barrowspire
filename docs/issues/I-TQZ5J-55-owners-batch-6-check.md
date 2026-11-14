---
id: I-TQZ5J-55
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-50, I-TQZ5J-51, I-TQZ5J-52, I-TQZ5J-53, I-TQZ5J-54]
labels: []
title: "FS-TQZ5J batch 6, slice 6: the owner's look and listening check of the end row and the moved chat (HITL)"
---
Implements FS-TQZ5J §Change: Batch 6: the end row and the chat (the owner's check)

**Lane: HITL (Nick).** Restart the client only. No screenshots (the owner's rule, 2026-11-14).

## What to Check

### The run's end row (FS-TQZ5J R120–R124; FS-QPDKN § Amendment 2026-11-14)

The words WATCH, LEAVE, SETTLEMENT in EB Garamond bold 13 px (was 14), letter-spaced 1 (was 3); each
button its label's width plus 24 a side: WATCH 104, LEAVE 94, SETTLEMENT 144 (each was 200), 38 high; 8
apart (was 16). The row's height is unchanged (y 466–504 at 720 tall). Where the row stands, by logical
width (x spans):

| Buttons | At 1080 (from 442, clear of the chat) | At 1280 (centred) |
|---|---|---|
| WATCH | 488–592 | 588–692 |
| LEAVE | 493–587 | 593–687 |
| SETTLEMENT | 468–612 | 568–712 |
| WATCH + LEAVE | 442–546, 554–648 | 537–641, 649–743 |
| LEAVE + SETTLEMENT | 442–536, 544–688 | 517–611, 619–763 |
| WATCH + SETTLEMENT | 442–546, 554–698 | 512–616, 624–768 |
| all three | 442–546, 554–648, 656–800 | 461–565, 573–667, 675–819 |

- [ ] An escaped player with a teammate in play: WATCH and LEAVE in the bottom-centre row, right of the open
      chat window at 1080, centred at 1280; SETTLEMENT joins them once the record has come.
- [ ] The dead player's card: WATCH and LEAVE centred on the card, 8 apart, each its own width.
- [ ] The dead spectator's corner button reads LEAVE (it read LEAVE THE BARROW), 94 wide, its right edge
      where the 200-wide button's was, above the corner row.
- [ ] The settlement record still opens over the row, centred; the row never touches the chat window,
      open or folded, its picker list open or shut.
- [ ] The text reads well at render scale 1 (13 px is the guideline's label step; 12 px would be its
      floor).

### Chat in the UI scene (FS-TQZ5J R125–R136)

- [ ] Chat in the town, a field and the run: the tabs, the picker and its list, the scrollbar and the wheel,
      the fold button, Enter to type, Esc and Enter on nothing to stop, whispers by a name and by `@`, party
      lines, join and leave lines: as before.
- [ ] While typing, nothing in the world or the UI answers a key (WASD, M, E, I, C, T, H, Esc stay the
      field's); a stride key held as Enter is pressed stops.
- [ ] Opening the letter panel while typing keeps the half-typed line; the menu, a gear panel, the town's
      dialogue, the run's end and an open chest drop it, as before.
- [ ] Over the chat window, nothing of the world lights or shows a tip (new: the window takes the pointer
      there); a press on it never attacks.
- [ ] The letter panel, the gear overlay, the party panel, the controls panel and the settlement record drawn
      over the window take their own presses, hovers and wheel: the window under them scrolls, lights and
      plays nothing.
- [ ] The corner row's hover label stays over the ability card after the card comes back up.
- [ ] (Added 2026-11-14, batch 6 review: an intended look change.) Entering a world, the chat window is up at
      full strength while the world fades in from black around it: it no longer fades with the world, as
      the corner row and the HUD pieces do not. Holding left on a monster and right-pressing over the chat
      window attacks, casts and strikes nothing.

### Where each chat sound plays (FS-WDM0X § Pass 2: the chat, as amended 2026-11-14)

| Sound | Where | When |
|---|---|---|
| `menu_tab` | a channel tab (Area, World, Party, Whisper) | each press; with the picker's list open, alone (the list shuts silently) |
| `menu_dropdown_open` | the channel picker at the input row's left | pressed with its list shut (the input opens with it: one sound) |
| `menu_dropdown_close` | the picker pressed with its list open; a press outside the list that is not on a tab (the lines, the fold button, the world); Esc in the list; a row picked by the release or by Enter | once |
| (silent) | the list shut by Tab, by typing, by a resize, by the keys taken (the menu, a gear panel, the dialogue, the letter panel, the run's end, an open chest), by a press on another UI piece, by a tab press | |
| `menu_hover` | the pointer onto a tab, or onto a row of the open list it can pick | once per one entered; none under a UI piece drawn over the window; none on WATCH, LEAVE or SETTLEMENT (they no longer meet it); none for the picker, the fold button or a name |
| `menu_error` | Enter on `@Name` with no message, or `@ ` with no name | once per Enter, the draft kept |

- [ ] Each sound plays where the table says, once per action, at the interface volume.
