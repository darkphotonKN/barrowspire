# ADR-0094 — Class book page icons are muted pigment glyphs in bronze-rimmed roundels

Status: accepted
Date: 2026-11-25
Scope: `game-client`, the page icons of a class book (FS-X2CMM): the 14 pages of the Spellbook,
the Hunter's Journal, The Ledger and Scars, wherever a page is drawn (the book panel, the cast
bar). Not the corner row, the ability bar or any other canvas HUD icon: those stay bronze
knockouts (ADR-0080). Not item icons (ADR-0020).
Amends: [ADR-0080](0080-canvas-hud-icons-are-embossed-bronze-knockouts-from-one-shared-renderer.md) —
the Shape and Colour clauses, for class book page icons only
Realized by: [FS-X2CMM](../specs/X2CMM-class-books.md)
Builds on: [ADR-0013](0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)
(tokens only), [ADR-0025](0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the
canvas palette), [ADR-0021](0021-characters-are-authored-in-code-not-sourced.md) (art is built in code)

## Context

Class books (FS-X2CMM) add 14 page icons that sit together in a panel. The owner gave a
spellbook grid as the reference and asked to "learn from the example but colour it in our
serious Ultima-like vibe" (2026-11-25). The reference reads because each spell is a coloured
picture on a small disc: in a grid of a dozen entries, colour is what finds a page at a glance.

ADR-0080 makes every canvas HUD icon a single-colour bronze knockout. That is right for the
corner row and the ability bar, where three to six controls each mean one thing and must not
compete with the world. It is wrong for a book: 14 bronze silhouettes in one grid read as one
grey-gold texture, and the player has to read shapes alone to find Recall among the Spellbook's
five. The owner's reference is coloured; the knockouts are not.

The register still has to stay "serious Ultima-like": no saturated game-UI colours, no glow, no
gradient candy. Ultima's spell and reagent art used earth and mineral pigments on dark grounds,
which is the vocabulary the barrow palette already speaks (vellum, brass, oxblood, verdigris).

The decision was a charter default approved by the owner with the rest of the class books
scoping on 2026-11-25. Recorded without adversarial review: no `challenge-me` pass was run.

## Decision

A class book page icon is a **muted pigment glyph inside a bronze-rimmed roundel**, drawn in
code by one shared page-icon renderer (beside `src/ui/knockout.ts`, reusing its supersampling).

- **Roundel:** a disc of dark ground (`palette.ink` family) with a bronze rim, the same bronze as
  ADR-0080 (`mix(palette.frame, palette.interactable, 0.5)`). The rim carries ADR-0080's emboss
  (a drop shadow, a top-lit tint). The rim is what makes the 14 a family with the HUD.
- **Glyph:** a filled picture inside the disc, painted in **one main pigment plus bone** for
  highlights and detail. Flat fills with a few bone strokes; no gradients inside the glyph, no
  glow, no outlines thicker than the cuts.
- **Pigments:** five muted mineral tones, added to `BARROW` / `BARROW_HEX` as their own tokens and
  read only through `palette.bookPigment`: **verdigris**, **ochre**, **madder**, **lapis** and
  **bone**. Each page takes the pigment of what it does (light and finding: ochre; movement and
  air: lapis; binding and blood: madder; growth, beasts and cures: verdigris), not of its class,
  so the colour carries meaning across books. Bone is the shared highlight pigment and never a
  main pigment. No pigment is saturated past the barrow ramp's own (verdigris `#5fa88a` is the
  ceiling).
- **Rendering:** into a texture at 2× the render scale, shown at 1/(2×scale), rebuilt on a
  render-scale change, as ADR-0080.
- **Locked:** the same roundel with the glyph flattened to `hudFaint` at 0.6 and the rim unlit.
  Never coloured.
- **Not ready** (on cooldown, short of cost): the glyph keeps its pigment under a dark cooldown
  sweep; short of cost dims it. It never brightens.
- **Hover:** the rim's tint lifts and alpha goes to 1, as ADR-0080.
- **Fallback:** where the texture cannot be made, the page draws its glyph as a 2.25 px line in
  its main pigment. A page is never blank.

## Consequences

- **The book is the one coloured family on the canvas HUD.** Every other HUD icon stays bronze
  knockout; a coloured corner icon or ability square is still wrong by ADR-0080. The book's own
  corner icon (the one that opens it) is a bronze knockout, not a roundel.
- **Five new tokens** (`pigmentVerdigris`, `pigmentOchre`, `pigmentMadder`, `pigmentLapis`,
  `pigmentBone`), named by what they are, read only by the page-icon renderer. The fence
  (ADR-0013) keeps the glyphs off raw hex.
- **A new page picks a pigment by what it does.** A future page that fits none of the four
  meanings is a reason to revisit this list, not to add a sixth colour in passing.
- **The glyphs carry more detail than knockouts** (two colours, strokes), so they are drawn for a
  roundel of about 40–48 px in the panel and must still read at 28 px on the cast bar. Check at
  render scale 1, 1.5 and 2, as ADR-0080 asks.
- **Art gate:** a contact sheet of all 14 roundels, locked, ready, on cooldown and hovered, is
  shown before the icons are wired into the panel.
