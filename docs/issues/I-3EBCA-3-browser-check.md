---
id: I-3EBCA-3
status: open
implements: FS-3EBCA
blocked_by: [I-R82NV-13, I-3EBCA-1, I-1GZGD-12, I-G4VMQ-5, I-3EBCA-2]
labels: [blocked]
title: "FS-3EBCA slice 3: Nick's browser check of the corner icons and the panel controls (HITL)"
---
Implements FS-3EBCA §Acceptance Criteria (whole FS); FS-1GZGD §Change: The envelope toggles the letter panel and stands in the corner row; FS-R82NV §Change: The party panel closes on its × and stands nearer the middle; FS-G4VMQ §Change: The ESC menu in a field world

**Lane: HITL (Nick).**

## Files it expects to touch

- This issue file (ticks) and, on a pass, the sections' status flips by `spec-update`. No code.

## What to Check

- Town, field and run, 1080 and 1280 wide, windowed and fullscreen: the four icons bottom right
  (gear, bust, two busts, envelope), the same places in every world; each brightens and names
  itself under the pointer; the envelope greyed outside the town, "Mailbox · town only", inert.
- Each icon toggles its panel; a second press closes it; I, B, T, M and Esc as before.
- The gear icon does what Esc does: in the town and a field the menu (Change character, Back),
  in a run the run's menu.
- The letter panel closes on a second press of the envelope.
- The party panel: × at its top right, Esc closes it, centred near the top; with a party of 2–4
  it does not hide too much of you; prompts and the ready check beside it, not under it.
- A field: Esc with nothing open opens the menu; Change character takes you to the roster.
- A run and a field: the ability card just above the icons; dead, Leave the barrow above them.
- Pending your decision, not built: splitting the gear overlay into a Character panel (C) and an
  Inventory panel (I) with a fifth icon (FS-3EBCA Out of Scope). Until then Character (I) opens
  the whole overlay.
- Look at: with the gear overlay open its right panel covers the icons (FS-3EBCA R11, raised:
  the Character icon cannot close the overlay); in a run a prompt stepped beside the open party
  panel overlaps the minimap.

## Acceptance Criteria

- [ ] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-R82NV-13, I-3EBCA-1, I-1GZGD-12, I-G4VMQ-5, I-3EBCA-2

## Spec Reference

FS-3EBCA whole; the three change sections above.
