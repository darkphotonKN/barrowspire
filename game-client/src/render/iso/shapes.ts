import { depthKey, worldToScreen, type Point, type Rect } from "./projection";

/**
 * Screen-space outlines of world shapes, for drawing placeholder geometry on the
 * projection (FS-2325V §A.3) until baked art replaces it. Pure maths: callers
 * hand the points to Phaser (`Graphics.fillPoints`).
 */

/** The four screen corners of a world rect: top vertex first, clockwise on screen. */
export function projectRect(
  x: number,
  y: number,
  w: number,
  h: number,
): Point[] {
  return [
    worldToScreen(x, y),
    worldToScreen(x + w, y),
    worldToScreen(x + w, y + h),
    worldToScreen(x, y + h),
  ];
}

/** The same outline lifted `height` screen px off the ground. */
export function raise(points: Point[], height: number): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y - height }));
}

/**
 * An upright box on a world rect, as the three faces the fixed camera sees: the top,
 * and the south (+y) and east (+x) sides, which face the viewer.
 */
export function boxFaces(
  x: number,
  y: number,
  w: number,
  h: number,
  height: number,
): { top: Point[]; south: Point[]; east: Point[] } {
  const ground = projectRect(x, y, w, h);
  const top = raise(ground, height);
  const [, right, bottom, left] = ground;
  const [, rightTop, bottomTop, leftTop] = top;

  return {
    top,
    south: [left, bottom, bottomTop, leftTop],
    east: [bottom, right, rightTop, bottomTop],
  };
}

/**
 * Quads that together cover everything within `reach` of a convex polygon but none of
 * its inside: one outward half-plane per edge. Overlaps are harmless for an opaque
 * fill, which is what this is for (the indoor mask).
 */
export function outsideConvex(polygon: Point[], reach: number): Point[][] {
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;

  return polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;

    // of the two normals, the one pointing away from the centre
    let nx = dy;
    let ny = -dx;
    if ((a.x - cx) * nx + (a.y - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    const a0 = { x: a.x - dx * reach, y: a.y - dy * reach };
    const b0 = { x: b.x + dx * reach, y: b.y + dy * reach };

    return [
      a0,
      b0,
      { x: b0.x + nx * reach, y: b0.y + ny * reach },
      { x: a0.x + nx * reach, y: a0.y + ny * reach },
    ];
  });
}

/**
 * Cuts a world rect along its longer axis into pieces no longer than `step`, so each
 * piece can take its own footprint depth. A long wall sorted by one key would stand
 * in front of a delver at one end and behind them at the other.
 */
export function splitAlongLength(
  x: number,
  y: number,
  w: number,
  h: number,
  step: number,
): Rect[] {
  const alongX = w >= h;
  const length = alongX ? w : h;
  const pieces: Rect[] = [];

  for (let at = 0; at < length; at += step) {
    const span = Math.min(step, length - at);
    pieces.push(
      alongX
        ? { x: x + at, y, width: span, height: h }
        : { x, y: y + at, width: w, height: span },
    );
  }

  return pieces;
}

/**
 * The scene depth band world objects sort in: above ground (< 100), below effects,
 * overlays, the indoor mask, atmosphere and HUD (≥ 140).
 */
export const WORLD_DEPTH = 100;

/** One world pixel of footprint moves an object this far in depth. */
const PER_KEY = 1 / 10_000;
/** Sub-layers of one object (legs over body…) stay inside a single world pixel. */
const PER_LAYER = PER_KEY / 10;

/**
 * A scene depth for an object standing on footprint `(x, y)`: sorted by
 * `depthKey`, mapped into the world band. `layer` (0–9) stacks parts of one object.
 */
export function worldDepth(x: number, y: number, layer = 0): number {
  return WORLD_DEPTH + depthKey(x, y) * PER_KEY + layer * PER_LAYER;
}
