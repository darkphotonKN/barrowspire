# FS-7TQN4: The whole corner row is knockout

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: The whole corner row is knockout → FS-7TQN4`: [FS-3EBCA](3EBCA-hud-corner-icons.md) (the Menu, Character and Party glyphs and the greyed Mailbox, R3 and R9, and its § Change: The inventory icon is a bronze knockout rucksack, whose knockout this reuses) and [FS-1GZGD](1GZGD-in-game-mailbox.md) (the town envelope, R33, as FS-J1672 and FS-QHN87 left it) · Builds on: [FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack](3EBCA-hud-corner-icons.md) (the knockout technique, K1–K7), [FS-J1672](J1672-bare-corner-icons.md) (bare icons, the count badge), [FS-QHN87](QHN87-richer-corner-glyphs.md) (today's shapes) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the HUD is on the game palette) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Corner row**, **Envelope**, **Count badge**

> Scoped and promoted `--from-thread` on 2026-11-13 from the approved charter's locked decisions
> N1–N10 (owner, 2026-11-13). Each requirement marked **(charter default)** is one of those
> decisions, with its reason. **(spec)** fills an acceptance-level gap the charter left, and is
> this spec's own. Recorded without adversarial review: no `challenge-me` pass (client art, cheap
> to redo, judged by eye). Code citations are against `68ec6fa9` (I-3EBCA-14 built: the bronze
> knockout rucksack; FS-QHN87 with its tweak rounds 1 and 2 built; none on main yet).

## Summary

The other four icons of the corner row follow the Inventory rucksack: each becomes a **knockout**,
one solid bronze silhouette with its inner lines cut out so the world shows through. The Menu gear
is a solid gear with a hole at its centre, a ring cut round that hole and four rivet holes. The
Character bust is a solid head over a solid shoulder mass, a gap at the neck, the baldric and its
buckle cut across the chest, and its pauldrons drawn again: smooth rounded shoulder caps that flow
into the arms, each with one plate seam cut into it. Party is three such busts in today's places,
with a gap cut where the front one overlaps the two behind. The town envelope is a solid rounded
rectangle with its flap and foot folds cut; the count badge still sits on it and the new-letter glow
is unchanged. Outside the town the greyed Mailbox is the same knockout in the faint grey. All five
are drawn by the one knockout implementation the Inventory icon already uses. Where a scene cannot
make the texture, each icon is drawn as today's line glyph. Where the icons are, how big a press
target they are, what they do, their keys and their labels stay as they are.

The owner, 2026-11-13, after choosing the bronze knockout for Inventory (「古銅反白好了」):
「其他icon不是也要反白嗎」 (shouldn't the other icons be knockouts too?), and 「目前反白前的肩胛有點怪在調整一下」
(the pauldrons as they are now, before the knockout, look a bit odd; adjust them).

**Why a change FS.** The work changes two owners' capabilities: FS-3EBCA owns the Menu, Character
and Party glyphs and the greyed Mailbox (R3, R9), and FS-1GZGD owns the town envelope (R33). Per
*The FS ledger*, that is one change FS with no thin line and a stub on each owner. Both owners'
thin lines ("Panel shortcut icons on the HUD", "Mailbox in the hub HUD") stay true, so no line is
reworded. FS-J1672 and FS-QHN87 are change FSs with no capability of their own; this FS narrows
their rules below without a stub on either, as FS-3EBCA's bronze knockout section did. The
owner's pauldron remark comes after FS-QHN87's two tweak rounds (its R15: a third request is a new
change), so it is taken here, not as a third round there.

## Bounds

Issues under this FS may change `game-client/src/ui/HudCorner.ts`,
`game-client/src/ui/MailboxEnvelope.ts` (**the envelope's drawing only**: its body, its knockout
image and that image's render-scale watch; the badge, glow, pulse, zone, label, press, toggle and
store subscription are unchanged), `game-client/src/ui/knockoutRucksack.ts` (§ Facts) and a new
**shared knockout renderer** module beside it that R1 generalises out of it (for example
`game-client/src/ui/knockout.ts`; the rucksack's file keeps its shapes and line fallback), their
test files (`HudCorner.test.ts`, `MailboxEnvelope.test.ts`, the renderer's own, and the rucksack's
if one is split off), and the **Corner row**
paragraph of `game-client/docs/design-guideline.md`. A screenshot harness is throwaway. It lives
under the git-ignored `game-client/tmp/` (the row's harness is already there,
`game-client/tmp/glyphs/`) and is never committed.

They may **not** change `hudCornerLayout.ts` (rects, gap, labels), `letterPanelLayout.ts`,
`cornerLabel.ts`, `LetterPanel.ts` or `LetterPanel.test.ts`, `mailboxHud.ts`, `drawWaxSeal`,
`@/mailbox/mailbox`, the mailbox store, `carvedPanel.ts`, `canvasPalette.ts` or `theme.ts` (so no
new token), any scene, anything under `public/art` or `tools/bake`, `game-client/CONTEXT.md`, any
server, or the existing text of any FS. A slice that finds one of these unavoidable stops and
escalates.

## Facts this spec rests on

Verified 2026-11-13 on `68ec6fa9`. Paths are under `game-client/`.

- **The knockout today** (`src/ui/knockoutRucksack.ts`, landed by I-3EBCA-14) is one class,
  `KnockoutRucksack`, with the rucksack's geometry inside it. `show(f, hovered, renderScale)` makes
  (or remakes, when the render scale differs from the one it was built at) a RenderTexture of the
  slot's size times `k = 2 × renderScale` on the slot's centre, at the given depth, scroll factor
  0 and scale `1 / k`; fills the silhouette in `TINT_IDENTITY` on a `scene.make.graphics({}, false)`
  scaled by `k`, strokes the cuts at `CUT_W = 1.6` on a second one, calls
  `image.draw(solid).erase(cuts).render()` and destroys both graphics; then sets the tint and
  alpha for the state (idle `mix(palette.frame, palette.interactable, 0.5)` at 0.85, hovered
  `mix(palette.frame, palette.interactableBright, 0.5)` at 1) and the position. It returns false,
  and never tries again, where the scene lacks `make.graphics` or `add.renderTexture` or making the
  texture throws; the caller then draws `drawRucksackLines`. `destroy()` destroys the image. It is
  **not shared**: the fill and cut drawing are private functions over the rucksack's constants, and
  the tints are its own `INK` table. The charter's N1 assumed I-3EBCA-14 would build a shared
  module; as landed, the machinery must first be lifted out of it (R1). `HudCorner.ts` and
  `knockoutRucksack.ts` each carry their own copy of a small `bend` helper (the quadratic through a
  pull point), and of `oval`.
- **Joins** (`node_modules/phaser/src/renderer/webgl/renderNodes/StrokePath.js`, Phaser 4.2.1):
  adjacent segments of a path get a connecting quad only when `lineWidth > 2`, and the width tested
  is the Graphics' own `lineStyle` width, before any scale (FS-3EBCA § Change: The inventory icon is
  a bronze knockout rucksack, § Facts). `KnockoutRucksack` strokes its cuts at 1.6 on a graphics
  scaled by `k`, so no cut corner is joined, even inside one path. Drawn instead in **texel
  coordinates** (every point times `k`, on an unscaled graphics, `lineStyle(1.6·k)`, which is at
  least 3.2 since `k ≥ 2`), the same cut is 1.6 logical px wide and every corner is joined. The
  owner-side developer proposed this on 2026-11-13. `HudCorner.test.ts` measures a cut's width as
  `lineStyle` width × the graphics' scale × the texture's scale, so either method reads 1.6 there.
- **The row** (`src/ui/HudCorner.ts`) builds one `KnockoutRucksack` and watches
  `viewport.onChange`, redrawing the Inventory icon on any change; `destroy` unwatches and destroys
  it. `draw` clears each icon's graphics and draws, centred on the slot's centre `(cx, cy)`: Menu
  `drawGear(g, cx, cy, …)`, Character `drawCharacter(g, cx, cy + 1, …)`, Party `drawParty(g, cx,
  cy, …)`, in `palette.interactable` at 0.85 idle and `palette.interactableBright` at 1 hovered;
  the greyed Mailbox `drawEnvelopeLines(g, f, palette.hudFaint, 0.6)`. These are the **line
  glyphs** of FS-QHN87 as its tweak round 2 left them (`4d6b6245`), unchanged since.
  - **The gear**: eight bevelled teeth, root radius 11, tip 15, root half-width 2.5, tip 1.5,
    the teeth and rim one closed outline; an inner ring of radius 6.2; four rivets of radius 1.1
    centred on that ring at 45°, 135°, 225° and 315°.
  - **The bust** (`drawBust`, scale `s`): a head circle radius 4.8 at `y = −6.6`; the shoulders
    the upper half of a circle radius 11 at `y = 12`; a pauldron over each shoulder, a quadratic
    bump standing 2.8 out from the shoulders' curve between 190° and 236° (mirrored), meeting the
    curve at an angle at both ends. The Character (`drawCharacter`) is one bust at scale 1,
    with a baldric (`lineBetween`) from the left pauldron's neck end to `(7, 12)`, a 5 × 4.4 buckle
    on it 0.7 of the way down, and a rivet on each pauldron; no collar. These pauldrons are what
    the owner called odd.
  - **Party** (`drawParty`, `PARTY_BUSTS`): a front bust at `(0, 1.6)`, scale 0.8, with its
    collar (a gorget's edge, an arc of radius 6.2 across the chest); two behind it at `(±10, −2.6)`,
    scale 0.66, no collar, their lines left undrawn where the front bust covers them.
- **The envelope** (`src/ui/MailboxEnvelope.ts`): in the town, `MailboxEnvelope` makes, in this
  order, a glow graphics, a body graphics and a badge graphics, all at depth 1000, then draws them;
  the count's text is made anew on each badge draw. The body is `drawEnvelopeLines(g, f, ink,
  alpha)`: a rounded rect (radius 2) in `envelopeRect(f)`, 36 × 25, centred across the slot and
  11 px down from its top; the flap one path from `(e.x + 1, e.y + 1)` down to the flap point
  (`envelopeFlapPoint`, 58% down) and up to `(e.x + e.width − 1, e.y + 1)`; two foot folds as
  `lineBetween` from the bottom corners up toward the middle. The count badge is centred on the
  envelope rect's top-right corner, moved left only as far as keeps it inside the slot. The glow
  is torch-coloured rounded rects filled round **and over** the slot, faded in and out by the pulse.
  The envelope has no viewport watch: `mailboxHud` calls its `relayout` from the scene's
  `relayoutOn`, which **does not fire on a render-scale change alone** (`src/render/viewport/anchor.ts`).
- **Draw order.** Phaser's display list sorts by depth with a stable sort
  (`node_modules/phaser/src/gameobjects/DisplayList.js`, `StableSort`), so objects of one depth
  draw in the order they were added. An image made after the badge graphics, at the same depth,
  would draw over the badge. The list has `moveBelow(child1, child2)` and `moveAbove`
  (`src/structs/List.js`, which DisplayList extends).
- **The tests.** `HudCorner.test.ts`'s stand-in scene comes in three kinds (no `make` and no
  `add.renderTexture`; both, recording; and one whose `add.renderTexture` throws) and records the
  texture, its draws, erases and tints. `MailboxEnvelope.test.ts`'s stand-in has no `make` and no
  `add.renderTexture`. `LetterPanel.test.ts` mounts the envelope on a stand-in that has
  `make.graphics` (for its masks) but no `add.renderTexture`, whose graphics know only
  `lineStyle`, `strokeRoundedRect`, `strokeRect`, `lineBetween`, `strokeCircle`, `beginPath`,
  `moveTo`, `lineTo`, `arc`, `closePath` and `strokePath` among the stroke methods.
- **Render scale** is 1 to the cap, 1.5 included (`src/render/viewport/camera.ts`); a texture's
  framebuffer is not antialiased, hence the 2× supersample (FS-3EBCA § Change: The inventory icon
  is a bronze knockout rucksack, § Facts).
- **Slots** are 54 × 46, 2 px apart (`hudCornerLayout.ts`, `CORNER_ICON_W`, `CORNER_ICON_GAP`).

## Requirements

#### One knockout

1. **One shared knockout renderer.** Menu, Character, Party, the town envelope and the greyed
   Mailbox are drawn by the **same** knockout code that draws the Inventory rucksack. Because
   I-3EBCA-14 landed that code inside `KnockoutRucksack` (§ Facts), the slice **first generalises
   it** into a shared knockout renderer that takes, per glyph, its **silhouette** (the shapes to
   fill) and its **cuts** (the paths and holes to erase), plus its two states' tint and alpha. The
   renderer alone owns: making the texture at `k = 2 × renderScale`, filling white, erasing the
   cuts (R2), rendering once and destroying its drawing graphics; the tint and alpha per state
   (hover); the rebuild on a new render scale, **including the `viewport.onChange` watch** (R13);
   falling back where it cannot draw (it reports so, and its owner draws the line glyph, R15); and
   destroy (R14). The rucksack keeps only its shapes and its line fallback, and uses the renderer
   like the other four: no visual change to it but the joined cut corners of R2. The two copies of
   `bend` (and `oval`) in `HudCorner.ts` and `knockoutRucksack.ts` fold into one. There is no
   second texture-making path anywhere. **(charter default, N1: "the SAME shared knockout module
   … No second implementation". The generalisation step and what it covers are the coordinator's,
   2026-11-13, from § Facts)**
2. **Cuts and holes, joined.** A cut is erased as a 1.6 px stroke (logical px), the Inventory's
   width, and each cut is one stroke or one path, never pieced from `lineBetween` calls; two cuts
   never meet end to end at an angle. A **hole** is a disc erased whole (a filled circle in the cut
   pass). The cut pass may therefore fill as well as stroke, and only into the erase. **The method:**
   the cuts are drawn in texel coordinates, every point and radius times `k` on an unscaled
   graphics, at `lineStyle(1.6·k)` (at least 3.2), so the renderer joins every corner of a cut path
   and no hairline wedge is left (§ Facts). The fills may keep the scaled graphics. This holds for
   the rucksack's cuts too. Curves are fine-stepped. **(spec: the charter names holes and cuts; the
   width and the one-path rule follow the Inventory's R4; the texel-coordinate method is the
   developer's, adopted by the coordinator 2026-11-13, and narrows the Inventory's R4 note on
   wedges)**

#### The pictures

3. **Menu: a riveted solid gear.** The silhouette is today's gear outline (eight bevelled teeth,
   root 11, tip 15, § Facts), filled. Cut into it, about its centre:
   - a **centre hole**, radius 2 to 3.5;
   - a **ring**, one closed circular cut concentric with the hole, with at least 1.5 px of bronze
     between the hole's edge and the cut's inner edge;
   - **four rivet holes**, radius 0.9 to 1.4, evenly spaced at 45°, 135°, 225° and 315°, each
     with at least 1 px of bronze between it and the ring cut and between it and the teeth's root
     circle.

   The ring's radius and the rivets' radius out may move from today's to make that room. The four
   rivet holes read as four separate holes at render scale 1. **(charter default, N2. The radii
   bands and the bronze margins are this spec's: today's rivets sit on the ring, which as holes
   would merge with its cut)**
4. **Character: a solid bust.** One bust at scale 1 on `(cx, cy + 1)`, as today. Its silhouette is
   a solid **head disc** and a solid **shoulder mass** below it. Cut into, or left between, them:
   - a **neck gap**: the head and the shoulder mass do not touch; at least 1.6 px of ground lies
     between them everywhere;
   - the **pauldron seams** (R5), one per shoulder;
   - the **baldric**: one cut from the top of the left shoulder, inside the left seam's inner end,
     down across the chest to the shoulder mass's foot right of its middle, crossing no other cut;
   - its **buckle**: a closed rectangular cut on the baldric about 0.7 of the way down, about
     5 × 4.4, its long side along the strap.

   The pauldron rivets and the collar go. The silhouette's box is within 3 px of today's line
   glyph's box (half the line width included) in each dimension, and its centre within 1 px.
   **(charter default, N3. The rivets going is the charter's list read as complete; the box
   tolerance is FS-QHN87 R4's, this spec's)**
5. **The pauldrons, drawn again.** The shoulder mass's upper outline runs from the foot of one arm,
   up over a **rounded shoulder cap**, across the shoulders under the neck, over the other cap and
   down the other arm, as one **smooth convex** curve: at every vertex it turns the same way, by no
   more than 20°, so there is no lump standing out of the shoulder line, no hook and no corner
   where a cap meets it. The caps are the curve's broadest, squarest-rounded part, and flow
   straight down into the arm line (the silhouette's sides). Each cap carries **one plate seam**: a
   single cut that follows the cap's edge 2 to 4 px inside it, from the arm side up and in toward
   the neck, ending before it reaches above the head's edge, so the cap reads as a layered plate
   over the shoulder. Left and right are mirror images within 0.01 px (the baldric and buckle
   aside). They read as armour at render scale 1. **(charter default, N3b: "smooth rounded shoulder
   caps that flow into the arm line, each with one layered plate seam … No bulging lumps, no hooks";
   the owner's 「肩胛有點怪」. The convexity and 20° rule is this spec's test for "no lumps, no hooks";
   the seam's inset band is this spec's)**
6. **Party: three solid busts.** Three busts of R4's shape (head disc, shoulder mass, R5's caps,
   neck gap) in today's arrangement (`PARTY_BUSTS`): the front one at `(0, 1.6)`, scale 0.8, and
   two behind it at `(±10, −2.6)`, scale 0.66. The front bust has its two plate seams and its
   gorget's edge as a cut (today's collar arc). The back two have their neck gaps; their seams may
   be left out. None has a baldric. Where the front bust overlaps a back one, a **gap** is cut along
   the front bust's outline (head and shoulders), at least 1.6 px wide, so the front bust's whole
   outline reads and each back bust reads as its own shape behind it. The three silhouettes are
   one fill, separated only by that gap. The whole is mirror-symmetric within 0.01 px. **(charter
   default, N4. That the front keeps its gorget and the back drop their seams is this spec's: the
   charter lets the back stay simpler, and the gorget is today's)**
7. **The envelope: a solid letter.** In the town, the envelope's silhouette is one solid rounded
   rectangle in today's `envelopeRect` (36 × 25, radius 2, 11 px down from the slot's top), so the
   badge's place is unchanged. Cut into it: the **flap**, one path from near the top-left corner
   down to the flap point (`envelopeFlapPoint`) and up to near the top-right; and the **two foot
   folds**, each one cut from a bottom corner up toward the middle, as today's lines run. Nothing
   else is cut, and nothing is drawn on it but the count badge. The flap is one path, so its point
   is joined (R2). **(charter default, N5)**
8. **The badge and the glow are unchanged.** The count badge (its ember pill, rim, count, size and
   place, FS-J1672 R8, R9) is drawn **over** the envelope's knockout at every moment: on building,
   after a rebuild at a new render scale, and after the count changes. The new-letter glow (its
   look, its place under the envelope and its pulse, FS-J1672 R10) is drawn **under** it, as
   today. Neither the badge's nor the glow's depth or drawing changes; the knockout image is placed
   between them in the display list each time it is made (for example with `moveBelow` against the
   badge's graphics, § Facts). **(charter default, N5: "The count badge draws over it unchanged.
   The new-letter glow is unchanged". The draw-order rule is this spec's, from § Facts)**
9. **The greyed Mailbox.** Outside the town (a field, a run), the row's Mailbox is R7's knockout
   envelope, tinted `palette.hudFaint` at alpha 0.6, with no badge. It never brightens and never
   changes alpha under the pointer, and its hover shows only its label, "Mailbox · town only". It
   is never amber. **(charter default, N6; FS-3EBCA R9)**

#### Colour, hover, size

10. **Bronze, lifted under the pointer.** Menu, Character, Party and the town envelope are tinted
    `mix(palette.frame, palette.interactable, 0.5)` at alpha 0.85 idle, and
    `mix(palette.frame, palette.interactableBright, 0.5)` at alpha 1 under the pointer, exactly as
    the Inventory rucksack. Only the tint and alpha change on hover and leave: the texture is not
    rebuilt and nothing is drawn into it. Each icon's label shows above its slot under the pointer
    and goes when it leaves (FS-3EBCA R5). One solid colour: no gradient, no second fill colour,
    no outline round a silhouette, no shadow. **(charter default, N7; the no-rebuild rule follows
    the Inventory's R5)**
11. **Same slot, same centre.** Each silhouette is centred where today's glyph is (Menu and Party on
    the slot's centre, Character 1 px below it, the envelope in `envelopeRect`) within 1 px, lies
    wholly inside its slot, and moves with its slot on every `relayout` (FS-ZAJMH R12, R13).
    **(spec, from N9)**

#### Drawn into a texture

12. **Per icon, one texture.** Where the scene can make it, each knockout icon has its own render
    texture, made and shown as the Inventory's (R1): at depth 1000, scroll factor 0, the slot's
    size times `k`, shown at `1 / k` on the slot's centre. The icon's own graphics draws nothing
    while its texture stands.
13. **A new render scale rebuilds it.** When `viewport.renderScale` changes, each knockout
    (the four row icons, and the envelope in the town) is built again at the new `k` and its old
    texture destroyed. A view change that keeps the render scale builds nothing; a `relayout` only
    moves the images. The watch is the shared renderer's (R1), so the envelope gets it too: it
    needs one, since the scene's relayout does not fire on a render-scale change alone (§ Facts),
    and that watch is part of its drawing. The row's own Inventory-only watch goes into the
    renderer. **(charter default, N1: as the Inventory's R7)**
14. **Taken down with its owner.** `HudCorner.destroy` destroys every knockout image of the row and
    stops watching; `MailboxEnvelope.destroy` destroys the envelope's image and stops its watch. A
    render-scale change after either builds nothing and throws nothing. **(as the Inventory's R8)**

#### The fallback

15. **Today's line glyphs.** Where the scene cannot make a texture (it lacks `make.graphics` or
    `add.renderTexture`, or making it throws), each icon is drawn exactly as at `68ec6fa9`: Menu
    `drawGear`, Character `drawCharacter`, Party `drawParty`, the town envelope and the greyed
    Mailbox `drawEnvelopeLines`, with their inks, alphas, widths and points unchanged, strokes only.
    The slot is never empty. If a later render-scale change finds the scene still unable, the line
    glyph stays. Each icon falls back on its own. **(charter default, N8: "draw today's line
    glyphs". The fallback Character and Party keep today's pauldrons, not R5's: N8 names today's
    glyphs)**
16. **`Ink` stays stroke-only.** The fallback glyphs draw through the stroke-only `Ink` (FS-J1672
    R3 held in the types); fills live only in the knockout module's drawing graphics.
    `drawEnvelopeLines` keeps calling only the methods `LetterPanel.test.ts`'s stand-in knows
    (FS-QHN87 R11), and that test passes unchanged: on its stand-in (`make.graphics`, no
    `add.renderTexture`) the envelope falls back. **(spec, from § Facts)**

#### Tokens and the rest

17. **Tokens only.** Every colour is a `palette` token or a `mix` of tokens, and the white
    silhouette is `TINT_IDENTITY` from `@/utils/theme`. No raw colour literal, no new token, and the
    lint fence passes (ADR-0013, ADR-0025). **(as the Inventory's R10)**
18. **Everything else stays.** Slots 54 × 46, 2 px apart; the row's order; every rect, zone, hand
    cursor, `covers`, press, guard, key and label (FS-3EBCA R1, R2, R5–R19); the envelope's press,
    toggle, zone and label (FS-1GZGD § Change); the count badge; the glow and its pulse; the
    Inventory rucksack as I-3EBCA-14 built it and its owner's check (I-3EBCA-15) leaves it.
    **(charter default, N9)**

#### The record

19. **The guideline says so.** The design guideline's **Corner row** paragraph is updated:
    - all five icons are **knockouts**: a solid silhouette in bronze (brass and amber mixed half
      and half), its inner lines cut 1.6 px so the world shows through, alpha 0.85 idle, lifted
      toward the bright amber and opaque under the pointer, drawn into a texture at twice the
      render scale; a greyed icon (Mail outside the town) is the same knockout in `hudFaint` at 0.6
      and never brightens;
    - Menu: a solid gear with a centre hole, a ring cut round it and four rivet holes; Character:
      a solid head over solid shoulders, a gap at the neck, smooth rounded shoulder caps each with
      one plate seam, a baldric and buckle cut across the chest; Party: three such busts, a gap cut
      where the front one overlaps the two behind; Mailbox: a solid envelope with its flap and foot
      folds cut, the count badge over it;
    - where a scene cannot make the texture, each is drawn as its 2.25 px line glyph;
    - Inventory's "the row's one knockout" goes.

    The rest of the paragraph stays, and its "Added by" note is kept, with this FS added to it.
    **(charter bounds)**

#### The check

20. **Screenshots for the owner.** The agent slice renders the row in a real WebGL Phaser
    (`game-client/tmp/glyphs/`, the four row icons plus `MailboxEnvelope` with a count of 3) and
    saves, at backing resolution with no resampling unless said:
    - six of the **town row idle**, at render scale 1, 1.5 and 2, over a **light ground** (a
      daylit field's tone) and a **dark ground** (`palette.ground`);
    - twelve of the **town row with one icon hovered** (Menu, Character, Party, Mailbox), at render
      scale 1, 1.5 and 2, over the dark ground;
    - three of the **field row idle** (the greyed Mailbox), at render scale 1, 1.5 and 2, over the
      light ground;
    - three **nearest-neighbour enlargements** (4×) of the idle town row over the dark ground, one
      per render scale;
    - one of the town row **mid-glow** (a pulse at its brightest), at render scale 2, dark ground;
    - one of a **render-scale change at run time** (built at 1, then set to 2), to show the rebuild.

    Twenty-six PNGs. The slice lists their absolute paths in its issue. The harness is throwaway
    (§ Bounds). **(charter default, N10's render scales; the set follows the Inventory's R14)**
21. **At most one round.** The owner looks in game at render scale 1, 1.5 and 2. He may ask for
    one round of tweaks, which changes only this FS's files and re-shoots R20's set. A second
    request is a new change. **(charter default, N10)**

## What this changes in its owners

Where an owner's text below and this FS disagree, this FS wins. The owners' text is not edited
(write-once, `docs/specs/README.md`).

- **FS-3EBCA R3** ("on it a line glyph", "Menu is a gear: a toothed ring round a small hub",
  "Character is a bust", "Party is two busts"): each is the knockout of R3–R6 here. "Drawn in code
  from palette tokens; no baked art, no emoji, no texture file" still holds: the textures are drawn
  in code at run time, and no file is added.
- **FS-3EBCA R9** (greyed Mail: "its envelope lines … in `palette.hudFaint`"): the greyed Mailbox
  is the knockout envelope of R9 here, in `hudFaint` at 0.6. "No count, no brightening and no hand cursor"
  holds.
- **FS-3EBCA's acceptance criterion** "its glyph in `interactable`, brightening to
  `interactableBright` under the pointer", as FS-J1672 reworded it: for every live icon it is the
  bronze at 0.85, lifted at 1 (R10), or, in the fallback, exactly as written (R15).
- **FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack**: its R11 ("The four stay
  stroke-only … Their glyphs, strokes, widths, colours and alphas are exactly as at `84d82e8a`"),
  its R13 bullets "it is the row's one knockout" and "the other four are line glyphs", its user
  story 21 ("so that the next icon is not drawn this way by imitation"), its criterion "Menu,
  Character, Party and the greyed Mailbox fill nothing and are drawn exactly as at `84d82e8a`" and
  its Out of Scope line "turning any of them into a knockout" no longer hold. They hold for the
  fallback (R15, R16). Everything it says of the rucksack holds, except that its knockout is
  drawn by the shared renderer (R1) and its cuts in texel coordinates (R2): its R4 note that a sharp
  corner "may keep a hairline wedge" and its R6 "the graphics used to draw into it" scaled by `k`
  for the cuts no longer describe the method. Its picture, size, colours and tests' measures hold.
- **FS-1GZGD R33** ("a line envelope"), as FS-J1672 left it (bare, no seal): the envelope is R7's
  knockout. It stays bare, with no plate and no seal (FS-J1672 R1, R7).
- **FS-J1672 R3** ("No fill behind a glyph") and its criterion: no icon of the row holds it while its
  texture stands; each silhouette is filled in its own texture, as the icon itself, with nothing laid
  on the world round it. It holds for every fallback. **R2** ("Glyphs unchanged") no longer applies.
  **R6** ("No outline or halo") holds. **R8–R10** (the badge, the pulse) hold unchanged (R8 here).
- **FS-QHN87 R1** (one 2.25 px width for every glyph) and **R7** ("Line only"): they hold for the
  fallback only; a knockout's cuts are 1.6 px (R2). **R2** (no notches) holds for the cuts (R2) and
  the fallback. **R3–R6** (the pictures) are replaced by R3–R7 here for the knockouts and stand for
  the fallback. **R11** (the envelope's draw methods) holds for `drawEnvelopeLines` (R16).
- **The guideline's Corner row paragraph**: updated (R19).

## User Stories

1. As a player, I want every icon in the corner row drawn the same way as the Inventory rucksack,
   so that the row reads as one set and not one odd icon among four.
2. As a player, I want the Menu gear solid with a hole at its centre, a ring and four rivet holes,
   so that it reads as a worked iron gear.
3. As a player, I want the four rivet holes distinct at render scale 1, so that the gear does not
   read as a blot.
4. As a player, I want the Character bust solid, with a gap at the neck, so that head and shoulders
   read at a glance.
5. As a player, I want its shoulders to be smooth rounded plates that flow into the arms, so that
   they read as armour and not as lumps or hooks.
6. As a player, I want one seam on each shoulder plate, so that it reads as layered plate.
7. As a player, I want the baldric and buckle cut across the chest, so that the Character bust keeps
   the detail that tells it from the Party's.
8. As a player, I want Party's three busts where they are today, so that what I learned stays.
9. As a player, I want a gap where the front bust overlaps the two behind, so that the three read as
   three people and not one blob.
10. As a player, I want the envelope a solid letter with its flap and folds cut, so that it matches
    the row.
11. As a player waiting on letters, I want the count badge still on the envelope's corner and
    always over it, so that I still see how many wait.
12. As a player who gets a letter, I want the envelope still to glow a few times, so that I notice
    it.
13. As a player outside the town, I want the Mailbox the same knockout in faint grey that never
    brightens, so that I know it can't be pressed there.
14. As a player, I want each icon to lift toward bright amber and go opaque under the pointer, so
    that it answers my hand.
15. As a player, I want every icon's label, key, press and place unchanged, so that nothing I
    learned changes.
16. As a player on a high-density screen, I want the cut lines smooth, so that the icons look made,
    not jagged.
17. As a player on a plain screen or at 1.5, I want each silhouette and its main cuts still to read,
    so that the row works at every render scale.
18. As a player who moves the window to a screen of another density, I want every icon redrawn sharp,
    the envelope included, so that none turns blurry.
19. As a player over a daylit field or the dark town, I want every icon legible, so that none sinks
    into the world.
20. As a player whose browser cannot draw textures, I want today's line icons, so that no slot is
    ever empty.
21. As the owner, I want screenshots at render scale 1, 1.5 and 2, idle and hovered, over light and
    dark ground, so that I can judge the row before looking in game.
22. As the owner, I want one round of tweaks, so that the shapes and the pauldrons end up right.
23. As a maintainer, I want one knockout implementation for all five icons, so that a fix to it
    fixes all five.
24. As a maintainer, I want each knockout tested as the rucksack is, so that a later change cannot
    quietly break one.
25. As a maintainer, I want the guideline to say every corner icon is a knockout, so that the next
    one is drawn the same way.

## Acceptance Criteria

On a recording stand-in scene that offers `make.graphics` and `add.renderTexture`:

- [ ] The shared knockout renderer is the only code that calls `add.renderTexture`, `erase` or
      `viewport.onChange` for the corner row's knockouts and the envelope's. The Inventory rucksack
      uses it, and I-3EBCA-14's tests pass, changed at most in their imports and in how the
      stand-in reads a cut's width (they measure in logical px, § Facts). One `bend` remains.
- [ ] A town row (Menu, Inventory, Character, Party) makes exactly four render textures, a field row
      (with the greyed Mailbox) five, and the town envelope one: each at depth 1000, scroll factor 0,
      on its slot's centre, `round(f.width·k) × round(f.height·k)` with `k = 2 × renderScale`, at
      scale `1 / k`. The icons' own graphics and the envelope's body graphics record no op.
- [ ] Into each: fills only in `TINT_IDENTITY` at alpha 1, then an erase of strokes and filled
      discs only, then `render()`; the drawing graphics are destroyed. No `fillGradientStyle`, no
      other colour. No cut uses `lineBetween`. Every cut stroke is on an unscaled graphics at
      `lineStyle(1.6·k)` (over 2, so joined), which is 1.6 logical px; the rucksack's included.
- [ ] **Menu:** the filled outline is today's gear outline; the cuts are one centre disc of radius
      2–3.5, one closed ring concentric with it at least 1.5 px clear of it, and four discs of radius
      0.9–1.4 at 45°, 135°, 225° and 315°, each at least 1 px clear of the ring cut and of the root
      circle (radius 11).
- [ ] **Character:** a head disc and a shoulder mass at least 1.6 px apart; the mass's upper outline
      convex, turning one way by at most 20° per vertex, mirror-symmetric within 0.01 px; one seam
      per cap, inside the mass, 2–4 px in from its edge; a baldric cut from inside the left seam's
      inner end to the mass's foot right of the middle, crossing no other cut; a closed four-sided
      buckle cut on it about 0.7 down. No rivet, no collar. Its box within 3 px of the fallback
      `drawCharacter`'s (half the line width included) in each dimension, its centre within 1 px.
- [ ] **Party:** three head discs and three shoulder masses at `PARTY_BUSTS`' places and scales, each
      head clear of its own mass by at least 1.6 × its scale; a cut at least 1.6 px wide along the
      front bust's outline wherever it lies over a back bust; the front bust's two seams and gorget
      arc; no baldric. Mirror-symmetric within 0.01 px.
- [ ] **Envelope (town and greyed):** the fill is one rounded rect equal to `envelopeRect(f)`,
      radius 2; the cuts are one flap path through (or rounded within 1 px of) `envelopeFlapPoint(f)`
      and two foot folds; nothing else.
- [ ] Idle tint `mix(palette.frame, palette.interactable, 0.5)` at 0.85, hovered
      `mix(palette.frame, palette.interactableBright, 0.5)` at 1, for Menu, Character, Party and the
      town envelope. The greyed Mailbox is `palette.hudFaint` at 0.6, hovered or not. Hover and
      leave make no texture and draw nothing into one.
- [ ] The envelope's knockout image stands under the badge's graphics and the count's text, and over
      the glow, in the scene's display list: after building, after a render-scale rebuild, and after
      the count goes from 0 to 3.
- [ ] A `relayout` to 1280 × 720 moves every image to its slot's new centre and makes no texture. A
      render scale 1 → 2 makes a new texture per knockout at `k = 4` and destroys each old one, the
      envelope's included, with no scene relayout; a width change alone makes none.
- [ ] `HudCorner.destroy` and `MailboxEnvelope.destroy` destroy their images and unwatch: a later
      render-scale change makes nothing and throws nothing.

On a stand-in with no `make` and no `add.renderTexture`, and on one whose `add.renderTexture`
throws:

- [ ] Every icon draws today's line glyph exactly as at `68ec6fa9`: the FS-J1672 and FS-QHN87
      blocks' assertions on Menu, Character, Party, the envelope and the greyed Mailbox pass
      unchanged on this path, and no slot is empty.
- [ ] `LetterPanel.test.ts` passes unchanged.

For the whole row:

- [ ] Every zone, hand cursor, `covers`, press, label and the envelope's toggle are unchanged, with
      and without textures. The count badge's look and place are unchanged.
- [ ] `Ink` has no fill method. No raw colour literal. `npx vitest run --maxWorkers=4
      --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint` pass in `game-client`.
- [ ] The guideline's Corner row paragraph reads as R19 and cites this FS.
- [ ] The twenty-six PNGs of R20 exist, their absolute paths listed in the agent slice's issue. No
      harness file is committed.

**By eye (the owner, in game at render scale 1, 1.5 and 2):**

- [ ] The row reads as one set of five bronze knockouts with the rucksack.
- [ ] The gear's centre hole, ring and four rivet holes read at 2 and 1.5, and its hole and ring at 1.
- [ ] The Character's shoulders read as armour plates, smooth, with no lump or hook, at all three
      scales; its neck gap, seams, baldric and buckle read at 2 and 1.5.
- [ ] Party reads as three people, the gap separating the front bust from the two behind, at all
      three scales.
- [ ] The envelope reads as a letter, its flap and folds clear, the badge sitting on it; it still
      glows on a new letter.
- [ ] The greyed Mailbox reads as off, over a field and in a run.
- [ ] Cut lines are smooth, with no jagged steps and no corner wedge, the rucksack's included.
- [ ] Tweak rounds: at most one (R21). The owner approves the row.

## Edge States

- **Render scale 1:** the 1.6 px cuts are under two backing px and, supersampled, may show as soft
  rather than clean gaps. The rivet holes (radius ≥ 0.9) and Party's back busts (scale 0.66) are the
  likeliest to fade. The silhouettes and the main cuts (the ring, the neck gap, the Party gap, the
  flap) must still read. The owner judges.
- **Render scale 1.5:** `k = 3`; edges land between pixels, which the supersample softens. Shot and
  judged like the other two.
- **A sharp corner of a cut** (the flap's V, the buckle's corners, the rucksack's hasp): drawn in
  texel coordinates at over 2 px, every corner of one path is joined (R2), so no hairline wedge is
  left. Where two separate cuts meet (a foot fold at the envelope's edge) nothing needs joining.
- **The count badge over the envelope:** the badge covers the envelope's top-right corner and the
  flap's upper-right end, as today. A rebuild never draws the envelope over it (R8).
- **The glow during a pulse:** the glow fills under and round the envelope, so its cuts show the
  torch glow, not the world, while it pulses. Expected; the glow is unchanged.
- **The render scale changes while hovered:** the rebuilt texture takes the hovered tint and alpha
  at once, and the label stays.
- **The render scale changes mid-pulse:** the envelope rebuilds under the badge; the glow's tween
  runs on untouched.
- **The render scale changes in the middle of a relayout:** each rebuild uses its slot's current
  rect; neither order leaves an icon off its slot.
- **A light ground** (a daylit field): the bronze carries each silhouette, the cuts show the bright
  ground. **A dark ground** (the town, a run): the bronze carries it, the cuts read as dark lines.
  The greyed Mailbox at 0.6 is fainter on both, as today.
- **No texture possible**, or a throw: today's line glyphs (R15), per icon. A row where one icon
  failed and the others did not is legal; it only happens on a throw.
- **The ESC menu open:** no icon but Menu takes hover (FS-3EBCA R18); the others stay idle-tinted.
- **The letter panel open:** the envelope is drawn as always (no "open" state).
- **No letters:** no badge; the envelope's knockout alone.
- **A lost and restored WebGL context:** not handled here, as for the rucksack. A blank texture
  found in the owner's check is a new change.

## Out of Scope

- An emboss, bevel, gradient or any shading inside a silhouette: a later, separate charter (N9).
- The Inventory rucksack's shape, colour or tests (I-3EBCA-14) and its owner check (I-3EBCA-15).
- The fallback glyphs' look: they stay today's, pauldrons included (R15).
- A new palette token, or any change to `canvasPalette.ts` or `theme.ts`.
- Baked art, an image file, or anything under `public/art` or `tools/bake`.
- An "open" or pressed state, animation, or a glow on any icon but the envelope's existing one.
- Rects, zones, the gap, keys, labels, the row's order, and any scene's wiring.
- The count badge's look, the glow's look, the pulse, the letter panel, `drawWaxSeal`.
- `game-client/CONTEXT.md`. Its **Envelope** entry ("a line envelope drawn in Phaser") becomes
  untrue of the drawn envelope; rewording it, and whether **knockout** is a term for it, is a
  `domain-model` pass outside these bounds.
- The guideline's art-direction sections beyond the Corner row paragraph.
- Any server, proto, gateway or contract change.
