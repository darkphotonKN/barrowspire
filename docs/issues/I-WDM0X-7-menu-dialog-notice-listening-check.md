---
id: I-WDM0X-7
status: open
implements: FS-WDM0X
blocked_by: [I-WDM0X-5, I-WDM0X-6]
labels: [blocked]
title: "FS-WDM0X § Change: Menu, dialog and notice sounds, slice 3: the owner's listening check, with where each sound plays (HITL)"
---
Implements FS-WDM0X §Change: Menu, dialog and notice sounds (pass 1)

**Lane: HITL.** The owner listens in Chrome and Safari, in the town, a field and the run, and on
the main menu, against the table below.

## Where each sound plays after pass 1

Worlds: **T** town, **F** field, **R** run, **MM** main menu. Every sound plays at the Sound
effects level, never before the audio unlocks, and never two for one press (M2).

| Sound | UI element | Trigger | Worlds |
|---|---|---|---|
| `menu_hover` | ESC menu rows and its × | pointer comes onto an enabled row or the × (50 ms cooldown) | T F R |
| `menu_hover` | OPTIONS: Music and Sound effects ◄ ►, each step, Fullscreen row, *Back*, × | pointer comes onto it (an arrow only while it can move) | T F R |
| `menu_hover` | Fall confirm: *Fall* (while not asked), *Not yet*, × | pointer comes onto it | R |
| `menu_hover` | NPC dialogue card rows | pointer comes onto an enabled row | T |
| `menu_hover` | corner icons Menu, Inventory, Character, Party | pointer comes onto the icon | T F R |
| `menu_hover` | the town's envelope (corner Mailbox slot) | pointer comes onto it | T |
| `menu_click` | ESC menu *Options* | pressed, or its number key | T F R |
| `menu_click` | ESC menu *Change character* | pressed, or Enter / 1 | T F |
| `menu_click` | ESC menu *Leave the queue* | pressed, or its number key (shown while queued) | T |
| `menu_click` | dialogue *Go on* (the Elder, the town folk) | pressed, or E / Enter / 1 | T |
| `menu_back` | OPTIONS *Back*, its ×, Esc | back to the ESC menu | T F R |
| `menu_toggle_on` | OPTIONS Fullscreen row | pressed while Off | T F R |
| `menu_toggle_off` | OPTIONS Fullscreen row | pressed while On | T F R |
| `menu_slider_tick` | OPTIONS Music slider | ◄, ►, a step click to another level, ← / → | T F R |
| `menu_slider_tick` | OPTIONS Sound effects slider | ◄, ►, a step click to another level (heard at the new level) | T F R |
| `menu_error` | ESC menu *Change character*, dimmed | pressed or picked by key while asked | T F |
| `menu_error` | ESC menu *Leave the barrow*, dimmed | pressed or picked by key while asked | R |
| `menu_error` | Fall confirm *Fall*, dimmed | pressed or picked by key while asked | R |
| `menu_error` | OPTIONS ◄ at 0, ► at 5; ← / → at the Music row's end | pressed | T F R |
| `menu_error` | dialogue row dimmed (a door way awaiting its reply) | pressed or picked by its key | T |
| `menu_error` | greyed Mailbox icon | pressed | F R |
| `menu_error` | corner icon that changes nothing (Party or Menu under a dialogue; an icon the world turns away, e.g. the run's Party with a chest open; Menu after the run's end with no window open) | pressed | T F R |
| `menu_error` | the town's envelope | pressed while a dialogue holds the screen | T |
| `dialog_open` | NPC dialogue card | opened by the player: E by a figure, E in the Spire's gate, stepping into the gate | T |
| `dialog_open` | Fall confirm | *Fall where you stand* pressed, or 1 | R |
| `dialog_open` | delete-character confirm | the card's × pressed, as the browser asks | MM |
| `dialog_confirm` | dialogue: *Descend alone*, *Wait for company*, *Enter as a party* | pressed, or its number key / E / Enter | T |
| `dialog_cancel` | dialogue: *Farewell*, *Not yet*, *I'll wait*, a resident's *Leave* | pressed, or its key | T |
| `dialog_cancel` | dialogue card | Esc; E or Enter on a card with nothing to confirm | T |
| `dialog_cancel` | Fall confirm *Not yet*, its ×, Esc | pressed (closes the whole menu: no `settings_close` too) | R |
| `dialog_cancel` | delete-character confirm | answered Cancel (or the browser's Esc) | MM |
| `dialog_confirm_heavy` | Fall confirm *Fall* | pressed, or 1 / Enter | R |
| `dialog_confirm_heavy` | delete-character confirm | answered OK | MM |
| `notify` | the town's envelope | glows for a letter newer than the player last saw (`mail_arrived`, or entering the town with one waiting) | T |
| `notify` | notices, the client's own | a full bag (a pickup or an unequip), a locked or busy item, a full stash | T F R |
| `notify` | notices, pickup refusals | a pile held for its killer (said by the client or the server) | F R |
| `notify` | notices, the run's news | the switch thrown ("Exit door unlocked!"), the escape door open, someone escaped, the server's `exit_door_unlocked`, an interact success's words | R |
| `notify_important` | notices relaying the server's refusal or error | the Spire's/queue's refusals in passing, *Leave the queue*'s and *Change character*'s errors, a field gate refused, a gear change refused | T |
| `notify_important` | notices relaying the server's refusal or error | *Change character*'s error, leaving the field refused ("You have fallen…") | F |
| `notify_important` | notices relaying the server's refusal or error | an equip refused, an interact refused or waiting ("The stair waits…", "It will not open.", "too far away to interact"), a fall refused | R |
| `menu_tab` | none in pass 1 | (pass 2: the chat's channel tabs) | |
| `menu_dropdown_open` | none in pass 1 | (pass 2: the chat's channel picker opens) | |
| `menu_dropdown_close` | none in pass 1 | (pass 2: the chat's channel picker closes) | |

Unchanged from FS-WDM0X: the eleven window and minimap sounds (`settings_open`/`settings_close`,
`inventory_*`, `character_*`, `party_*`, `mailbox_*`, `map_mode_switch`). Closing the whole ESC
menu (Menu icon, *Back*, ×, Esc, *Leave the barrow*) plays `settings_close`.

## Deferred to pass 2

- **Chat (FS-TQZ5J phase 7):** `menu_tab` (channel tabs), `menu_dropdown_open` /
  `menu_dropdown_close` (the canvas channel picker), hovers on its options, `menu_error` for invalid
  chat input.
- **Party (FS-TQZ5J phase 3):** the invite prompt (`notify_important`), the ready check, the party
  panel's buttons and invite field.
- **Later:** dismantle and discard (`dialog_confirm_heavy`); the main menu's switch confirm (not
  named); the chat's server notices.

## Acceptance Criteria

- [ ] The owner hears each row above where it says, in Chrome and Safari, and nothing doubled.
- [ ] The cooldown keeps a fast sweep over the menu rows from stacking.
- [ ] The delete confirm's `dialog_open` is heard while the browser's confirm is up (or the
      owner accepts it cut, Edge States).

## Blocked By

I-WDM0X-5, I-WDM0X-6

## Spec Reference

FS-WDM0X § Change: Menu, dialog and notice sounds (pass 1): all of it.
