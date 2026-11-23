---
id: I-8RZ51-23
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-22]
labels: [blocked]
title: "FS-8RZ51 slice 23: the Tree colours review page in the dev gallery, every class's nodes in three states at scale 1 and 2 (game-client, HITL: Kranti approves)"
---
Implements FS-8RZ51 §Change: A lit node glows in its own colour, §L-E (L13)

**Author: agent; HITL gate:** Kranti reviews the page and approves the colours before the slice
closes. A retune he asks for is an edit to the tokens under this section, inside the charter, and
the page is checked again.

## Files it expects to touch

- `game-client/src/dev/gallery/families.ts`: a `tree-colours` family
- `game-client/src/dev/gallery/Gallery.tsx`: its section
- a sheet module and panel beside `raritySheet.ts` / `RaritySheetPanel.tsx` (e.g.
  `treeColoursSheet.ts`, `TreeColoursPanel.tsx`) and their tests
- `game-client/src/ui/PassiveTreeOverlay.ts`, only to export the plate-and-picture drawing the
  sheet reuses, so what is approved is what ships

## What to Build

- Its own Phaser canvas, SSR off, as the other gallery canvases.
- Every class's nodes, each on its real plate in its three states (greyed, open, lit), drawn by the
  overlay's own code.
- A render-scale switch, 1 and 2; the knockouts rebuild at each.
- Each hue's token name and value beside its nodes, and a colour input per hue that previews a
  retune live. A preview is never saved.
- `TREE_BRONZE_MIX`, the lit lift and the halo's alpha shown with their values.

## Acceptance Criteria

- [ ] The family shows every node of all four classes in the three states, at scale 1 and 2.
- [ ] A per-hue preview recolours only that hue's nodes; a reload shows the tokens again.
- [ ] Production builds still 404 the gallery (FS-1819Q).
- [ ] Kranti approves the colours (HITL). Each retune is recorded in the commit that makes it.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-22 (the inks and the glow it shows).

## Spec Reference

FS-8RZ51 §Change: A lit node glows in its own colour: L13. User stories 10, 13, 14.
