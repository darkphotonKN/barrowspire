---
id: I-56CKV-5
status: open
implements: FS-56CKV
blocked_by: [I-56CKV-1, I-56CKV-2, I-56CKV-3, I-56CKV-4]
labels: [blocked]
title: "FS-56CKV slice 5: Nick's browser check of the minimap's look and the run HUD's corners (HITL)"
---
Implements FS-56CKV §Acceptance Criteria (whole FS), §User Stories 1–23

**Lane: HITL (Nick).**

## Files it expects to touch

- This issue file (ticks) and, on a pass, the FS's and the stubs' status flips by `spec-update`.
  No code.

## What to Check

- Floor 1, a dev build, 1080 and 1280 wide, windowed and fullscreen: the minimap at the top of the
  top-right corner, frame as before; candle-dark edges; explored rooms dark stone, the party's
  rooms lighter, each outlined; the lever, arch and steps found and told apart; your dot larger;
  the floor and escaped lines small under it; x/y small and dim in the minimap's bottom-left,
  covering no room; M hides the map and the lines close up to the top, x/y under them.
- A tower floor (floor 2 or 3), dev build: no minimap; the floor and escaped lines at the top of
  the corner, x/y under them; the XP bar, bars and party frames at the very top left.
- A production build: no x/y anywhere; the top-left stack at the top.
- In a party: the frames clear of the chat window.
- Owner question, answered 2026-11-12 (not asked again): x/y under the top-right lines on a floor
  with no minimap (FS-56CKV §C.18). Nick said "好" to "沒有小地圖時，座標放在右上那一欄文字的下方，可以嗎？";
  recorded in FS-56CKV's amendment of 2026-11-12. Check only that it stands there.

## Acceptance Criteria

- [ ] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-56CKV-1, I-56CKV-2, I-56CKV-3, I-56CKV-4

## Spec Reference

FS-56CKV whole.
