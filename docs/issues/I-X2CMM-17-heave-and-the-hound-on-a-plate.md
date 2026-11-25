---
id: I-X2CMM-17
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-8", "I-X2CMM-11", "FS-5FZ4J (stone blocks, jammed portcullises, pressure plates)"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 17: Heave forces a portcullis and shoves a stone block, and a hound holds a plate"
---
Implements FS-X2CMM §J R52, R58

**Author: agent**

## What to Build

**Wave 2.** The Spire entities it names are on this branch (merged at df34f73c).

Warrior, level 3, interactable adjacent, 2 s, 25 stamina, 20 s: forces a jammed portcullis open; shoves an adjacent stone block one full cell away if that cell is free. Offer the page. A hound standing on a pressure plate holds it as a body does.

## Against the Spire as built

- No jammed portcullis exists (the gate opens only by its seals, ADR-0092): Heave shoves stone blocks only, one cell away from the warrior, refused when the cell is not free or is outside the block's plates room.
- A hound holds a plate by becoming a body kind that `Weighs` (`systems/body.go`).
- Seams: `/Users/kranti/Library/Application Support/Claude/side-session-notes/local_928fe7ae-6c9c-45f9-b619-b451ce11c57b/class-books-wave2-seams.md`.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-8, I-X2CMM-11, FS-5FZ4J (stone blocks, jammed portcullises, pressure plates)

## Spec Reference

FS-X2CMM §J R52, R58

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
