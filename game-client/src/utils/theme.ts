/**
 * The Age of Barrowspire — barrow-dark palette.
 *
 * Single source of truth for the gothic dungeon look. Torch-lit, barrow-deep,
 * grim: cold ambient darkness with warm torch pools as the only real light.
 * Presentation only — no game state, no logic.
 *
 * Each colour is exposed twice: `hex` (CSS strings) and `num` (Phaser 0x ints).
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
} as const;
