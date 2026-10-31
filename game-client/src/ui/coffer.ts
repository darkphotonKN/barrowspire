/**
 * The coffer: the container view's face for a chest (FS-1D6BX §Requirements 15, D4). It is a
 * square open box of banded oak, the baked chest without its lid, seen from the front and a
 * little above the front rim. You look down past the rim onto the dark floor the items lie on.
 * It is drawn here in code, as the satchel is (ADR-0020/0021, D10), with every colour from the
 * canvas palette.
 *
 * It fills the satchel's footprint (`BODY_W` × `BODY_H`, D8), so the satchel's slots sit on its
 * floor. Geometry is in texture px; the view centres the texture on its origin. Nothing opens:
 * there is one texture, and no lid.
 */

import type Phaser from "phaser";
import { palette, rgba, shade, tint } from "@/utils/canvasPalette";
import { fbm, hash, paint, roundedPoly, type Pt } from "./paintKit";
import { BODY_H, BODY_W } from "./satchel";

export const COFFER_KEY = "ui:coffer";

/** Paints the coffer unless a previous scene already did. */
export function ensureCofferTexture(scene: Phaser.Scene): void {
  if (!scene.textures.exists(COFFER_KEY))
    paint(scene, COFFER_KEY, BODY_W, BODY_H, paintCoffer);
}

// The box, in texture px. The far (back) edges are narrower than the near ones: perspective.
const OUTER: Pt[] = [
  [40, 14],
  [320, 14],
  [352, 270],
  [8, 270],
];
/** The opening inside the rim: the walls are as thick as the rim is wide. */
const INNER: Pt[] = [
  [56, 30],
  [304, 30],
  [332, 254],
  [28, 254],
];
/** Where the back wall meets the floor. */
const FLOOR_BACK: [Pt, Pt] = [
  [80, 94],
  [280, 94],
];
const FRONT_TOP = 270;
const FRONT_BOTTOM = 314;
/** The iron bands, as fractions of the half-width from the centre, as on the baked chest. */
const BANDS = [-0.67, 0.67];
const BAND_W = 22;

function paintCoffer(b: CanvasRenderingContext2D, W: number, H: number) {
  const [bl, br] = FLOOR_BACK;
  const [il, ir, ifr, ifl] = INNER;

  // the floor, then the walls you see the inside of: the back, and the two sides
  const floor = poly([bl, br, ifr, ifl]);
  fillGrained(b, floor, palette.cofferFloor, W, H, 11, [3, 34], 0.5);
  floorBoards(b, floor);
  const back = poly([il, ir, br, bl]);
  fillGrained(b, back, palette.cofferInside, W, H, 12, [40, 3], 0.45);
  boardSeams(b, back, [52, 73], il[0], ir[0]);
  const left = poly([il, bl, ifl]);
  fillGrained(
    b,
    left,
    shade(palette.cofferInside, 0.35),
    W,
    H,
    13,
    [4, 30],
    0.4,
  );
  const right = poly([ir, ifr, br]);
  fillGrained(
    b,
    right,
    tint(palette.cofferInside, 0.08),
    W,
    H,
    14,
    [4, 30],
    0.4,
  );

  // the dark down where the walls meet the floor, and the far wall under the rim's shadow
  b.save();
  b.clip(poly(INNER));
  const fall = b.createLinearGradient(0, 30, 0, 110);
  fall.addColorStop(0, rgba(palette.inkDeep, 0.55));
  fall.addColorStop(1, rgba(palette.inkDeep, 0));
  b.fillStyle = fall;
  b.fill(poly(INNER));
  const pool = b.createRadialGradient(W / 2, 170, 30, W / 2, 170, 210);
  pool.addColorStop(0, rgba(palette.inkDeep, 0));
  pool.addColorStop(1, rgba(palette.inkDeep, 0.6));
  b.fillStyle = pool;
  b.fill(floor);
  b.lineWidth = 3;
  b.strokeStyle = rgba(palette.inkDeep, 0.7);
  b.stroke(poly([il, bl, br, ir]));
  b.beginPath();
  b.moveTo(...bl);
  b.lineTo(...ifl);
  b.moveTo(...br);
  b.lineTo(...ifr);
  b.stroke();
  b.restore();

  // the rim: the walls' top edges, lit from above
  const rim = new Path2D();
  rim.addPath(poly(OUTER));
  rim.addPath(poly([...INNER].reverse()));
  fillGrained(b, rim, tint(palette.coffer, 0.18), W, H, 15, [30, 3], 0.35);
  b.lineWidth = 2;
  b.strokeStyle = rgba(palette.inkDeep, 0.75);
  b.stroke(poly(INNER));
  b.strokeStyle = rgba(tint(palette.coffer, 0.4), 0.5);
  b.lineWidth = 1.5;
  b.stroke(poly(OUTER));

  // the front of the box, below its rim
  const front = poly([
    [8, FRONT_TOP],
    [352, FRONT_TOP],
    [348, FRONT_BOTTOM],
    [12, FRONT_BOTTOM],
  ]);
  fillGrained(b, front, palette.coffer, W, H, 16, [44, 3], 0.45);
  boardSeams(b, front, [292], 8, 352);
  b.save();
  b.clip(front);
  const under = b.createLinearGradient(0, FRONT_TOP, 0, FRONT_BOTTOM);
  under.addColorStop(0, rgba(palette.inkDeep, 0.45));
  under.addColorStop(0.25, rgba(palette.inkDeep, 0));
  under.addColorStop(1, rgba(palette.inkDeep, 0.35));
  b.fillStyle = under;
  b.fill(front);
  b.restore();
  // stubby feet under the front corners
  for (const x of [14, 318]) {
    b.fillStyle = rgba(shade(palette.coffer, 0.55), 1);
    b.fillRect(x, FRONT_BOTTOM, 28, 8);
  }

  ironwork(b);
  lockPlate(b, W / 2, 292);

  // inked outline, as every hand-drawn thing in the barrow has
  const hull = poly([
    OUTER[0],
    OUTER[1],
    OUTER[2],
    [348, FRONT_BOTTOM],
    [12, FRONT_BOTTOM],
    OUTER[3],
  ]);
  b.lineWidth = 3;
  b.strokeStyle = rgba(palette.inkDeep, 0.9);
  b.stroke(hull);
}

/** Two iron bands over the front and both rims, iron at the front corners, rivets on all of it. */
function ironwork(b: CanvasRenderingContext2D) {
  for (const f of BANDS) {
    const near = 180 + f * 172;
    const far = 180 + f * 140;
    // over the back rim
    band(b, [
      [far - BAND_W / 2 + 1, OUTER[0][1]],
      [far + BAND_W / 2 - 1, OUTER[0][1]],
      [far + BAND_W / 2 - 1, INNER[0][1]],
      [far - BAND_W / 2 + 1, INNER[0][1]],
    ]);
    // over the front rim and down the front
    band(b, [
      [near - BAND_W / 2, INNER[2][1]],
      [near + BAND_W / 2, INNER[2][1]],
      [near + BAND_W / 2, FRONT_BOTTOM],
      [near - BAND_W / 2, FRONT_BOTTOM],
    ]);
    rivet(b, near, 262, 3.5);
    rivet(b, near, 282, 3.5);
    rivet(b, near, 304, 3.5);
    rivet(b, far, 22, 3);
  }
  // corner irons: an angle bracket over each front corner
  for (const [x, dir] of [
    [8, 1],
    [352, -1],
  ] as const) {
    band(b, [
      [x, FRONT_TOP - 16],
      [x + dir * 26, FRONT_TOP - 16],
      [x + dir * 26, FRONT_BOTTOM],
      [x, FRONT_BOTTOM],
    ]);
    rivet(b, x + dir * 13, FRONT_TOP - 6, 3);
    rivet(b, x + dir * 13, FRONT_BOTTOM - 10, 3);
  }
}

function band(b: CanvasRenderingContext2D, pts: Pt[]) {
  const p = poly(pts);
  const top = Math.min(...pts.map((pt) => pt[1]));
  const bottom = Math.max(...pts.map((pt) => pt[1]));
  const g = b.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, rgba(tint(palette.cofferIron, 0.18), 1));
  g.addColorStop(1, rgba(shade(palette.cofferIron, 0.3), 1));
  b.fillStyle = g;
  b.fill(p);
  // pitting
  b.save();
  b.clip(p);
  for (let i = 0; i < 40; i++) {
    const x = pts[0][0] + hash(i, 1, top) * 40 - 8;
    const y = top + hash(i, 2, top) * (bottom - top);
    b.fillStyle = rgba(palette.inkDeep, 0.25);
    b.fillRect(x, y, 1.5, 1.5);
  }
  b.restore();
  b.lineWidth = 1.5;
  b.strokeStyle = rgba(palette.inkDeep, 0.8);
  b.stroke(p);
}

/** The brass lock plate on the front, keyhole and all. */
function lockPlate(b: CanvasRenderingContext2D, x: number, y: number) {
  const plate = roundedPoly(
    [
      [x - 15, y - 17],
      [x + 15, y - 17],
      [x + 15, y + 12],
      [x, y + 20],
      [x - 15, y + 12],
    ],
    4,
  );
  const g = b.createLinearGradient(x - 15, y - 17, x + 15, y + 20);
  g.addColorStop(0, rgba(tint(palette.cofferBrass, 0.3), 1));
  g.addColorStop(1, rgba(shade(palette.cofferBrass, 0.4), 1));
  b.fillStyle = g;
  b.fill(plate);
  b.lineWidth = 1.5;
  b.strokeStyle = rgba(palette.inkDeep, 0.85);
  b.stroke(plate);
  b.fillStyle = rgba(palette.inkDeep, 1);
  b.beginPath();
  b.arc(x, y - 3, 3.5, 0, Math.PI * 2);
  b.fill();
  b.beginPath();
  b.moveTo(x - 2, y - 1);
  b.lineTo(x + 2, y - 1);
  b.lineTo(x + 3, y + 9);
  b.lineTo(x - 3, y + 9);
  b.closePath();
  b.fill();
  for (const [rx, ry] of [
    [x - 10, y - 12],
    [x + 10, y - 12],
  ])
    rivet(b, rx, ry, 2.5, palette.cofferBrass);
}

/** The floor's boards run away from you, so their joints close in toward the back wall. */
function floorBoards(b: CanvasRenderingContext2D, floor: Path2D) {
  const [bl, br] = FLOOR_BACK;
  const [, , ifr, ifl] = INNER;
  const boards = 6;
  b.save();
  b.clip(floor);
  b.lineWidth = 2;
  b.strokeStyle = rgba(palette.inkDeep, 0.6);
  for (let i = 1; i < boards; i++) {
    const t = i / boards;
    b.beginPath();
    b.moveTo(bl[0] + (br[0] - bl[0]) * t, bl[1]);
    b.lineTo(ifl[0] + (ifr[0] - ifl[0]) * t, ifl[1]);
    b.stroke();
    // a nail head where each board crosses the hidden batten
    const nx = ifl[0] + (ifr[0] - ifl[0]) * (t - 0.5 / boards) * 0.98 + 4;
    b.fillStyle = rgba(palette.inkDeep, 0.55);
    b.beginPath();
    b.arc(nx, 226, 2, 0, Math.PI * 2);
    b.fill();
  }
  b.restore();
}

/** Joints between horizontal boards: a dark line and the lit lip below it. */
function boardSeams(
  b: CanvasRenderingContext2D,
  path: Path2D,
  ys: number[],
  x0: number,
  x1: number,
) {
  b.save();
  b.clip(path);
  for (const y of ys) {
    b.fillStyle = rgba(palette.inkDeep, 0.6);
    b.fillRect(x0, y - 1, x1 - x0, 2);
    b.fillStyle = rgba(tint(palette.coffer, 0.3), 0.18);
    b.fillRect(x0, y + 1, x1 - x0, 1);
  }
  b.restore();
}

/**
 * Fills a shape with wood, its grain streaked along the board: `stretch` is the noise scale in x
 * and y, so [40, 3] runs the grain across and [3, 34] runs it away from you.
 */
function fillGrained(
  b: CanvasRenderingContext2D,
  path: Path2D,
  color: number,
  w: number,
  h: number,
  seed: number,
  stretch: [number, number],
  amount: number,
) {
  b.save();
  b.clip(path);
  b.fillStyle = rgba(color, 1);
  b.fill(path);
  const img = b.getImageData(0, 0, w, h);
  const d = img.data;
  const mask = b.isPointInPath.bind(b);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask(path, x + 0.5, y + 0.5)) continue;
      const i = (y * w + x) * 4;
      const streak = fbm(x / stretch[0], y / stretch[1], seed);
      const knot = fbm(x / 7, y / 7, seed + 9) > 0.78 ? -0.1 : 0;
      const f =
        1 -
        amount / 2 +
        amount * streak +
        (hash(x, y, seed) - 0.5) * 0.08 +
        knot;
      d[i] *= f;
      d[i + 1] *= f;
      d[i + 2] *= f;
    }
  b.putImageData(img, 0, 0);
  b.restore();
}

function rivet(
  b: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  metal: number = palette.cofferIron,
) {
  const g = b.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.5, x, y, r);
  g.addColorStop(0, rgba(tint(metal, 0.5), 1));
  g.addColorStop(0.6, rgba(metal, 1));
  g.addColorStop(1, rgba(shade(metal, 0.6), 1));
  b.fillStyle = g;
  b.beginPath();
  b.arc(x, y, r, 0, Math.PI * 2);
  b.fill();
}

function poly(pts: Pt[]): Path2D {
  const p = new Path2D();
  p.moveTo(...pts[0]);
  for (const pt of pts.slice(1)) p.lineTo(...pt);
  p.closePath();
  return p;
}
