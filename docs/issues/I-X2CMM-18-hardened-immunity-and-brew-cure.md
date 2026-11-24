---
id: I-X2CMM-18
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-1", "I-X2CMM-7", "FS-5FZ4J (trap damage and poison)"]
labels: [blocked]
title: "FS-X2CMM slice 18: Hardened ignores trap damage and poison, and a draught cures poison"
---
Implements FS-X2CMM §J R53, R54

**Author: agent**

## What to Build

**Wave 2.** Do not start until the Spire entities it names exist on this branch.

While hardened, trap damage and poisoning on the warrior are ignored. Drinking a draught also cures poison.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-1, I-X2CMM-7, FS-5FZ4J (trap damage and poison)

## Spec Reference

FS-X2CMM §J R53, R54

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
