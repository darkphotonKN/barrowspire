---
id: I-X2CMM-15
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-11", "FS-5FZ4J (levers, plates, detected traps)"]
labels: [blocked]
title: "FS-X2CMM slice 15: Far Hand works a lever, plate, chest or door from range and springs a detected trap, with the interactable reticle"
---
Implements FS-X2CMM §J R50, §H R41

**Author: agent**

## What to Build

**Wave 2.** Do not start until the Spire entities it names exist on this branch.

Mage, level 5, interactable ≤ 6 cells, 1 s, 15 mana, 30 s: interacts with the target as if the mage stood beside it; springs a detected trap. Offer the page. Client: the `interactable` reticle (R41) under the interactable nearest the pointer.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-11, FS-5FZ4J (levers, plates, detected traps)

## Spec Reference

FS-X2CMM §J R50, §H R41

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
