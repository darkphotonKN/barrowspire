---
id: I-3EBCA-9
status: done
implements: FS-3EBCA
blocked_by: [I-3EBCA-8]
labels: [ready-for-agent]
title: "FS-3EBCA slice 9: one title style for every window, and MENU on the menu (game-client)"
---
Implements FS-3EBCA §E R20–R24; FS-G4VMQ §Change: The menu wears the party panel's frame (C3, amended)

The owner, 2026-11-12: "每個ui視窗的標題都不同位置 都統一放在中間的樣式好了 大小顏色也一樣", "menu目前沒標題也加上",
"全大寫也統一".

## What to Build

`drawPanelTitle` beside `drawPanelFrame`: the words in capitals, centred across the panel, 14 px
below its top, 14 px `frameBright`, letter-spacing 4. The party panel, the gear overlay (inventory,
character, stash), the letter panel, the run's controls panel, the settlement record and
`showMenuPanel` (MENU, rows moved down by the title band) draw their titles through it.

## Acceptance Criteria

- [x] FS-3EBCA §E's acceptance line.
- [x] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-3EBCA-8

## TDD Approach

- RED: `drawPanelTitle`'s place, style, capitals and band clear of the ×; each window calling it
  with its panel and words; the menu's MENU and its rows moved down by the band.
- GREEN: `panelFrame.drawPanelTitle`; each window's title drawn through it.
