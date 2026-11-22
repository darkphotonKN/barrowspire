---
id: I-8RZ51-13
status: done
implements: FS-8RZ51
blocked_by: []
labels: [ready-for-agent]
title: "FS-8RZ51 slice 13: the tree becomes a graph with locked sides, one rule for both services, the golden rewritten (game-server)"
---
Implements FS-8RZ51 §Change: Tree v2: a traversal graph with locked sides, §V-A (V1–V12), §V-C V18–V19, §V-D V21, §API surface

**Author: agent** (named in the charter of 2026-11-22, so not server work taken on by inference).
Foundational. **Lands together with I-8RZ51-14:** rewriting the golden turns the client's id-parity
and model tests red until slice 14 follows on the same branch. Every Go suite is green at the end
of this slice.

## Files it expects to touch

- `game-server/common/passivetree/tree.go`: node shape (V1: `requires`, `minLevel`, `exclusive`;
  no `tier`/`gate`), kind `traversal` (no `filler`), stat `primary_attribute`, the V2 shape per
  class, the per-class primary attributes (V14), the side-taken read (V9)
- `game-server/common/passivetree/spend.go`: `CheckSpend` in V5's order, `ErrSideTaken`,
  `Unspent` over known ids only (V8); `otherSpecializationHeld` and `gateMet` go
- `game-server/common/passivetree/specialization.go` (only if a read moves)
- `game-server/common/passivetree/passivetree_test.go`, `spend_test.go`, `specialization_test.go`,
  `golden_test.go` (the golden gains `primaryAttributes`), a new `graph_test.go` (V10 math walk,
  V11 fixture tree with a three-sided group, the V10 no-trap proof)
- `game-client/src/data/passiveTree.golden.json` (written by `-update`, never by hand)
- `game-server/common/errcode/errcode.go` and `refusal_test.go` (`PASSIVE_SIDE_TAKEN`)
- `game-server/game-service/internal/gameserver/passive_spend.go` and `passive_spend_test.go` (V18
  words, which read the gate today)
- `game-server/game-service/grpc/character/client.go` and `client_test.go` (V19)
- Fixtures off the retired ids (`t1a`, `t1b`, `t4a`, `t4b`), moved to live ids:
  `character-service/internal/character/{service,passive_spend,passive_handler,passive_repository}_test.go`;
  `game-service/internal/serializer/{passive,specialization}_test.go`;
  `game-service/internal/game/{berserker,passive_ranks,sellsword,passive_bonus}_test.go`;
  `game-service/internal/systems/{blink,settle_the_debt,kickers,combat,specialization,passive_bonus}_test.go`.
  A test that pinned a filler's own stat (max stamina, mana regen) is deleted with it. Slice 16
  pins the traversal stats.

## What to Build

The shared definition of FS-8RZ51 §Change V1–V12:

- 31 nodes per class in V2's table *(charter default (coordinator), 2026-11-22: no `m5`; `la5`/`lb5` added)*, each linked by `requires` (any of), with level gates on `t3`
  (10) and `t6a`/`t6b` (20), and the sides `upper`, `lower`, `spec` (a/b) as data.
- The spend rule refuses, in this order: unknown, already held (no-op), out of order, max rank,
  **side taken**, **not reachable** (`PASSIVE_TIER_LOCKED`), no points.
- The tree's math is pinned by a test computed from the definition: a cheapest spec path of 10,
  10 points left, 13 ranks on the chosen sides, 15 unreachable, and the ability's 6 with level 10.
  A **no-trap** test also proves it: at most 13 ranks are holdable without `la1` or `lb1`, so
  every 18-spent state holds one, and at level 20 2 points reach `m4` and a spec *(charter default (coordinator), 2026-11-22: no `m5`; `la5`/`lb5` added)*.
- The rule reads only `requires`, `minLevel` and `exclusive`, so a fixture with a three-sided
  group past a spec needs no code.
- game-service's refusal words (V18), including a character-service `PASSIVE_TIER_LOCKED` it
  passed reading as the level still being recorded, and the gRPC client's map (V19). Neither
  restates the rule; both use the package's reads.

## Acceptance Criteria

- [ ] FS-8RZ51 §Change "Graph and rule (common)" rows, every one.
- [ ] game-service answers each V18 line, one test each. A `PASSIVE_SIDE_TAKEN` from
      character-service maps to the rule's refusal.
- [ ] No Go test or code names `t1a`, `t1b`, `t4a` or `t4b` (outside the retirement test
      asserting they are absent).
- [ ] `make test` green in `game-server/common`, `character-service` and `game-service` (with lint
      and check there).

## Blocked By

None.

## Spec Reference

FS-8RZ51 §Change: Tree v2 V1–V12 (graph, sides, math, extension, golden), V18–V19 (words, mapping),
V21 (unknown ids), §API surface (the refusal code, the golden shape). User stories 2, 18, 19.

## TDD Approach

- RED: `CheckSpend("warrior", 2, {}, "warrior.r1", 1)` is Allowed, and `ub1` with `ua1` held is
  `ErrSideTaken`.
- GREEN: the V2 builder and V5's rule; then the math walk and the fixture tree.
