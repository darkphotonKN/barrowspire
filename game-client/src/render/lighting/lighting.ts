/**
 * The light-map's rules, without Phaser (FS-2325V §C.7–§C.9, guideline "Lighting").
 *
 * The light-map multiplies the lit world by a layer filled with the world's ambient, plus an
 * additive pool per light source. Here: what a light source is, which ones are in view, how each
 * flickers on its own clock, what ambient each world gets, and what the light-map and vignette
 * leave of the ground at the canvas edge. `LightMap.ts` draws it.
 *
 * The readability floor is not met here. Ambient is never lifted for it: hostile markers draw
 * above the light-map and vignette (`src/render/markers/`), and are tested against
 * {@link litEdgeGround}.
 *
 * Light is presentation only (CONTEXT.md "Light source"): it never changes what anyone can see
 * or hit.
 */

import type { Point, Rect } from "@/render/iso";
import type { ArtLight, ArtRgb } from "@/render/art/manifest";
import type { WorldKind } from "@/render/world/ground";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";

export interface LightSource {
  /** Screen-space position in the camera's world (a projected point, before scroll). */
  x: number;
  y: number;
  /** Pool radius, screen px. */
  radius: number;
  /** 0xRRGGBB, from a BARROW token. */
  color: number;
  /** 0..1: how strongly the pool adds its colour at its centre. */
  intensity: number;
  /** 0 is steady; 1 gutters most. */
  flicker: number;
  /** Phase for this source's own flicker clock. */
  seed: number;
}

/** How strongly a manifest-declared prop light adds at its centre. */
const PROP_INTENSITY = 0.7;

/** A prop's declared light, placed at the prop's anchor on screen. */
export function sourceFromManifest(
  light: ArtLight,
  anchor: Point,
  seed: number,
): LightSource {
  return {
    x: anchor.x + light.offset.x,
    y: anchor.y + light.offset.y,
    radius: light.radius,
    color: BARROW_HEX[light.color],
    intensity: PROP_INTENSITY,
    flicker: light.flicker,
    seed,
  };
}

/** The pool the delver carries; replaces FS-W6BP1's overlay torch. */
export const DELVER_TORCH = {
  radius: 260,
  color: BARROW_HEX.amber,
  intensity: 0.8,
  flicker: 0.3,
} as const;

/**
 * The sources whose pool reaches the view, written into `out` (cleared first) so the per-frame
 * cull allocates nothing. FS-2325V "Edge States": off-screen sources are culled before stamping.
 */
export function cullInto(
  sources: readonly LightSource[],
  view: Rect,
  out: LightSource[],
): LightSource[] {
  out.length = 0;
  for (const s of sources) {
    const nx = Math.max(view.x, Math.min(s.x, view.x + view.width));
    const ny = Math.max(view.y, Math.min(s.y, view.y + view.height));
    if ((s.x - nx) ** 2 + (s.y - ny) ** 2 <= s.radius * s.radius) out.push(s);
  }
  return out;
}

/** The deepest a flicker dims a source, as a share of its `flicker` amount. */
const FLICKER_DEPTH = 0.35;

/**
 * A source's brightness multiplier at a moment: 1 at full, dipping by up to
 * `amount × FLICKER_DEPTH`. Time-based (three detuned waves on the source's own phase), so it is
 * smooth, frame-rate independent, and no two sources gutter together.
 */
export function flickerAt(
  timeMs: number,
  seed: number,
  amount: number,
): number {
  if (amount === 0) return 1;
  const p = seed * 12.9898;
  const wave =
    0.5 +
    0.25 * Math.sin(timeMs * 0.0071 + p) +
    0.15 * Math.sin(timeMs * 0.0173 + p * 1.7) +
    0.1 * Math.sin(timeMs * 0.0419 + p * 2.3);
  return 1 - amount * FLICKER_DEPTH * wave;
}

// ── Colour maths ──────────────────────────────────────────────────────────

const channels = (c: number): [number, number, number] => [
  (c >> 16) & 0xff,
  (c >> 8) & 0xff,
  c & 0xff,
];
const pack = ([r, g, b]: number[]) =>
  (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

function mix(a: number, b: number, t: number): number {
  const ca = channels(a);
  const cb = channels(b);
  return pack(ca.map((v, i) => v + (cb[i] - v) * t));
}

const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0..1. */
export function relativeLuminance(c: number): number {
  const [r, g, b] = channels(c).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── Ambient, and the ground it leaves at the edge ─────────────────────────

/**
 * Warm dusk in the hub, dark barrow in a run (FS-2325V §C.8). Fixed: the world may stay dark,
 * because hostile markers carry readability above the light-map (§C.9).
 */
export const AMBIENT: Record<WorldKind, number> = {
  hub: mix(BARROW_HEX.barrowBrown, BARROW_HEX.amberBright, 0.55),
  run: mix(BARROW_HEX.slate, BARROW_HEX.necrotic, 0.4),
};

/**
 * The tower interior's ambient (FS-8RBQY §B.6): the run's cold slate, sunk toward pitch, so the
 * inside of the Barrowspire is darker than a run outdoors and its sconces and slits throw their
 * pools into it. The exterior world theme keeps {@link AMBIENT}`.run`. Never lifted for
 * readability: markers carry that above the light-map.
 */
export const TOWER_AMBIENT = mix(
  mix(BARROW_HEX.slate, BARROW_HEX.necrotic, 0.3),
  BARROW_HEX.pitch,
  0.33,
);

/**
 * A baked ground colour as it reaches the eye: multiplied by the ambient, then under the
 * vignette's dark at `vignette` alpha (FS-2325V §C.9: ambient × baked ground mean × vignette).
 * Both are sRGB operations, so lighting a sheet's mean equals the mean of its lit pixels.
 */
export function litEdgeGround(
  mean: ArtRgb,
  ambient: number,
  vignette: number,
): number {
  const a = channels(ambient);
  const dark = channels(palette.inkDeep);
  return pack(
    [mean.r, mean.g, mean.b].map(
      (v, i) => ((v * a[i]) / 255) * (1 - vignette) + dark[i] * vignette,
    ),
  );
}
