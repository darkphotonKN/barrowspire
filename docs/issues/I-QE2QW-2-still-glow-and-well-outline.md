---
id: I-QE2QW-2
status: done
implements: FS-QE2QW
blocked_by: [I-QE2QW-1]
labels: [ready-for-agent]
title: "FS-QE2QW slice 2: Runed and Fabled icons glow and their wells are outlined, everywhere an item icon is drawn"
---
Implements FS-QE2QW §B, §D (R19, R20, R22), §E, §F (R29), §G (R34), §H

**Styling FS:** no `/code-review` gate and no new tests. Verify with the build and the dev gallery.

## What to Build

A soft still glow behind every Runed and Fabled icon, and a rarity outline where the icon sits in a
well, through one treatment module the three views share.

1. `src/ui/itemShine.ts`: from an `ItemView` and the icon's centre and side, makes the baked
   `fx_glow`, rarity-tinted and additive, to go under the icon; bound to the drawn icon, it follows
   the icon's position, alpha and scale each frame (R8, R10, R11, R22).
2. Ends with its icon: the icon's `destroy` or the scene's `shutdown`, both listeners released, the
   follow listener gone (R24, R25).
3. Missing `fx_glow`, `fx_glint` or `fx_mote`: no glow, logged once for the page, icon untouched (R27).
4. GearOverlay: glow, then icon in `content`, in bag and stash cells and worn slots (R11). The well
   outline, the left edge still over it (R9, R20).
5. LetterPanel: glow made before the icon (same depth, creation order), outline scaled by the slot's
   alpha, the Taken stamp still on top (R11, R19, R20).
6. ContainerView: two shared layers in `root`, glows under every icon, glints over them, both under
   the flap; a new icon goes between them (R11). Glow for the top two on every face.
7. Faint icons: the glow takes the icon's alpha (R19).
8. Guideline: the item marks passage (R29).
9. Contact sheet: under each tip, the icon in a well with its edge, outline and glow; a faint well in
   the Runed and Fabled columns (R34).

## Acceptance Criteria

- [ ] Runed and Fabled icons show the glow in GearOverlay cells and worn slots, ContainerView's three faces and LetterPanel enclosures, Fabled visibly stronger; lower tiers and no-rarity items show none (R7, R8).
- [ ] Top-tier wells have the rarity outline with the left edge still drawn; ContainerView has no outline (R9).
- [ ] The glow never draws over its own icon, the flap, a tip, the Taken stamp or a listed mark (R11).
- [ ] A faint Runed or Fabled icon's glow is at its alpha (R19).
- [ ] In a sack the glow drops in with its icon, follows a slide and the hover scale, and lifts out with it (R22).
- [ ] Redrawing the overlay, closing a coffer and leaving a scene leave no glow objects or listeners behind (R24, R25).
- [ ] With an fx sheet missing, icons draw as ever with no glow and one log line (R27).
- [ ] The edge states "A cell past bag capacity", "An unsafe find", "A listed Fabled item" and "A Taken enclosure" hold.
- [ ] The guideline's item marks passage is updated (R29).
- [ ] `npm run build` and `npm run lint:fence` pass; the existing suite still passes, with fakes touched only if a view's construction needs it.

## Files expected to touch

- `game-client/src/ui/itemShine.ts` (new)
- `game-client/src/ui/GearOverlay.ts`
- `game-client/src/ui/LetterPanel.ts`
- `game-client/src/ui/ContainerView.ts`
- `game-client/src/ui/itemTip.ts` (the well outline's numbers, if kept with the tier table)
- `game-client/docs/design-guideline.md`
- `game-client/src/dev/gallery/raritySheet.ts`

## Blocked By

I-QE2QW-1

## Spec Reference

FS-QE2QW §B R7-11, §D R19-20 and R22, §E R24-25 and R27-28, §F R29, §G R34, §H R36-37; User Stories
8, 9, 13-16, 19, 20, 23; Edge States "A cell past bag capacity", "An unsafe find", "A listed Fabled
item", "A Taken enclosure", "Hovering a top-tier cell", "Hovering a satchel icon", "The smallest bag
cell", "Icon art missing".
