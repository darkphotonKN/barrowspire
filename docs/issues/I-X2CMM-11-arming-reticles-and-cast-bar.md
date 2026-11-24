---
id: I-X2CMM-11
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-10", "I-X2CMM-2"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 11: clicking a page arms it, the run draws its reticle and sends the cast, and the cast bar fills"
---
Implements FS-X2CMM §H

**Author: agent**

## What to Build

- **The ask (R44a).** Clicking a ready page sends the world a new `UiRequest` kind
  (`uiBridge.ts`); `none`/`self` pages cast at once; `ground`/`ally` pages arm.
- **Arming (R40–R41).** A pure `src/scenes/pageAim.ts` state machine (pattern: `arrowRainAim.ts`)
  in the run scene: the reticle at the pointer (`ground`, sized per page, faint beyond range) or
  under the nearest teammate/self within a body's reach (`ally`). A left-click on a valid target
  sends `cast_skill {skill_id: page, target_x, target_y, target_id}` via `PlayerCombat`'s port and
  disarms; on no target it does nothing. While armed, left-click never attacks and right-click
  disarms without the class ability. Esc disarms first (`escapeOrder`). Closing the book, another
  window, death, a floor change, leaving the run disarm. Nothing of the effect is predicted (R42).
- **Cast bar (R43).** While `current_player.book.casting` is present a small bar under the player's
  feet fills to `total` (reuse `countdownBar.ts`, as `openBar.ts` does), with the page's roundel at
  28 px on its left. Owner only.

## Acceptance Criteria

- [ ] Clicking Witchlight arms a ground ring; a click 5 cells off sends `cast_skill` with the page id and point; Esc and right-click disarm with no other effect.
- [ ] Hardened casts on the click; Levitate's reticle snaps to the nearest teammate in reach.
- [ ] The cast bar fills while `casting` is present and clears after.
- [ ] Client suites green.

## Blocked By

I-X2CMM-10, I-X2CMM-2

## Spec Reference

FS-X2CMM §H R40–R44a

## TDD Approach

- RED: `pageAim` arms on a ground page and sends on a valid click.
- GREEN: the state machine, the request, the scene wiring.
