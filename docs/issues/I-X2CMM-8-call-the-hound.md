---
id: I-X2CMM-8
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-2"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 8: Call the Hound summons a hound that fights beside the archer for 40 s"
---
Implements FS-X2CMM §E

**Author: agent**

## What to Build

- **Call the Hound (R28, R29).** Archer, level 15, ground ≤ 4 cells walkable, 2 s, 40 stamina,
  180 s. A hound at the point for 40 s: health 40 % of the archer's max, the archer's base speed,
  bites the nearest monster within 5 cells for `8 + 0.5 × archer level` physical damage every 1.0 s
  at a 1-cell reach, else follows the archer to within 2 cells (walls respected; reuse the
  movement and pathing the monsters use where you can). Monsters may target it like a delver
  (include it in the monster AI's candidates) and hit it. It never counts as a delver: not in
  `InPlay`, the clear, the party, escape, loot or experience rules. Its kills are the archer's for
  loot and experience. When its time is up or health reaches 0 it goes. One per archer: a new one
  replaces the old. It does not climb (floor-change wipe).
- **Wire:** `book_effects` entry kind `hound` with `owner_id, x, y, health, max_health, action`
  (`idle|run|bite|dead`) for every recipient.
- New files for the hound's components and system; the smallest hooks into monster targeting and
  `CanHit`.

## Acceptance Criteria

- [ ] A level-15 archer calls a hound 3 cells off: after 2 s stamina −40 and the hound shows; it walks to and bites a monster 4 cells away every 1 s for 8 + 0.5 × 15.
- [ ] A monster may target and hit the hound; at 0 health it goes; after 40 s it goes.
- [ ] A monster killed by the hound counts as the archer's kill (experience, drop).
- [ ] A second call replaces the first; a floor change removes it; the hound never blocks the run's end rule.
- [ ] `make test` green.

## Blocked By

I-X2CMM-2

## Spec Reference

FS-X2CMM §E R28–R29, §F R34

## TDD Approach

- RED: the hound bites a monster in reach.
- GREEN: entity, AI step, targeting hook, kill credit.
