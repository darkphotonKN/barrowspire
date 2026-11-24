---
id: I-X2CMM-2
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-1"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 2: the server counts cast time, breaks it on a move, a hit or another cast, and Witchlight sets down its light"
---
Implements FS-X2CMM §D, §E, §F

**Author: agent**

## What to Build

Adds the cast time every slow page uses, proven by Witchlight (ground, 1 s).

- **Casting (R16–R20).** An accepted page with a cast time starts casting: page, target, elapsed,
  total, the start position and the health before combat (copy `TimedOpenComponent` /
  `systems/timed_open.go`'s `MarkHealth` and `cancelled` pattern). It completes when the time runs
  out with the R17 re-check (cost, caster in play, target valid and within range + 1 cell); it
  breaks with nothing spent on a move (any position change), a hit that costs health, another cast
  that resolves (`CombatSystem.Attackers()`), leaving play, or a floor change. A page cast while
  casting is refused.
- **Witchlight (R21).** Mage, level 2, ground ≤ 8 cells on a walkable cell (not a wall), 1 s,
  20 mana, 45 s. On completion a witchlight entity at the point for 20 s, then gone. Cleared on a
  floor change. Offered from this slice on.
- **The wire.** `current_player.book.casting = {page, remaining, total}` while casting. A run
  world-effect list for every recipient, e.g. `book_effects: [{id, kind:"witchlight", x, y,
  remaining}]` (interest-cut as other run entities are). Pick one shape the rune (slice 4) reuses.

## Acceptance Criteria

- [ ] A level-2 mage casts `witchlight` at a walkable point 5 cells off: `casting` shows for 1 s, then mana −20, cooldown 45 s, a witchlight in every recipient's state for 20 s.
- [ ] Walking, a monster hit that costs health, a left-click that resolves, death and a floor change during the cast each break it with no mana spent, no cooldown and no light.
- [ ] A point 9 cells off, or inside a wall, is refused with nothing spent; a second page while casting is refused.
- [ ] A witchlight goes on a floor change.
- [ ] `make test` green.

## Blocked By

I-X2CMM-1

## Spec Reference

FS-X2CMM §D R16–R20, §E R21–R22, §F R32 (casting), R34

## TDD Approach

- RED: a cast-time test that the light appears only after 1 s.
- GREEN: casting component and its system step; the witchlight entity and its serializer entry.
