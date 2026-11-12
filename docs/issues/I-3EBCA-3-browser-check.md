---
id: I-3EBCA-3
status: open
implements: FS-3EBCA
blocked_by: [I-R82NV-13, I-3EBCA-1, I-1GZGD-12, I-G4VMQ-5, I-3EBCA-2, I-3EBCA-4, I-3EBCA-5]
labels: [blocked]
title: "FS-3EBCA slice 3: Nick's browser check of the corner icons and the panel controls (HITL)"
---
Implements FS-3EBCA §Acceptance Criteria (whole FS); FS-1GZGD §Change: The envelope toggles the letter panel and stands in the corner row; FS-R82NV §Change: The party panel closes on its × and stands nearer the middle; FS-G4VMQ §Change: The ESC menu in a field world; FS-HRH2J §Change: Character and inventory apart

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
  Character opens the stats beside it, the gear icon closes both. The inventory's slots, bag (30
  cells, no scroll bar), gold and hint read well at its shorter height; equipping by right-click
  or E as before.
- At the stash chest: stash left, inventory right; an open character panel closes; C does
  nothing there.
- The gear icon does what Esc does: in the town and a field the menu (Change character, Back),
  in a run the run's menu.
- The letter panel closes on a second press of the envelope.
- The party panel: × at its top right, Esc closes it, centred near the top; with a party of 2–4
  it does not hide too much of you; prompts and the ready check beside it, not under it.
- A field: Esc with nothing open opens the menu; Change character takes you to the roster.
- A run and a field: the ability card just above the icons; dead, Leave the barrow above them.
- Look at: the left (character) panel is shortened too, to mirror the inventory; the right
  panel's title now reads INVENTORY; Party and the envelope still refuse while either panel is
  open (their owners' guards); with only the character panel open E talks to NPCs and opens doors
  and chests; in a run a prompt stepped beside the open party panel overlaps the minimap.

## Acceptance Criteria

- [ ] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-R82NV-13, I-3EBCA-1, I-1GZGD-12, I-G4VMQ-5, I-3EBCA-2, I-3EBCA-4, I-3EBCA-5

## Spec Reference

FS-3EBCA whole; the four change sections above.
