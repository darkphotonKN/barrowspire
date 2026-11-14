---
id: I-84N1G-4
status: done
implements: FS-84N1G
blocked_by: [I-84N1G-1]
labels: [ready-for-agent]
title: "FS-84N1G slice 4: the controls badge, a bronze book above the run's ability card"
---
Implements FS-84N1G §Requirements B, C (R3–R11)

**Lane: AFK (agent).** game-client only.

## What to Build

- The bridge gains `abilityCard(up)`; the run sends it as its ability card comes up or goes (R4).
- The UI scene stands the badge in the run while the card is up and the run has not ended, 54 × 46,
  right-aligned with the card, 8 px above it, at 1000 (R3–R5).
- The badge is a `Knockout` of `bookPicture()` (`knockoutBook.ts`), its lines where it cannot be drawn
  (R6); its hover shows "Controls (H)" and plays `menu_hover` (R7); its release toggles the panel with
  `dialog_open` / `dialog_cancel`, refused under the menu with `menu_error` (R8, R11); no cursor (R9).

## Acceptance Criteria

- [ ] The badge's place, and its up and down with the card, the end and the run.
- [ ] Its look through `Knockout` and its line fallback; `bookPicture` is the one function to swap.
- [ ] Hover, press and refusal sounds; the bone hand stays.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-84N1G-1.

## Spec Reference

FS-84N1G R3–R11.

## TDD Approach

- RED: `controlsBadgeFrame` sits over the ability card; the badge slot stands the badge only while the run says its card is up.
- GREEN: the layout, the slot, the piece, the run's send.
