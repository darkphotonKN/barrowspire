---
id: I-X2CMM-6
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-1"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 6: Tracker's Eye and the Long Night: the archer's sight state, and the warrior's taunt and guard"
---
Implements FS-X2CMM §E

**Author: agent**

## What to Build

- **Tracker's Eye (R26).** Archer, level 3, `none`, instant, 20 stamina, 60 s: `trackers_eye`
  for 15 s on the archer's named states. Its reveal is wave 2.
- **The Long Night (R31).** Warrior, level 15, `self`, instant, 40 stamina, 120 s: `long_night`
  for 6 s. While it runs, every living monster within 5 cells of the warrior (at the start and any
  coming within 5 cells) takes the warrior as its target (`MonsterComponent.Target` = the warrior,
  held as a retaliation is), and every hit on the warrior deals 30 % less damage. Stunned monsters
  stay stunned. When it ends, targeting goes back to normal. Id `long_night`, never `last_stand`
  (the Guardian's rule, `LastStandSpentComponent`, is unrelated).

## Acceptance Criteria

- [ ] A level-3 archer's `trackers_eye` shows 15 s on their state; stamina −20; cooldown 60 s.
- [ ] Under the Long Night, a monster chasing a teammate 3 cells from the warrior turns on the warrior; one 7 cells off does not; a hit on the warrior deals 70 % of its damage.
- [ ] After 6 s a monster picks its target normally again.
- [ ] `make test` green.

## Blocked By

I-X2CMM-1

## Spec Reference

FS-X2CMM §E R26, R31

## TDD Approach

- RED: a monster within 5 cells targets the warrior.
- GREEN: the state, the taunt step and the damage cut.
