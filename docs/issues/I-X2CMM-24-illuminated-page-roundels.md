---
id: I-X2CMM-24
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-13"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 24: illuminated page roundels (ADR-0095 inks) and the re-rendered contact sheet"
---
Implements FS-X2CMM §Change: Illuminated pages and the open tome (C1, C2, C8, C9)

**Author: agent**

**Styling only: no `/code-review` gate** (the owner's standing art rule; FS §Change says so).

## What to Build

ADR-0095 in `src/ui/pageRoundel.ts`: change `roundelInk` and add the ground layer; the 14
pictures in `src/ui/pageIcons.ts` stay as drawn.

- Ground: the page's pigment as a soft radial (pigment at cx 50 %, cy 35 %; `shade(pigment,
  0.35)` at the rim). Body bone (`pigmentBone`, alpha 1). Detail `shade(pigment, 0.55)`. Rim the
  HUD bronze at about 0.08 of the size, lifting to `brassBright` on hover. Hovered: ground centre
  `mix(pigment, bone, 0.15)`. Locked: flat warm near-ink ground (a new token, about `#2a2320`),
  body `hudFaint` at the greyed alpha, detail the ground colour, rim unlit. Dim: every layer sinks
  toward the ground. Recovering: ready under the sweep.
- New tones are `BARROW`/`BARROW_HEX` tokens read only through `palette.bookPigment`.
- The cast bar's 28 px roundel takes the new inks for free (same renderer); check it.
- Re-render `docs/art/class-book-pages-contact-sheet.png` (all 14, ready / locked / recovering /
  hovered / dim, 44 and 28 px, render scales 1, 1.5, 2). The slice-9 render script was left in a
  scratchpad: rebuild it, and this time commit it under `game-client/tools/` (e.g.
  `tools/contact/pageRoundels.mjs`) with an npm script, so later variants can re-render. Look at
  the PNG and iterate until bone on pigment reads at 28 px.
- Update the gallery card.

## Acceptance Criteria

- [ ] `roundelInk` and the ground follow ADR-0095 in every state; unit tests cover the mapping.
- [ ] The contact sheet is re-rendered at the same path; its script is committed.
- [ ] Client suites green.

## Blocked By

I-X2CMM-13

## Spec Reference

FS-X2CMM §Change: Illuminated pages and the open tome, C1, C2, C8, C9; ADR-0095.
