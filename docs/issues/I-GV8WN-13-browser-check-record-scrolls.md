---
id: I-GV8WN-13
status: open
implements: FS-GV8WN
blocked_by: [I-GV8WN-12]
labels: [blocked]
title: "FS-GV8WN slice 13: Nick's browser check of the scrolling settlement record (HITL)"
---
Implements FS-GV8WN §Change: The settlement record scrolls (§Acceptance Criteria, by eye)

**Lane: HITL (Nick).** No code. Client only: no service restart is needed beyond the usual dev
client reload.

## Files it expects to touch

- This issue file (ticks) and, on a pass, the section's status flip by `spec-update`. No code.

## What to Check

- Escape a run carrying more than 8 items (and, if you can, lose a few): every item is listed, no
  "and n more"; the wheel over the record scrolls the two lists together, the thin brass thumb on
  the right follows, and the title, status, earned and delve lines and CLOSE stay put.
- A short record (8 items or fewer a list) looks exactly as before and does not scroll.
- Rows are cut cleanly at the top and bottom of the scroll area, and the text is as crisp as the
  rest of the HUD, at render scale 1, 1.5 and 2 (resize the window; fullscreen).
- With the pointer over the record where it overlaps the chat window, the wheel scrolls only the
  record; off the record, the chat scrolls as before.
- Scrolled down, wait for pending → confirmed: the list stays where it was. Close and reopen with
  the Settlement button: back at the top.

## Acceptance Criteria

- [ ] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-GV8WN-12.

## Spec Reference

FS-GV8WN §Change: The settlement record scrolls — the by-eye Acceptance Criterion, S1–S8 as seen.
