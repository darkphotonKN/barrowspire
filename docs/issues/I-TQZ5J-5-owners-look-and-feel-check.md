---
id: I-TQZ5J-5
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-2, I-TQZ5J-3, I-TQZ5J-4, I-TQZ5J-6, I-TQZ5J-7, I-TQZ5J-8]
labels: [blocked]
title: "FS-TQZ5J slice 5: the owner's look-and-feel check of phase 1 in the town, a field and the run (HITL)"
---
Implements FS-TQZ5J §Acceptance Criteria (the owner's look-and-feel check), §Requirements F (R23, R24), §Amendment A2

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
- [ ] Across the scenes (FS-TQZ5J A1): an archer's Shadow Shot let go over the corner row fires; a
      chat scrollbar drag let go there lets go; pressing a corner icon while typing in chat stops the
      typing; a gear tip goes as the pointer jumps onto the row. The one picture A1 changes: no icon
      lights under a press begun in the world (it once did); accept or send back.
- [ ] The town's dialogue card (FS-TQZ5J A2): looks, answers (mouse, E, Enter, 1–3, Esc) and closes
      as before, over the corner row again; a reply awaited dims its row; a page turns.
- [ ] The notices (A2): each world's look, place and timing as before; over the interface and the
      world's windows now (R35's named cases): accept or send back.

## Blocked By

I-TQZ5J-2, I-TQZ5J-3, I-TQZ5J-4, I-TQZ5J-6, I-TQZ5J-7, I-TQZ5J-8.

## Spec Reference

FS-TQZ5J §Acceptance Criteria (the owner's check), §Requirements F (R23, R24), §User Stories 1–13.

## Owner sign-off

2026-11-14: the owner checked phase 1 in game (corner row, ESC menu, OPTIONS, Fall confirm, NPC dialogue, notices, interface sounds, the cross-scene pointer) and approved it: 「沒問題」.
