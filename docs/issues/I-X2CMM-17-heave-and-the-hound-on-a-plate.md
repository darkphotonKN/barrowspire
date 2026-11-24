---
id: I-X2CMM-17
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-8", "I-X2CMM-11", "FS-5FZ4J (stone blocks, jammed portcullises, pressure plates)"]
labels: [blocked]
title: "FS-X2CMM slice 17: Heave forces a portcullis and shoves a stone block, and a hound holds a plate"
---
Implements FS-X2CMM §J R52, R58

**Author: agent**

## What to Build

**Wave 2.** Do not start until the Spire entities it names exist on this branch.

Warrior, level 3, interactable adjacent, 2 s, 25 stamina, 20 s: forces a jammed portcullis open; shoves an adjacent stone block one full cell away if that cell is free. Offer the page. A hound standing on a pressure plate holds it as a body does.

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
