# FS-QE2QW: Item rarity emphasis in canvas tips and icons

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" (Item rarity emphasis in canvas tips and icons) → this FS · Builds on: [FS-KZC92](KZC92-shimmers.md) (the granted glint), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) R59 (the item tip), [FS-1819Q](1819Q-dev-gallery.md) (dev gallery), [FS-C4JWH](C4JWH-scene-scoped-art-loading.md) (resident art) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (two palettes), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (pixel rounding) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) "Still glow", "Item glitter", "Shimmer" · Art: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md), amended by this feature (§F)

> Promoted `--from-thread` on 2026-11-08 under the owner's pre-approved charter. There was no
> interview. Markers: **[owner decision]** is the owner's own words. **[charter default]** is a
> default the owner approved in the charter. **[agent default]** is a gap the charter left open,
> filled at promotion with the smaller v1 and open to override. *Starting value* means a tuning
> knob, expected to move when the contact sheet is approved. Code citations are against `33159235`.

> **Styling rule for this whole FS** [owner decision]: no `/code-review` gate, no new tests, and no
> TDD section in the issues. Verification is the build plus looking at it in the dev gallery (§H).

## Summary

Canvas item tips and icons say an item's rarity louder. Every tip's name takes its rarity colour;
Runed and Fabled tips also get a full rarity border, a wider left edge and a faint halo; Runed and
Fabled icons sit on a soft still glow, in an outlined well where they have one; and Fabled icons
carry a quiet glitter, built from the potion shimmer's glint, so a Fabled item stands out at a
glance in a bag.

## Requirements

Tiers: **top two** means Runed (`epic`) and Fabled (`legendary`). An unknown tier renders as
`common` (`rarityOf`, `src/marketplace/rarity.ts`) and is not top two.

### A. The tip (`src/ui/itemTip.ts`)

1. **Name.** The name line is drawn in `palette.rarity[view.rarity.token]` for every tier. An item
   with `view.rarity === null` keeps `palette.hudText`. The rarity badge and its label stay, so
   colour is never alone. [charter default] FS-4R9M9 R59 already asked for "the name in its rarity
   colour"; the guideline and the code went the other way, and this settles it. The tier colours
   all clear 4.5:1 on the tip's `pitch`
   ground (Normal 6.48, Uncommon 5.29, Rare 5.26, Runed 4.93, Fabled 10.96).
2. **Top-two border.** A Runed or Fabled tip's border is a full stroke in its rarity colour, in
   place of the faint brass hairline. The Runed stroke is 2 px and the Fabled 3 px, at alpha 1.
   *Starting values.* [charter default; widths agent default] `tipGround` keeps its default for
   every other caller (the purse tip; Normal, Uncommon and Rare tips).
3. **Top-two left edge.** The accent edge widens from 3 px to 5 px on Runed and 6 px on Fabled.
   *Starting values.* The tip's text inset does not move (`PAD + EDGE`, 17 px, stays clear of a 6 px
   edge), so a tip's layout and size are the same at every tier. [charter default; widths agent
   default]
4. **Halo.** A faint outer halo in the rarity colour, drawn in the tip's own `Graphics` as
   concentric rounded strokes outside the tip's bounds, fading outward: Runed 3 rings, peak alpha
   0.16; Fabled 4 rings, peak alpha 0.28; 2 px apart. *Starting values.* The tip's reported
   `width` and `height` do not include it, so `itemTipRow` and every placement stay unchanged. It
   needs no fx sheet. [charter default; construction agent default: a filter or a stretched
   `fx_glow` would add a dependency a tip does not need]
5. **Unchanged.** Normal, Uncommon and Rare frames are as they were: faint brass hairline, 3 px
   edge, no halo. A rarity colour is never a fill. [charter default]
6. **Comments.** The header of `src/ui/itemTip.ts` and the rarity note in
   `src/utils/canvasPalette.ts` stop saying "never on the name" and say what is true now.
   [charter default]

### B. The still glow and the well (`GearOverlay`, `ContainerView`, `LetterPanel`)

7. **Where.** Every top-two icon drawn from an `ItemView`-backed item: GearOverlay's bag and stash
   cells and worn slots, ContainerView's three faces, LetterPanel's enclosed items. These are the
   only drawers: PotionHud's potion and the purse's coins are not items. [charter default;
   verified, `grep artSprite` over `src/ui`]
8. **The still glow.** The baked `fx_glow`, tinted the rarity colour, additive, behind the icon.
   Its side is the icon's drawn side × 1.3 on Runed and × 1.4 on Fabled, its alpha 0.28 on Runed and
   0.5 on Fabled. *Starting values.* It sits under its icon and over the well or the container's
   body. It never moves on its own. [charter default; numbers agent default]
9. **Well outline.** Where an icon sits in a well (GearOverlay, LetterPanel), the well's hairline
   gives way to a full outline in the rarity colour: 1 px on Runed, 1.5 px on Fabled, alpha 0.9.
   *Starting values.* The left rarity edge stays, for every tier, over it. ContainerView has no well
   and no outline. [charter default; numbers agent default]
10. **One source for the treatment.** The tier's numbers (§A, §B, §C) and the outline live once and
    GearOverlay, LetterPanel and the contact sheet (§G) read them. The icon treatment is one module
    (`src/ui/itemShine.ts`), so the three views differ only in where they place what it makes.
    [agent default]
11. **Placing it.** The treatment is made from the item's view and the icon's centre and side, and
    gives the caller a glow to put under the icon and, once bound to the drawn icon, a layer of
    glints to put over it. [agent default]
    - **GearOverlay:** children of `content`, in order glow, icon, glints, listed mark.
    - **LetterPanel:** every slot object stands alone at `PANEL_DEPTH`, where draw order is creation
      order, so the glow is made before its icon and the glints after it. The Taken stamp, made
      later, still lies over all of them.
    - **ContainerView:** two shared layers added to `root` when the view is built, a glow layer under
      all the icons and a glint layer over them, both under the flap. A new icon goes between them
      (today `root.addAt(sprite, 1)`). A shared glow layer keeps a glow's soft tail from lying over a
      neighbouring icon (icons pitch at 60 px and a Fabled glow is about 78 px).

### C. Fabled glitter (`src/render/effects/glitter.ts`)

12. **Fabled only.** Runed has the glow and no glints. [owner decision; charter default]
13. **The shared glint.** `shimmer.ts`'s private `glint()` draw and its `GLINT` wink numbers move to
    `src/render/effects/glitter.ts`, and `ShimmerFx` calls them. The heal shimmer plays exactly as it
    did: same objects in the same order, same tweens, same random draws. `Look` keeps its three
    colours; the shared draw takes only `glint` and `centre`. [charter default] One module, so the
    card rule in `effects.test.ts` is met by the glitter's own card and `HELPERS` is not touched.
    [agent default]
14. **Look.** `rarityFabled` glint, `vellum` centre, both `BARROW` tokens. No light, no feet glow,
    no body scatter. [owner decision: Fabled is pink-purple `#d678c8`, Runed burnt orange-brown
    `#c07a3a`, both new `BARROW` tokens replacing the charter's amber and brass]
15. **The loop.** While the icon is shown, a glint every 600-900 ms (uniform), at most 2 live on an
    icon. Each icon's first glint comes at a random point within the first gap, so a bag of Fabled
    items does not pulse in unison. [charter default]
16. **Each glint.** Winks as `GLINT` says (alpha up and back, scale only grows, a small turn and
    rise), over a life of 260-360 ms, the granted base's. Size and rise are `GLINT`'s × 0.55 × icon
    side ÷ 64, so a glint is about 7-14 px on a 64 px icon and shrinks with its icon. *Starting
    values.* A bare `GLINT.size` glint would be 14-27 px, half an icon. [agent default]
17. **Confined.** A glint's start point is inset from the icon's square by its own half-size and its
    rise, so nothing of it leaves the icon's bounds. [charter default]
18. **Released as it ends.** A finished glint's objects and tweens are destroyed at the end of its
    life, not held to the end of the loop, so an open bag accumulates nothing. [agent default]

### D. Faint and motion

19. **Faint items.** An icon a view draws faint (GearOverlay's listed, settling, too-high and
    still-in-a-delve; LetterPanel's taken enclosures) keeps its glow at glow alpha × the icon's
    alpha, and has no glints. [charter default; the taken enclosure is an agent default, the same
    rule applied to the one other faint icon]
20. **A well's outline on a faint icon** follows its view's left edge: full in GearOverlay, × alpha
    in LetterPanel (`drawSlot`). [agent default]
21. **`prefers-reduced-motion`.** No glints; the still glow stays. Read through
    `prefersReducedMotion` (`src/render/effects/mist.ts`) when the icon is drawn. [charter default]
22. **The glow follows its icon.** Each frame the glow takes the icon's position, its alpha
    (× the glow alpha) and its scale (× the glow's ratio), and the glint layer its position and
    alpha. ContainerView's slides, drop-ins, 1.1× hover and lift-out then carry the glow and glints
    with no change to those tweens. [agent default, per the charter's "record how"]
23. **No wink while in motion.** A glint due while the icon's alpha is under 1 is skipped: a drop-in
    or a lift-out shows none. [agent default]

### E. Lifecycle

24. **Dies with its icon.** The treatment binds to the icon's `destroy` event and to the scene's
    `shutdown`. Either ends it: the timer removed, the live glints' tweens stopped and objects
    destroyed, the follow listener gone, and the icon's glow and its own glint layer destroyed
    (ContainerView's two shared layers live as long as the view). It holds no timers or tweens
    after. Both listeners are released when either fires, so redraws do not pile up
    `shutdown` listeners. The repo's idiom (`hit.ts`, `menuFigure.ts`). [charter default]
25. **What that covers.** GearOverlay's redraw, hide and shutdown (the icon goes with `content`);
    ContainerView's reset, `closeNow` and lift-out (the sprite is destroyed at the end of its tween);
    LetterPanel's `clear`. No caller stops a treatment by hand. [charter default]
26. **Restart on redraw is acceptable.** A GearOverlay redraw starts every icon's loop anew, at a
    fresh random phase. [charter default]
27. **Missing art.** If any of `fx_glow`, `fx_glint` or `fx_mote` is missing from the art, the icon
    has no glow and no glints, and the fact is logged once for the page, naming the sheets. The icon
    itself is drawn as ever. The tip's treatments and the well outline need no sheet and stay.
    [charter default]
28. **Sheets in every scene.** `fx_*` sit on atlas page `fx-0` (group `fx`) and `icon_*` on
    `icons-0` (group `icons`). Neither group is named in `SCENE_ART` or `ON_DEMAND_ART`, so both are
    resident: PreloadScene loads them, every scene's `registerArt` holds them and eviction never
    takes them. That covers BarrowspireScene, FieldScene, HubScene and the mailbox, which only
    HubScene mounts. No load change is needed. [verified, `src/render/art/sceneArt.ts:90`,
    `sceneAtlases`, `public/art/manifest.json`]

### F. Design guideline (`game-client/docs/design-guideline.md`)

29. **Item marks** ("Item marks in the gear and bag overlay"): a held item's rarity shows as its
    edge and, on the top two tiers, as the still glow and the well outline.
30. **The canvas item tip** gets its own rule: the name may take the rarity colour at every tier,
    always with the badge; the top two tiers take the border, wider edge and halo. Never a fill.
31. **Rarity ramp exemption** ("The exemption is scoped"): the "three places" stay the rule for the
    DOM, and the canvas's item tip and icon marks are named as the canvas's own places.
32. **Item glitter**, a new entry under "Shimmers": what it is, Fabled only, how it differs from a
    Shimmer (a loop on an icon, not a one-shot on a body; marks what the item is, not a moment), and
    that the 1200 ms cap governs Shimmers and not this loop. Bounds: at most 2 glints live, no light,
    `prefers-reduced-motion` drops it. The Fabled colour is rarity data, as it already is on the
    badge. [charter default]

### G. Dev gallery

33. **Glitter card.** `src/dev/gallery/effects.ts` gains a card, `module: "glitter"`, that draws a
    Fabled icon with its treatment beside the figure and destroys it after a hold. `Stage.art` widens
    to what the treatment and `artSprite` need. [charter default]
34. **Contact sheet.** A card showing all five tiers side by side, from the real code: each tier's
    tip from `buildItemTip` over the real `itemView` of a sample item, and under it the icon in a
    well with its edge, outline, glow and glitter. The Runed and Fabled columns add a faint well.
    Fabled's sample carries a unique effect and lore, the tallest tip. Used to approve the look.
    [charter default; the faint wells agent default]
35. **Its own canvas.** The effects canvas is 720 × 360 and five 280 px tips need 1400 px at 1:1, so
    the sheet is a second, wider Phaser canvas of about 1480 × 520 (`src/dev/gallery/raritySheet.ts`
    and a panel), mounted under the effects section's card list inside a horizontal scroller, in the
    Phaser chunk (FS-1819Q R5). It is not an `EFFECT_CARDS` entry and not a new tracked family.
    [agent default: the charter says "card" and the canvas cannot hold one at a size worth judging]

### H. Verification

36. `npm run build` passes. `npm run lint:fence` passes (no literal colours). The look is judged on
    the dev gallery's contact sheet at `/dev/gallery`. No new tests. [owner decision]
37. Existing tests keep passing. In particular `src/render/effects/shimmer.test.ts` passes unchanged,
    which is what holds R13's "plays exactly as it did". [agent default]

## User Stories

1. As a player, I want an item's name in its rarity colour, so that I read its tier with the name.
2. As a player, I want the rarity label beside the name, so that colour is never the only cue.
3. As a colour-blind player, I want the label and the heavier frame on the top tiers, so that I can
   tell them apart without the hue.
4. As a player, I want a Runed tip to look heavier than a Rare one, so that it reads as a step up.
5. As a player, I want a Fabled tip to look heavier than a Runed one, so that the top tier is plain.
6. As a player comparing a bag item with worn gear, I want each tip to keep its own treatment, so
   that the comparison reads tier for tier.
7. As a player, I want the lower tiers' tips left calm, so that the top tiers stand out against them.
8. As a player opening my bag, I want Runed and Fabled icons to glow softly, so that they catch my
   eye.
9. As a player, I want a top-tier cell outlined in its colour, so that the cell reads as special.
10. As a player, I want Fabled icons to glitter gently, so that they stand out from everything else
    in a bag.
11. As a player, I want the glitter small and confined to the icon, so that it never competes with
    the game.
12. As a player with several Fabled items, I want them to glint out of step, so that the bag
    shimmers rather than pulses.
13. As a player looting a coffer, a sack or a bone heap, I want the same glow and glitter, so that a
    great find reads in the moment.
14. As a player looting a sack, I want the glow to drop in and lift out with its icon, so that
    nothing is left floating.
15. As a player reading a letter, I want an enclosed Fabled item marked as in my bag, so that the
    attachment reads as what it is.
16. As a player with an item listed or still in a delve, I want it to stay quiet and faint, so that
    I can see it is not available.
17. As a player who asked for reduced motion, I want no glints but the still glow, so that the
    tier still shows without movement.
18. As a player, I want a potion's heal shimmer to look exactly as it did, so that nothing else
    changed.
19. As a player, I want a missing art sheet never to cost me my icons, so that a bad load is
    cosmetic only.
20. As a player playing for a long time, I want an open bag to cost nothing that grows, so that the
    game does not slow down.
21. As the owner, I want all five tiers side by side in the gallery, so that I can approve the look.
22. As a developer, I want a glitter card in the gallery, so that the effect is listed with the rest.
23. As a developer, I want the treatment in one place, so that the three views cannot drift apart.
24. As a designer, I want the guideline to say this, so that the next view follows the same rule.

## Acceptance Criteria

Judged by the build and by eye on the dev gallery, as §H says.

- [ ] All five tiers' tips show the name in the tier's colour; an item with no rarity shows `hudText`; every rarity label is still there (R1).
- [ ] Runed and Fabled tips have the full rarity border, wider left edge and halo; Fabled is visibly heavier than Runed; Normal, Uncommon and Rare frames look as they did; no tip is filled with a rarity colour (R2-R5).
- [ ] A top-tier tip has the same size and text layout as a Rare tip with the same content (R3, R4).
- [ ] The stale "never on the name" comments are gone (R6).
- [ ] Runed and Fabled icons have the still glow in GearOverlay cells and worn slots, ContainerView's three faces and LetterPanel enclosures, Fabled visibly stronger (R7, R8).
- [ ] Top-tier wells in GearOverlay and LetterPanel have the rarity outline, with the left edge still drawn (R9).
- [ ] Only Fabled icons glitter; no light, feet glow or body scatter appears (R12, R14).
- [ ] Glints stay within the icon, never more than 2 at once, and a row of Fabled icons does not pulse together (R15-R17).
- [ ] A heal shimmer looks as it did and `shimmer.test.ts` passes unchanged (R13, R37).
- [ ] A faint Runed or Fabled icon has a glow at its alpha and no glints (R19).
- [ ] With `prefers-reduced-motion`, the glow is there and no glints appear (R21).
- [ ] In a sack, a glow drops in with its icon, follows a slide and a hover, lifts out with its icon, and no glint shows during the drop-in or the lift-out (R22, R23).
- [ ] Closing a coffer, leaving a scene and redrawing the overlay leave no glitter timers, tweens or objects (R24, R25).
- [ ] The glow and glints of a Fabled item do not draw over the sack's flap, a tip, the Taken stamp or a listed mark (R11).
- [ ] With an fx sheet missing, icons draw as ever with no glow or glints, one log line (R27).
- [ ] The guideline carries the four amendments (R29-R32).
- [ ] The gallery has the glitter card and the five-tier contact sheet (R33-R35).
- [ ] `npm run build` and `npm run lint:fence` pass (R36).

## Edge States

- **A cell past bag capacity** keeps its red tint and border colour for a lower tier; a top-tier item there shows the rarity outline over the tint, its glow and its left edge.
- **An unsafe find** keeps its oxblood inner edge, inside the outline and clear of the left edge.
- **A listed Fabled item** is faint, has no glints, and its listed mark stays on top.
- **A Taken enclosure** is faint under the wax, no glints, the stamp on top (R19).
- **Hovering a top-tier cell:** GearOverlay's hover ring draws over the outline, as it draws over the hairline today.
- **Hovering a satchel icon:** the glow grows with its 1.1× scale.
- **A full bag of Fabled items:** at most 2 glints each and all their loops run; each glint is short-lived, so the count stays bounded.
- **The smallest bag cell** (26 px, icon about 20 px): glow and glints shrink with the icon, with no minimum size.
- **Icon art missing, placeholder drawn:** the treatment follows the placeholder as it would the icon.
- **An item whose tier is unknown or has no rarity:** no treatment. Unknown tiers read as Normal, a no-rarity item keeps `hudText`.
- **The reduced-motion setting changes while a view is open:** takes effect at the icon's next draw.
- **The tab is hidden:** the scene clock stops with the loop, and the glitter stops with it.
- **Two neighbouring tips with halos** (compare tips, 8 px gap): their halos may meet; neither moves.
- **A tip at the screen's edge:** the halo may be cut by the canvas; the tip's placement is unchanged.

## Out of Scope

- The Bazaar web pages (DOM) and their rarity treatment.
- The server, and which items are which rarity.
- New baked art or bake tooling; new tokens beyond `rarityRuned` and `rarityFabled` (R14).
- Item names or icons anywhere but the three canvas views (the HUD, nameplates, world drops, chat).
- A lasting buff display, or any change to how a Shimmer plays.
- Live re-reading of `prefers-reduced-motion` in an open view.
- `/code-review`, new tests and a TDD section (owner's styling rule).
