---
id: I-X2CMM-18
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-1", "I-X2CMM-7", "FS-5FZ4J (trap damage and poison)"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 18: Hardened ignores trap damage and poison, and a draught cures poison"
---
Implements FS-X2CMM §J R53, R54

**Author: agent**

## What to Build

**Wave 2.** The Spire entities it names are on this branch (merged at df34f73c).

While hardened, trap damage and poisoning on the warrior are ignored. Drinking a draught also cures poison.

## Against the Spire as built

- Trap damage is `hitByTrap` (`game/trap_hit.go`, also a wrong lever's darts); poisoning is `systems.Poison` from a gas vent. While hardened neither lands; a poison already running runs on.
- Brew's cure is `systems.CurePoison`, the entry point FS-5FZ4J named for it.
- Seams: `/Users/kranti/Library/Application Support/Claude/side-session-notes/local_928fe7ae-6c9c-45f9-b619-b451ce11c57b/class-books-wave2-seams.md`.

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
