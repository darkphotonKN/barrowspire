---
id: I-X2CMM-15
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-11", "FS-5FZ4J (levers, plates, detected traps)"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 15: Far Hand works a lever, plate, chest or door from range and springs a detected trap, with the interactable reticle"
---
Implements FS-X2CMM §J R50, §H R41

**Author: agent**

## What to Build

**Wave 2.** The Spire entities it names are on this branch (merged at df34f73c).

Mage, level 5, interactable ≤ 6 cells, 1 s, 15 mana, 30 s: interacts with the target as if the mage stood beside it; springs a detected trap. Offer the page. Client: the `interactable` reticle (R41) under the interactable nearest the pointer.

## Against the Spire as built

- Plates are held by weight and take no interact, so Far Hand does not work them.
- Levers are seal pieces of kind `lever` and `bridge_lever`; doors are the floor's doors; chests are containers; a detected trap is sprung.
- Seams: `/Users/kranti/Library/Application Support/Claude/side-session-notes/local_928fe7ae-6c9c-45f9-b619-b451ce11c57b/class-books-wave2-seams.md`.

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
