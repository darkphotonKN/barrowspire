---
id: I-8RZ51-21
status: done
implements: FS-8RZ51
blocked_by: []
labels: [ready-for-agent]
title: "FS-8RZ51 slice 21: the tree's ten hue tokens and each node's hue in its copy (game-client)"
---
Implements FS-8RZ51 §Change: A lit node glows in its own colour, §L-B (L4–L6), §L-E (L14, the palette table and the two notes)

**Author: agent.** Foundation: the colours and which node wears which, no drawing yet.

## Files it expects to touch

- `game-client/src/utils/theme.ts`: seven new bases in `BARROW` and `BARROW_HEX` (`copper`,
  `steelBlue`, `teal`, `frost`, `verdigris`, `amethyst`, `silver`), at L4's starting values
- `game-client/src/utils/canvasPalette.ts`: `palette.treeHue` (`health`, `power`, `fire`,
  `defence`, `mana`, `speed`, `movement`, `crit`, `refund`, `steel`), each resolving
  from `BARROW_HEX` (`refund` derived from `brassBright`)
- `game-client/src/utils/theme.test.ts` (or a `canvasPalette` test): no tree hue is amber,
  amberBright, arcane, arcaneDeep or fire-only
- `game-client/src/data/passiveTree.ts` and its test: `PassiveNodeCopy.hue`, set in `TRAVERSAL`
  and on every class node; the table pinned
- `game-client/src/ui/passiveTreeModel.ts` and its test: `NodeView.hue`
- `game-client/docs/design-guideline.md`: the palette table's seven bases; the frost and amethyst
  notes (tree pictures only)

## What to Build

- The ten hues as palette tokens, reusing `oxbloodText` (health) and `ember` (fire), and adding
  seven bases, `teal` (mana) among them (ADR-0013: theme first, then the guideline's table).
- Each node's hue in its presentation copy, carried on `NodeView` for the overlay.

## Acceptance Criteria

- [ ] Every node of every class has the hue L4's table gives it; every hue is used (test).
- [ ] Every `palette.treeHue` value resolves from `BARROW_HEX`; none is amber, amberBright,
      arcane, arcaneDeep or a fire-only token (test).
- [ ] A node the copy lacks has no hue (R42).
- [ ] The guideline's palette table lists the seven bases; the frost and amethyst notes are in.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` green.

## Blocked By

None. (I-8RZ51-19's code, the vellum ink this change replaces, is on main; only its contact-sheet
approval is open, and this change retires that ink.)

## Spec Reference

FS-8RZ51 §Change: A lit node glows in its own colour: L4, L5, L6, L14. User stories 2, 3, 8, 15.

## TDD Approach

- RED: a test walking every class's ids expecting L4's hue per node.
- GREEN: the tokens, `palette.treeHue` and `hue` on the copy and the view.
