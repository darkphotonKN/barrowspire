# ADR-0087 — The web UI palette is Barrow Vellum, and the canvas menus keep Bone & Soot

Status: accepted
Date: 2026-11-21
Scope: `game-client`'s web UI palette (`src/app/globals.css` `:root` and the `UI` table in
`src/utils/theme.ts`), and the canvas menus' `menu*` tokens in `BARROW` / `BARROW_HEX`
Amends: [ADR-0025](0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md). Its Decision
stands: the web UI and the game canvas remain two palettes, and neither reads the other's table.
This ADR replaces the palette ADR-0025 put on the web (Bone & Soot, its Context) and ends the
rule that the canvas menus mirror the web's `:root`.

## Context

ADR-0025 split the web UI from the canvas so the web could leave torch amber on warm umber, which
read as busy on pages people look at for long stretches. The web took Bone & Soot: bone on
neutral soot, grey iron frames. The canvas menus (loading screen, main menu, character creation)
were treated as the gate into the game, so they wore Bone & Soot too, through `menu*` tokens that
had to match `:root` value for value, enforced by `menuChrome.test.ts`.

On 2026-11-21 Kranti saw comparison pages in the game's own barrow colours (vellum text on
charcoal, umber panels, brass rules, no amber) and liked them. Four palettes were rendered on the
real home page, Bazaar, login, register and profile pages at 375px and 1280px, through a
throwaway `:root` override with fixture data:

- A, Bone & Soot (today)
- B, vellum text and brass on soot
- C, Barrow Vellum with the game's gold `brassBright` `#c9a14e`
- D, Barrow Vellum with brass only on rules and frames

One finding shaped the choice. `--color-brass-bright` is a text colour as well as a structure
colour: the logo accent, the home section titles, the auth footer links, every "Sign in to bid"
in the Bazaar, the active filter chips and the verified badge. With the game's gold there, B and
C brought back the amber busyness that ADR-0025 removed. D keeps those vellum. Kranti picked D.

> Recorded without adversarial review. The choice came from a visual comparison, not a grill.

## Decision

1. **The web UI palette is Barrow Vellum.** Its text is the game's vellum ramp (text `#cdbf9a`,
   dim `#9b8e6a`, muted `#8d8362`, placeholder `#6b6349`). The page is charcoal `#161310`, the
   panels umber (`#1f1a15` and `#241d17`, translucent), and the structure brass `#9c7b3f`. There
   is no amber. The torch, one per view, is a lifted vellum `#e6d8b0`.
2. **`--color-brass-bright` is vellum `#cdbf9a`, not the game's gold `brassBright`.** It colours
   text, so gold there would not stay a rule. Brass as a hue lives in the hairlines, dividers and
   frames (`--color-brass`). The token names are unchanged, and "brass" names a real brass again.
3. **The canvas menus keep Bone & Soot as their own values.** The `menu*` entries of `BARROW` /
   `BARROW_HEX` keep the Bone & Soot values and no longer mirror `:root`. Their comments name the
   web token each one held, so they double as the record of the old web palette for a swap-back.
4. **Every text token clears 4.5:1 on the page and on the card.** Measured against charcoal: text
   10.15, dim 5.70, muted 4.90, brass-bright 10.15. On the raised panel muted is 4.45, the same
   kind of gap Bone & Soot had there (4.05).

The rest of ADR-0025 and ADR-0013 stands: colour is token-only, raw hex stays in the definition
sites, and `:root` and the `UI` table must agree.

## Consequences

- The web UI and the game now share their materials: vellum, umber and brass. They still differ
  in the torch. The canvas lights with amber, and the web marks its one focal thing with vellum.
  Going from the site into a delve is no longer a change of register, only of light.
- The canvas menus now differ from the site. Going from the web into the main menu goes from
  umber and vellum to soot and bone. That is accepted for now. Moving the menus to Barrow Vellum
  later is a value change to the `menu*` tokens alone.
- **Swap-back is a value edit.** The design guideline, Part II "Former palette: Bone & Soot",
  keeps the whole Bone & Soot `:root` block, token for token. Restoring it is that block back
  into `:root` and the `UI` table, and nothing else.
- `menuChrome.test.ts` no longer checks the menus against `:root`. It checks that `BARROW` and
  `BARROW_HEX` agree. Nothing now ties the menus to the site, which is the point.
- The material layer (surface gradients, carved edges, grain) keeps its neutral-white highlights
  from Bone & Soot. On umber they read a little cooler than the amber-era warm cast. That is left
  as it is unless it shows.
