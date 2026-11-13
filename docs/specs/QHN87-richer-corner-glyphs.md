# FS-QHN87: Richer corner glyphs

> Status: shipped · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Richer corner glyphs → FS-QHN87`: [FS-3EBCA](3EBCA-hud-corner-icons.md) (the corner row's glyphs, R3, and its § Change: The inventory icon is an inked backpack) and [FS-1GZGD](1GZGD-in-game-mailbox.md) (the envelope's lines, R33, as FS-J1672 left them) · Builds on: [FS-J1672](J1672-bare-corner-icons.md) (bare icons, the count badge) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the HUD is on the game palette) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Corner row**, **Envelope**, **Count badge**

> Promoted `--from-thread` on 2026-11-13 from the approved charter's locked decisions G1–G7
> (owner, 2026-11-13). Requirements marked **(charter default)** are those decisions, each with its
> reason. Those marked **(spec)** fill an acceptance-level gap the charter left, and are this
> spec's own. Recorded without adversarial review: no `challenge-me` pass (client art, cheap to
> redo, judged by eye). Code citations are against `f779a9b0` (FS-J1672 and the backpack's tweak
> round 2 built, neither on main yet).

## Summary

The five icons in the bottom-right corner are drawn richer, in heavier lines, so the row stops
looking empty. The Menu gear gets bevelled teeth and a riveted inner ring. The Character icon
becomes a hooded, cloaked figure with only shadow under the hood, the game's own player. The Party
icon becomes two such figures. The town envelope is tied with a diagonal cord and knot, one corner
folded over and creases at its flap, and still no circle in its middle. Every glyph, the
haversack included, goes from 1.5 px to one sturdier line width. Where the icons are, how big a
press target they are, what they do, their keys, their labels, their hover, and the count badge
stay as they are. Everything stays line only, with no fills.

The owner, 2026-11-13: 「icon感覺有點空 不是指背包是所有icon」 (the icons feel a bit empty; not just the
backpack, all of them). Asked how to fill them, he chose to draw the glyphs themselves richer, not
to add backings or plates.

**Why a change FS.** The work changes two owners' capabilities: FS-3EBCA owns the Menu, Inventory,
Character and Party glyphs and the greyed Mailbox (R3, R9), and FS-1GZGD owns the envelope (R33).
Per *The FS ledger*, that is one change FS with no thin line and a stub on each owner. Both owners'
thin lines ("Panel shortcut icons on the HUD", "Mailbox in the hub HUD") stay true, so no line is
reworded. FS-J1672 is a change FS with no capability of its own; this FS narrows its R2 below,
without a stub there, as the backpack section did.

**The haversack** keeps its `f779a9b0` size and design, and changes only through the shared line
width (R9).

## Bounds

Issues under this FS may change `game-client/src/ui/HudCorner.ts`,
`game-client/src/ui/MailboxEnvelope.ts` (the envelope's lines and the shared width constant only;
the badge, glow, pulse, zone, label and toggle are unchanged), `game-client/src/ui/HudCorner.test.ts`,
`game-client/src/ui/MailboxEnvelope.test.ts`, and the **Corner row** paragraph of
`game-client/docs/design-guideline.md`. A screenshot harness is throwaway. It lives under the
git-ignored `game-client/tmp/` (the root `.gitignore`'s `tmp/`) and is never committed.

They may **not** change `LetterPanel.ts` or `LetterPanel.test.ts` (R11 keeps the envelope inside
that test's fake graphics), `hudCornerLayout.ts`, `letterPanelLayout.ts`, `cornerLabel.ts`,
`carvedPanel.ts`, `canvasPalette.ts` or `theme.ts` (so no new token), `drawWaxSeal` (the letter
list's unread dot), `@/mailbox/mailbox`, the mailbox store, any scene, anything under `public/art`
or `tools/bake`, `game-client/CONTEXT.md`, any server, or the existing text of any FS. A slice
that finds one of these unavoidable stops and escalates.

## Facts this spec rests on

Verified 2026-11-13 on `f779a9b0`. Paths are under `game-client/`.

- **The row** (`src/ui/HudCorner.ts` `draw`) draws each live glyph on the slot's centre
  `(f.x + 29, f.y + 23)` into the icon's own graphics at depth 1000, cleared and redrawn on hover,
  on leave and on `relayout`: Menu `drawGear`, Inventory `drawBackpack`, Character
  `drawBust(g, cx, cy + 1, 1, …)`, Party `drawParty`. Ink is `palette.interactable` at 0.85 idle and
  `palette.interactableBright` at 1 under the pointer. The greyed Mailbox (outside the town) is
  `drawEnvelopeLines(g, f, palette.hudFaint, 0.6)` from `MailboxEnvelope.ts`.
- **Line widths today.** `HudCorner.ts` has `LINE_W = 1.5` ("the envelope's"), used by every glyph
  and by the cover margins of `behindPouch` and `onBust`. `drawGear`'s teeth are `lineStyle(3, …)`
  stubs drawn with `lineBetween`. `drawEnvelopeLines` writes its own literal `lineStyle(1.5, …)`.
  The badge's rim is 1 px.
- **The gear** is a ring of radius 9, a hub circle of radius 3.5, and eight square teeth, 3 px
  stubs from radius 9.5 to 13.
- **The bust** is a head circle (radius 5·s at `cy − 6·s`) over the upper half circle of the
  shoulders (radius 11·s at `cy + 12·s`). **Party** draws a back bust at scale 0.8 on
  `(cx − 6, cy − 2)` and a front one at 0.85 on `(cx + 5, cy + 2)`. The back one's shoulders are
  cut where the front one's shape covers them (`uncoveredRuns`, `onBust`, half-degree steps, the
  line width as margin). Nothing is filled.
- **The envelope's lines** (`drawEnvelopeLines`) sit in `envelopeRect`, 11 px in from the icon
  rect's left, top and right and 10 px up from its foot: 36 × 25 inside 58 × 46. They are a
  rounded rect (radius 2), the flap as two `lineBetween` calls from the top corners down to the flap
  point at 58% of the rect's height (`envelopeFlapPoint`), and two foot folds from the bottom
  corners up toward the middle.
- **The count badge** (`MailboxEnvelope.drawBadge`) is 14 px tall, centred on the envelope rect's
  top-right corner `(e.x + 36, e.y)`, moved left only as far as keeps it inside the icon's rect.
  While anything waits, it covers the envelope's top-right corner.
- **How WebGL strokes a path** (`node_modules/phaser/src/renderer/webgl/renderNodes/StrokePath.js`,
  Phaser 4.2.1): each segment is its own quad. Adjacent segments of one path get a connecting quad
  only when `lineWidth > 2`, closing the loop too when the path is closed. `lineBetween` is a path
  of one segment, so two `lineBetween` calls meeting at an angle are never joined.
  `strokeRoundedRect` splits its path with `moveTo` where each side meets a corner arc, but those
  meetings are tangent, so they show no notch. The width is the Graphics' own, before the camera's
  zoom (render scale, `src/render/viewport/camera.ts`).
- **The tests.** `HudCorner.test.ts` records every op with its arguments (its fake knows
  `moveTo`, `lineTo`, `strokePoints`, `strokeEllipse` and the rest) and asserts, for every icon, no
  fill (`FILLS`), one ink per state, the Party cut, the greyed Mailbox's flap meeting at the flap
  point, and the haversack's parts, widths (`{1.5}`) and box. `MailboxEnvelope.test.ts` asserts no
  `fillCircle` or `strokeCircle` (`SEAL_PARTS`), the flap meeting at the point as two
  `lineBetween`s, and the badge. `LetterPanel.test.ts` mounts the envelope on a fake graphics whose
  methods all answer as no-ops, so it pins none of the envelope's ops, but it knows only
  `lineStyle`, `strokeRoundedRect`, `strokeRect`, `lineBetween`, `strokeCircle`, `beginPath`,
  `moveTo`, `lineTo`, `arc`, `closePath` and `strokePath` among the stroke methods. A call to any
  other method would throw there.
- **The player is a hooded figure** (`game-client/CLAUDE.md`, the game palette's scenes: "Player =
  hooded figure").

## Requirements

#### The line

1. **One width, named once.** Every stroke of the five glyphs (Menu, Inventory, Character, Party,
   the town envelope's lines and the greyed Mailbox's) is drawn at one width, `GLYPH_LINE_W =
   2.25`. It is declared once, exported from `MailboxEnvelope.ts`, and imported by `HudCorner.ts`,
   which already imports from it (a constant in `HudCorner.ts` would need the envelope to import the
   row, a cycle). No other line width is written in either file's glyph code: the gear's 3 px teeth
   and the envelope's literal 1.5 go, and `HudCorner.ts`'s `LINE_W` is this constant, so the cover
   margins (`onBust`, `behindPouch`) follow it. The badge's 1 px rim is not a glyph line and stays.
   **(charter default, G5: a sturdier row. 2.25 is over the renderer's 2 px join threshold, § Facts,
   so every path's corners are joined at render scale 2; the charter named it as the example)**
2. **No notches.** Wherever two straight strokes of a glyph meet at an angle, they are drawn as one
   path through that corner, so the renderer joins them. They are never two `lineBetween` calls
   meeting end to end. Meetings that are tangent (an arc running into a line along its direction,
   as in `strokeRoundedRect`) may be separate. **(charter default, G5: "no corner notches at render
   scale 2"; the rule made testable here, from § Facts)**

#### The glyphs

3. **Menu: a riveted gear.** Eight teeth, each bevelled: a trapezoid, wider at its root than its
   tip, its flanks slanting in. The teeth and the rim between them are one closed outline. Inside
   it, an inner ring at the hub, where today's hub circle stands, a little larger. On that ring
   are 4 to 6 rivets, evenly spaced, each a small stroked circle centred on the ring's line so it
   reads as a bead on it. The rivets must read as separate beads at render scale 1. If 5 or 6 merge,
   draw 4, and say so in the slice. **(charter default, G1)**
4. **Character: a hooded figure.** A head-and-shoulders figure in a hood and cloak, the game's
   player (§ Facts):
   - a hood peaked at the top, its opening a deep inner curve;
   - under the hood, shadow only: no face, no eyes, no features. With no fill allowed (R7), the
     shadow is the opening's inner curve and at most two short strokes inside it. The world shows
     through the rest;
   - the cloak falls from the hood over the shoulders to the glyph's foot, its hem a curve, with one
     or two fold lines.

   It keeps today's bust's place and size: its box (half the line width included) is within 3 px
   of today's bust's in each dimension, and its centre within 1 px of today's. **(charter default,
   G2: the player is a hooded figure. The place and size tolerance is this spec's, so the row keeps
   its rhythm)**
5. **Party: two hooded figures.** R4's figure twice, at today's scales and offsets (back 0.8 on
   `(cx − 6, cy − 2)`, front 0.85 on `(cx + 5, cy + 2)`). The back figure's lines are left undrawn
   wherever the front figure's shape (its line width included) covers them, as today. Nothing is
   filled, and the front figure is drawn whole. Its box is within 3 px of today's Party glyph's in
   each dimension, centred within 1 px of it. **(charter default, G3)**
6. **The town envelope: tied, folded, creased.** `drawEnvelopeLines` draws, inside today's
   `envelopeRect`:
   - **its edge**, the rounded rect, as today;
   - **its flap**, the V from the top corners to the flap point, now as one path with the flap
     point as its middle vertex (R2). The two flap lines still meet there, and nothing is drawn over
     that point;
   - **fold creases at the flap**: a short crease line just inside each flap line near its top
     corner, where the paper folds. Each crease is no longer than a third of its flap line and ends
     well clear of the flap point;
   - **the foot folds**, as today;
   - **a folded-over corner**: one bottom corner turned over as a small triangle. The corner is cut
     by a short diagonal, and the turned-over flap's edges are drawn inside it;
   - **a diagonal tie cord** running edge to edge across the envelope, with **a knot** on it. The
     knot is crossing strokes with two short loose ends, never a circle and never a closed loop. It
     stands at least 8 px from the flap point and from the rect's centre, so nothing round sits in
     the middle. The cord passes no nearer than 3 px to the flap point. Where the cord crosses the
     envelope's other lines, those lines are left undrawn under it (the cord's width plus a hair
     each side), so the cord reads as lying on top, the way the Party's back figure is cut.

   None of the cord, the knot or the folded corner lies in the box the widest count badge ("99",
   from `drawBadge`'s own geometry) covers when lit, so the badge never hides them. The envelope
   draws no `strokeCircle`, `fillCircle` or `arc` that closes on itself. **(charter default, G4:
   never a circle in the middle; the owner found the old seal odd, FS-J1672. The knot's distance,
   the cord's gap, the badge's keep-out and the folded corner's choice of a bottom corner are this
   spec's, so the badge stays unchanged, G6, and still hides nothing)**
7. **Line only.** No glyph fills anything, in any colour, idle or hovered, in any world. FS-J1672
   R3 holds for all five icons, the haversack included. **(charter default, G6)**
8. **The greyed Mailbox.** Outside the town, the row draws R6's envelope with the same function, in
   `palette.hudFaint` at 0.6, never brightening, with no badge. **(charter default, G4)**
9. **The haversack.** The Inventory glyph keeps its `f779a9b0` design, parts, size and centre. It
   changes only by being drawn at `GLYPH_LINE_W` (R1). Its box stays inside the slot and the band
   its tests hold today (32–36 px tall, at most 44 wide, centred within 1 px). If the heavier line
   makes a part mush at render scale 1, the slice reports it, and the owner decides in the check
   (R15). The slice does not redraw it. **(charter default, G5)**

#### Unchanged

10. **Everything else stays.** The icons' positions, order, rects and zones, hand cursors,
    `covers`, presses, keys, guards, hover labels, depth, the hover rule (`interactable` at 0.85 →
    `interactableBright` at 1, the greyed Mailbox never brightening), the count badge (its look,
    place, count and rim), the torch glow and its pulse, the envelope's toggle, and the row's
    constructor and `HudCornerDeps`. **(charter default, G6)**
11. **The envelope's draw methods.** `drawEnvelopeLines` calls only `lineStyle`,
    `strokeRoundedRect`, `strokeRect`, `lineBetween`, `beginPath`, `moveTo`, `lineTo`, `arc`,
    `closePath` and `strokePath`, the stroke methods `LetterPanel.test.ts`'s fake graphics knows
    (§ Facts), so that test stays untouched. Its `Pick` type names exactly the ones it uses.
    **(spec: the charter's bounds keep `LetterPanel.test.ts` out, since it pins no envelope op)**
12. **Tokens only.** Every colour is a `palette` token. No raw colour literal, and the lint fence
    passes (ADR-0013, ADR-0025). **(charter bounds)**

#### The record

13. **The guideline says so.** The design guideline's **Corner row** paragraph is updated to what
    the row now is:
    - Menu is a gear with bevelled teeth and a riveted inner ring;
    - Inventory is the haversack, as described now;
    - Character is a hooded, cloaked figure with only shadow under the hood;
    - Party is two such figures;
    - the Mailbox envelope is tied with a diagonal cord and knot, a corner folded over and creases
      at its flap, with no circle in its middle;
    - all five are line glyphs at one 2.25 px width (over the renderer's join threshold) of the
      interactable amber, with nothing filled.

    The rest of the paragraph stays: bare, the press areas and gaps, the greyed `hudFaint`, the
    label, code and tokens, and the ability card above. Its "Added by" note is kept, and FS-QHN87
    is added to it. **(charter bounds)**

#### The check

14. **Screenshots for the owner.** The agent slice renders the corner row as the town shows it:
    the four row icons, plus the town envelope (`MailboxEnvelope`) with a count of 3. It saves:
    - eight PNGs of the whole row: **idle** and **hovered** (every icon drawn hovered, by emitting
      `pointerover` on each zone in turn; the label then names the last), at **render scale 1** and
      **render scale 2**, over a **light ground** (a daylit field's tone) and a **dark ground**
      (`palette.ground`, the town's dusk);
    - two PNGs of the row as a field or a run shows it, with the greyed Mailbox, idle, dark ground,
      at render scale 1 and 2;
    - two enlargements, one per render scale, of the whole idle dark-ground row, scaled up with
      nearest-neighbour (8× at render scale 1, 4× at 2).

    All are at backing resolution with no resampling except the enlargements. The slice lists their
    absolute paths in its issue. The harness is throwaway (§ Bounds). **(charter default, G7; the
    set is the backpack's, § Change R13, widened to every glyph and to the town envelope)**
15. **At most two rounds.** After the screenshots the owner may ask for shape tweaks in at most two
    rounds. Each round changes only this FS's files and re-shoots R14's set. A third request is a
    new change. **(charter default, G7)**

### What this changes in its owners

Where an owner's text below and this FS disagree, this FS wins. The owners' text is not edited.

- **FS-3EBCA R3**: "a line glyph 1.5 px wide", "**Menu** is a gear: a toothed ring round a small
  hub", "**Character** is a bust: a head over the curve of the shoulders", "**Party** is two busts":
  the width is `GLYPH_LINE_W`, 2.25 (R1). Menu is the riveted gear (R3), Character the hooded figure
  (R4), Party two hooded figures (R5). "Drawn in code from palette tokens; no baked art, no emoji,
  no texture file" still holds.
- **FS-3EBCA § Change: The inventory icon is an inked backpack**, as its tweak round 2 built it (the
  line haversack, its tests asserting `{1.5}` widths): the haversack is drawn at `GLYPH_LINE_W`
  (R9). Its design, size and centre are unchanged, and its R4 band still holds. This is not a third
  tweak round of that section (its R14). It is this change.
- **FS-1GZGD R33** ("a line envelope with a small wax seal", as FS-J1672 R7 already reworded it,
  a bare line envelope): the envelope's lines are R6's. The count badge, the pulse and the toggle are
  unchanged (R10).
- **FS-J1672 R2** ("Glyphs unchanged … shape, place in its rect, line width") and its Out of Scope
  line "Redesigning any glyph (D7)": the shapes and the width change as R1–R9 say. The place in the
  rect, the colours and the alphas still hold. **FS-J1672 R3** ("No fill behind a glyph") and **R7**
  ("No seal on the envelope … nothing over" the flap point) hold, now with R6's knot kept off the
  middle.
- **The guideline's Corner row paragraph**: updated (R13).

## User Stories

1. As a player, I want the corner icons to look drawn rather than empty, so that the corner of the
   screen feels made with care.
2. As a player, I want a gear with bevelled teeth and a riveted hub, so that the Menu icon reads
   as a real, worked piece of iron.
3. As a player, I want the Character icon to be a hooded figure like the one I play, so that it
   reads as *me*.
4. As a player, I want no face under the hood, only shadow, so that the figure stays the grim,
   anonymous delver of the game.
5. As a player, I want the Party icon to show two hooded figures, so that it reads as my
   companions, not as a pair of generic busts.
6. As a player, I want the back figure hidden behind the front one with no dark patch, so that no
   piece of an old frame is left on the world.
7. As a player in the town, I want the envelope tied with a cord and a corner folded over, so that
   it looks like a real letter.
8. As a player in the town, I want no circle in the middle of the envelope, so that the old odd
   seal never comes back in another form.
9. As a player in the town, I want the count badge where and as it was, never hiding the cord or
   the fold, so that I still see at a glance how many letters wait.
10. As a player outside the town, I want the greyed envelope drawn the same way in the faint tone,
    so that it still reads as the mailbox and as not pressable.
11. As a player, I want the haversack as it is, only in the row's heavier line, so that the icon I
    just approved stays.
12. As a player, I want sturdier lines, so that the icons hold up over a bright field and a dark
    run.
13. As a player on a high-density screen, I want clean corners with no notches, so that the
    heavier lines look solid.
14. As a player on a plain screen, I want each icon's main shape still to read, so that the extra
    detail never turns the icons to mush at render scale 1.
15. As a player, I want every icon where it was, the same size target, the same key, label and
    hover, so that nothing my hand learned changes.
16. As a player who resizes the window, I want the new glyphs to move with the corner, so that they
    never drift from where I press.
17. As the owner, I want screenshots of the whole row, idle and hovered, at both render scales,
    over light and dark ground, in the town and outside it, so that I can judge the art by eye.
18. As the owner, I want up to two rounds of tweaks, so that the shapes end up right.
19. As a maintainer, I want the line width named once, so that the next glyph uses the same width
    without guessing.
20. As a maintainer, I want the guideline to describe the new glyphs, so that the next icon matches
    them.

## Acceptance Criteria

- [ ] `GLYPH_LINE_W` is exported once from `MailboxEnvelope.ts`, is 2.25, and is the only width
      in every `lineStyle` of the Menu, Inventory, Character and Party graphics and of the
      envelope's lines (town and greyed). The badge's rim is still 1 px.
- [ ] No two `lineBetween` calls of a glyph meet end to end at an angle. Every angled corner of a
      glyph is a vertex inside one path (R2).
- [ ] Menu: one closed outline holds eight teeth, each narrower at its tip than its root. There
      is an inner ring at the hub, and 4–6 small stroked circles are centred on that ring's line,
      evenly spaced.
- [ ] Character: no circle is drawn for a head or a face, and nothing is drawn in the hood's
      opening but its inner curve and at most two short strokes. Its box is within 3 px of today's
      bust's in each dimension, centred within 1 px.
- [ ] Party: two R4 figures at the scales and offsets above. No point of the back figure's strokes
      lies inside the front figure's shape, and the front figure is whole. Its box is within 3 px of
      today's, centred within 1 px.
- [ ] Envelope (town and greyed): no `strokeCircle` or `fillCircle`, and no `arc` closing on
      itself. The flap is one path whose middle vertex is `envelopeFlapPoint`. Two crease strokes
      run inside the flap lines near the top corners. A bottom corner is folded over. A cord runs
      edge to edge on a diagonal, no nearer than 3 px to the flap point, with a knot at least 8 px
      from the flap point and the rect's centre. The envelope's other lines are broken where the
      cord crosses them. Nothing of the cord, the knot or the folded corner is in the "99" badge's
      box.
- [ ] `drawEnvelopeLines` calls only the stroke methods listed in R11. `LetterPanel.test.ts` is
      unchanged and passes.
- [ ] No graphics of the row or the envelope calls a fill op (`FILLS`) for a glyph. The badge's
      ember and the glow's torch are the only fills, as today.
- [ ] Idle, each live glyph is stroked in `interactable` at 0.85 alone. Hovered, `interactableBright`
      at 1 alone. The greyed Mailbox is `hudFaint` at 0.6, unchanged under the pointer.
- [ ] The haversack's ops are as at `f779a9b0` except for the line width. Its box is 32–36 tall,
      at most 44 wide, inside its slot, centred on (969, 681) within 1 px.
- [ ] Zones, hand cursors, `covers`, presses, labels, the badge (place, count, rim, "99" keep-in),
      the glow and the pulse pass their existing tests unchanged. Every glyph follows a
      `relayout` to 1280.
- [ ] The guideline's Corner row paragraph reads as R13 and cites FS-QHN87.
- [ ] The twelve PNGs of R14 exist, and their absolute paths are listed in the agent slice's issue.
      No harness file is committed.
- [ ] No raw colour literal. `npx vitest run --maxWorkers=4 --minWorkers=1`,
      `npx tsc --noEmit -p .` and `npm run lint` pass in `game-client`.

**By eye (the owner, from the screenshots):**

- [ ] The row no longer feels empty. Each glyph reads as what it is (gear, haversack, hooded
      figure, two hooded figures, tied envelope) at render scale 2, and its main shape at 1.
- [ ] No corner shows a notch at render scale 2. No icon reads as a filled blob at 1.
- [ ] The envelope has nothing that reads as a circle in its middle, and the badge hides none of
      its cord, knot or fold.
- [ ] Tweak rounds: at most two (R15). The owner approves the row.

## Edge States

- **Render scale 1:** rivets, creases, the knot and the hood's inner strokes may merge. The gear's
  teeth, the hood's peak, the envelope's flap and cord must still read. If rivets merge, R3 drops to
  4. Anything else that mushes is reported, and the owner decides (R15).
- **Translucent strokes:** idle ink is at 0.85 and the greyed Mailbox at 0.6. Where a path's
  segment and join quads overlap, the line may show slightly denser at its corners. The screenshots
  show it, and the owner judges. No alpha changes (R10).
- **The badge lit:** it sits over the envelope's top-right corner as today. No part of R6's cord,
  knot or folded corner is under it.
- **More than 99 waiting:** the badge reads "99" and is at its widest. R6's keep-out is that box.
- **Hovered:** only the ink and the alpha change. Every point is where it was (as the haversack's
  test already asserts for itself).
- **The ESC menu open:** the icons take no hover (FS-3EBCA R18), so they stay idle-drawn.
- **Outside the town:** the greyed Mailbox is R6's envelope in `hudFaint` at 0.6. No badge, no
  press.
- **A resize:** every glyph, zone, the badge and the glow move with the corner, as before.

## Out of Scope

- Plates, backings, halos, outlines or fills behind any glyph (the owner chose richer glyphs
  instead; FS-J1672 R1, R3, R6 hold).
- Any change to the haversack beyond the line width.
- Any change to the count badge, the glow, the pulse, the letter panel, `drawWaxSeal` or the
  letter list's unread dot.
- Positions, rects, order, spacing, keys, labels, cursors and any scene's wiring.
- A new palette token, or any change to `canvasPalette.ts` or `theme.ts`.
- Baked art, images, textures, or anything under `public/art` or `tools/bake`.
- `game-client/CONTEXT.md`: its **Corner row** entry ("Character (a bust)") stays true of a
  hooded head-and-shoulders figure.
- Any server, proto, gateway or contract change.
