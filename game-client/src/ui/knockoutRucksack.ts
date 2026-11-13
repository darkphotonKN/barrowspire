/**
 * The Inventory icon of the corner row (FS-3EBCA § Change: The inventory icon is a bronze knockout
 * rucksack; the owner, 2026-11-13: 「古銅反白好了」): a round, squat rucksack from the front, a bedroll
 * tied across its top, a wide rounded flap shut by a hasp on a ring, and a low pocket with its own
 * flap at each side.
 *
 * It is the row's one **knockout**: one solid silhouette in bronze (brass and amber mixed half and
 * half) with its inner lines cut out of it, so the world shows through them (R1–R5). A texture's
 * framebuffer is not antialiased, so the rucksack is drawn white into a render texture at twice the
 * render scale, its cuts erased, and shown at the slot filtered down; the tint gives it its colour,
 * so hover never redraws it (R6). Where a scene cannot make that texture, the same rucksack is
 * drawn in the row's lines instead (R9). Drawn in code from palette tokens (ADR-0013).
 */

import type Phaser from "phaser";
import { mix, palette } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import type { Rect } from "./hudCornerLayout";

/** What the line rucksack draws with: lines only, never a fill (FS-J1672 R3). */
type Pen = Pick<
  Phaser.GameObjects.Graphics,
  "lineStyle" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "strokePath" | "strokeCircle"
>;

type Pt = readonly [number, number];

/** The cut lines' width, in logical px (R4). */
const CUT_W = 1.6;
/** How much finer than the render scale its texture is drawn (R6). */
const SUPERSAMPLE = 2;
/** Its bronze idle, and lifted toward the bright amber under the pointer (R3, R5). */
const INK = {
  idle: { tint: mix(palette.frame, palette.interactable, 0.5), alpha: 0.85 },
  hover: { tint: mix(palette.frame, palette.interactableBright, 0.5), alpha: 1 },
};

/** The quadratic from `a` through the pull of `c` to `b`, in `steps` points, `a` left out. */
function bend(a: Pt, c: Pt, b: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** The arc of an ellipse from angle `from` to `to`, in `steps` points, both ends kept. */
function oval(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
}

// ── The round rucksack, in local px about its box's middle, x to the right and y down ─────────────

/** The bedroll: its box, rounded at both ends. */
const ROLL = { left: -11, right: 11, top: -15, bottom: -9 };
const ROLL_R = (ROLL.bottom - ROLL.top) / 2;
const ROLL_MID = (ROLL.top + ROLL.bottom) / 2;
/** The body: a squat superellipse under the roll, its centre's height, half-axes and exponent. */
const BODY_C = { y: 3, rx: 14.5, ry: 11.5, n: 2.6 };
/** The middle of the box from the roll's top to the body's foot: laid on the slot's centre. */
const MID = (ROLL.top + BODY_C.y + BODY_C.ry) / 2;
const up = (ps: readonly Pt[]): Pt[] => ps.map(([x, y]) => [x, y - MID] as Pt);

const ROLL_SHAPE = up([
  ...oval(ROLL.left + ROLL_R, ROLL_MID, ROLL_R, ROLL_R, Math.PI / 2, (3 * Math.PI) / 2, 10),
  ...oval(ROLL.right - ROLL_R, ROLL_MID, ROLL_R, ROLL_R, -Math.PI / 2, Math.PI / 2, 10),
]);
/** The roll's rolled right end: a narrow ellipse face, closed. */
const ROLL_FACE = up(oval(ROLL.right - ROLL_R, ROLL_MID, 1.5, ROLL_R, 0, 2 * Math.PI, 16).slice(0, -1));
/** Where the roll lies on the body. */
const ROLL_SEAM = up([
  [ROLL.left + ROLL_R, ROLL.bottom],
  [ROLL.right - ROLL_R, ROLL.bottom],
]);
/** Two ties round the roll, each from its top to its bottom, bowed a little. */
const TIES = [-5.5, 4].map((x) =>
  up([[x, ROLL.top], ...bend([x, ROLL.top], [x + 1.1, ROLL_MID], [x, ROLL.bottom], 6)]),
);
/** The body's outline, from its top round clockwise. */
const BODY_RING: Pt[] = Array.from({ length: 256 }, (_, i) => {
  const a = -Math.PI / 2 + (i / 256) * 2 * Math.PI;
  const [c, s, e] = [Math.cos(a), Math.sin(a), 2 / BODY_C.n];
  return [BODY_C.rx * Math.sign(c) * Math.abs(c) ** e, BODY_C.y + BODY_C.ry * Math.sign(s) * Math.abs(s) ** e] as Pt;
});
const BODY = up(BODY_RING);
/** How far the body's side stands out from its middle at height y. */
const bodyX = (y: number) => BODY_C.rx * (1 - Math.abs((y - BODY_C.y) / BODY_C.ry) ** BODY_C.n) ** (1 / BODY_C.n);
/** The flap's lower edge: from one side of the body to the other, lowest in the middle. */
const FLAP_TOP = -4;
const FLAP = up([
  [-bodyX(FLAP_TOP), FLAP_TOP],
  ...bend([-bodyX(FLAP_TOP), FLAP_TOP], [0, 15], [bodyX(FLAP_TOP), FLAP_TOP], 18),
]);
/** The flap's lowest point: the quadratic's middle. */
const FLAP_LOW = (FLAP_TOP + 15) / 2;
/**
 * The hasp: a small U hanging from the flap's lowest point, its two foot corners rounded so its
 * 1.6 px cut, which the renderer never joins (only lines over 2 px are), leaves no wedge there (R4).
 */
const HASP = up([
  [-1.6, FLAP_LOW - 1],
  ...oval(-0.6, FLAP_LOW + 1.6, 1, 1, Math.PI, Math.PI / 2, 3),
  ...oval(0.6, FLAP_LOW + 1.6, 1, 1, Math.PI / 2, 0, 3),
  [1.6, FLAP_LOW - 1],
]);
const RING = { x: 0, y: FLAP_LOW + 4.5 - MID, r: 1.8 };

/** A box's outline from its top-left clockwise, its top corners rounded by `rt`, its foot's by `rb`. */
function roundedBox(l: number, t: number, r: number, b: number, rt: number, rb: number): Pt[] {
  return [
    ...oval(l + rt, t + rt, rt, rt, Math.PI, 1.5 * Math.PI, 4),
    ...oval(r - rt, t + rt, rt, rt, -0.5 * Math.PI, 0, 4),
    ...oval(r - rb, b - rb, rb, rb, 0, 0.5 * Math.PI, 5),
    ...oval(l + rb, b - rb, rb, rb, 0.5 * Math.PI, Math.PI, 5),
  ];
}
/**
 * The side pockets (the owner: 「背包兩側在加側袋」): a squat rounded pouch against each side of the
 * body, low on it, so the pack grows wider and not taller, each with a rounded flap of its own.
 */
const POCKET = { outer: 18.8, inner: 12, top: 5.4, bottom: 13, flap: 8.8 };
const POCKET_LEFT = roundedBox(-POCKET.outer, POCKET.top, -POCKET.inner, POCKET.bottom, 2, 3);
const POCKET_FLAP_LEFT: Pt[] = [
  [-POCKET.outer, POCKET.top + 1.6],
  ...bend(
    [-POCKET.outer, POCKET.top + 1.6],
    [-(POCKET.outer + POCKET.inner) / 2, 2 * POCKET.flap - POCKET.top - 2.2],
    [-POCKET.inner, POCKET.top + 1.6],
    10,
  ),
];
/** The left pocket, and the right as its mirror. */
const POCKETS = [1, -1].map((mirror) => ({
  shape: up(POCKET_LEFT.map(([x, y]) => [x * mirror, y] as Pt)),
  flap: up(POCKET_FLAP_LEFT.map(([x, y]) => [x * mirror, y] as Pt)),
}));

/** Whether (x, y) lies inside the shape `ps` closes round. */
function inside(ps: readonly Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[i], ps[j]];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
/** How far (x, y) stands from the outline `ps`. */
function fromOutline(ps: readonly Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < ps.length; i++) {
    const [a, b] = [ps[i], ps[(i + 1) % ps.length]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
  }
  return best;
}
/** The runs of the line `ps` that `hidden` leaves in view. */
function runs(ps: readonly Pt[], hidden: (p: Pt) => boolean): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] = [];
  for (const p of [...ps, null]) {
    if (p && !hidden(p)) run.push(p);
    else {
      if (run.length > 1) out.push(run);
      run = [];
    }
  }
  return out;
}
/**
 * The runs of the closed outline `ps` that `hidden` leaves in view, read from a hidden point round
 * to itself, so a run across the outline's first point stays one path and is joined there.
 */
function ringRuns(ps: readonly Pt[], hidden: (p: Pt) => boolean): Pt[][] {
  const from = ps.findIndex(hidden);
  return runs(from < 0 ? [...ps, ps[0]] : [...ps.slice(from), ...ps.slice(0, from + 1)], hidden);
}

/** The body's line in lines: its top, under the roll, left out. */
const BODY_LINE = up([...BODY_RING, BODY_RING[0]].filter(([, y]) => y > ROLL.bottom + GLYPH_LINE_W / 2));
/**
 * In lines, each pocket hangs just behind the body's side: only what stands out past the body's
 * line is drawn, so it reads as a pouch on the side and the body's line stays whole (R9).
 */
const behindBody = ([x, y]: Pt) => inside(BODY, x, y) || fromOutline(BODY, x, y) < GLYPH_LINE_W;
const POCKET_LINES = POCKETS.flatMap(({ shape, flap }) => [
  ...ringRuns(shape, behindBody),
  ...runs(flap, behindBody),
]);
/** Where each pocket lies over the body: its outline inside the body's silhouette, a cut seam. */
const POCKET_SEAMS = POCKETS.flatMap(({ shape }) =>
  ringRuns(shape, ([x, y]) => !(inside(BODY, x, y) && fromOutline(BODY, x, y) > 0.3)),
);

/** Strokes the line through `ps`, moved by (ox, oy), as one path, closed when `closed`. */
function stroke(g: Pen, ps: readonly Pt[], ox: number, oy: number, closed = false): void {
  g.beginPath();
  g.moveTo(ox + ps[0][0], oy + ps[0][1]);
  for (const [x, y] of ps.slice(1)) g.lineTo(ox + x, oy + y);
  if (closed) g.closePath();
  g.strokePath();
}

/**
 * The fallback (R9): the round rucksack in the row's lines, `GLYPH_LINE_W` wide, centred on
 * (cx, cy), in `ink` at `alpha`, with nothing filled; every angled corner a vertex inside one path.
 */
export function drawRucksackLines(g: Pen, cx: number, cy: number, ink: number, alpha: number): void {
  g.lineStyle(GLYPH_LINE_W, ink, alpha);
  stroke(g, ROLL_SHAPE, cx, cy, true);
  stroke(g, ROLL_FACE, cx, cy, true);
  for (const tie of TIES) stroke(g, tie, cx, cy);
  stroke(g, BODY_LINE, cx, cy);
  for (const line of POCKET_LINES) stroke(g, line, cx, cy);
  stroke(g, FLAP, cx, cy);
  stroke(g, HASP, cx, cy);
  g.strokeCircle(cx + RING.x, cy + RING.y, RING.r);
}

/** The silhouette, filled solid: the body, the roll and the two pockets (R3). */
function fillSilhouette(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(TINT_IDENTITY, 1);
  for (const shape of [BODY, ROLL_SHAPE, ...POCKETS.map(({ shape }) => shape)]) {
    g.beginPath();
    g.moveTo(shape[0][0], shape[0][1]);
    for (const [x, y] of shape.slice(1)) g.lineTo(x, y);
    g.closePath();
    g.fillPath();
  }
}

/** The cuts, each one stroke or one path, `CUT_W` wide (R4). */
function strokeCuts(g: Phaser.GameObjects.Graphics): void {
  g.lineStyle(CUT_W, TINT_IDENTITY, 1);
  stroke(g, ROLL_SEAM, 0, 0);
  stroke(g, ROLL_FACE, 0, 0, true);
  for (const tie of TIES) stroke(g, tie, 0, 0);
  stroke(g, FLAP, 0, 0);
  stroke(g, HASP, 0, 0);
  g.strokeCircle(RING.x, RING.y, RING.r);
  for (const { flap } of POCKETS) stroke(g, flap, 0, 0);
  for (const seam of POCKET_SEAMS) stroke(g, seam, 0, 0);
}

/**
 * The knockout rucksack on a slot (R3–R9): drawn into its own render texture once per render
 * scale, then only moved and tinted. `show` says whether it stands; where it cannot (the scene
 * makes no textures, or making one threw), the caller draws `drawRucksackLines`, and it never
 * tries again.
 */
export class KnockoutRucksack {
  private image?: Phaser.GameObjects.RenderTexture;
  private builtAt = 0;
  private failed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  /** Shows it on the slot `f`, hovered or not, at the render scale; false where it cannot be drawn. */
  show(f: Rect, hovered: boolean, renderScale: number): boolean {
    if (this.failed || !this.possible()) return false;
    if (!this.image || this.builtAt !== renderScale) {
      try {
        this.build(f, renderScale);
      } catch (err) {
        this.failed = true;
        console.warn("hud corner: the knockout rucksack could not be drawn; drawing it in lines", err);
        return false;
      }
    }
    const ink = hovered ? INK.hover : INK.idle;
    this.image!.setPosition(f.x + f.width / 2, f.y + f.height / 2)
      .setTint(ink.tint)
      .setAlpha(ink.alpha);
    return true;
  }

  destroy(): void {
    this.image?.destroy();
    this.image = undefined;
  }

  /** Whether the scene can make it: a test's stand-in scene cannot (R9). */
  private possible(): boolean {
    return typeof this.scene.make?.graphics === "function" && typeof this.scene.add?.renderTexture === "function";
  }

  private build(f: Rect, renderScale: number): void {
    this.destroy();
    const k = SUPERSAMPLE * renderScale;
    const image = this.scene.add.renderTexture(
      f.x + f.width / 2,
      f.y + f.height / 2,
      Math.round(f.width * k),
      Math.round(f.height * k),
    );
    const pens: Phaser.GameObjects.Graphics[] = [];
    // drawn at k, about the texture's own middle (it may have rounded its size up to even)
    const pen = () => {
      const g = this.scene.make.graphics({}, false).setScale(k).setPosition(image.width / 2, image.height / 2);
      pens.push(g);
      return g;
    };
    try {
      image.setScrollFactor(0).setDepth(this.depth).setScale(1 / k);
      const solid = pen();
      fillSilhouette(solid);
      const cuts = pen();
      strokeCuts(cuts);
      image.draw(solid).erase(cuts).render();
    } catch (err) {
      image.destroy();
      throw err;
    } finally {
      for (const g of pens) g.destroy();
    }
    this.image = image;
    this.builtAt = renderScale;
  }
}
