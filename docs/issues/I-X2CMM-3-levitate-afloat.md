---
id: I-X2CMM-3
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-2"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 3: Levitate makes an ally or the mage afloat, and an afloat delver cannot attack"
---
Implements FS-X2CMM §C, §E

**Author: agent**

## What to Build

- **Levitate (R23).** Mage, level 9, target `ally` (a living, un-escaped delver of the run within
  6 cells, or the mage), 1.5 s, 35 mana, 90 s. The target is `target_id` (a member/player id; the
  caster's own id is self). On completion `afloat` for 8 s; a second Levitate restarts it.
- **Afloat refuses attacks.** While afloat, every attack row, the class ability and the tree ability
  are refused as if on cooldown (nothing spent); book pages and the potion still work. Do it with
  the smallest hook into `resolve` (one check reading the state), so the Spire branch merges.
- **Wire:** `afloat` among the delver's named states, on `current_player` and `other_players`.

## Acceptance Criteria

- [ ] A level-9 mage levitates a teammate 4 cells off: after 1.5 s mana −35, the teammate shows `afloat` for 8 s and their slash is refused; it works again after.
- [ ] Self works with the caster's own id; a teammate 7 cells off, a dead or escaped teammate, an unknown id and a monster id are refused with nothing spent.
- [ ] An ally walking 1 cell further during the cast still completes; 2 cells further ends with nothing.
- [ ] `make test` green.

## Blocked By

I-X2CMM-2

## Spec Reference

FS-X2CMM §C R13, R15, §D R17, §E R23, §F R34

## TDD Approach

- RED: an afloat delver's slash is refused.
- GREEN: the resolver, the state and the hook.
