# ADR-0080 — Canvas HUD icons are embossed bronze knockouts, drawn by one shared renderer

Status: accepted
Date: 2026-11-13
Scope: icons and badges drawn on the game canvas as HUD controls: the corner row today, and any
HUD icon or badge added later. Not item icons (baked art, ADR-0020), not the web UI's Heroicons
(ADR-0025), not the count badge's numerals or the minimap's marks.
Specified by: [FS-7TQN4](../specs/7TQN4-knockout-corner-row.md) (the whole corner row is
knockout), [FS-S8Z2Y](../specs/S8Z2Y-embossed-corner-row.md) (the emboss),
[FS-3EBCA](../specs/3EBCA-hud-corner-icons.md) § Change: The inventory icon is a bronze knockout
rucksack.
Builds on: [ADR-0013](0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)
(tokens only), [ADR-0025](0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the
canvas is on the game palette), [ADR-0057](0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md)
(Phaser 4, render scale).

## Context

The owner's decision on 2026-11-13, after seeing the finished corner row in the game:
「icon看起來可以 之後有新的徽章都照著個設計方式」 (the icons look right; every new badge follows this
design). Recorded without adversarial review: no `challenge-me` pass was run.

The style was found by elimination over one day, and each rejected step is part of the reason:

- **Carved plates** behind amber line glyphs (FS-3EBCA) were removed as frames the owner did not
  want (FS-J1672).
- **Bare line glyphs**, then **richer line glyphs** at 2.25 px (FS-QHN87), read as 「空」 (empty)
  in the row: thin lines carry little weight at 26–36 px.
- **A baked, realistic backpack** (the item-icon pipeline, ADR-0020) was judged the wrong style
  for the HUD.
- **An inked illustration** (heavy outline, flat fills, hatching) read as cartoonish.
- **A knockout** (a solid silhouette with its inner lines cut through to the ground) read as a
  stamped bronze badge, fitting the dark, old-European register. It reads well at small sizes,
  because a filled shape carries more than a line.
- **One solid icon among line glyphs** over-weighted that icon, so the whole row went knockout.
  The row as a family is what reads right.
- **Emboss** (a drop shadow and a top-lit gradient) gave the badges depth. **Engraved rims** on the
  cuts were tried and dropped: they mush at render scale 1.

The technique has constraints of its own:

- A Phaser render texture gets no antialiasing, so it is drawn at 2× the render scale and shown
  down-scaled.
- Phaser joins stroke corners only above 2 px, so cuts are drawn in texel coordinates.
- A multiply tint cannot light a texel above its own colour, which bounds what a gradient can do.

## Decision

Every canvas HUD icon or badge is a **bronze knockout**, drawn in code through the **one shared
knockout renderer** (`game-client/src/ui/knockout.ts`). No icon gets its own drawing pipeline.

- **Shape:** a solid silhouette. Its inner lines are **cut out** so the ground shows through:
  about 1.6 px, drawn in texel coordinates so every corner joins. Detail lives in the silhouette
  and the cuts, not in strokes or fills.
- **Colour:** bronze, `mix(palette.frame, palette.interactable, 0.5)`, at alpha 0.85. Tokens only.
- **Rendering:** into a texture at 2× the render scale, shown at 1/(2×scale). Rebuilt when the
  render scale changes; a relayout only moves it.
- **Emboss:**
  - a drop shadow, the silhouette in `palette.ink` at about 0.5, offset about 1 px down-right;
  - a top-lit corner-tint gradient: the top lifted toward `interactableBright` by about 25%, the
    foot shaded by about 20%.
  
  No engraved rims.
- **Hover:** the gradient lifts and alpha goes to 1. The shadow stays put.
- **Unavailable:** the same knockout, flat in `hudFaint` at 0.6, with the shadow and no gradient.
  It never brightens (an amber thing the player cannot act on is a defect).
- **Fallback:** where the texture cannot be made, the icon falls back to a 2.25 px line glyph,
  with no emboss. A slot is never empty.

## Consequences

- **A new icon is designed as a silhouette plus cuts**, not as a line drawing. Its design has to
  survive render scale 1:
  - features under about 3 px become specks;
  - cuts under about 1.5 px vanish;
  - two cuts close together read as a face. This happened with the gorget and seams, and it was
    cut.
  
  Check it in screenshots at render scale 1, 1.5 and 2 before shipping.
- **One renderer to change.** A fix to the shadow, gradient, supersampling or rebuild lands on
  every icon at once. A new icon supplies only its silhouette, its cuts and its line fallback.
- **Cost:** one small texture per icon, plus a shadow image. Each is rebuilt only on a
  render-scale change.
- **Heavier than line glyphs.** A canvas HUD icon added in the old line style would now be the
  odd one out, and is wrong by this decision.
- **The line glyphs live on only as the fallback.** Each icon keeps one, and it must stay
  legible, but it is not the design.
- **Follow-up for the design guideline owner:** `game-client/docs/design-guideline.md`'s Corner
  row paragraph describes the current icons. It should also state this rule for every new canvas
  HUD icon and point here. Until it does, this ADR is the rule.
