---
id: I-X2CMM-16
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-3", "FS-5FZ4J (chasm cells and traps)"]
labels: [blocked]
title: "FS-X2CMM slice 16: an afloat delver crosses chasms and fires no trap"
---
Implements FS-X2CMM §J R51

**Author: agent**

## What to Build

**Wave 2.** Do not start until the Spire entities it names exist on this branch.

While afloat, chasm cells are walkable and no trap fires; landing on a chasm cell when it ends follows FS-5FZ4J's fall rule.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-3, FS-5FZ4J (chasm cells and traps)

## Spec Reference

FS-X2CMM §J R51

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
