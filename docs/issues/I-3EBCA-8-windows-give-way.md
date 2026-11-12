---
id: I-3EBCA-8
status: done
implements: FS-3EBCA
blocked_by: [I-3EBCA-7]
labels: [ready-for-agent]
title: "FS-3EBCA slice 8: the windows give way to the letter panel and the menu, and the menu owns the screen (game-client)"
---
Implements FS-3EBCA §D R15–R19 (with R6–R9, R11); FS-1GZGD §Change: The envelope toggles the letter panel and stands in the corner row (C1, C4); FS-R82NV §Change: The party panel closes on its × and stands nearer the middle (C8, C9); FS-HRH2J §Change: Character and inventory apart (C2, C11); FS-G4VMQ §Change: The ESC menu in a field world (C4, C6)

The owner, 2026-11-12: "信箱似乎也會卡住其他面板 但信箱是全畫面 那設定成開信箱時其他視窗會被關閉 開其他視窗時信箱會被關閉
開menu時其他視窗也會關閉 然後menu開啟時其他都不能按".

## What to Build

The windows are the inventory, the character panel, the party panel and the town's letter panel.
The envelope opens the letter panel over any of them, closing them (only a dialogue or the menu
refuses it); I, B, C, T and their icons open their window over the letter panel, closing it; the
menu, as it opens, closes every window. Esc keeps closing the topmost first; the Menu icon opens
the menu at once (after a run's end it only closes the windows). While the menu is open nothing
else answers: no corner icon (Menu included), no window key, no envelope, no chat focus, and a
blocker under the menu's rows takes every press and hover over the view.

## Acceptance Criteria

- [x] FS-3EBCA §D's acceptance lines; FS-1GZGD § Change C4's, FS-R82NV § Change C9's and FS-G4VMQ § Change C4's and C6's.
- [x] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-3EBCA-7

## TDD Approach

- RED: per world, the envelope (town) with each window and the stash open; I, B, C, T and their
  icons over the letter panel; Esc's order kept; the Menu icon closing every window and opening the
  menu (a run's end: no menu); with the menu open no icon, key or envelope answers and the chat
  input takes no focus; the menu's blocker (depth, view-wide, follows a resize, stops a press).
- GREEN: the envelope's and the party panel's `opening`, the scenes' `refusesLetter`,
  `clearForLetter`, `closeLetter`, `closeWindows`, `pressMenuIcon`, `mayChat`; `showMenuPanel`'s
  blocker.
