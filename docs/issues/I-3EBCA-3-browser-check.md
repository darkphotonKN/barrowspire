---
id: I-3EBCA-3
status: open
implements: FS-3EBCA
blocked_by: [I-R82NV-13, I-3EBCA-1, I-1GZGD-12, I-G4VMQ-5, I-3EBCA-2, I-3EBCA-4, I-3EBCA-5, I-3EBCA-6, I-3EBCA-7, I-3EBCA-8]
labels: [blocked]
title: "FS-3EBCA slice 3: Nick's browser check of the corner icons and the panel controls (HITL)"
---
Implements FS-3EBCA §Acceptance Criteria (whole FS); FS-1GZGD §Change: The envelope toggles the letter panel and stands in the corner row; FS-R82NV §Change: The party panel closes on its × and stands nearer the middle; FS-G4VMQ §Change: The ESC menu in a field world; FS-HRH2J §Change: Character and inventory apart; FS-G4VMQ §Change: The menu wears the party panel's frame

**Lane: HITL (Nick).**

## Files it expects to touch

- This issue file (ticks) and, on a pass, the sections' status flips by `spec-update`. No code.

## What to Check

- Town, field and run, 1080 and 1280 wide, windowed and fullscreen: the five icons bottom right
  (gear, bag, bust, two busts, envelope), the same places in every world; each brightens and names
  itself under the pointer; the envelope greyed outside the town, "Mailbox · town only", inert.
- Each icon toggles its panel; a second press closes it; I, B, T, M and Esc as before; C opens
  and closes the character panel alone, I and B the inventory alone, either with or without the
  other; each panel's × closes it alone; one Esc closes both.
- With the inventory open the icons stay in view below it and answer: Inventory closes it,
  Character opens the stats beside it, the gear icon closes both and opens the menu. The inventory's slots, bag (30
  cells, no scroll bar), gold and hint read well at its shorter height; equipping by right-click
  or E as before.
- The ESC menu (town, field, run, and the Fall confirm), the inventory and the character panel
  wear the party panel's frame and its × at the top right; the menu's × closes it as Esc does.
- At the stash chest: stash left, inventory right; an open character panel closes; C does
  nothing there.
- The gear icon opens the menu at once, closing whatever window is open: in the town and a field
  the menu (Change character, Back), in a run the run's menu; Esc still closes the topmost window
  first. While the menu is open nothing else answers: no icon (the gear included), no I, B, C, T or
  M, no envelope, no Travel, Leave or prompt button, no chat tab or input, no attack; its ×, Back
  and Esc close it (FS-3EBCA R17, R18).
- Town: the envelope opens the letters with the inventory, the character panel, the stash or the
  party panel open, closing them; with the letters open, I, B, C, T and their icons open their
  window and put the letters away (FS-3EBCA R15, R16).
- The letter panel closes on a second press of the envelope.
- The party panel: × at its top right, Esc closes it, centred near the top; with a party of 2–4
  it does not hide too much of you; prompts and the ready check beside it, not under it.
- With the inventory, the character panel or both open, T and the Party icon open the party
  panel over them in the town, a field and a run; it is drawn on top; the first Esc closes it,
  the second the overlay; its invite field takes typing (I, C, B, T, E, Q type letters); a press
  on it does nothing in the inventory or character panel underneath (FS-R82NV § Change C8).
- A field: Esc with nothing open opens the menu; Change character takes you to the roster.
- A run and a field: the ability card just above the icons; dead, Leave the barrow above them.
- Look at: the left (character) panel is shortened too, to mirror the inventory; the right
  panel's title now reads INVENTORY; with only the character panel open E talks to NPCs and opens doors
  and chests; in a run a prompt stepped beside the open party panel overlaps the minimap; in a
  field and a run an invite prompt or the ready check stays drawn under the open menu but cannot be
  pressed until it closes (the town hides them under the menu).

## Acceptance Criteria

- [ ] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-R82NV-13, I-3EBCA-1, I-1GZGD-12, I-G4VMQ-5, I-3EBCA-2, I-3EBCA-4, I-3EBCA-5, I-3EBCA-6, I-3EBCA-7, I-3EBCA-8

## Spec Reference

FS-3EBCA whole; the five change sections above.
