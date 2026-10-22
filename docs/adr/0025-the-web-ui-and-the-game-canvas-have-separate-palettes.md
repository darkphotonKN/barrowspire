# ADR-0025 — The web UI and the game canvas have separate palettes

Status: accepted
Date: 2026-10-21
Scope: `game-client`, both the DOM styling layer (`src/app/globals.css`, components) and the
Phaser layer (`src/scenes/**`, `src/render/**`)
Amends: [ADR-0013](0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md),
only the clause that the two definition sites are "the same palette in two forms" and "must agree"

## Context

ADR-0013 made client colour token-only and named two definition sites: the `globals.css` `:root`
block for the DOM and the `BARROW` / `BARROW_HEX` tables in `src/utils/theme.ts` for Phaser. It
also declared them one palette in two forms, structurally forced to stay in sync. That held
while the web platform and the canvas shared one look: the torch-lit barrow ramp, with amber as
the torch.

The canvas has since gone much deeper into that ramp. The lighting, floor lights, hit, smoke,
death and escape effects, and the baked art manifest all read `BARROW_HEX`, and the torch-amber
light pool is how the game reads as a barrow at all. The web platform has different work to do.
It is menus, marketing copy, a marketplace and forms, viewed for long stretches, and the amber
torch on warm umber read as busy there.

On 2026-10-21 Kranti compared 18 palettes live on the home page and chose **Bone & Soot** for the
web UI: bone (`#e9dfc9`) as the torch on soot (`#121212`), with grey stone frames. He also chose
the **Atmosphere** layer, which is a gradient-filled hero title, a hero glow tinted by the torch
colour, and a page vignette. He kept the game canvas as it is. Under ADR-0013's sync clause that
combination is not allowed. Either the canvas goes bone and grey, which throws away its lighting
model, or the web UI stays amber, which throws away the choice.

> Recorded without adversarial review. The choice came from a visual comparison, not a grill.

## Decision

**The web UI and the game canvas are two palettes. They are no longer required to agree.**

- **The UI palette** is defined in `globals.css` `:root`. Where DOM code needs the same values as
  JS strings (Stripe Elements' `appearance`, for example), they come from a separate UI table in
  `src/utils/theme.ts` that mirrors `:root`. **Those two must agree with each other.**
- **The game palette** is `BARROW` / `BARROW_HEX` in `src/utils/theme.ts`, read only by Phaser
  code. It does not track the UI palette.
- **DOM code never reads `BARROW`, and Phaser code never reads the UI table.** Crossing that
  boundary would bring back the coupling this ADR removes, just with no rule left to notice it.
- **The Atmosphere layer is derived from tokens.** Its gradients, glows and vignette are built
  from `var(--color-*)` (for example with `color-mix()`), so it adds no new raw values. A palette
  change carries the Atmosphere with it.
- **The rest of ADR-0013 stands unchanged.** Colour stays token-only, raw hex stays confined to
  the definition sites, and the fence must still be watched to reject.

## Consequences

- The web UI can change its look without touching the canvas, and the reverse. A UI reskin no
  longer needs a lighting or art pass, and an art pass no longer recolours the marketplace.
- Moving from the web UI into the game becomes a deliberate change of register, from bone-and-soot
  menus into the torch-lit barrow. That is the intended read. It does mean the two palettes need
  care at the seams: the header and any UI drawn over the canvas (HUD, satchel, overlays) belong
  to one palette or the other, and each surface has to say which.
- **Cost: there are now three tables to keep honest instead of two.** `:root` and the UI table
  must agree, and nothing forces it except review. The fence proves every colour came from *a*
  palette. It cannot prove it came from the *right* one.
- **Cost: the design guideline has to carry two palettes.** Its single torch-amber ramp, the
  "torch is amber" rule, and the token table split into a UI section and a game section. The
  "one torch per view" rule survives in both, with a different torch colour in each.
- **Cost: existing DOM consumers of `BARROW` have to migrate** to the UI table. The subscription
  page's Stripe theming is the known one, and there may be others.
