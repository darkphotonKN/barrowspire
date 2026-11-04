// The two baked cursors (FS-KYPQ9 §H.2), authored in code (ADR-0021). They replace the
// canvas-drawn pixel-art hand and strike-mark: 32×32, smooth (linearly filtered, supersampled),
// lit from the world's key light (screen-left, above), so the pointer is made of the same bone,
// iron and brass as the world.
//
// Each cursor is a stack of shapes, each a signed distance field with a bevel. Per sample the
// topmost shape under it gives the material and a normal from its bevel, lit with a lambert
// term and, for metal, a highlight. A thin dark rim and a soft drop shadow, both shades of
// `slate`, keep the cursor readable on any ground. Colour comes only from `BARROW`; cursors are
// static art, so §B.7's three-colour cap for effects does not apply.
//
// A cursor's anchor is its hotspot: the hand's fingertip, the strike-mark's centre. The
// client's `cursorCss` (src/render/cursors/) reads it from the manifest.

import { clamp, fbm, vnoise } from "../noise.js";
import { mix, shade } from "../palette.js";
import { LIGHT, raster } from "./fx.js";

export const CURSOR_SIZE = 32;

// --- signed distance fields, in px, negative inside -------------------------------------

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

/** A capsule from (ax, ay) to (bx, by) with radius r. */
function capsule(ax, ay, bx, by, r) {
  const ux = bx - ax;
  const uy = by - ay;
  const len2 = ux * ux + uy * uy;
  return (x, y) => {
    const t = clamp(((x - ax) * ux + (y - ay) * uy) / len2, 0, 1);
    return Math.hypot(x - ax - ux * t, y - ay - uy * t) - r;
  };
}

/** A capsule from (ax, ay) to (bx, by), its radius tapering from ra to rb. */
function cone(ax, ay, bx, by, ra, rb) {
  const ux = bx - ax;
  const uy = by - ay;
  const len2 = ux * ux + uy * uy;
  return (x, y) => {
    const t = clamp(((x - ax) * ux + (y - ay) * uy) / len2, 0, 1);
    return Math.hypot(x - ax - ux * t, y - ay - uy * t) - (ra + (rb - ra) * t);
  };
}

/** A convex polygon (points clockwise on screen), its corners rounded by r. */
function polygon(points, r = 0) {
  return (x, y) => {
    let d = Infinity;
    let inside = true;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      const ex = bx - ax;
      const ey = by - ay;
      const t = clamp(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
      d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t));
      if (ex * (y - ay) - ey * (x - ax) < 0) inside = false;
    }
    return (inside ? -d : d) - r;
  };
}

/** A ring of radius R and half-thickness w, cut away where `gap(angle)` is true. */
function brokenRing(cx, cy, R, w, gapHalf) {
  return (x, y) => {
    const ring = Math.abs(Math.hypot(x - cx, y - cy) - R) - w;
    // distance to the nearest cardinal axis, in px along the ring
    const th = Math.atan2(y - cy, x - cx);
    const q = Math.abs(((th % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4);
    const gap = (Math.PI / 4 - q) * R - gapHalf; // < 0 inside a gap
    return Math.max(ring, -gap);
  };
}

// --- shading -----------------------------------------------------------------------------

/**
 * A shape: `sdf`, the `bevel` width over which its edge rolls off, and `paint(x, y, n, light)`
 * returning its colour. `light` is the lambert term; `n` the surface normal.
 */
const shapeOf = (sdf, bevel, paint) => ({ sdf, bevel, paint });

function normalAt(s, x, y, depth) {
  const e = 0.25;
  const gx = (s.sdf(x + e, y) - s.sdf(x - e, y)) / (2 * e);
  const gy = (s.sdf(x, y + e) - s.sdf(x, y - e)) / (2 * e);
  const slope = 1.7 * (1 - clamp(depth / s.bevel, 0, 1));
  const nx = gx * slope;
  const ny = gy * slope;
  const l = Math.hypot(nx, ny, 1);
  return [nx / l, ny / l, 1 / l];
}

const lambert = (n) => clamp(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2], 0, 1);

/** The highlight off a polished surface toward the viewer. */
function glint(n, power) {
  const d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  const rz = 2 * d * n[2] - LIGHT[2];
  return Math.pow(clamp(rz, 0, 1), power);
}

/** Metal: dark in shadow, a hard highlight where it faces the light. */
const metal = (base, hi, power = 18) => (x, y, n, l) => {
  const g = glint(n, power);
  return mix(shade(base, 0.45 + 0.85 * l), hi, g * 0.8);
};

/** Aged metal: a patina of noise over `metal`, so a plate is worn, not enamelled. */
const aged = (paint, seed) => (x, y, n, l) => shade(paint(x, y, n, l), 0.82 + 0.3 * vnoise(x * 2.3, y * 2.3, seed));

/** Bone: yellowed and matte, with a grain and a soft sheen where it faces the light. */
const boneOf = (seed) => (x, y, n, l) => {
  const base = shade(mix("vellum", "vellumDark", 0.45), (0.3 + 0.68 * l) * (0.89 + 0.22 * vnoise(x * 2.2, y * 2.2, seed)));
  return mix(base, shade("vellum", 1.12), glint(n, 10) * 0.3);
};

/**
 * Renders a stack of shapes (later ones on top) with a dark rim and a drop shadow, both from
 * `rim`. `groove(x, y, shape)` darkens plate seams (0 none .. 1 full); `overlap` px of dark seam
 * runs inside a shape's edge wherever it lies over a shape beneath it.
 */
function cursor(shapes, { rim, groove = () => 0, edge = null, overlap = 0 }) {
  const union = (x, y) => shapes.reduce((d, s) => Math.min(d, s.sdf(x, y)), Infinity);
  const shadow = shade(rim, 0.6);
  return raster(CURSOR_SIZE, CURSOR_SIZE, (x, y) => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      const d = s.sdf(x, y);
      if (d >= 0) continue;
      const n = normalAt(s, x, y, -d);
      let c = shade(s.paint(x, y, n, lambert(n)), 1 - 0.55 * groove(x, y, s));
      // a dark seam where this plate's edge lies over another, so overlapping plates read apart
      if (overlap > 0 && -d < overlap && shapes.slice(0, i).some((u) => u.sdf(x, y) < 0))
        c = shade(c, 0.35 + 0.65 * (-d / overlap));
      // a light edge just inside the silhouette, so the outline reads on the darkest ground
      if (edge) c = mix(c, edge.color, edge.amount * (1 - clamp(-union(x, y) / edge.width, 0, 1)));
      return [...c, 1];
    }
    const d = union(x, y);
    if (d < 0.9) return [...rim, 0.95];
    // the drop shadow falls screen-right and down, away from the key light
    const ds = union(x - 1.2, y - 1.6);
    if (ds < 0.9) return [...shadow, 0.4 * clamp(1 - ds / 0.9, 0, 1) + 0.05];
    return null;
  });
}

/**
 * cursor_hand: a dead hand out of the barrow, pointing up-left as a pointer does: a slender
 * index finger of three phalanges split by dark joints and leaned 20° off upright, the other
 * three fingers curled to knuckle knobs beside it, their metacarpals running down to the wrist,
 * a two-bone thumb along the left side, and a tall rusted iron shackle at the wrist. Bone is
 * yellowed `vellum` toward `vellumDark`; the shackle is `slate` iron rusted toward
 * `barrowBrown` and `ember`, with hammered bands and one rivet. The hotspot (anchor) is the
 * fingertip.
 *
 * Every bone is a separate shape with a dark seam where it overlaps the one beneath, so the
 * joints and the curled fingers read apart.
 *
 * Drawn upright in a local frame (fingertip at the origin, the hand below it), then turned
 * onto the cursor; the light is applied after the turn, so it still falls from screen-left.
 */
export const HAND_HOTSPOT = [6, 1];
const HAND_LEAN = (20 * Math.PI) / 180;
export function boneHand() {
  const [hx, hy] = HAND_HOTSPOT;
  const c = Math.cos(HAND_LEAN);
  const sn = Math.sin(HAND_LEAN);
  /** Cursor px → the upright local frame. */
  const local = (x, y) => [c * (x - hx) - sn * (y - hy), sn * (x - hx) + c * (y - hy)];
  const turned = (sdf) => (x, y) => sdf(...local(x, y));
  let seed = 100;
  const bone = (sdf, bevel) => shapeOf(turned(sdf), bevel, boneOf(seed++));
  const iron = (x, y, n, l) => {
    const rust = clamp((fbm(x * 0.6, y * 0.6, 61, 3) - 0.45) * 2.6, 0, 1);
    const col = metal(shade("slate", 1.0), shade("slateLight", 2.0), 14)(x, y, n, l);
    return mix(col, shade(mix("barrowBrown", "ember", 0.4), 0.35 + 0.55 * l), rust * 0.8);
  };

  const shackle = turned(polygon([[-0.4, 21.1], [7.6, 21.0], [8.0, 27.8], [-0.8, 27.9]], 0.5));
  const carpals = bone(polygon([[0.6, 18.6], [6.6, 18.6], [6.2, 21.0], [1.0, 21.0]], 0.7), 1.0);
  const metacarpals = [
    [0.1, 12.8, 1.6, 19.0, 0.85],
    [3.0, 12.4, 2.9, 18.8, 0.8],
    [5.5, 13.2, 4.4, 18.9, 0.75],
    [7.6, 14.0, 5.6, 19.2, 0.7],
  ].map(([ax, ay, bx, by, r]) => bone(cone(ax, ay, bx, by, r, r * 0.75), 0.9));
  // the curled fingers: a folded bone above each knuckle knob
  const curled = [
    [3.0, 11.0, 1.3, 2.4],
    [5.5, 11.9, 1.25, 2.2],
    [7.7, 13.0, 1.1, 1.9],
  ].flatMap(([x, y, r, fold]) => [
    bone(cone(x + 0.2, y - fold, x, y, r * 0.78, r * 0.9), 1.0),
    bone(circle(x, y, r), 1.2),
  ]);
  const thumb = [
    bone(cone(0.4, 18.4, -2.4, 15.2, 1.05, 0.95), 1.0),
    bone(cone(-2.9, 14.2, -3.7, 11.4, 0.95, 0.8), 1.0),
  ];
  // the index, tip to knuckle, a gap between each phalanx
  const index = [
    [0.9, 3.5, 0.95, 1.1],
    [4.8, 7.5, 1.05, 1.25],
    [8.8, 11.6, 1.2, 1.4],
  ].map(([ay, by, ra, rb]) => bone(cone(0, ay, 0, by, ra, rb), 1.2));
  const shapes = [
    shapeOf(shackle, 1.0, iron),
    carpals,
    ...metacarpals,
    ...curled,
    ...thumb,
    ...index,
    shapeOf(turned(circle(3.6, 24.4, 0.8)), 0.8, metal(shade("slate", 0.9), shade("slateLight", 1.8), 12)),
  ];
  // the shackle's hammered bands, in the local frame
  const groove = (x, y, s) => {
    if (s.sdf !== shackle) return 0;
    const [, ly] = local(x, y);
    const k = (ly - 21.1) / 1.7;
    return ly > 22.1 && ly < 26.8 ? 0.6 * (1 - clamp(Math.abs(k - Math.round(k)) / 0.2, 0, 1)) : 0;
  };
  return cursor(shapes, {
    rim: shade("pitch", 0.75),
    groove,
    overlap: 0.75,
    edge: { color: shade("vellum", 1.05), amount: 0.25, width: 0.8 },
  });
}

/**
 * cursor_strike: the strike-mark over a rival, an aged mark and not a reticle: a worn `brass`
 * ring broken at the cardinal points, darkened `amber` sight-ticks across the breaks with a
 * polished bevel, and one dim `oxblood` pip at the centre. The hotspot (anchor) is the centre.
 */
export const STRIKE_HOTSPOT = [16, 16];
export function strikeMark() {
  const [cx, cy] = STRIKE_HOTSPOT;
  const brass = aged(metal(shade("brass", 0.85), shade("brassBright", 1.25), 12), 9);
  const amber = aged(metal(shade("amber", 0.72), shade("amberBright", 1.05), 9), 11);
  const blood = metal(shade("oxblood", 0.85), shade("oxblood", 1.7), 16);
  const R = 9.5;
  const shapes = [shapeOf(brokenRing(cx, cy, R, 1.5, 2.2), 1.5, brass)];
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]])
    shapes.push(shapeOf(capsule(cx + ux * 7.2, cy + uy * 7.2, cx + ux * 12.6, cy + uy * 12.6, 1.2), 1.2, amber));
  shapes.push(shapeOf(circle(cx, cy, 1.6), 1.6, blood));
  return cursor(shapes, { rim: shade("slate", 0.3) });
}

/** Both cursors, as the catalogue reads them: sheet, authoring function, hotspot, builder. */
export const CURSORS = [
  { name: "cursor_hand", fn: "boneHand", hotspot: HAND_HOTSPOT, build: boneHand },
  { name: "cursor_strike", fn: "strikeMark", hotspot: STRIKE_HOTSPOT, build: strikeMark },
];
