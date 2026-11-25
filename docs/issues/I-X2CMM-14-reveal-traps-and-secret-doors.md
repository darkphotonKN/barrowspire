---
id: I-X2CMM-14
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-2", "I-X2CMM-6", "I-X2CMM-8", "FS-5FZ4J (traps, secret doors and the per-recipient detection rule)", "FS-4EC7Z (ambush rooms)"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 14: Witchlight and Tracker's Eye reveal traps and secret doors, and the hound bays at them"
---
Implements FS-X2CMM §J R49

**Author: agent**

## What to Build

**Wave 2.** The Spire entities it names are on this branch (merged at df34f73c).

Witchlight detects hidden doors, switches and traps within 3 cells while it burns; tracker's eye detects every trap, tripwire and secret door within 10 cells of the archer; the hound bays (a sound and a mark) at a secret door or an ambush room within 6 cells. Detection follows FS-5FZ4J's rule: once detected by anyone, known to the party; never sent before. Server rules and the client's marks and bay.

## Against the Spire as built

- Hidden switches do not exist: reveal finds secret doors and traps (tripwires are traps).
- Reveal = `DetectableComponent.Detected` (the party's, FS-5FZ4J R30) and `DetectableComponent.Revealed` (FS-4EC7Z's flag), which the serializer sends as `revealed: true` on a trap's and a secret door's entry.
- The hound bays at a shut secret door, and at a seal piece or tripwire whose ambush (`AmbushComponent`) has not woken, within 6 cells.
- Seams: `/Users/kranti/Library/Application Support/Claude/side-session-notes/local_928fe7ae-6c9c-45f9-b619-b451ce11c57b/class-books-wave2-seams.md`.

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
