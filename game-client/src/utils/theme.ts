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
  // Base dark — near-black charcoal / deep umber
  charcoal: "#0d0b0a",
  umber: "#1a1410",
  pitch: "#070605",

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
  necrotic: "#4a6b6f",

  // Blood / danger — oxblood
  oxblood: "#6e1f1f",

  // Parchment — UI surfaces
  vellum: "#cdbf9a",
  vellumDark: "#8a7d5c",
  ink: "#1c1712",

  // Brass / bronze accents
  brass: "#9c7b3f",
  brassBright: "#c9a14e",
} as const;

/** Phaser 0x integer forms of the same palette. */
export const BARROW_HEX = {
  charcoal: 0x0d0b0a,
  umber: 0x1a1410,
  pitch: 0x070605,
  slate: 0x3a3d42,
  slateLight: 0x52555c,
  barrowBrown: 0x5a4632,
  barrowDeep: 0x3e2f22,
  amber: 0xe8a14d,
  amberBright: 0xf2b866,
  ember: 0xc2611f,
  arcane: 0x6f8f4a,
  arcaneDeep: 0x3c5a36,
  necrotic: 0x4a6b6f,
  oxblood: 0x6e1f1f,
  vellum: 0xcdbf9a,
  vellumDark: 0x8a7d5c,
  ink: 0x1c1712,
  brass: 0x9c7b3f,
  brassBright: 0xc9a14e,
} as const;
