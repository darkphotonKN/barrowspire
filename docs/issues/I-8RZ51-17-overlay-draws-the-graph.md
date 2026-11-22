---
id: I-8RZ51-17
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-14]
labels: [blocked]
title: "FS-8RZ51 slice 17: the overlay draws the graph, with its links, node sizes by kind, locked sides and the side ask (game-client)"
---
Implements FS-8RZ51 §Change: Tree v2: a traversal graph with locked sides, §V-E (V23–V25, V27)

**Author: agent.** UI scene only (ADR-0084–0086); no world scene changes.

## Files it expects to touch

- `game-client/src/ui/passiveTreeLayout.ts` and its test:
  - depth left to right and lanes by side (V23's placement rule);
  - plate size by kind and the link segments;
  - fits 1280×720 clear of `CORNER_ROW_CLEARANCE`;
  - `nodeAt` over round and square plates.
- `game-client/src/ui/passiveTreeModel.ts` and its test:
  - the view becomes nodes and links in place of the interim depth rows: depth, lane, and a
    link's lit/dim;
  - `TreeSpend` asks on the first node of a side (V27).
- `game-client/src/ui/PassiveTreeOverlay.ts` and its test:
  - links under plates, lit when both ends are held;
  - locked nodes dimmed with the lock mark slot (slice 19 draws the padlock picture), closed nodes
    greyed;
  - the ask in the footer band.

## What to Build

The tree as a graph. The layout is computed from `requires` and `exclusive`, never placed per
class:

- on today's shape it is 13 columns by 5 rows, as V23 states *(charter default (coordinator), 2026-11-22: no `m5`; `la5`/`lb5` added)*;
- plates are sized by kind: traversal small and round, kicker larger, ability and spec largest;
- links run plate edge to plate edge, lit when both ends are held;
- a locked side is dimmed with a lock mark;
- the first spend on a side asks once.

## Acceptance Criteria

- [ ] FS-8RZ51 §Change "Client" rows 1–5 and 8.
- [ ] A layout test on V11's fixture tree, with a three-sided group past a spec, places every node
      with no layout code change.
- [ ] The old R35 tier rows, "or" and gate column are gone.
- [ ] `npm test`, lint, `lint:fence` and `tsc` green.

## Blocked By

I-8RZ51-14 (the model's rule and states).

## Spec Reference

FS-8RZ51 §Change: Tree v2 V23 (layout), V24 (links), V25 (states drawn), V27 (the ask). User stories
3, 4, 6, 7, 20.
