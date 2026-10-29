/**
 * A field's horizon (FS-X2F2H §Requirements 54): sky and distant hills behind the map's far edge,
 * and the land running on beyond its other edges. Drawn under the world (the ground covers it
 * inside the map) and moving with the camera at a slower rate, so it reads as far away.
 *
 * Pure planning: bands and hill outlines in the backdrop's own scroll-factored space, from a
 * look's colours and the camera's reach. Every hill is a fixed sum of waves on the look's seed,
 * never `Math.random`. `addHorizon` in `scene.ts` draws it.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point, Rect } from "@/render/iso/projection";
import { mix } from "@/utils/canvasPalette";
import { tileHash } from "./ground";

/** A field's horizon colours, each mixed from `BARROW_HEX` tokens. */
export interface HorizonLook {
  /** The sky overhead, and where it meets the hills. */
  skyHigh: number;
  skyLow: number;
  /** The far range, hazed toward the sky; the near range, darker and lower. */
  farHills: number;
  nearHills: number;
  /**
   * The land beyond the map's edges: the field's own ground colour, so the ground fading out past
   * the edge dissolves into it. Hazed toward the sky at the hills' foot.
   */
  land: number;
  /** Shapes the hills, so each field has its own skyline. */
  seed: number;
}

/**
 * How fast the backdrop moves with the camera: about a third as fast as the world, so it reads as
 * far, and stays in sight beyond the far edges over most of the map.
 */
export const HORIZON_PARALLAX = 0.35;
/**
 * The hills' foot, in the backdrop's scroll-factored space. With the camera at the top of its
 * reach the hills rise behind the map's top vertex, their foot hidden behind the near ground; as
 * the camera moves down they sink behind the map more slowly than it moves, as distant land does.
 */
export const HORIZON_FOOT = 160;

/** How tall the sky's gradient is above the foot, and the land's haze below it, px. */
const SKY_FADE = 320;
const LAND_FADE = 360;
/** How far toward the sky the land is hazed at the hills' foot. */
const LAND_HAZE = 0.35;
/** Gradient steps: bands, not a shader, so it draws the same on every renderer. */
const BANDS = 12;
/** The hills' outline is sampled this often, px. */
const HILL_STEP = 16;

/** One range of hills: its peak heights above the foot and its waves' lengths. */
const RANGES = [
  { rise: 60, swell: 80, waves: [520, 230, 97], sink: 0 },
  { rise: 18, swell: 40, waves: [380, 170, 71], sink: 6 },
] as const;

export interface HorizonBand {
  y: number;
  height: number;
  color: number;
}

export interface HorizonHill {
  color: number;
  /** A closed outline: the skyline left to right, then down to the foot and back. */
  points: Point[];
}

export interface HorizonPlan {
  /** The scroll factor the backdrop is drawn with. */
  factor: number;
  /** What it covers, in scroll-factored space. */
  span: Rect;
  sky: HorizonBand[];
  /** Far range first, then the near one over it. */
  hills: HorizonHill[];
  land: HorizonBand[];
}

export interface HorizonCamera {
  /** The camera's reach (its bounds), in world-screen space. */
  bounds: Rect;
  /** The view's size, px. */
  view: { width: number; height: number };
}

/**
 * The span a scroll-factored backdrop must cover so that, wherever the camera scrolls within its
 * bounds, the view is filled: a factored object at x shows at x − scrollX·f.
 */
function spanFor({ bounds, view }: HorizonCamera, f: number): Rect {
  const pad = 64;
  const scrollMaxX = bounds.x + Math.max(0, bounds.width - view.width);
  const scrollMaxY = bounds.y + Math.max(0, bounds.height - view.height);
  const x = Math.min(bounds.x * f, scrollMaxX * f) - pad;
  const y = Math.min(bounds.y * f, scrollMaxY * f) - pad;
  const right = Math.max(bounds.x * f, scrollMaxX * f) + view.width + pad;
  const bottom = Math.max(bounds.y * f, scrollMaxY * f) + view.height + pad;
  return { x, y, width: right - x, height: bottom - y };
}

/** Bands from `top` to `bottom`, the colour easing from `from` to `to` over `fade` px from `start`. */
function gradient(
  top: number,
  bottom: number,
  start: number,
  fade: number,
  from: number,
  to: number,
  upward: boolean,
): HorizonBand[] {
  const bands: HorizonBand[] = [];
  const step = fade / BANDS;
  // the gradient's own bands, nearest the foot first
  for (let i = 0; i < BANDS; i++) {
    const t = (i + 0.5) / BANDS;
    const y = upward ? start - (i + 1) * step : start + i * step;
    bands.push({ y, height: step, color: mix(from, to, t) });
  }
  // then the flat colour out to the span's edge
  if (upward && top < start - fade) bands.push({ y: top, height: start - fade - top, color: to });
  if (!upward && bottom > start + fade)
    bands.push({ y: start + fade, height: bottom - start - fade, color: to });
  return bands;
}

/** One range's skyline: a fixed sum of waves, phased by the look's seed. */
function range(
  span: Rect,
  r: (typeof RANGES)[number],
  seed: number,
  color: number,
): HorizonHill {
  const phases = r.waves.map((_, i) => ((tileHash(i, r.rise, seed) & 0xffff) / 0xffff) * Math.PI * 2);
  const weights = [0.6, 0.28, 0.12];
  const left = span.x - HILL_STEP;
  const right = span.x + span.width + HILL_STEP;
  const foot = HORIZON_FOOT + r.sink;
  const skyline: Point[] = [];
  for (let x = left; x <= right + HILL_STEP - 1; x += HILL_STEP) {
    const wave = r.waves.reduce(
      (sum, length, i) => sum + weights[i] * (0.5 + 0.5 * Math.sin((x / length) * Math.PI * 2 + phases[i])),
      0,
    );
    skyline.push({ x, y: HORIZON_FOOT - r.rise - r.swell * wave });
  }
  const last = skyline[skyline.length - 1].x;
  return {
    color,
    points: [...skyline, { x: last, y: foot }, { x: left, y: foot }],
  };
}

/** The horizon behind a field, for a camera with this reach. */
export function planHorizon(look: HorizonLook, camera: HorizonCamera): HorizonPlan {
  const factor = HORIZON_PARALLAX;
  const span = spanFor(camera, factor);
  const bottom = span.y + span.height;
  return {
    factor,
    span,
    sky: gradient(span.y, bottom, HORIZON_FOOT, SKY_FADE, look.skyLow, look.skyHigh, true),
    hills: [
      range(span, RANGES[0], look.seed, look.farHills),
      range(span, RANGES[1], look.seed, look.nearHills),
    ],
    land: gradient(
      span.y,
      bottom,
      HORIZON_FOOT,
      LAND_FADE,
      mix(look.land, look.skyLow, LAND_HAZE),
      look.land,
      false,
    ),
  };
}
