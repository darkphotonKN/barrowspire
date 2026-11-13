# game-client

## Visuals

`docs/design-guideline.md` decides every visual question: canvas art, sprites, animation,
fonts, colour, lighting, UI chrome, layout. Read the part you need before changing how anything
looks. If this file and the guideline disagree, the guideline wins.

Three rules that catch people out:

- Two palettes ([ADR-0025](../docs/adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md)).
  DOM code uses Bone & Soot from `globals.css` and the `UI` table in `src/utils/theme.ts`.
  Phaser code uses the barrow ramp in `BARROW` / `BARROW_HEX`, named by what a thing is through
  `palette` in `src/utils/canvasPalette.ts` (`palette.door`, not `BARROW_HEX.slate`). Neither
  side reads the other's. The canvas menus are the exception: they read `palette.menu`.
- Tokens only, no raw hex ([ADR-0013](../docs/adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)).
  Lint rejects colour literals. Fonts are `var(--font-heading)` / `var(--font-body)`, never a
  face name.
- Phaser 4 masks go through `maskInView` only ([ADR-0057](../docs/adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md)).

## Wording

Copy is medieval barrow-delve: terse, grim, dread and rumour. Never sci-fi.

- Players are **players**, not operators, users or delvers. The enemy is the **Spire** and its
  **Lich Lord**.
- Play/Start → "Delve"; queue → "Gather the delve"; loot → "plunder", container → "coffer";
  escape → "escape the barrow"; death is grim ("Few return whole").
- Never: "operator", "uplink", "deploy", "the void", "Sector", "extraction".
- Login is "Speak Your Name", Register is "Take the Oath". "MAIN MENU" stays as it is until a
  named hub exists.
- No emoji in the UI.

## Dev gallery

`/dev/gallery` (dev builds only) shows the reusable visual pieces. Check it before building a
new one. A change that adds to a tracked family (listed in `src/dev/gallery/families.ts`) adds
its gallery card in the same change.
