---
id: I-X2CMM-19
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-11", "FS-5FZ4J (locked doors)", "FS-4EC7Z (cages)"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 19: Pick the Lock opens a locked door, cage or chest without its key"
---
Implements FS-X2CMM §J R55

**Author: agent**

## What to Build

**Wave 2.** The encounters (FS-4EC7Z) are on this branch (merged at c80e432d).

Mercenary, level 3, interactable adjacent, 4 s, no cost, 30 s: opens it without its key. Offer the page.

## Against the encounters as built

- FS-5FZ4J built no locked doors or locked chests: the cage is the page's only target. It calls `Session.OpenCage(cageID, opener)` (`game/captives.go`).
- Seams: `/Users/kranti/Library/Application Support/Claude/side-session-notes/local_928fe7ae-6c9c-45f9-b619-b451ce11c57b/class-books-ledger-seams.md`.

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
