---
id: I-WDM0X-5
status: in-progress
implements: FS-WDM0X
blocked_by: []
labels: [ready-for-agent]
title: "FS-WDM0X § Change: Menu, dialog and notice sounds, slice 1: the 16 effects, one sound per action, the ESC menu, OPTIONS, the Fall confirm and the corner row (game-client)"
---
Implements FS-WDM0X §Change: Menu, dialog and notice sounds (pass 1)

**Lane: agent.** game-client only. No world scene changes in this slice.

## What to Build

- **The effects (M1).** `UI_EFFECTS` names all 27; the 16 m4a copies made with S21's command and
  committed beside their oggs; `PreloadScene` queues them as it queues the eleven.
- **The player (M2–M4).** Inside `act`, the first effect asked for is the action's one sound, in
  place of the rule's; outside, it plays at once. `menu_hover` has a 50 ms cooldown
  (`MENU_HOVER_COOLDOWN_MS`), the clock injected.
- **The chrome's feedback.** `menuOption`, `showMenuPanel`, `frameCloseHit` and `showOptionsPanel`
  take an optional feedback (`hovered`, `refused`, and for OPTIONS `stepped`, `toggled`): a hover on
  a pressable option, a press or key on a dimmed one, a level moved, the Fullscreen row pressed.
- **The menu slot (M5–M10, M13).** `UiMenuSlot` hands the chrome its feedback (the bridge's
  `play`), and plays: `menu_click` for *Options*, *Change character*, *Leave the queue*;
  `menu_back` for OPTIONS' *Back*/×/Esc; `dialog_open` for *Fall where you stand*;
  `dialog_confirm_heavy` for *Fall*; `dialog_cancel` for *Not yet*/×/Esc; the rule's
  `settings_close` for the rest.
- **The corner row (M5, M10).** `HudCorner` hovers play through the spec's `hovered` (not the
  greyed Mailbox); the greyed Mailbox's press plays `menu_error`; `UiCornerRow` plays `menu_error`
  for a press that changes no window.

## Acceptance Criteria

- [ ] FS-WDM0X § Change acceptance criteria 1–7 (the effects, `act`, the cooldown, the menu slot,
      OPTIONS, dimmed rows in the menu and the Fall confirm, the corner row).
- [ ] Existing FS-WDM0X and FS-TQZ5J tests that asserted silence for an *Options* press, an OPTIONS
      back step or a dimmed press are updated to the new sounds, and no other existing test changes.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint`, `npm run lint:fence` pass.

## Blocked By

None

## Spec Reference

FS-WDM0X § Change: Menu, dialog and notice sounds (pass 1): M1–M10, M13 (the Fall confirm).

## TDD Approach

- RED: `UiSounds.act` plays the first effect asked for inside it, in place of the rule's.
- GREEN: a `chosen` effect held by the outermost `act`.
