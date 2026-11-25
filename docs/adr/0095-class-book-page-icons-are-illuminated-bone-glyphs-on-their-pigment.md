# ADR-0095 — Class book page icons are illuminated: bone glyphs on a ground of their pigment

Status: accepted
Date: 2026-11-25
Scope: `game-client`, the class book page icons (FS-X2CMM), wherever a page roundel is drawn (the
book, the cast bar). Nothing else on the canvas HUD.
Amends: [ADR-0094](0094-class-book-page-icons-are-muted-pigment-glyphs-in-bronze-rimmed-roundels.md) —
the Roundel, Glyph, Locked and Hover clauses (the inks); its pigments, its pigment-by-what-it-does
rule, its renderer, its rendering and its fallback stand
Realized by: [FS-X2CMM](../specs/X2CMM-class-books.md) § Change: Illuminated pages and the open tome

## Context

ADR-0094 drew each page as a pigment glyph on a dark ground in a bronze rim, and the first
contact sheet (`docs/art/class-book-pages-contact-sheet.png`) was made in that look. The owner
then compared variants of the icons and the book panel in a separate `/variants` round and picked
"Illuminated" for the icons (2026-11-25, relayed by the coordinating session): the pigment fills
the disc and the picture is bone, as in an illuminated manuscript's initials. Against the dark
run, a coloured disc finds a page faster than a coloured line on black, and the bone picture
keeps the serious register (no saturated colour, no glow).

Recorded without adversarial review: no `challenge-me` pass was run.

## Decision

A page roundel inverts ADR-0094's inks. The 14 pictures, their pigments and the shared renderer
are unchanged; only the inks change.

- **Ground:** the page's own pigment, a soft radial: the pigment at the centre top (cx 50 %,
  cy 35 %), falling to `shade(pigment, 0.35)` at the rim. Not `palette.ink`.
- **Glyph body:** bone (`pigmentBone`) at alpha 1.
- **Glyph detail** (ADR-0094's bone layer): `shade(pigment, 0.55)`, so it reads as dark cuts in
  the bone.
- **Rim:** the HUD bronze, a little thicker (about 0.08 of the size, was 0.075), lifting to
  `brassBright` on hover.
- **Hovered:** the ground's centre lifts to `mix(pigment, bone, 0.15)`.
- **Locked:** a flat warm near-ink ground (a token, about `#2a2320`); the body `hudFaint` at the
  greyed alpha; the detail the ground's colour; the rim unlit. Never coloured.
- **Dim** (short of cost or spent): every layer sinks toward the ground, as before.
- **Recovering:** as ready, under the existing sweep.
- The new tones are tokens (ADR-0013), read only through `palette.bookPigment`.

## Consequences

- **The change is inks, not drawings.** `roundelInk` and the ground layer change; the 14 pictures
  in `pageIcons.ts` stay. A later variant is again an ink change in the same place.
- **The contact sheet is re-rendered** in the new inks and replaces the old one at the same path.
- **The book is still the one coloured family on the canvas HUD** (ADR-0094); every other HUD
  icon stays a bronze knockout (ADR-0080).
- **Bone on pigment is lighter than ADR-0094's glyphs,** so the cooldown sweep's dark wedge reads
  more strongly; no change to the sweep.
