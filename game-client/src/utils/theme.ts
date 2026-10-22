/**
 * The Age of Barrowspire — barrow-dark palette.
 *
 * Single source of truth for the gothic dungeon look. Torch-lit, barrow-deep,
 * grim: cold ambient darkness with warm torch pools as the only real light.
 * Presentation only — no game state, no logic.
 *
 * Each colour is exposed twice: `hex` (CSS strings) and `num` (Phaser 0x ints).
 *
 * Two palettes live in this file (ADR-0025). `BARROW` / `BARROW_HEX` are the
 * GAME palette, read only by Phaser code. `UI` at the bottom is the web UI
 * palette (Bone & Soot), read only by DOM code, and it mirrors globals.css
 * :root. The two are not required to agree, and neither reads the other.
 *
 * One seam crosses: the canvas MENUS (MainMenuScene, CharacterCreationScene,
 * LoadoutScene and src/ui/menuChrome.ts) wear the site's Bone & Soot look, so
 * the gate into the game matches the web UI. Phaser still never reads `UI`:
 * the `menu*` entries below are game-palette tokens that MIRROR the matching
 * globals.css :root values, and must agree with them. Everything past the
 * menus (hub, run, HUD, baked art) stays on the barrow ramp.
 */

export const BARROW = {
  // Base dark — warm umber/stone. Dark, never black: see the contrast
  // floor in docs/design-guideline.md. Must match globals.css :root.
  charcoal: "#1c1613",
  umber: "#241d17",
  pitch: "#100c0a",

  // Stone — cold slate
  slate: "#3a3d42",
  slateLight: "#52555c",

  // Earth / barrow — muted browns
  barrowBrown: "#5a4632",
  barrowDeep: "#3e2f22",

  // Torchlight — the only warmth
  amber: "#e8a14d",
  amberBright: "#f2b866",
  ember: "#c2611f",

  // Arcane / Lich corruption — sickly green, necrotic blue-green
  arcane: "#6f8f4a",
  arcaneDeep: "#3c5a36",
  necrotic: "#688b8f",

  // Blood / danger — oxblood
  oxblood: "#6e1f1f",
  /* Oxblood is a fill; on a dark ground it is unreadable AS text, so error
     copy uses this lifted tone from the same family. */
  oxbloodText: "#c96b5e",

  // Parchment — UI surfaces. vellumDark carries labels at 5.52:1 on charcoal.
  vellum: "#cdbf9a",
  vellumDark: "#9b8e6a",
  vellumFaint: "#8d8362",
  placeholder: "#6b6349",
  ink: "#1c1712",

  // Brass / bronze accents
  brass: "#9c7b3f",
  brassBright: "#c9a14e",

  // Rarity: the one tier colour no other role owns (the rest of the ramp is arcane, necrotic,
  // brass and amber-bright). Must match globals.css --rarity-common.
  rarityCommon: "#a2946d",

  // Menu chrome: Bone & Soot, mirroring globals.css :root token for token (see the header).
  // Read only by the canvas menus, through `palette.menu` in canvasPalette.ts.
  menuBone: "#e9dfc9", //         --color-primary (the torch)
  menuBoneBright: "#f6efdf", //   --color-primary-bright
  menuAsh: "#8c8c84", //          --color-accent (secondary, cancel, subtitle)
  menuDangerText: "#d07a6a", //   --color-danger-text
  menuSoot: "#121212", //         --color-bg-dark
  menuSootDeep: "#0a0a0a", //     --color-bg-darker
  menuStone: "#1b1b1a", //        --color-bg-card-opaque
  menuStoneRaised: "#242322", //  --color-bg-card-2-opaque
  menuIron: "#5c5a55", //         --color-brass (iron: structure)
  menuIronBright: "#8a8780", //   --color-brass-bright
  menuText: "#cfc9bb", //         --color-text
  menuTextDim: "#9b968b", //      --color-text-dim
  menuTextMuted: "#85817a", //    --color-text-muted
  menuTextFaint: "#5e5b55", //    --color-text-placeholder
} as const;

/** Phaser 0x integer forms of the same palette. */
export const BARROW_HEX = {
  charcoal: 0x1c1613,
  umber: 0x241d17,
  pitch: 0x100c0a,
  slate: 0x3a3d42,
  slateLight: 0x52555c,
  barrowBrown: 0x5a4632,
  barrowDeep: 0x3e2f22,
  amber: 0xe8a14d,
  amberBright: 0xf2b866,
  ember: 0xc2611f,
  arcane: 0x6f8f4a,
  arcaneDeep: 0x3c5a36,
  necrotic: 0x688b8f,
  oxblood: 0x6e1f1f,
  oxbloodText: 0xc96b5e,
  vellum: 0xcdbf9a,
  vellumDark: 0x9b8e6a,
  vellumFaint: 0x8d8362,
  placeholder: 0x6b6349,
  ink: 0x1c1712,
  brass: 0x9c7b3f,
  brassBright: 0xc9a14e,
  rarityCommon: 0xa2946d,
  menuBone: 0xe9dfc9,
  menuBoneBright: 0xf6efdf,
  menuAsh: 0x8c8c84,
  menuDangerText: 0xd07a6a,
  menuSoot: 0x121212,
  menuSootDeep: 0x0a0a0a,
  menuStone: 0x1b1b1a,
  menuStoneRaised: 0x242322,
  menuIron: 0x5c5a55,
  menuIronBright: 0x8a8780,
  menuText: 0xcfc9bb,
  menuTextDim: 0x9b968b,
  menuTextMuted: 0x85817a,
  menuTextFaint: 0x5e5b55,
} as const;

/**
 * The web UI palette (Bone & Soot) as CSS strings, for DOM code that cannot
 * read a CSS variable: Stripe Elements renders in a cross-origin iframe, and a
 * 2D canvas takes a literal fillStyle.
 *
 * ADR-0025: this table MIRRORS `globals.css` `:root` and must agree with it,
 * token for token. Change a value in both places or in neither. It is a
 * separate palette from `BARROW` / `BARROW_HEX` above: DOM code reads `UI`,
 * never `BARROW`, and Phaser code reads `BARROW`, never `UI`. Values and
 * contrast figures: docs/design-guideline.md Part II.
 *
 * `:root` derives the borders and focus ring with color-mix(); the strings
 * here are the same colours written out, because color-mix(in srgb, X p%,
 * transparent) is exactly X at alpha p.
 */
export const UI = {
  // Torch: bone. Text on a bone fill is bgDark.
  primary: "#e9dfc9", //              --color-primary
  primaryBright: "#f6efdf", //        --color-primary-bright
  accent: "#8c8c84", //               --color-accent (ash grey)
  danger: "#6e1f1f", //               --color-danger (oxblood fill)
  dangerText: "#d07a6a", //           --color-danger-text

  // Surfaces: soot and grey stone
  bgDark: "#121212", //               --color-bg-dark
  bgDarker: "#0a0a0a", //             --color-bg-darker
  bgCard: "rgba(28, 28, 27, 0.88)", //   --color-bg-card
  bgCard2: "rgba(38, 37, 35, 0.92)", //  --color-bg-card-2
  bgCardOpaque: "#1b1b1a", //         --color-bg-card-opaque
  bgCard2Opaque: "#242322", //        --color-bg-card-2-opaque
  bgWell: "#0a0a0a", //               --color-bg-well
  bgInset: "#0e0e0e", //              --color-bg-inset
  bgDropdown: "#070707", //           --color-bg-dropdown

  // Iron: structure ("brass" is the role name, not the hue)
  brass: "#5c5a55", //                --color-brass
  brassBright: "#8a8780", //          --color-brass-bright
  border: "rgba(92, 90, 85, 0.3)", //         --color-border (brass 30%)
  borderStrong: "rgba(92, 90, 85, 0.6)", //   --color-border-strong (brass 60%)
  focusRing: "0 0 0 2px rgba(138, 135, 128, 0.7)", // --focus-ring (brass-bright 70%)

  // Text
  text: "#cfc9bb", //                 --color-text
  textDim: "#9b968b", //              --color-text-dim
  textMuted: "#85817a", //            --color-text-muted
  textPlaceholder: "#5e5b55", //      --color-text-placeholder
} as const;
