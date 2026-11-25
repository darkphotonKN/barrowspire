---
id: I-X2CMM-20
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-11", "FS-4EC7Z (encounter groups and the hire)"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 20: Strike a Deal hires a willing encounter group for the rest of the floor"
---
Implements FS-X2CMM §J R56

**Author: agent**

## What to Build

**Wave 2.** The encounters (FS-4EC7Z) are on this branch (merged at c80e432d).

Mercenary, level 9, interactable (an encounter group) ≤ 4 cells, 2 s, no cost, 900 s: hires a willing group for the rest of the floor, as FS-4EC7Z's hire. Offer the page. No gold.

## Against the encounters as built

- It calls `Session.Hire(group, hirer)` (`game/cutthroats.go`); the target is an encounter group, refused as `Hire` refuses.
- Seams: `/Users/kranti/Library/Application Support/Claude/side-session-notes/local_928fe7ae-6c9c-45f9-b619-b451ce11c57b/class-books-ledger-seams.md`.

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
