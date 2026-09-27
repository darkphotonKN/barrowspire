/**
 * The light-map's rules, without Phaser (FS-2325V §C.7–§C.9, guideline "Lighting").
 *
 * The light-map multiplies the lit world by a layer filled with the world's ambient, plus an
 * additive pool per light source. Here: what a light source is, which ones are in view, how each
 * flickers on its own clock, what ambient each world gets, and the readability floor that lifts
 * that ambient when it would hide a hostile at the canvas edge. `LightMap.ts` draws it.
 *
 * Light is presentation only (CONTEXT.md "Light source"): it never changes what anyone can see
 * or hit.
 */

import type { Point, Rect } from "@/render/iso";
import type { ArtLight } from "@/render/art/manifest";
import type { WorldKind } from "@/render/world/ground";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { edgeVignetteAlpha } from "./vignette";

/**
 * Full light: the multiply identity, which leaves the baked art exactly as baked. Not a palette
 * colour (nothing is drawn in it); it is what "no darkening" means to a multiply layer.
 */
export const FULL_LIGHT = 0xffffff;

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

/** WCAG relative luminance. */
function luminance(c: number): number {
  const [r, g, b] = channels(c).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── Ambient and the readability floor ─────────────────────────────────────

/** Warm dusk in the hub, dark barrow in a run (FS-2325V §C.8), before the floor lifts either. */
export const BASE_AMBIENT: Record<WorldKind, number> = {
  hub: mix(BARROW_HEX.barrowBrown, BARROW_HEX.amberBright, 0.55),
  run: mix(BARROW_HEX.slate, BARROW_HEX.necrotic, 0.4),
};

/** What a hostile is read by: its glowing eyes (guideline "Characters / Enemies"). */
const HOSTILE_ACCENT = palette.rivalGlow;
/** What it is read against: the barrow ground it walks on. */
const GROUND = palette.ground;

/** A colour as it reaches the eye: multiplied by the ambient, then under the vignette's dark. */
function litUnderVignette(
  color: number,
  ambient: number,
  vignette: number,
): number {
  const c = channels(color);
  const a = channels(ambient);
  const dark = channels(palette.inkDeep);
  return pack(
    c.map((v, i) => ((v * a[i]) / 255) * (1 - vignette) + dark[i] * vignette),
  );
}

/** The hostile's accent against the ground, at the canvas edge, under this ambient. */
export function edgeContrast(ambient: number, vignette: number): number {
  return contrastRatio(
    litUnderVignette(HOSTILE_ACCENT, ambient, vignette),
    litUnderVignette(GROUND, ambient, vignette),
  );
}

/**
 * The share of an edge hostile's contrast the light-map must leave standing, measured against the
 * vignette alone (the readability the pre-art canvas shipped with). FS-2325V §C.9 names no number;
 * an absolute floor such as WCAG's 3:1 is out of reach at the edge even with no light-map (the
 * vignette alone leaves about 2:1), so the floor is relative: darkness may take at most two thirds
 * of what the vignette leaves.
 */
export const READABILITY_SHARE = 1 / 3;

/** Whether a hostile at the canvas edge stays readable under this ambient. */
export function edgeReadable(ambient: number, vignette: number): boolean {
  const baseline = edgeContrast(FULL_LIGHT, vignette) - 1;
  return (
    edgeContrast(ambient, vignette) - 1 >= READABILITY_SHARE * baseline - 1e-9
  );
}

/** Step by which a failing ambient is lifted toward full light. */
const LIFT_STEP = 0.02;

/** The ambient, lifted toward full light just far enough to pass `readable` (§C.9: ambient lifts). */
export function liftAmbient(
  ambient: number,
  readable: (ambient: number) => boolean,
): number {
  for (let t = 0; t < 1; t += LIFT_STEP) {
    const lifted = mix(ambient, FULL_LIGHT, t);
    if (readable(lifted)) return lifted;
  }
  return FULL_LIGHT;
}

/** The ambient a world is lit by on a canvas of this size, floor applied. */
export function ambientFor(
  kind: WorldKind,
  canvas: { width: number; height: number },
): number {
  const vignette = edgeVignetteAlpha(canvas.width, canvas.height);
  return liftAmbient(BASE_AMBIENT[kind], (a) => edgeReadable(a, vignette));
}
