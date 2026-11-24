---
id: I-X2CMM-21
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-1", "FS-4EC7Z (contract marks)"]
labels: [blocked]
title: "FS-X2CMM slice 21: Take a Contract places a contract mark, and killing it settles the contract"
---
Implements FS-X2CMM §J R57

**Author: agent**

## What to Build

**Wave 2.** Do not start until the Spire entities it names exist on this branch.

Mercenary, level 15, none, instant, no cost, once per delve: places a mark on this floor as FS-4EC7Z's; killing it grants the mercenary Contract Settled (+15 % damage until the delve ends, lost on death). The Ledger shows the mark's rough heading per FS-4EC7Z. Offer the page. No gold.

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
