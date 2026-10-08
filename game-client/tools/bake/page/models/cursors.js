// The two baked cursors (FS-KYPQ9 §H.2), authored in code (ADR-0021). They replace the
// canvas-drawn pixel-art hand and strike-mark: 32×32, smooth (linearly filtered, supersampled),
// lit from the world's key light (screen-left, above), so the pointer is made of the same iron,
// leather and brass as the world.
//
// Each cursor is a stack of shapes, each a signed distance field with a bevel. Per sample the
// topmost shape under it gives the material and a normal from its bevel, lit with a lambert
// term and, for metal, a highlight. A thin dark rim and a soft drop shadow, both shades of
// `slate`, keep the cursor readable on any ground. Colour comes only from `BARROW`; cursors are
// static art, so §B.7's three-colour cap for effects does not apply.
//
// A cursor's anchor is its hotspot: the gauntlet's fingertip, the strike-mark's centre. The
// client's `cursorCss` (src/render/cursors/) reads it from the manifest.

import { clamp, vnoise } from "../noise.js";
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

/** Leather: matte, with a faint grain. */
const leather = (base, seed) => (x, y, n, l) =>
  shade(base, (0.3 + 0.62 * l) * (0.88 + 0.24 * vnoise(x * 1.7, y * 1.7, seed)));

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
 * cursor_gauntlet: an armoured hand pointing up-left, as a pointer does: the index finger
 * extended and leaned 20° off upright, the other three fingers curled into a row of knuckle
 * plates beside it, a separate thumb lying along the left side, and a short flared iron cuff.
 * Iron plates (`slate` lifted toward `slateLight`), a dark leather strap at the wrist
 * (`vellumDark`), two `brass` rivets on the back of the hand, and a `slateLight` edge so the
 * silhouette reads on pitch-dark flagstone. The hotspot (anchor) is the fingertip.
 *
 * Every part is a separate plate with a dark seam where it overlaps the one beneath, so the
 * fingers, thumb and cuff read apart. The cuff is plain iron with a rolled lip: no fringe and
 * no grain, so it never reads as bristles.
 *
 * Drawn upright in a local frame (fingertip at the origin, the hand below it), then turned
 * onto the cursor; the light is applied after the turn, so it still falls from screen-left.
 */
export const GAUNTLET_HOTSPOT = [7, 1];
const GAUNTLET_LEAN = (20 * Math.PI) / 180;
export function gauntlet() {
  const iron = aged(metal(shade("slateLight", 1.2), shade("slateLight", 2.5)), 3);
  const ironDark = aged(metal(mix("slate", "slateLight", 0.5), shade("slateLight", 2.0)), 4);
  const brass = metal("brass", shade("brassBright", 1.35), 12);
  const strap = leather(shade("vellumDark", 0.7), 7);
  const [hx, hy] = GAUNTLET_HOTSPOT;
  const c = Math.cos(GAUNTLET_LEAN);
  const sn = Math.sin(GAUNTLET_LEAN);
  /** Cursor px → the upright local frame. */
  const local = (x, y) => [c * (x - hx) - sn * (y - hy), sn * (x - hx) + c * (y - hy)];
  const turned = (sdf) => (x, y) => sdf(...local(x, y));

  const fingerR = 2.1;
  const finger = turned(capsule(0, fingerR, 0, 13.5, fingerR));
  const back = turned(polygon([[-1.6, 12.6], [11.6, 13.4], [10.2, 19.8], [0.0, 20.2]], 1.6));
  // the curled fingers: three knuckle plates stepping down from the index, each its own lame
  const knuckles = [
    [4.2, 9.2, 2.0],
    [7.8, 10.3, 1.9],
    [11.0, 11.6, 1.7],
  ].map(([x, top, r]) => turned(capsule(x, top + r, x, 15, r)));
  // the thumb: off the side of the hand, lying up along the index with a gap between
  const thumb = turned(capsule(-0.4, 18.2, -4.6, 12.4, 2.0));
  const cuff = turned(polygon([[0.0, 20.6], [10.4, 20.4], [12.8, 25.0], [-2.0, 25.2]], 0.7));
  const lip = turned(capsule(-1.8, 25.0, 12.6, 24.8, 0.85));
  const shapes = [
    shapeOf(cuff, 1.4, ironDark),
    shapeOf(lip, 0.9, iron),
    shapeOf(turned(polygon([[-0.2, 19.4], [10.4, 19.2], [10.6, 21.0], [-0.3, 21.3]], 0.3)), 0.8, strap),
    shapeOf(back, 1.8, iron),
    ...knuckles.reverse().map((k) => shapeOf(k, 1.9, iron)),
    shapeOf(thumb, 2.0, iron),
    shapeOf(finger, fingerR, iron),
    ...[[3.0, 17.2], [8.4, 17.4]].map(([lx, ly]) => shapeOf(turned(circle(lx, ly, 0.8)), 0.8, brass)),
  ];
  // the lames: seams across the finger, in the local frame
  const seam = (v, at) => 1 - clamp(Math.abs(v - at) / 0.45, 0, 1);
  const groove = (x, y, s) => {
    if (s.sdf !== finger) return 0;
    const [, ly] = local(x, y);
    const k = (ly - 4.6) / 3.4;
    return ly > 3.5 && ly < 11 ? seam(k, Math.round(k)) : 0;
  };
  return cursor(shapes, {
    rim: shade("slate", 0.3),
    groove,
    overlap: 0.7,
    edge: { color: shade("slateLight", 1.9), amount: 0.5, width: 1.0 },
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
  { name: "cursor_gauntlet", fn: "gauntlet", hotspot: GAUNTLET_HOTSPOT, build: gauntlet },
  { name: "cursor_strike", fn: "strikeMark", hotspot: STRIKE_HOTSPOT, build: strikeMark },
];
