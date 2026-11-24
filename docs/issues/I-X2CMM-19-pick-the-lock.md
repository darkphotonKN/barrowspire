---
id: I-X2CMM-19
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-11", "FS-5FZ4J (locked doors)", "FS-4EC7Z (cages)"]
labels: [blocked]
title: "FS-X2CMM slice 19: Pick the Lock opens a locked door, cage or chest without its key"
---
Implements FS-X2CMM §J R55

**Author: agent**

## What to Build

**Wave 2.** Do not start until the Spire entities it names exist on this branch.

Mercenary, level 3, interactable adjacent, 4 s, no cost, 30 s: opens it without its key. Offer the page.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-11, FS-5FZ4J (locked doors), FS-4EC7Z (cages)

## Spec Reference

FS-X2CMM §J R55

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
