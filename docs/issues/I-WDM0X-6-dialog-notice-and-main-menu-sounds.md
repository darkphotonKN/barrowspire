---
id: I-WDM0X-6
status: open
implements: FS-WDM0X
blocked_by: [I-WDM0X-5]
labels: [blocked]
title: "FS-WDM0X § Change: Menu, dialog and notice sounds, slice 2: the NPC dialogue card, the town's envelope, the notices and the main menu's delete confirm (game-client)"
---
Implements FS-WDM0X §Change: Menu, dialog and notice sounds (pass 1)

**Lane: agent.** game-client only. `HubScene`, `FieldScene` and `BarrowspireScene` change only in
what they say: `dialog_open`, an option's `sound`, a notice's `important`.

## What to Build

- **The dialogue card (M5, M10–M13, M15).** `DialogueOption.sound`; `UiDialogueSlot` plays the
  pick's sound inside `act` (pointer and keys), `menu_error` for a dimmed row, `menu_hover` on an
  enabled row (`showDialogueCard` passes the feedback to its rows); Esc and E/Enter with nothing to
  confirm play `dialog_cancel`.
- **The town (M11, M12, M15).** `HubScene` plays `dialog_open` on E by a figure, E in the gate and
  stepping into it; marks the door's three ways `"confirm"` and a resident's *Leave* `"cancel"`.
- **The envelope (M5, M10, M16).** `MailboxEnvelope` plays `menu_hover`, `menu_error` for a press
  under a dialogue, and `notify` on a newer letter's glow, through a `play` the town passes.
- **The notices (M16).** `Notice.important`; `UiNoticeLayer` plays `notify` or `notify_important`
  as it draws; each world's call site says it as M16 lists.
- **The main menu (M14).** A Phaser-free `confirmDeletion` (ask, then play); `MainMenuScene` makes
  its player in `create` and asks through it.

## Acceptance Criteria

- [ ] FS-WDM0X § Change acceptance criteria 6 (the dialogue card's dimmed rows), 8–12.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint`, `npm run lint:fence` pass.

## Blocked By

I-WDM0X-5 (the player's one-sound rule, the chrome's feedback)

## Spec Reference

FS-WDM0X § Change: Menu, dialog and notice sounds (pass 1): M5, M10–M16.

## TDD Approach

- RED: a door way picked plays `dialog_confirm` once and no `menu_click`.
- GREEN: the option's sound played inside the slot's `act`.
