---
id: I-8RZ51-1
status: open
implements: FS-8RZ51
blocked_by: []
labels: [ready-for-agent]
title: "FS-8RZ51 slice 1: one shared tree definition, points earned and the spend rule, with the client golden (game-server/common)"
---
Implements FS-8RZ51 §A (R1–R6), §B (R7–R10), §F R28–R31 (values only), §API surface (the refusal codes)

**Author: agent.**

## Files it expects to touch

- `game-server/common/passivetree/passivetree.go` (new): node ids, tiers, slots, kinds, max ranks,
  per-rank values for the four classes; `Earned(level)`; `Unspent(level, ranks)`; the spend rule;
  per class the ability node and the two specialization nodes
- `game-server/common/passivetree/passivetree_test.go` (new), `golden_test.go` (new, `-update`)
- `game-client/src/data/passiveTree.golden.json` (new, written by the golden test, never by hand)
- `game-server/common/errcode/errcode.go` (six `PASSIVE_*` codes)

## What to Build

A package under `game-server/common` that both character-service and game-service import, so the
rule that allows a spend is the rule that saves it (FS-BDA7X R15's precedent, `common/progression`).

- The tree of R2 for `warrior`, `mage`, `archer`, `mercenary`: ids `<class>.t1a` … `<class>.t6b`
  (R3), kind (filler, kicker, ability, specialization), tier, max rank, and the per-rank values of
  R28 and R29 as data (stat, amount, unit), plus each kicker's R3 rule as an id the game systems
  switch on. No names: names are the client's.
- Gates: tiers 2, 3, 5, 6 by ranks spent in smaller tiers (4, 8, 13, 18); tier 4 by the tier-3
  node held.
- `Earned(level)`: `L − 1` below 20, 20 at 20 (R4), using `progression.MaxLevel`.
- The spend rule (R9) as one pure function of (class, level, held ranks, node, target rank)
  answering allowed, already held (R10), or which rule refused it: unknown node, out of order, max
  rank, tier locked, no points, specialization taken. Typed errors the services map to codes.
- Reads the siblings need (R31): `AbilityNode(class)`, `SpecializationNodes(class)` (`t6a` then
  `t6b`).
- The golden (R6): a test that marshals the definition to
  `game-client/src/data/passiveTree.golden.json` (relative path as `hub_town_golden_test.go` does)
  and fails on any difference; `-update` rewrites it.
- `common/errcode`: `PASSIVE_UNKNOWN_NODE`, `PASSIVE_RANK_OUT_OF_ORDER`, `PASSIVE_MAX_RANK`,
  `PASSIVE_TIER_LOCKED`, `PASSIVE_NO_POINTS`, `PASSIVE_SPECIALIZATION_TAKEN` (adding is non-breaking).

## Acceptance Criteria

- [ ] `Earned(1)=0`, `Earned(2)=1`, `Earned(10)=9`, `Earned(19)=18`, `Earned(20)=20`.
- [ ] Every class has 11 nodes with max ranks 2/2/3/3/1/2/2/3/3/1/1 and the R2 gates; a test pins
      every row and every per-rank value of R28 and R29.
- [ ] Table-driven rule tests: each refusal of the FS's "Points and rules" criteria, and each
      allowed one step later; a target already held is "already held", not a refusal.
- [ ] Unspent never goes below 0 in any table case.
- [ ] The golden test fails when the definition and the JSON differ; `-update` rewrites it.
- [ ] `make test` green in `game-server/common`.

## Blocked By

None.

## Spec Reference

FS-8RZ51 §A R1–R6, §B R7–R10, §F R28–R31 (the values as data), §API surface (codes). User stories
1–3, 8, 18, 27–29.

## TDD Approach

- RED: `Earned` table, then the tier-2 gate refusing at 3 spent above.
- GREEN: the definition table and a rule walking the checks in R9's order.
