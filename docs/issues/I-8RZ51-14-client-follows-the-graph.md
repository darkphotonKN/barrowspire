---
id: I-8RZ51-14
status: done
implements: FS-8RZ51
blocked_by: [I-8RZ51-13]
labels: [blocked]
title: "FS-8RZ51 slice 14: the client reads the graph golden, restates the rule and draws the five new states (game-client)"
---
Implements FS-8RZ51 §Change: Tree v2: a traversal graph with locked sides, §V-E V25, V28, §V-B V13

**Author: agent.** Brings `game-client` back to green after slice 13 rewrites the golden. It lands in
the same PR as slice 13. The overlay keeps its current row drawing, one row per graph depth, as an
interim step. Slice 17 replaces it with the graph.

## Files it expects to touch

- `game-client/src/data/passiveTree.ts`:
  - `PassiveNodeDef` gains `requires`, `minLevel` and `exclusive`, and drops `tier` and `gate`;
  - kind `traversal` replaces `filler`;
  - a `primaryAttributes` read;
  - `PASSIVE_COPY` re-keyed to the 31 ids *(charter default (coordinator), 2026-11-22: no `m5`; `la5`/`lb5` added)*. Traversal names: Vitality, Might, Haste, Fleetness.
    Their interim pictures are `health`, `attribute`, `regen`, `reserve` until slice 19;
  - `classNodes` ordered by definition, not tier.
- `game-client/src/data/passiveTree.test.ts` (id parity both ways, unchanged in spirit)
- `game-client/src/ui/passiveTreeModel.ts` and its test:
  - the rule restated: reachability, `minLevel`, sides;
  - node states `max | held | available | closed | locked` (V25);
  - each node's depth;
  - the tier rows become depth rows, the interim step;
  - the closed and locked reasons in V26's words.
- `game-client/src/ui/PassiveTreeOverlay.ts`: only what the model's renamed states need
- Fixtures off retired ids: `ui/characterSheet.test.ts`, `ui/uiSceneTree.test.ts`, `ui/GearOverlay.test.ts`,
  `ui/PassiveTreeOverlay.test.ts`, `ui/passiveTreeCommands.test.ts`

## What to Build

The client reads the v2 golden and answers "may I take this?" as the server does. It shows the
answer for the player only; the server decides again:

- a node is available when any of its requires is held, its level gate is met, and no other side
  of its group is taken;
- it is **closed** when not reachable, and its tooltip names the linked nodes (joined by "or") or
  the level;
- it is **locked** when another side is taken: "Locked: you chose <the held side's kicker or
  spec name>.".

Unknown ids stay ignored (R42).

## Acceptance Criteria

- [ ] With `ua1` held, every `upper:b` node's state is `locked`, and its reason reads "Locked: you
      chose Heavy Hand." (warrior). With `t6a` held, `t6b` reads "Locked: you chose Guardian."
- [ ] `t3` with `m2` held at level 9 is `closed`, "Not reachable yet: reach level 10.". `m1` with
      nothing held reads "Not reachable yet: take Haste or Fleetness first."
- [ ] `spendable` is true only for an available or held node with a point.
- [ ] A retired id in `passive_ranks` changes nothing in the view.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` are green.

## Blocked By

I-8RZ51-13 (the golden).

## Spec Reference

FS-8RZ51 §Change: Tree v2 V25 (states), V26 (reason words only), V28 (rule restated), V13 (names).
User stories 3, 5.

## TDD Approach

- RED: `treeView` for a warrior holding `warrior.ua1` gives `warrior.ub1` the state `locked`.
- GREEN: the restated rule over the golden's `exclusive`.
