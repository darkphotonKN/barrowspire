---
id: I-3EBCA-7
status: done
implements: FS-3EBCA
blocked_by: [I-3EBCA-6]
labels: [ready-for-agent]
title: "FS-3EBCA slice 7: the party panel opens over the inventory and the character panel (game-client)"
---
Implements FS-3EBCA §A–§B R8, R11; FS-R82NV §Change: The party panel closes on its × and stands nearer the middle (C2, C8); FS-HRH2J §Change: Character and inventory apart (C11)

The owner's finding, 2026-11-12: "開道具欄跟角色欄時開不了隊伍" (with the inventory or the character
panel open, the party panel cannot be opened).

## What to Build

Each scene's rule for T and the Party icon stops naming the overlay: the town refuses only for a
dialogue, the ESC menu or the letter panel; a run for its ESC menu, its end or an open container;
a field for its ESC menu. The party panel draws above the overlay's panels and their ×; the
overlay leaves a press, the pointer and the wheel at a point the party panel covers alone; one
Esc closes the party panel before the overlay. The envelope and the chat input keep their rules.

## Acceptance Criteria

- [x] FS-R82NV § Change C8's acceptance line; FS-3EBCA R8's and R11's.
- [x] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-3EBCA-6

## TDD Approach

- RED: T and the Party icon with the inventory, the character panel and both open, in the town,
  a field and a run; the open panel's depth over the overlay's; Esc closing the party panel first;
  the overlay ignoring a press, a hover and E under the party panel; keys typed into the invite
  field stopped there.
- GREEN: the three scenes' `refusesParty`, `PARTY_PANEL_DEPTH`, the overlay's `under`, `escapeStep`.
