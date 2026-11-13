---
id: I-TQZ5J-5
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-2, I-TQZ5J-3, I-TQZ5J-4]
labels: [blocked]
title: "FS-TQZ5J slice 5: the owner's look-and-feel check of phase 1 in the town, a field and the run (HITL)"
---
Implements FS-TQZ5J §Acceptance Criteria (the owner's look-and-feel check), §Requirements F (R23, R24)

**Lane: HITL (Nick).** Restart the client only. No server change.

## Files it expects to touch

- This issue file (ticks, status). On a pass, `spec-update` flips FS-TQZ5J to shipped. No thin
  line (FS-TQZ5J has none). No code.

## What to Check

In the town, a field and the run, windowed and fullscreen, at render scale 1 and 1.5/2:

- [ ] The corner row looks, hovers, labels and greys as before; each icon does what it did.
- [ ] Clicking the row or the open menu never attacks, walks or talks; clicking beside them plays
      as before.
- [ ] Esc closes one thing at a time (dialogue, letter, menu, party panel, gear), then opens the
      menu; OPTIONS's Back and Esc reopen the menu; the run's Fall confirm and Leave the barrow work.
- [ ] 1 drinks a potion with the menu shut and picks a row with it open, never both; Enter opens
      chat with it shut and presses the first row with it open.
- [ ] Walking, then Esc: the character stops and does not walk on after the menu closes.
- [ ] The Music slider changes the town's music at once; Sound effects and Fullscreen as before.
- [ ] Every interface sound as before (open, close, none for menu ↔ OPTIONS).
- [ ] Main menu and character creation show no corner row; the disconnect notice holds the menu shut.
- [ ] The slices' screenshot sets: every named difference (R23) and depth overlap (R24) is accepted
      or sent back.

## Blocked By

I-TQZ5J-2, I-TQZ5J-3, I-TQZ5J-4.

## Spec Reference

FS-TQZ5J §Acceptance Criteria (the owner's check), §Requirements F (R23, R24), §User Stories 1–13.
