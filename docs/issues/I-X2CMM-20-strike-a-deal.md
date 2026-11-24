---
id: I-X2CMM-20
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-11", "FS-4EC7Z (encounter groups and the hire)"]
labels: [blocked]
title: "FS-X2CMM slice 20: Strike a Deal hires a willing encounter group for the rest of the floor"
---
Implements FS-X2CMM §J R56

**Author: agent**

## What to Build

**Wave 2.** Do not start until the Spire entities it names exist on this branch.

Mercenary, level 9, interactable (an encounter group) ≤ 4 cells, 2 s, no cost, 900 s: hires a willing group for the rest of the floor, as FS-4EC7Z's hire. Offer the page. No gold.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-11, FS-4EC7Z (encounter groups and the hire)

## Spec Reference

FS-X2CMM §J R56

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
