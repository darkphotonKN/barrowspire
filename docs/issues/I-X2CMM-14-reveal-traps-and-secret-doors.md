---
id: I-X2CMM-14
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-2", "I-X2CMM-6", "I-X2CMM-8", "FS-5FZ4J (traps, secret doors and the per-recipient detection rule)", "FS-4EC7Z (ambush rooms)"]
labels: [blocked]
title: "FS-X2CMM slice 14: Witchlight and Tracker's Eye reveal traps and secret doors, and the hound bays at them"
---
Implements FS-X2CMM §J R49

**Author: agent**

## What to Build

**Wave 2.** Do not start until the Spire entities it names exist on this branch.

Witchlight detects hidden doors, switches and traps within 3 cells while it burns; tracker's eye detects every trap, tripwire and secret door within 10 cells of the archer; the hound bays (a sound and a mark) at a secret door or an ambush room within 6 cells. Detection follows FS-5FZ4J's rule: once detected by anyone, known to the party; never sent before. Server rules and the client's marks and bay.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-2, I-X2CMM-6, I-X2CMM-8, FS-5FZ4J (traps, secret doors and the per-recipient detection rule), FS-4EC7Z (ambush rooms)

## Spec Reference

FS-X2CMM §J R49

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
