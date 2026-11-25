---
id: I-X2CMM-5
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-2"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 5: Recall pulls every living teammate on the floor to the mage, once per floor"
---
Implements FS-X2CMM §E

**Author: agent**

## What to Build

- **Recall (R25).** Mage, level 17, target `none`, 3 s, 50 mana, once per floor. Refused at the
  cast when no other living, un-escaped delver is on the run's floor. On completion each such
  teammate moves to a free walkable spot within 2 cells of the mage, nearest first, never in a
  wall or on another body (see `partyArea`/`gatherParty` in `party_spawn.go`, and `blink`'s
  `endCharge` before moving). Their own timed open or cast breaks (they moved). The spent flag is
  sent as `spent: true` until the next floor.

## Acceptance Criteria

- [ ] Two teammates in other rooms land within 2 cells of the mage after 3 s; mana −50; `recall` shows `spent` until the party climbs, then is ready.
- [ ] A solo mage, or one whose teammates are all dead or escaped, is refused with nothing spent.
- [ ] A recalled teammate's timed open breaks.
- [ ] `make test` green.

## Blocked By

I-X2CMM-2

## Spec Reference

FS-X2CMM §A R8, §E R25

## TDD Approach

- RED: two teammates land near the mage.
- GREEN: the resolver and the placement.
