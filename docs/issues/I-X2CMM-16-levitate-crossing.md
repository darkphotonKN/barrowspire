---
id: I-X2CMM-16
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-3", "FS-5FZ4J (chasm cells and traps)"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 16: an afloat delver crosses chasms and fires no trap"
---
Implements FS-X2CMM §J R51

**Author: agent**

## What to Build

**Wave 2.** The Spire entities it names are on this branch (merged at df34f73c).

While afloat, chasm cells are walkable and no trap fires; landing on a chasm cell when it ends follows FS-5FZ4J's fall rule.

## Against the Spire as built

- Pits are `BarrierPit` barriers, rock to every body; FS-5FZ4J has no fall rule. An afloat delver walks pit cells and fires no trap (and breathes no gas vent); when afloat ends over a pit they are set down on the nearest walkable cell, unhurt.
- Seams: `/Users/kranti/Library/Application Support/Claude/side-session-notes/local_928fe7ae-6c9c-45f9-b619-b451ce11c57b/class-books-wave2-seams.md`.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-3, FS-5FZ4J (chasm cells and traps)

## Spec Reference

FS-X2CMM §J R51

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
