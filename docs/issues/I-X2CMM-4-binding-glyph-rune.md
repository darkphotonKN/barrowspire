---
id: I-X2CMM-4
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-2"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 4: Binding Glyph lays a rune that stuns the first three monsters to cross it"
---
Implements FS-X2CMM §E

**Author: agent**

## What to Build

- **Binding Glyph (R24).** Mage, level 13, ground ≤ 6 cells, walkable, 2.5 s, 40 mana, 60 s. A
  rune of radius 0.75 cells at the point for 30 s. Each tick the first 3 distinct monsters whose
  centre is inside it are stunned for 4 s (a boss 2 s) through the existing stun (`systems.stun`,
  which keeps the longer stun and cancels a wind-up; export a small helper if needed). Each monster
  is caught once. After the third, or at 30 s, the rune goes. Cleared on a floor change.
- **Wire:** the rune in the run world-effect list (slice 2's shape), kind `rune`, so every recipient
  draws it.

## Acceptance Criteria

- [ ] A rune laid under a monster stuns it on the first tick for 4 s; a boss 2 s.
- [ ] Four monsters walking in: the first three are stunned, the fourth is not, and the rune is gone after the third.
- [ ] A rune with no catch goes after 30 s; a point 7 cells off is refused.
- [ ] `make test` green.

## Blocked By

I-X2CMM-2

## Spec Reference

FS-X2CMM §E R24, §F R34

## TDD Approach

- RED: the first monster inside is stunned.
- GREEN: rune entity, its tick, the serializer entry.
