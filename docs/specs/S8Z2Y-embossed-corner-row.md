# FS-S8Z2Y: The corner row is embossed

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: The corner row is embossed → FS-S8Z2Y`: [FS-3EBCA](3EBCA-hud-corner-icons.md) (Menu, Inventory, Character, Party and the greyed Mailbox, R3 and R9, as FS-7TQN4 and its § Change: The inventory icon is a bronze knockout rucksack left them) and [FS-1GZGD](1GZGD-in-game-mailbox.md) (the town envelope, R33, as FS-7TQN4 left it) · Builds on: [FS-7TQN4](7TQN4-knockout-corner-row.md) (the knockout row and its one renderer) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the HUD is on the game palette) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Corner row**, **Envelope**, **Count badge**

> Scoped and promoted `--from-thread` on 2026-11-13 from the approved charter's locked decisions
> G1–G7 (owner, 2026-11-13). Each requirement marked **(charter default)** is one of those
> decisions. **(spec)** fills an acceptance-level gap the charter left, and is this spec's own.
> Recorded without adversarial review: no `challenge-me` pass (client art, cheap to redo, judged
> by eye). Code citations are against `73bcac1d` (FS-7TQN4's agent slice built; not on main).

## Summary

Every knockout in the corner row stands slightly raised off the world. Under each icon lies its
own silhouette in dark ink, half seen, one pixel down and to the right, so the icon reads as a
plate lifted above the ground. The bronze itself is lit from above: lighter at the top of each
silhouette, darker at its foot. Under the pointer the whole gradient lifts toward the bright
amber; the shadow stays where it is. The greyed Mailbox outside the town gets the shadow but stays
one flat faint grey. The cuts stay fully see-through. The badge, the glow, the places, the keys,
the labels and the line-glyph fallback are unchanged.

The owner, 2026-11-13, once the five knockouts were done: 「icon可以加一點浮凸的陰影或漸層嗎」
(can the icons get a little raised shadow or gradient?), then 「加上浮凸漸層」 (add the raised
gradient).

**Why a change FS.** FS-7TQN4, which made the row knockout, is itself a change FS with no
capability and no ledger of its own; the capabilities it changed are FS-3EBCA's (the row's icons,
R3, R9) and FS-1GZGD's (the town envelope, R33). This change touches both again, so by *The FS
ledger* it is one change FS with no thin line and a stub on each owner, not a `## Change:` on
FS-7TQN4. FS-7TQN4's own Out of Scope names "an emboss, bevel, gradient or any shading inside a
silhouette" as "a later, separate charter": this is that charter. It is not FS-7TQN4's one tweak
round (its R21). Both owners' thin lines ("Panel shortcut icons on the HUD", "Mailbox in the hub
HUD") stay true; no line is reworded. FS-7TQN4 is narrowed below without a stub, as it narrowed
FS-J1672 and FS-QHN87.

## Bounds

Issues under this FS may change `game-client/src/ui/knockout.ts` (the shared renderer),
`game-client/src/ui/HudCorner.ts` and `game-client/src/ui/MailboxEnvelope.ts` (**their knockouts'
inks and draw order only**), `game-client/src/ui/knockoutRucksack.ts`, their test files
(`knockout.test.ts`, `HudCorner.test.ts`, `MailboxEnvelope.test.ts`), and the **Corner row**
paragraph of `game-client/docs/design-guideline.md`. A screenshot harness is throwaway and lives
under the git-ignored `game-client/tmp/glyphs/`.

They may **not** change the pictures (FS-7TQN4 R3–R7), `hudCornerLayout.ts`, `cornerLabel.ts`,
`letterPanelLayout.ts`, `LetterPanel.ts` or its test, `mailboxHud.ts`, the badge, glow or pulse
drawing, `carvedPanel.ts`, `canvasPalette.ts` or `theme.ts` (so no new token), any scene, anything
under `public/art` or `tools/bake`, `game-client/CONTEXT.md`, any server, or the existing text of
any FS. A slice that finds one of these unavoidable stops and escalates.

## Facts this spec rests on

Verified 2026-11-13 on `73bcac1d`. Paths are under `game-client/`.

- **The renderer** (`src/ui/knockout.ts`, `Knockout`) draws each knockout once per render scale
  into its own RenderTexture at `k = 2 × renderScale`, the slot's size times `k`, shown at `1 / k`
  on the slot's centre, depth 1000, scroll factor 0: the silhouette filled `TINT_IDENTITY`, the
  cuts erased, one `render()`. `show(f, hovered)` then only moves it and calls `setTint(ink.tint)`
  and `setAlpha(ink.alpha)` for the state (`KnockoutInk`: `idle`, `hover`). It watches
  `viewport.onChange` and rebuilds on a new render scale; it tells its owner `built(image)` after
  each build (the envelope moves the image under its badge there) and `lost()` when a rebuild
  fails. `BRONZE` is idle `mix(frame, interactable, 0.5)` at 0.85, hovered
  `mix(frame, interactableBright, 0.5)` at 1; the row's `GREYED` is `hudFaint` at 0.6 in both.
- **Tint** (`node_modules/phaser/src/gameobjects/components/Tint.js`, Phaser 4.2.1):
  `setTint(topLeft, topRight, bottomLeft, bottomRight)` sets a tint per corner of the quad,
  interpolated across it; one argument sets all four. `setTintMode` picks how it applies
  (`src/renderer/TintModes.js`); the default `MULTIPLY` multiplies the texture's colour by it, so
  a white texel shows the tint exactly (`src/renderer/webgl/shaders/ApplyTint-glsl.js`). `FILL`
  (1) replaces the colour with the tint and keeps the texel's alpha. The corner tints are vertex
  data: a gradient this way adds no draw and no texture.
- **A second look at one texture.** A RenderTexture is an Image over a DynamicTexture
  (`src/gameobjects/rendertexture/RenderTexture.js`), and an Image takes a Texture instance as its
  key (`TextureManager.get` returns it). So `scene.add.image(x, y, image.texture)` shows the
  knockout's texture a second time, cuts included, without drawing it again.
- **Draw order.** Objects of one depth draw in display-list order (FS-7TQN4 § Facts);
  `scene.children.moveBelow(a, b)` puts `a` just under `b` when `a` is above it
  (`src/utils/array/MoveBelow.js`). An object made after the knockout's image draws over it.
  In the envelope, the image is moved under the badge's graphics by `built`; a shadow made at the
  end of the list must then be moved under the image, or it would draw over the badge.
- **Where each silhouette lies in its slot.** The slot is 54 × 46. The silhouettes are not
  centred on it in height alike: the envelope's rect is 25 tall and starts 11 px down
  (`envelopeRect`), while the gear runs 15 px above and below the slot's centre. A gradient
  fixed to the texture's top and foot would lift each silhouette by a different amount; one laid
  on each silhouette's own top and foot lifts them alike.
- **The palette** (`src/utils/canvasPalette.ts`): `palette.ink` is the charcoal, `shade(c, t)`
  mixes toward the pitch, `palette.interactableBright` is the bright amber.
- **Engraved cuts, tried.** A throwaway trial on 2026-11-13 drew each cut's upper edge darker and
  its lower edge lighter inside the texture (a dark and a light stroke offset 0.6 px either side of
  each cut, before the erase). A texel can only be lifted above the bronze if the surface is drawn
  below white and the tint raised to match, which clips the bright channels. At render scale 2 the
  cuts read carved. At render scale 1 they mush: every cut reads wider and softer, the Party gap
  and the buckle lose their edge, the rucksack's ties blur. The trial's shots are listed in
  I-S8Z2Y-1.

## Requirements

#### The shadow

1. **A drop shadow under each knockout.** Under every knockout of the row (Menu, Inventory,
   Character, Party, the greyed Mailbox) and under the town envelope lies its **shadow**: the
   knockout's own texture shown a second time (cuts included), tinted `palette.ink` in Phaser's
   `FILL` tint mode at alpha 0.5, at the same scale `1 / k`, depth and scroll factor, **1 logical px
   right and 1 down** of the icon. It is an Image of the same texture: no second texture is made
   and nothing is drawn twice. **(charter default, G1)**
2. **Just under its icon.** Each time a knockout is built, its shadow stands directly under its
   image in the display list, after the owner's `built` has placed the image. In the town the
   envelope's order is therefore glow, shadow, envelope, badge, count, after building, after a
   render-scale rebuild and after the count changes. **(spec, from G6 and § Facts)**
3. **It moves, builds and goes with its icon.** A `relayout` moves the shadow with its slot; a new
   render scale makes a new one with the new texture and destroys the old; `destroy` destroys it.
   Hover and leave never change its place, tint or alpha. **(charter default, G4; spec)**

#### The gradient

4. **Top-lit bronze.** Each live knockout's colour runs, top to foot of its own silhouette, from
   its state's tint lifted 25% toward the bright amber, `mix(tint, palette.interactableBright,
   0.25)`, at the silhouette's top edge, to the same tint shaded 20%, `shade(tint, 0.2)`, at its
   foot, in a straight line between. It is laid as the image's corner tints, the top two equal and
   the foot two equal, carried out to the texture's top and foot along that line (each channel
   rounded and held to 0–255). The silhouette's fill and the cuts' erase are unchanged: the texture
   stays one white silhouette, and the cuts stay fully transparent. No draw is added. **(charter
   default, G2; laying the ends on the silhouette and not on the slot is this spec's, from § Facts)**
5. **Hover lifts the whole gradient.** Under the pointer the same gradient is laid from the lifted
   bronze, `mix(palette.frame, palette.interactableBright, 0.5)`, at alpha 1; idle, from the
   bronze at 0.85 (FS-7TQN4 R10). Only the corner tints and the alpha change; nothing is rebuilt
   and nothing is drawn. **(charter default, G4)**
6. **The greyed Mailbox is flat.** Outside the town the greyed Mailbox has its shadow (R1) but no
   gradient: all four corners `palette.hudFaint`, at alpha 0.6, hovered or not. **(charter default,
   G5)**

#### Engraved cuts

7. **No rims.** The cuts get no drawn rims: the trial (§ Facts) mushed at render scale 1, which is
   the charter's own condition for leaving it out. The shadow showing through each cut's upper-left
   edge is all the carving there is. **(charter default, G3, with its drop condition met)**

#### Unchanged

8. **Everything else stays.** The pictures and cuts (FS-7TQN4 R3–R7), their texture per icon
   (R12), the count badge over everything, the shadow included, and the new-letter glow under it
   (R8), the zones, places, keys, presses and labels (R11, R18), the rebuild and teardown (R13,
   R14). The line-glyph fallback (R15, R16) gets no shadow and no gradient: where the renderer
   cannot draw, nothing of this change is made. **(charter default, G6)**
9. **Tokens only.** Every colour is a `palette` token, or `mix` or `shade` of tokens; no raw
   colour literal, no new token; the lint fence passes (ADR-0013, ADR-0025). **(charter bounds)**

#### The record

10. **The guideline says so.** The design guideline's **Corner row** paragraph adds: each knockout
    stands raised on a drop shadow (its own silhouette in ink at half alpha, 1 px down and right),
    and its bronze is lit from above, lifted toward the bright amber at the top and shaded at the
    foot; under the pointer the whole gradient lifts and the shadow stays; the greyed Mailbox has
    the shadow and stays flat; the fallback lines get neither. Its "Added by" note adds this FS.
    **(charter bounds)**

#### The check

11. **Screenshots for the owner, with and without.** The agent slice renders the row in a real
    WebGL Phaser (`game-client/tmp/glyphs/`) and saves, at backing resolution, each pair **without**
    the emboss (`…-plain`, `73bcac1d`) and **with** it (`…-emboss`): the town row idle at render
    scale 1, 1.5 and 2 over a dark and a light ground, with a 4× nearest-neighbour enlargement of
    each; the town row with Menu, Character, Party and the Mailbox hovered at 1, 1.5 and 2 (dark);
    the field row (the greyed Mailbox) at 1, 1.5 and 2 over both grounds; the town row mid-glow at
    2; a render-scale change 1 → 2 at run time. The paths go in the slice's issue. **(charter
    default, G7)**
12. **At most one round.** The owner looks at the shots and in game at render scale 1, 1.5 and 2,
    and may ask for one round of tweaks, which changes only this FS's files and re-shoots R11's
    set. A second request is a new change. **(charter default, G7)**

## What this changes in its owners

Where an owner's text below and this FS disagree, this FS wins. The owners' text is not edited.

- **FS-7TQN4 R10** ("One solid colour: no gradient, no second fill colour, no outline round a
  silhouette, no shadow") and its criterion "Idle tint `mix(palette.frame, palette.interactable,
  0.5)` at 0.85, hovered … at 1": the tint is now R4–R5's gradient laid from those colours, and
  the knockout has R1's shadow. "No second fill colour" and "no outline" hold: the texture is still
  one white fill, and the shadow is offset, not round the silhouette. Its Out of Scope line "An
  emboss, bevel, gradient or any shading inside a silhouette" no longer holds for the gradient.
  Its criterion "No `fillGradientStyle`, no other colour" into a texture holds.
- **FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack, R3** ("one colour …
  No gradient … and no shadow"): the rucksack takes R1–R5 like the rest of the row.
- **FS-J1672 R1** ("no shadow" among the plate's parts) and **R6** ("no dark outline, shadow or
  halo"): no plate returns, but each knockout now has R1's drop shadow. They hold for the fallback.
- **FS-3EBCA R9** (the greyed Mail never brightens): holds; R6 here keeps it flat.
- **The guideline's Corner row paragraph**: updated (R10).

## User Stories

1. As a player, I want the corner icons to look slightly raised off the world, so that they read
   as made objects and not flat stickers.
2. As a player, I want a soft dark shadow under each icon, so that it stands out over a bright
   field.
3. As a player, I want the bronze lighter at the top and darker at the foot, so that each icon
   looks lit from above like the rest of the HUD.
4. As a player, I want the cut lines still to show the world through them, so that the pictures
   read as before.
5. As a player, I want every icon to brighten as a whole under the pointer, so that it answers my
   hand as before.
6. As a player, I want the shadow not to jump on hover, so that the icon doesn't seem to move.
7. As a player outside the town, I want the greyed Mailbox to stay one flat faint grey, so that it
   still reads as off.
8. As a player outside the town, I want the greyed Mailbox to sit on the same shadow as the
   others, so that the row still reads as one set.
9. As a player waiting on letters, I want the count badge on top of the envelope and its shadow,
   so that I always see the count.
10. As a player who gets a letter, I want the envelope still to glow under it, so that I notice.
11. As a player on a plain screen, I want the icons as clear at render scale 1 as before, so that
    the emboss costs me nothing.
12. As a player on a high-density screen or at 1.5, I want the gradient smooth and the shadow
    crisp, so that the icons look finished.
13. As a player who moves the window to another density, I want every icon and its shadow redrawn
    sharp, so that none turns blurry.
14. As a player whose browser cannot draw textures, I want today's line icons, so that no slot is
    empty.
15. As the owner, I want screenshots with and without the emboss at 1, 1.5 and 2 over dark and
    light ground, so that I can judge it before looking in game.
16. As the owner, I want one round of tweaks, so that the strength ends up right.
17. As a maintainer, I want the emboss in the one shared renderer, so that all six knockouts get it
    and a fix fixes all of them.
18. As a maintainer, I want it to cost no extra texture and no redraw on hover, so that the HUD
    stays cheap.
19. As a maintainer, I want the guideline to say the row is embossed, so that the next icon is
    drawn the same way.

## Acceptance Criteria

On a recording stand-in scene that offers `make.graphics`, `add.renderTexture`, `add.image` and
`children.moveBelow`:

- [ ] Each knockout build makes one shadow: `add.image` on the knockout's own texture, at depth
      1000, scroll factor 0, scale `1 / k`, tint `palette.ink` in tint mode `FILL` (1), alpha 0.5,
      at the slot's centre plus (1, 1). A town row makes four, a field row five, the town envelope
      one; the texture counts of FS-7TQN4 are unchanged.
- [ ] Each shadow is directly under its image in the display list after building; in the town the
      order is glow, shadow, envelope image, badge, count after building, after a render-scale
      rebuild and after the count goes 0 → 3.
- [ ] A `relayout` to 1280 × 720 moves each shadow to its slot's centre plus (1, 1), making none. A
      render scale 1 → 2 makes a new shadow on the new texture at `1 / 4` and destroys the old.
      `destroy` destroys every shadow; a later render-scale change makes none.
- [ ] Hover and leave leave every shadow's place, tint and alpha as they were, and make nothing.
- [ ] Each live knockout's tint is four corners, the top two equal and the foot two equal; read
      along the texture's height, it is `mix(tint, palette.interactableBright, 0.25)` at the
      silhouette's top and `shade(tint, 0.2)` at its foot, each channel within 1, for `tint` the
      bronze at alpha 0.85 idle and the lifted bronze at alpha 1 hovered; the rucksack's included.
- [ ] The greyed Mailbox's four corners are `palette.hudFaint` at alpha 0.6, hovered or not.
- [ ] Into each texture still: the white fill, then the erase, then `render()`, and nothing else.
- [ ] On the plain and the throwing stand-ins, no image and no shadow is made, and every icon draws
      its line glyph exactly as at `73bcac1d`; `LetterPanel.test.ts` passes unchanged.
- [ ] No raw colour literal. `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p
      .`, `npm run lint` and `npm run lint:fence` pass in `game-client`.
- [ ] The guideline's Corner row paragraph reads as R10 and cites this FS.
- [ ] R11's shots exist in plain and emboss pairs, their paths listed in the slice's issue; no
      harness file is committed.

**By eye (the owner, at render scale 1, 1.5 and 2):**

- [ ] Each icon reads raised: the shadow is seen, and is not a blur or a double image.
- [ ] The bronze reads lit from above, and the row still reads as one set with the badge on top.
- [ ] Cuts, the gear's rivets, the Party gap and the buckle read no worse than in the plain shots.
- [ ] The greyed Mailbox still reads as off.
- [ ] Tweak rounds: at most one (R12). The owner approves.

## Edge States

- **Render scale 1:** the shadow's 1 px offset is one screen px; the texture's supersample softens
  its edge. The gradient spans about 25 to 30 screen px per icon, enough to see.
- **Render scale 1.5:** the offset is 1.5 screen px; the shadow's edge lands between pixels and is
  softened like the icon's.
- **Light ground:** the shadow does most of the lifting; the cuts show the ground with the shadow's
  edge along their upper left.
- **Dark ground:** the shadow is barely darker than the ground; the gradient does the lifting.
- **The icon at 0.85:** the shadow under it shows faintly through the bronze, darkening it a
  little. Expected; the owner judges the strength.
- **The render scale changes while hovered:** the new image takes the hovered gradient at once; the
  new shadow its usual place.
- **The glow pulses:** it draws under the shadow, so the shadow darkens the glow a little where it
  falls. Expected.
- **No letters:** no badge; envelope, shadow and glow as above.
- **No texture possible, or a throw:** the line glyphs, with no shadow and no gradient (R8).
- **A lost WebGL context:** not handled here, as for FS-7TQN4.

## Out of Scope

- Rims on the cuts (R7), a bevel, a highlight edge, an inner shadow, a blur or a soft shadow.
- Any change to the pictures, the cut width or the silhouettes.
- The badge, the glow, the pulse, the letter panel.
- A new palette token, or any change to `canvasPalette.ts` or `theme.ts`.
- The fallback line glyphs' look.
- Rects, zones, keys, labels, the row's order, any scene's wiring.
- `game-client/CONTEXT.md`.
- Any server, proto, gateway or contract change.
