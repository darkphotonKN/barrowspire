---
id: I-X2CMM-21
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-1", "FS-4EC7Z (contract marks)"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 21: Take a Contract places a contract mark, and killing it settles the contract"
---
Implements FS-X2CMM §J R57

**Author: agent**

## What to Build

**Wave 2.** The encounters (FS-4EC7Z) are on this branch (merged at c80e432d).

Mercenary, level 15, none, instant, no cost, once per delve: places a mark on this floor as FS-4EC7Z's; killing it grants the mercenary Contract Settled (+15 % damage until the delve ends, lost on death). The Ledger shows the mark's rough heading per FS-4EC7Z. Offer the page. No gold.

## Against the encounters as built

- It calls `Session.TakeContract(taker)` (`game/contract.go`); the mark's heading and Contract Settled are FS-4EC7Z's and already built.
- Seams: `/Users/kranti/Library/Application Support/Claude/side-session-notes/local_928fe7ae-6c9c-45f9-b619-b451ce11c57b/class-books-ledger-seams.md`.

## Acceptance Criteria

- [ ] The behaviour above, server and client, with tests.
- [ ] The page is offered (sent and castable) once built.
- [ ] Suites green.

## Blocked By

I-X2CMM-1, FS-4EC7Z (contract marks)

## Spec Reference

FS-X2CMM §J R57

## TDD Approach

- RED: the page's effect on the Spire entity.
- GREEN: the resolver.
