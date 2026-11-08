---
id: I-QE2QW-1
status: done
implements: FS-QE2QW
blocked_by: []
labels: [ready-for-agent]
title: "FS-QE2QW slice 1: the item tip says its rarity, with a five-tier contact sheet to judge it"
---
Implements FS-QE2QW §A, §F (R30, R31), §G (R34, R35), §H

**Styling FS:** no `/code-review` gate and no new tests. Verify with the build and the dev gallery.

## What to Build

Every canvas item tip's name takes its rarity colour, and Runed and Fabled tips look heavier. The
gallery gets the contact sheet the look is judged on; this slice fills in the tips, and slices 2 and
3 fill in the icons by using the same code as the game.

1. The name line in `palette.rarity[view.rarity.token]`, `hudText` with no rarity (R1).
2. A one-place table of the top-two tiers' numbers (`epic`, `legendary`) and a lookup from an
   `ItemView`, read by the later slices too (R10).
3. Top-two border, wider left edge and outer halo, Fabled heavier; `tipGround`'s default unchanged
   for other callers; tip size and text layout unchanged (R2-R5).
4. Update the "never on the name" comments in `itemTip.ts` and `canvasPalette.ts` (R6).
5. Guideline: the canvas item tip's rule and the rarity ramp's canvas places (R30, R31).
6. The contact sheet: its own canvas about 1480 x 520 in a horizontal scroller under the effects
   card list, five columns each with a real `buildItemTip` over the real `itemView` of a sample item
   (R34, R35). Fabled's sample carries a unique effect and lore.

## Acceptance Criteria

- [ ] On the contact sheet all five tiers' names are in their tier colour with the rarity label beside them; a no-rarity item keeps `hudText` (R1).
- [ ] Runed and Fabled tips show the full rarity border, wider left edge and halo, Fabled visibly heavier; Normal, Uncommon and Rare frames look as before; no rarity-coloured fill (R2-R5).
- [ ] A top-tier tip has the same size and text layout as a lower tier's with the same content (R3, R4).
- [ ] The purse tip looks as it did.
- [ ] The stale comments and the two guideline passages are updated (R6, R30, R31).
- [ ] `npm run build` and `npm run lint:fence` pass; the existing suite still passes.

## Files expected to touch

- `game-client/src/ui/itemTip.ts`
- `game-client/src/utils/canvasPalette.ts` (comment only)
- `game-client/docs/design-guideline.md`
- `game-client/src/dev/gallery/raritySheet.ts` (new)
- `game-client/src/dev/gallery/RaritySheetPanel.tsx` (new)
- `game-client/src/dev/gallery/EffectsPanel.tsx`

## Blocked By

None

## Spec Reference

FS-QE2QW §A R1-6, §F R30-31, §G R34-35, §H R36-37; User Stories 1-7, 21, 24; Edge States "Two
neighbouring tips with halos", "A tip at the screen's edge", "An item whose tier is unknown".
