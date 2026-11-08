---
id: I-QE2QW-3
status: done
implements: FS-QE2QW
blocked_by: [I-QE2QW-2]
labels: [ready-for-agent]
title: "FS-QE2QW slice 3: Fabled icons glitter gently, on the potion shimmer's own glint"
---
Implements FS-QE2QW §C, §D (R19, R21, R23), §E, §F (R32), §G (R33), §H

**Styling FS:** no `/code-review` gate and no new tests. Verify with the build and the dev gallery.

## What to Build

A quiet loop of small glints on every Fabled icon, drawn with the glint the heal shimmer uses.

1. `src/render/effects/glitter.ts`: `shimmer.ts`'s private glint draw and `GLINT` numbers move here;
   `ShimmerFx` calls them, playing exactly as before (R13).
2. The Fabled look: `rarityFabled` glint, `vellum` centre. No light, no feet glow,
   no body scatter (R14).
3. The loop: a glint every 600-900 ms, at most 2 live, a random first delay; small, sized to the
   icon and confined to its square; each glint destroyed at the end of its life (R15-R18).
4. `itemShine` runs it for Fabled only and places the glint layer over the icon in all three views
   (R11, R12). Skips a wink while the icon's alpha is under 1 (R23). Not started for a faint icon or
   under `prefers-reduced-motion` (R19, R21). Ends with its icon as the glow does (R24-R26).
5. Guideline: the item glitter entry under Shimmers (R32).
6. `src/dev/gallery/effects.ts`: a `module: "glitter"` card that draws a Fabled icon with its
   treatment beside the figure and destroys it after a hold; `Stage.art` widened as needed (R33).

## Acceptance Criteria

- [ ] A heal shimmer looks as it did and `src/render/effects/shimmer.test.ts` passes unchanged (R13, R37).
- [ ] Only Fabled icons glitter, with no light, feet glow or body scatter (R12, R14).
- [ ] Glints stay within the icon, never more than 2 at once, and a row of Fabled icons does not pulse together (R15-R17).
- [ ] An open bag of Fabled items accumulates no objects over time (R18).
- [ ] A faint Fabled icon has no glints; with `prefers-reduced-motion` no glints appear and the glow stays (R19, R21).
- [ ] No glint shows during a sack's drop-in or lift-out, and glints travel with a sliding icon (R22, R23).
- [ ] Redrawing the overlay, closing a coffer, a lift-out and leaving a scene leave no glitter timers or tweens (R24-R26).
- [ ] The contact sheet's Fabled well glitters, and the gallery lists the glitter card (R33, R34).
- [ ] The guideline carries the item glitter entry, distinct from Shimmers, the 1200 ms cap stated as the Shimmers' (R32).
- [ ] `npm run build` and `npm run lint:fence` pass; the existing suite still passes.

## Files expected to touch

- `game-client/src/render/effects/glitter.ts` (new)
- `game-client/src/render/effects/shimmer.ts`
- `game-client/src/ui/itemShine.ts`
- `game-client/src/ui/GearOverlay.ts`
- `game-client/src/ui/LetterPanel.ts`
- `game-client/src/ui/ContainerView.ts`
- `game-client/src/dev/gallery/effects.ts`
- `game-client/docs/design-guideline.md`

## Blocked By

I-QE2QW-2

## Spec Reference

FS-QE2QW §C R12-18, §D R19, R21, R23, §E R24-27, §F R32, §G R33-34, §H R36-37; User Stories 10-12,
14, 17, 18, 20, 22; Edge States "A listed Fabled item", "A full bag of Fabled items", "The smallest
bag cell", "The reduced-motion setting changes", "The tab is hidden".
