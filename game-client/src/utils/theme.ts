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
 * palette (Barrow Vellum, ADR-0087), read only by DOM code, and it mirrors
 * globals.css :root. The two are not required to agree, and neither reads the
 * other.
 *
 * The canvas MENUS (PreloadScene, MainMenuScene, CharacterCreationScene and
 * src/ui/menuChrome.ts) wear Bone & Soot, the web palette from 2026-10-21 to
 * 2026-11-21, through the `menu*` entries below. Since ADR-0087 those are their
 * own values and no longer mirror globals.css :root. Everything past the menus
 * (hub, run, HUD, baked art) stays on the barrow ramp.
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
  // Fire's temperature ramp around `ember`, hottest first (FS-PQ2TW, the owner's "火的顏色有辦法擬真一點嗎"):
  // fire effects only, never an interactable (that is amber).
  fireCore: "#f5d98f",
  fireHot: "#ea7f26",
  fireDeep: "#8a2913",

  // Arcane / Lich corruption — sickly green, necrotic blue-green
  arcane: "#6f8f4a",
  arcaneDeep: "#3c5a36",
  necrotic: "#688b8f",

  // Umbra — shadow magic, the archer's Shadow Shot (FS-JTNPR req 20–22). A dusk violet, dim and
  // desaturated, so a shadow reads by hue against the brown barrow floor where dark smoke alone
  // would vanish. The deep tone is the shadow's body; the lifted one its edge and the aim arrow.
  umbra: "#3f3452",
  umbraLight: "#7d6c99",

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

  // Rarity: the tier colours no other role owns (Uncommon and Rare are arcane and necrotic). Must
  // match globals.css --rarity-common, --rarity-epic and --rarity-legendary.
  rarityCommon: "#a2946d",
  rarityRuned: "#c07a3a",
  rarityFabled: "#d678c8",

  // The passive tree's hues (FS-8RZ51 §Change: A lit node glows in its own colour, L4; ADR-0089): a lit
  // tree picture's colour by what its node gives, mixed with the HUD's bronze where it is drawn. Read
  // only through `palette.treeHue`, and only by the tree's pictures. Frost is a pale cold sky tone, not
  // neon cyan; amethyst is crit, not umbra (design guideline, "Palette"). Teal, frost and silver are the
  // coordinator's starting values (2026-11-23), tuned by the owner at the Tree colours page.
  copper: "#d49274", //     power
  steelBlue: "#5f82b8", //  defence
  teal: "#3aa0b0", //       mana (the tree's own; the mana bar keeps necrotic)
  frost: "#8ac2e6", //      speed
  verdigris: "#5fa88a", //  movement, evasion
  amethyst: "#a088cc", //   crit
  silver: "#c2c8d0", //     the duel

  // The class book's pigments (FS-X2CMM R45, ADR-0094): a page's picture is painted in one main
  // pigment by what the page does, with bone for its highlights. Muted mineral tones, none past
  // verdigris's chroma; ochre kept off amber (interactable), madder off oxblood (damage). Read only
  // through `palette.bookPigment` (the page roundels) and `palette.bookEffect` (the book's world effects, R47).
  pigmentVerdigris: "#5b9a80", // growth, beasts and cures
  pigmentOchre: "#a88b52", //     light and finding
  pigmentMadder: "#8f5048", //    binding and blood
  pigmentLapis: "#52699a", //     movement and air
  pigmentBone: "#ddd3bb", //      every page's highlights, never a main pigment
  // A locked page's ground (FS-X2CMM §Change: Illuminated pages C1, ADR-0095): flat warm near-ink,
  // never coloured. Read only through `palette.bookPigment.lockedGround`.
  pigmentLockedGround: "#2a2320",
  // The open tome (FS-X2CMM §Change: Illuminated pages and the open tome, C3–C5): the class book's
  // two-page vellum spread in its leather, its gutter at the spine, and its three inks. Read only
  // through `palette.bookTome` (the book's panel, `classBookStyle.ts`).
  tomeLeather: "#3b2a1d", //      the binding round the spread
  tomeVellumEdge: "#c9b98f", //   a page at its outer edge
  tomeVellumMiddle: "#d8caa3", // a page near the spine
  tomeGutter: "#a89772", //       the fold's shadow at the spine
  tomeInk: "#2c2118", //          a page's name
  tomeInkMuted: "#5e4c34", //     costs, terms and hints
  tomeInkMadder: "#74392a", //    the title and the shown page's name: madder-brown

  // Menu chrome: Bone & Soot, the canvas menus' own values (ADR-0087; see the header). The
  // comments name the web token each held until 2026-11-21, which is also the swap-back table.
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

/**
 * Phaser's untinted multiply (`setTint`'s identity): white leaves a sprite as it is. Not a palette
 * colour, so it is not in `BARROW_HEX`; it is defined here so no other file writes the literal.
 */
export const TINT_IDENTITY = 0xffffff;

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
  fireCore: 0xf5d98f,
  fireHot: 0xea7f26,
  fireDeep: 0x8a2913,
  arcane: 0x6f8f4a,
  arcaneDeep: 0x3c5a36,
  necrotic: 0x688b8f,
  umbra: 0x3f3452,
  umbraLight: 0x7d6c99,
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
  rarityRuned: 0xc07a3a,
  rarityFabled: 0xd678c8,
  copper: 0xd49274,
  steelBlue: 0x5f82b8,
  teal: 0x3aa0b0,
  frost: 0x8ac2e6,
  verdigris: 0x5fa88a,
  amethyst: 0xa088cc,
  silver: 0xc2c8d0,
  pigmentVerdigris: 0x5b9a80,
  pigmentOchre: 0xa88b52,
  pigmentMadder: 0x8f5048,
  pigmentLapis: 0x52699a,
  pigmentBone: 0xddd3bb,
  pigmentLockedGround: 0x2a2320,
  tomeLeather: 0x3b2a1d,
  tomeVellumEdge: 0xc9b98f,
  tomeVellumMiddle: 0xd8caa3,
  tomeGutter: 0xa89772,
  tomeInk: 0x2c2118,
  tomeInkMuted: 0x5e4c34,
  tomeInkMadder: 0x74392a,
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
 * The web UI palette (Barrow Vellum, ADR-0087) as CSS strings, for DOM code
 * that cannot read a CSS variable: Stripe Elements renders in a cross-origin
 * iframe, and a 2D canvas takes a literal fillStyle.
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
  // Torch: lifted vellum. Text on a torch fill is bgDark.
  primary: "#e6d8b0", //              --color-primary
  primaryBright: "#f2e8cc", //        --color-primary-bright
  accent: "#9b8e6a", //               --color-accent (dark vellum)
  danger: "#6e1f1f", //               --color-danger (oxblood fill)
  dangerText: "#d07a6a", //           --color-danger-text

  // Surfaces: charcoal and umber
  bgDark: "#161310", //               --color-bg-dark
  bgDarker: "#100c0a", //             --color-bg-darker
  bgCard: "rgba(31, 26, 21, 0.88)", //   --color-bg-card
  bgCard2: "rgba(36, 29, 23, 0.92)", //  --color-bg-card-2
  bgCardOpaque: "#1e1914", //         --color-bg-card-opaque
  bgCard2Opaque: "#231c16", //        --color-bg-card-2-opaque
  bgWell: "#100c0a", //               --color-bg-well
  bgInset: "#130f0c", //              --color-bg-inset
  bgDropdown: "#0c0907", //           --color-bg-dropdown

  // Brass: structure. brassBright is vellum, not the game's gold (ADR-0087).
  brass: "#9c7b3f", //                --color-brass
  brassBright: "#cdbf9a", //          --color-brass-bright
  border: "rgba(156, 123, 63, 0.3)", //         --color-border (brass 30%)
  borderStrong: "rgba(156, 123, 63, 0.6)", //   --color-border-strong (brass 60%)
  focusRing: "0 0 0 2px rgba(205, 191, 154, 0.7)", // --focus-ring (brass-bright 70%)

  // Text: the vellum ramp
  text: "#cdbf9a", //                 --color-text
  textDim: "#9b8e6a", //              --color-text-dim
  textMuted: "#8d8362", //            --color-text-muted
  textPlaceholder: "#6b6349", //      --color-text-placeholder
} as const;
