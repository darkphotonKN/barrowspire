/**
 * The Age of Barrowspire — semantic palette for the Phaser canvas.
 *
 * Scenes name **what a thing is**, never what colour it is: `palette.door`,
 * not `BARROW_HEX.slate`. A hex at a call site says nothing about whether that
 * colour is right for a door; a name does, and it makes a retheme one file
 * instead of a sweep across 4.4k lines.
 *
 * Every value here resolves from `BARROW_HEX` (ADR-0013). Shades and tints are
 * **derived**, not typed in — that keeps this module free of new hex literals
 * and makes the shading relationship explicit instead of forty magic numbers.
 *
 * Colour in gameplay is a **readability channel, not emphasis** — see
 * docs/design-guideline.md "Gameplay accent". Amber means *interactable* and
 * repeats as often as there are interactables; it is not the web platform's
 * one-torch rule, deliberately.
 */

import { BARROW_HEX } from "./theme";

// ── Derivation helpers ────────────────────────────────────────────────────

/** Mix two 0xRRGGBB colours. `t` of 0 returns `a`, 1 returns `b`. */
function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Darken toward the deepest base. Shadow sides, recesses, undersides. */
export function shade(color: number, amount = 0.35): number {
  return mix(color, BARROW_HEX.pitch, amount);
}

/** Lighten toward vellum. Lit edges, highlights, raised faces. */
export function tint(color: number, amount = 0.25): number {
  return mix(color, BARROW_HEX.vellum, amount);
}

/** `0xRRGGBB` -> `"#rrggbb"`, for the 2D-canvas generators that take CSS strings. */
export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** `0xRRGGBB` + alpha -> `"rgba(r, g, b, a)"`, for soft glows and washes. */
export function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── The canvas palette ────────────────────────────────────────────────────

export const palette = {
  // -- Ground and structure. Barrow earth and cold stone; the world is
  //    lit only where a torch reaches it.
  ground: BARROW_HEX.barrowDeep,
  groundAlt: shade(BARROW_HEX.barrowDeep, 0.2),
  floor: BARROW_HEX.barrowBrown,
  floorShade: shade(BARROW_HEX.barrowBrown),
  wall: BARROW_HEX.slate,
  wallShade: shade(BARROW_HEX.slate),
  wallLight: tint(BARROW_HEX.slate, 0.18),
  wallTop: BARROW_HEX.slateLight,
  mapBackground: BARROW_HEX.charcoal,
  mapEdge: BARROW_HEX.pitch,

  // -- Interactables. Amber, per the gameplay accent rule: the player can
  //    do something with each of these. Repetition here is correct.
  interactable: BARROW_HEX.amber,
  interactableBright: BARROW_HEX.amberBright,
  door: BARROW_HEX.barrowBrown,
  doorBand: BARROW_HEX.brass,
  doorLocked: BARROW_HEX.oxblood,
  container: BARROW_HEX.barrowDeep,
  containerLid: BARROW_HEX.brass,
  switchOff: BARROW_HEX.slate,
  switchOn: BARROW_HEX.amber,
  escapeDoor: BARROW_HEX.brass,
  escapeGlow: BARROW_HEX.amberBright,

  // -- Safe / friendly / restorative. Arcane green.
  safe: BARROW_HEX.arcane,
  safeDeep: BARROW_HEX.arcaneDeep,
  heal: BARROW_HEX.arcane,

  // -- Damage / danger / hostile. Oxblood.
  damage: BARROW_HEX.oxblood,
  damageBright: tint(BARROW_HEX.oxblood, 0.35),
  hostile: BARROW_HEX.necrotic,

  // -- HUD. Vellum reads, brass frames. Never amber unless it is a control
  //    the player can actually act on.
  hudText: BARROW_HEX.vellum,
  hudLabel: BARROW_HEX.vellumDark,
  hudFaint: BARROW_HEX.vellumFaint,
  hudPanel: BARROW_HEX.umber,
  hudPanelDeep: BARROW_HEX.charcoal,
  frame: BARROW_HEX.brass,
  frameBright: BARROW_HEX.brassBright,

  // -- Light. The only warmth in the barrow.
  torch: BARROW_HEX.amber,
  torchCore: BARROW_HEX.amberBright,
  ember: BARROW_HEX.ember,

  // -- Ink. Outlines and the deepest shadow. Matches the DOM base so the
  //    canvas and the page agree on what "dark" means.
  ink: BARROW_HEX.charcoal,
  inkDeep: BARROW_HEX.pitch,

  // -- Characters. The delver reads warm (a torch you are carrying); rivals
  //    read cold and necrotic (a light that is not yours). Their eyes are the
  //    readable accent against dark, which is why the two glows differ in hue
  //    rather than only in brightness.
  delverCloak: BARROW_HEX.umber,
  delverCloakShade: shade(BARROW_HEX.umber),
  delverGlow: BARROW_HEX.amber,
  rivalCloak: BARROW_HEX.slate,
  rivalCloakShade: shade(BARROW_HEX.slate),
  rivalGlow: BARROW_HEX.arcane,
  rivalGlowSoft: BARROW_HEX.necrotic,
  hoodShadow: shade(BARROW_HEX.pitch, 0.45),
} as const;

// ── Typography ────────────────────────────────────────────────────────────

/**
 * Phaser draws to a canvas and cannot use CSS custom properties in a style
 * rule — but it can *read* one. `next/font` mangles family names at build
 * time (`__Pirata_One_a1b2c3`), so hardcoding "Pirata One" here would not
 * match what the document actually loaded. Reading the same variable the DOM
 * uses keeps one source of truth and survives a face swap.
 */
function cssFont(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

export const CANVAS_FONT = {
  /**
   * Blackletter. Permitted ONLY at >=28px and only on the main-menu title and
   * the end-of-run overlay heading — see docs/design-guideline.md "The
   * blackletter bound". Everything else uses `body`.
   */
  get display(): string {
    return cssFont("--font-heading", "Georgia, serif");
  },
  /** The readable workhorse: HUD, labels, counters, prompts, item names. */
  get body(): string {
    return cssFont("--font-body", "Georgia, serif");
  },
} as const;

/** The floor below which blackletter may not be used, in px. */
export const BLACKLETTER_MIN_PX = 28;
