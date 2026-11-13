/**
 * The corner row (FS-3EBCA): the panel icons in the bottom-right corner of every world, from the
 * right Menu (a gear: one Esc press), Inventory (a backpack: the inventory), Character (a bust: the
 * character panel), Party (two busts: the party panel) and the Mailbox. In the town the Mailbox is the mailbox's own envelope
 * (`MailboxEnvelope`, FS-1GZGD § Change), which this row leaves its slot to; elsewhere it is drawn
 * here, greyed (R9).
 *
 * Each icon is its bare glyph in 1.5 px lines over the world, with no plate under it and nothing
 * filled (FS-J1672 R1–R3): the interactable amber, brighter under the pointer, where a small label
 * names the icon and its key (R3, R5). The one exception is the Inventory icon, a small inked
 * illustration of a backpack with its own flat fills, ink and hatching, whose pressable cue is a
 * thin amber edge round it (FS-3EBCA § Change: The inventory icon is an inked backpack). Its 58 × 46 rect stays its press area (FS-J1672 R4). Drawn
 * in code from palette tokens (ADR-0013). The row decides nothing: what a press does is the
 * scene's, handed in per icon. The gear overlay's panels stop above it, so it answers
 * while they are open too (R11; FS-HRH2J § Change C12).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette, shade } from "@/utils/canvasPalette";
import { CornerLabel } from "./cornerLabel";
import { drawEnvelopeLines } from "./MailboxEnvelope";
import {
  CORNER_LABEL,
  CORNER_LABEL_GREYED_MAIL,
  cornerIconFrame,
  type CornerIcon,
  type Rect,
} from "./hudCornerLayout";

const HUD_DEPTH = 1000;
/** The glyph's lines, the envelope's. */
const LINE_W = 1.5;
/** The greyed Mailbox's lines. */
const GREYED_ALPHA = 0.6;

/** The body's leather: barrow brown warmed toward brass. */
const LEATHER = mix(palette.floor, palette.frame, 0.45);

/**
 * The inked backpack's tones (FS-3EBCA § Change: The inventory icon is an inked backpack, R3):
 * palette tokens and their mixes, each named once here. Its ink is `palette.ink`, never black.
 * None of them is amber, which is its edge's alone (R6).
 */
export const BACKPACK_TONES = {
  /** The body. */
  leather: LEATHER,
  /** The flap, the straps and the shoulder strap. */
  leatherDark: mix(palette.floor, palette.ground, 0.5),
  /** The side turned from the light, under its hatching. */
  leatherSide: shade(LEATHER, 0.2),
  /** The buckles: old brass. */
  brass: palette.frame,
  /** The bedroll: an undyed cloth. */
  cloth: shade(palette.hudLabel, 0.15),
  /** The bedroll's rolled end, turned from the light. */
  clothEnd: shade(palette.hudLabel, 0.4),
  /** The cords that tie it, darker than the cloth. */
  cord: shade(palette.hudLabel, 0.65),
  /** The ink: outlines, part lines, hatching, stitches and scratches. */
  ink: palette.ink,
} as const;

const labelOf = (spec: CornerIconSpec) =>
  spec.greyed && spec.icon === "mail" ? CORNER_LABEL_GREYED_MAIL : CORNER_LABEL[spec.icon];

export interface CornerIconSpec {
  icon: CornerIcon;
  /** What a press does; the scene's own key path (Esc, I, T). */
  press?: () => void;
  /** Shown but not pressable (the Mailbox outside the town, R9): faint, no hand, no press. */
  greyed?: boolean;
}

export interface HudCornerDeps {
  icons: CornerIconSpec[];
}

/** What a glyph draws with: lines only, never a fill (FS-J1672 R3). */
type Ink = Pick<
  Phaser.GameObjects.Graphics,
  "lineStyle" | "strokeCircle" | "lineBetween" | "beginPath" | "arc" | "strokePath" | "closePath"
>;

/**
 * What the backpack draws with: a glyph's lines, and the flat fills of its parts (FS-3EBCA §
 * Change: The inventory icon is an inked backpack, R5). The other glyphs keep to {@link Ink}.
 */
type FilledInk = Ink & Pick<Phaser.GameObjects.Graphics, "fillStyle" | "moveTo" | "lineTo" | "fillPath">;

interface DrawnIcon {
  spec: CornerIconSpec;
  frame: Rect;
  graphics: Phaser.GameObjects.Graphics;
  zone: Phaser.GameObjects.Zone;
  hovered: boolean;
}

export class HudCorner {
  private readonly icons: DrawnIcon[];
  private readonly label: CornerLabel;

  constructor(scene: Phaser.Scene, deps: HudCornerDeps) {
    this.label = new CornerLabel(scene);
    this.icons = deps.icons.map((spec) => {
      const frame = cornerIconFrame(spec.icon, viewport);
      const graphics = scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
      const zone = scene.add
        .zone(frame.x, frame.y, frame.width, frame.height)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH)
        .setInteractive({ useHandCursor: !spec.greyed });
      const drawn: DrawnIcon = { spec, frame, graphics, zone, hovered: false };
      zone.on("pointerdown", () => this.press(drawn));
      zone.on("pointerover", () => this.hover(drawn, true));
      zone.on("pointerout", () => this.hover(drawn, false));
      this.draw(drawn);
      return drawn;
    });
  }

  /**
   * Whether a screen point lies in an icon's rect, or in that icon's rect alone when one is named:
   * a press there is the row's, never the world's (R10; FS-J1672 R4); the open menu lets the Menu
   * icon through (R18).
   */
  covers(x: number, y: number, icon?: CornerIcon): boolean {
    return this.icons.some(
      ({ spec, frame: f }) =>
        (icon === undefined || spec.icon === icon) && x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height,
    );
  }

  /** The logical view changed: every icon back to the corner (FS-ZAJMH R12, R13). */
  relayout(): void {
    for (const icon of this.icons) {
      icon.frame = cornerIconFrame(icon.spec.icon, viewport);
      icon.zone.setPosition(icon.frame.x, icon.frame.y);
      this.draw(icon);
    }
    const hovered = this.icons.find((i) => i.hovered);
    if (hovered) this.label.show(hovered.frame, labelOf(hovered.spec));
  }

  destroy(): void {
    this.label.hide();
    for (const { graphics, zone } of this.icons) {
      graphics.destroy();
      zone.destroy();
    }
  }

  private press(icon: DrawnIcon): void {
    if (icon.spec.greyed) return;
    icon.spec.press?.();
  }

  private hover(icon: DrawnIcon, on: boolean): void {
    if (icon.hovered === on) return;
    icon.hovered = on;
    this.draw(icon);
    if (on) this.label.show(icon.frame, labelOf(icon.spec));
    else this.label.hide();
  }

  private draw(icon: DrawnIcon): void {
    const g = icon.graphics.clear();
    const f = icon.frame;
    if (icon.spec.greyed) {
      // never amber: an amber thing the player cannot act on is a defect (R9); bare, with no seal
      // and no count, since nothing of the mailbox is fetched outside the town (FS-J1672 R7, R8)
      drawEnvelopeLines(g, f, palette.hudFaint, GREYED_ALPHA);
      return;
    }
    const ink = icon.hovered ? palette.interactableBright : palette.interactable;
    const alpha = icon.hovered ? 1 : 0.85;
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    if (icon.spec.icon === "menu") drawGear(g, cx, cy, ink, alpha);
    else if (icon.spec.icon === "inventory") drawBackpack(g, cx, cy, ink, alpha);
    else if (icon.spec.icon === "character") drawBust(g, cx, cy + 1, 1, ink, alpha);
    else if (icon.spec.icon === "party") drawParty(g, cx, cy, ink, alpha);
  }
}

/** A gear (R3): a ring with eight square teeth round a small hub. */
export function drawGear(g: Ink, cx: number, cy: number, ink: number, alpha: number): void {
  g.lineStyle(LINE_W, ink, alpha);
  g.strokeCircle(cx, cy, 9);
  g.strokeCircle(cx, cy, 3.5);
  g.lineStyle(3, ink, alpha);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.lineBetween(
      cx + Math.cos(a) * 9.5,
      cy + Math.sin(a) * 9.5,
      cx + Math.cos(a) * 13,
      cy + Math.sin(a) * 13,
    );
  }
}

// ── The inked backpack (FS-3EBCA § Change: The inventory icon is an inked backpack) ─────────────
//
// Drawn in local px round its own middle, x to the right and y down, then laid on the slot's
// centre. The pack is seen from the front, turned a little so its right side shows: the bedroll
// across its top, the flap over its top third, two buckled straps, a pouch on the side and the
// shoulder strap curving down behind that side.

type Pt = readonly [number, number];

/** The silhouette's ink line: over 2 px, so WebGL joins its corners (§ Facts). */
const OUTLINE_W = 2.5;
/** Lines between parts. */
const PART_W = 1.25;
/** Stitches, scratches and the bedroll's turns. */
const FINE_W = 0.75;
/** Hatching: fine, faint ink, so it reads as shade and not as a second outline (R2). */
const HATCH_W = 1;
const HATCH_ALPHA = 0.55;
const STITCH_ALPHA = 0.85;
const SCRATCH_ALPHA = 0.7;
/** The amber edge: 1 px, just clear of the ink outline's outer side (R6). */
const EDGE_W = 1;
const EDGE_OFFSET = OUTLINE_W / 2 + EDGE_W / 2;

/** The quadratic from `a` through the pull of `c` to `b`, in `steps` points, `a` left out. */
function bend(a: Pt, c: Pt, b: Pt, steps = 8): Pt[] {
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
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/**
 * A closed outline through `corners`, each corner rounded by its radius (0 keeps it sharp), so a
 * fine line drawn round it has no notched corner at render scale 2 (§ Facts: lines of 2 px or
 * less are not joined).
 */
function rounded(corners: readonly (readonly [number, number, number])[]): Pt[] {
  const out: Pt[] = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const [x, y, r] = corners[i];
    if (r === 0) {
      out.push([x, y]);
      continue;
    }
    const [px, py] = corners[(i + n - 1) % n];
    const [nx, ny] = corners[(i + 1) % n];
    const toPrev = Math.hypot(px - x, py - y);
    const toNext = Math.hypot(nx - x, ny - y);
    const cut = Math.min(r, toPrev / 2, toNext / 2);
    const a: Pt = [x + ((px - x) * cut) / toPrev, y + ((py - y) * cut) / toPrev];
    const b: Pt = [x + ((nx - x) * cut) / toNext, y + ((ny - y) * cut) / toNext];
    out.push(a, ...bend(a, [x, y], b, 4));
  }
  return out;
}

/** Sharp corners, for a list of points that is already smooth. */
const sharp = (points: Pt[]) => points.map(([x, y]) => [x, y, 0] as const);

/** The flap's lower edge: a curve dipping from side to side. */
const FLAP_LEFT: Pt = [-11, -1.6];
const FLAP_RIGHT: Pt = [7.9, -1.6];
const FLAP_PULL: Pt = [-1.5, 3.8];
/** Where the flap's lower edge crosses x. */
function flapEdgeY(x: number): number {
  const t = (x - FLAP_LEFT[0]) / (FLAP_RIGHT[0] - FLAP_LEFT[0]);
  const u = 1 - t;
  return u * u * FLAP_LEFT[1] + 2 * u * t * FLAP_PULL[1] + t * t * FLAP_RIGHT[1];
}

/** The bedroll: its top and bottom, its rounded left end, and its rolled right end turned to the viewer. */
const ROLL_TOP = -15;
const ROLL_BOTTOM = -8;
const ROLL_LEFT = -14;
const ROLL_END = { x: 11.5, y: -11.5, rx: 2.6, ry: 3.5 };
/** The shoulder strap's outer edge, from behind the bedroll's end to behind the pouch. */
const STRAP_OUTER = bend([13.6, -9.4], [19, -5], [16.6, 0.8], 10);

/** The whole pack's outer edge, clockwise from the bedroll's top left (R2). */
const SILHOUETTE = rounded([
  [ROLL_LEFT, ROLL_TOP, 3.5],
  [ROLL_END.x, ROLL_TOP, 0],
  ...sharp(oval(ROLL_END.x, ROLL_END.y, ROLL_END.rx, ROLL_END.ry, -Math.PI / 2, 0.6, 10).slice(1)),
  ...sharp(STRAP_OUTER.slice(0, -1)),
  [16.6, 0.8, 0.8],
  [16.4, 9.6, 3.5],
  [13, 11, 0.5],
  [13, 11.8, 2.5],
  [8, 14.5, 1],
  [-1.8, 15.2, 8],
  [-11.5, 14.5, 5.5],
  [-12.2, 3, 8],
  [-10.6, ROLL_BOTTOM, 0.5],
  [ROLL_LEFT, ROLL_BOTTOM, 3.5],
]);

/** The pack's parts, back to front. */
const STRAP = [[13.6, -9.4] as Pt, ...STRAP_OUTER, [12.6, 0.8] as Pt, [12.6, -9.4] as Pt];
const SIDE = rounded([
  [7.5, -9, 0],
  [13, -9, 0],
  [13, 11.8, 2.5],
  [8, 14.5, 1],
]);
const SIDE_FLAP = rounded([
  [7.5, -9.5, 0],
  [13, -9.5, 0],
  [13, -2.4, 0.6],
  [7.9, -1.6, 0.6],
]);
const POUCH = rounded([
  [9, 1, 1],
  [16.4, 1, 1],
  [16.4, 9.6, 3.5],
  [9.2, 11.6, 1],
]);
const POUCH_FLAP = rounded([
  [8.7, 0.3, 0.6],
  [16.7, 0.3, 0.6],
  [16.7, 3.4, 0.8],
  ...sharp(bend([16.7, 3.4], [13.4, 6.6], [8.7, 4.4], 6).slice(0, -1)),
  [8.7, 4.4, 0.8],
]);
const FRONT = rounded([
  [-10.5, -9, 0],
  [7.5, -9, 0],
  [8, 14.5, 1],
  [-1.8, 15.2, 8],
  [-11.5, 14.5, 5.5],
  [-12.2, 3, 8],
]);
const FLAP = rounded([
  [-10.9, -9.5, 0],
  [7.8, -9.5, 0],
  [FLAP_RIGHT[0], FLAP_RIGHT[1], 1],
  ...sharp(bend(FLAP_RIGHT, FLAP_PULL, FLAP_LEFT, 12).slice(0, -1)),
  [FLAP_LEFT[0], FLAP_LEFT[1], 1],
]);
/** The two straps' middles. */
const STRAP_XS = [-5.4, 2.4];
const strapOf = (x: number) =>
  rounded([
    [x - 1.5, -9.5, 0],
    [x + 1.5, -9.5, 0],
    [x + 1.5, 8.8, 0.8],
    [x, 10.6, 0.8],
    [x - 1.5, 8.8, 0.8],
  ]);
/** A buckle's frame, the gap inside it where the strap shows, and its tongue across that gap. */
const buckleOf = (x: number) => ({
  frame: rounded([
    [x - 3, -3.6, 0.6],
    [x + 3, -3.6, 0.6],
    [x + 3, 0.8, 0.6],
    [x - 3, 0.8, 0.6],
  ]),
  gap: rounded([
    [x - 1.6, -2.1, 0.3],
    [x + 1.6, -2.1, 0.3],
    [x + 1.6, -0.9, 0.3],
    [x - 1.6, -0.9, 0.3],
  ]),
  tongue: [x, -2.1, x, 0] as const,
});
const BEDROLL = rounded([
  [ROLL_LEFT, ROLL_TOP, 3.5],
  [ROLL_END.x, ROLL_TOP, 0],
  [ROLL_END.x, ROLL_BOTTOM, 0],
  [ROLL_LEFT, ROLL_BOTTOM, 3.5],
]);
const ROLL_FACE = oval(ROLL_END.x, ROLL_END.y, ROLL_END.rx, ROLL_END.ry, 0, 2 * Math.PI, 20).slice(0, -1);
/** The cloth wound round itself on the rolled face, a turn of it near that end, and the left end's curl. */
const ROLL_SPIRAL = oval(ROLL_END.x + 0.2, ROLL_END.y + 0.2, 1.4, 2, -Math.PI / 2, Math.PI, 12);
const ROLL_TURN = [[9, -14.8] as Pt, ...bend([9, -14.8], [7.4, -11.5], [9, -8.2], 8)];
const ROLL_CURL = [[-11.4, -13.8] as Pt, ...bend([-11.4, -13.8], [-12.9, -11.5], [-11.4, -9.2], 6)];
/** The cords: a tie round the roll, and its two loose ends hanging over the flap. */
const CORD_XS = [-9, 5.6];
const cordOf = (x: number) => ({
  tie: [[x - 0.3, -15.1] as Pt, ...bend([x - 0.3, -15.1], [x + 1, -11.5], [x - 0.3, -7.9], 6)],
  ends: [
    [[x - 0.3, -7.9] as Pt, ...bend([x - 0.3, -7.9], [x - 1.4, -6.5], [x - 1, -4.7], 4)],
    [[x - 0.3, -7.9] as Pt, ...bend([x - 0.3, -7.9], [x + 0.9, -6.7], [x + 0.8, -5.1], 4)],
  ],
});

/** Parallel hatching, slanted down to the right, inside the box from (x0, y0) to (x1, y1). */
function hatchBox(x0: number, y0: number, x1: number, y1: number, gap: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  // the lines y = x + k: each meets the box from its left or top to its right or bottom
  for (let k = y0 - x1 + gap / 2; k < y1 - x0; k += gap) {
    const a: Pt = [Math.max(x0, y0 - k), Math.max(y0, x0 + k)];
    const b: Pt = [Math.min(x1, y1 - k), Math.min(y1, x1 + k)];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.8) out.push([a, b]);
  }
  return out;
}

/** Short slanted strokes in a row, each hanging `drop` below the curve `y(x)`. */
function hatchUnder(x0: number, x1: number, gap: number, y: (x: number) => number, drop: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let x = x0; x <= x1; x += gap) out.push([[x, y(x) + 0.9], [x + drop * 0.5, y(x) + 0.9 + drop]]);
  return out;
}

const HATCH = {
  side: hatchBox(8.2, -8.6, 12.6, 12.4, 1.4),
  underRoll: hatchUnder(-10.2, 7.4, 1.3, () => ROLL_BOTTOM - 0.1, 1.6),
  underFlap: hatchUnder(-10, 7.2, 1.3, flapEdgeY, 2),
  // under the pouch's flap, its lower edge taken as a straight slope
  underPouchFlap: hatchUnder(9.6, 15.6, 1.3, (x) => 4.4 - ((x - 9.6) / 6) * 0.6, 1.8),
  rollUnderside: hatchUnder(-12.4, 8.4, 1.3, () => ROLL_BOTTOM - 3, 1.8),
};

/** Stitches: dashes along a curve, a gap between each. */
function stitches(along: Pt[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < along.length; i += 2) out.push([along[i], along[i + 1]]);
  return out;
}

const STITCHES = [
  // along the flap's edge, just inside it
  ...stitches(bend([FLAP_LEFT[0] + 1, FLAP_LEFT[1] - 1.4], [FLAP_PULL[0], FLAP_PULL[1] - 1.6], [FLAP_RIGHT[0] - 1, FLAP_RIGHT[1] - 1.4], 22)),
  // the pouch's flap and its outer seam
  ...stitches(bend([15.8, 3.2], [13.4, 5.6], [9.6, 4], 8)),
  ...stitches(oval(15.4, 6.6, 0, 3, -Math.PI / 2, Math.PI / 2, 6)),
  // down the shoulder strap
  ...stitches(bend([14.2, -8.4], [17.4, -5], [15.6, 0], 9)),
];

const SCRATCHES: [Pt, Pt][] = [
  [[-9, 6], [-7.2, 7.8]],
  [[-2.2, 10], [0.4, 9]],
  [[4.8, 6.2], [5.8, 8.5]],
  [[-8.2, -6.2], [-6.8, -4.6]],
];

/** The middle of the box round the silhouette: the point laid on the slot's centre. */
const SIL_MID = (() => {
  const xs = SILHOUETTE.map(([x]) => x);
  const ys = SILHOUETTE.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as const;
})();

/** The closed outline `points` pushed out by `d` along its outward normal at every point. */
function outset(points: Pt[], d: number): Pt[] {
  const n = points.length;
  const unit = (x: number, y: number): Pt => {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  // clockwise on screen (y down): the outward normal of an edge (dx, dy) is (dy, -dx)
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i + n - 1) % n];
    const [x, y] = points[i];
    const [nx, ny] = points[(i + 1) % n];
    const [ax, ay] = unit(x - px, y - py);
    const [bx, by] = unit(nx - x, ny - y);
    const [mx, my] = unit(ay + by, -(ax + bx));
    // a miter, capped so a sharp turn cannot throw the point far out
    const cos = Math.max(0.5, mx * ay - my * ax);
    out.push([x + (mx * d) / cos, y + (my * d) / cos]);
  }
  return out;
}

const EDGE = outset(SILHOUETTE, EDGE_OFFSET);

/**
 * The Inventory icon (FS-3EBCA § Change: The inventory icon is an inked backpack, R1–R6): a small
 * inked illustration of an adventurer's backpack, centred on (cx, cy). Flat fills of leather,
 * brass and cloth inside a heavy ink outline, ink part lines, hatching for its shade, stitches and
 * scratches; no gradient and no light. Its one amber is a 1 px edge outside the outline, `edge` at
 * `edgeAlpha`, the only thing that changes under the pointer.
 */
export function drawBackpack(g: FilledInk, cx: number, cy: number, edge: number, edgeAlpha: number): void {
  const ox = cx - SIL_MID[0];
  const oy = cy - SIL_MID[1];
  const trace = (points: Pt[], closed: boolean) => {
    g.beginPath();
    g.moveTo(ox + points[0][0], oy + points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(ox + points[i][0], oy + points[i][1]);
    if (closed) g.closePath();
  };
  const fill = (points: Pt[], colour: number) => {
    g.fillStyle(colour, 1);
    trace(points, true);
    g.fillPath();
  };
  // the line style before the path: WebGL takes each point's width as the point is laid
  const line = (points: Pt[], width: number, colour: number, alpha: number, closed: boolean) => {
    g.lineStyle(width, colour, alpha);
    trace(points, closed);
    g.strokePath();
  };
  const part = (points: Pt[], colour: number) => {
    fill(points, colour);
    line(points, PART_W, BACKPACK_TONES.ink, 1, true);
  };
  const strokes = (segments: [Pt, Pt][], width: number, alpha: number) => {
    g.lineStyle(width, BACKPACK_TONES.ink, alpha);
    for (const [[x0, y0], [x1, y1]] of segments) g.lineBetween(ox + x0, oy + y0, ox + x1, oy + y1);
  };

  line(EDGE, EDGE_W, edge, edgeAlpha, true);

  // the shoulder strap, behind the side; the side, turned from the light, hatched
  part(STRAP, BACKPACK_TONES.leatherDark);
  fill(SIDE, BACKPACK_TONES.leatherSide);
  strokes(HATCH.side, HATCH_W, HATCH_ALPHA);
  line(SIDE, PART_W, BACKPACK_TONES.ink, 1, true);
  part(SIDE_FLAP, BACKPACK_TONES.leatherDark);

  // the pouch on the side, under its own flap
  part(POUCH, BACKPACK_TONES.leather);
  strokes(HATCH.underPouchFlap, HATCH_W, HATCH_ALPHA);
  part(POUCH_FLAP, BACKPACK_TONES.leather);

  // the front, shaded under the flap, worn
  part(FRONT, BACKPACK_TONES.leather);
  strokes(HATCH.underFlap, HATCH_W, HATCH_ALPHA);

  // the flap, shaded under the bedroll
  fill(FLAP, BACKPACK_TONES.leatherDark);
  strokes(HATCH.underRoll, HATCH_W, HATCH_ALPHA);
  line(FLAP, PART_W, BACKPACK_TONES.ink, 1, true);
  strokes(STITCHES, FINE_W, STITCH_ALPHA);
  strokes(SCRATCHES, FINE_W, SCRATCH_ALPHA);

  // the straps, each through its brass buckle
  for (const x of STRAP_XS) {
    part(strapOf(x), BACKPACK_TONES.leatherDark);
    const buckle = buckleOf(x);
    fill(buckle.frame, BACKPACK_TONES.brass);
    fill(buckle.gap, BACKPACK_TONES.leatherDark);
    line(buckle.frame, FINE_W, BACKPACK_TONES.ink, 1, true);
    g.lineBetween(ox + buckle.tongue[0], oy + buckle.tongue[1], ox + buckle.tongue[2], oy + buckle.tongue[3]);
  }

  // the bedroll across the top, its rolled end showing, tied with two cords
  fill(BEDROLL, BACKPACK_TONES.cloth);
  strokes(HATCH.rollUnderside, HATCH_W, HATCH_ALPHA);
  line(BEDROLL, PART_W, BACKPACK_TONES.ink, 1, true);
  line(ROLL_TURN, FINE_W, BACKPACK_TONES.ink, 1, false);
  line(ROLL_CURL, FINE_W, BACKPACK_TONES.ink, 1, false);
  part(ROLL_FACE, BACKPACK_TONES.clothEnd);
  line(ROLL_SPIRAL, FINE_W, BACKPACK_TONES.ink, 1, false);
  for (const x of CORD_XS) {
    const cord = cordOf(x);
    line(cord.tie, 1.5, BACKPACK_TONES.cord, 1, false);
    for (const end of cord.ends) line(end, 1, BACKPACK_TONES.cord, 1, false);
  }

  // last, the heavy ink line round the whole silhouette
  line(SILHOUETTE, OUTLINE_W, BACKPACK_TONES.ink, 1, true);
}

/** A bust's outline: its head's circle and the half circle of its shoulders. */
interface BustShape {
  cx: number;
  headY: number;
  headR: number;
  shoulderY: number;
  shoulderR: number;
}

function bustShape(cx: number, cy: number, s: number): BustShape {
  return { cx, headY: cy - 6 * s, headR: 5 * s, shoulderY: cy + 12 * s, shoulderR: 11 * s };
}

/** Whether (x, y) lies on the bust's shape, its lines' width included: where it hides what is behind it. */
function onBust(b: BustShape, x: number, y: number): boolean {
  if (Math.hypot(x - b.cx, y - b.headY) <= b.headR + LINE_W) return true;
  return y <= b.shoulderY && Math.hypot(x - b.cx, y - b.shoulderY) <= b.shoulderR + LINE_W;
}

/** How finely an outline is cut where a bust in front covers it: half a degree. */
const COVER_STEPS_PER_TURN = 720;

/**
 * The runs of the arc of (x, y, r), clockwise from `start` to `end`, that `front` leaves in view
 * (FS-J1672 R3), as [from, to] angles.
 */
function uncoveredRuns(
  x: number,
  y: number,
  r: number,
  start: number,
  end: number,
  front: BustShape,
): [number, number][] {
  const steps = Math.max(1, Math.round(((end - start) / (2 * Math.PI)) * COVER_STEPS_PER_TURN));
  const angle = (i: number) => start + ((end - start) * i) / steps;
  const shown = (i: number) =>
    i <= steps && !onBust(front, x + Math.cos(angle(i)) * r, y + Math.sin(angle(i)) * r);
  const runs: [number, number][] = [];
  let from: number | undefined;
  // one step past the end, never shown, closes the last run
  for (let i = 0; i <= steps + 1; i++) {
    if (shown(i)) from ??= i;
    else if (from !== undefined) {
      if (i - 1 > from) runs.push([angle(from), angle(i - 1)]);
      from = undefined;
    }
  }
  return runs;
}

/**
 * A bust (R3): a head over the curve of the shoulders, `s` its scale. With `front`, the bust
 * standing in front of this one, this one's shoulders are left undrawn where that one covers them
 * (FS-J1672 R3), its head standing clear: nothing is filled, so no dark patch is left on the world.
 */
export function drawBust(
  g: Ink,
  cx: number,
  cy: number,
  s: number,
  ink: number,
  alpha: number,
  front?: { cx: number; cy: number; s: number },
): void {
  const b = bustShape(cx, cy, s);
  const cover = front && bustShape(front.cx, front.cy, front.s);
  g.lineStyle(LINE_W, ink, alpha);
  // the back head stands clear of the front bust, so only the shoulders are ever cut
  g.strokeCircle(cx, b.headY, b.headR);

  const shoulders = cover
    ? uncoveredRuns(cx, b.shoulderY, b.shoulderR, Math.PI, 2 * Math.PI, cover)
    : [[Math.PI, 0] as [number, number]];
  for (const [from, to] of shoulders) strokeArc(g, cx, b.shoulderY, b.shoulderR, from, to);
}

/** One open arc, clockwise. */
function strokeArc(g: Ink, x: number, y: number, r: number, from: number, to: number): void {
  g.beginPath();
  g.arc(x, y, r, from, to, false);
  g.strokePath();
}

/** Two busts (R3): one stepped behind and above the other, the front one standing over it. */
export function drawParty(g: Ink, cx: number, cy: number, ink: number, alpha: number): void {
  const front = { cx: cx + 5, cy: cy + 2, s: 0.85 };
  drawBust(g, cx - 6, cy - 2, 0.8, ink, alpha, front);
  drawBust(g, front.cx, front.cy, front.s, ink, alpha);
}
