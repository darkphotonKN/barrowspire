/**
 * The corner row (FS-3EBCA): the panel icons in the bottom-right corner of every world, from the
 * right Menu (a gear: one Esc press), Inventory (a backpack: the inventory), Character (a bust: the
 * character panel), Party (two busts: the party panel) and the Mailbox. In the town the Mailbox is the mailbox's own envelope
 * (`MailboxEnvelope`, FS-1GZGD § Change), which this row leaves its slot to; elsewhere it is drawn
 * here, greyed (R9).
 *
 * Each icon is its bare glyph in 1.5 px lines over the world, with no plate under it and nothing
 * filled (FS-J1672 R1–R3): the interactable amber, brighter under the pointer, where a small label
 * names the icon and its key (R3, R5). The one exception is the Inventory icon, a small, dark inked
 * illustration of a backpack with its own flat fills, ink and hatching, with no amber at all: under
 * the pointer its tones lift a little (FS-3EBCA § Change: The inventory icon is an inked backpack,
 * as the owner's first tweak round changed it). Its 58 × 46 rect stays its press area (FS-J1672 R4). Drawn
 * in code from palette tokens (ADR-0013). The row decides nothing: what a press does is the
 * scene's, handed in per icon. The gear overlay's panels stop above it, so it answers
 * while they are open too (R11; FS-HRH2J § Change C12).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette, shade, tint } from "@/utils/canvasPalette";
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

/**
 * The inked backpack's tones (FS-3EBCA § Change: The inventory icon is an inked backpack, R3, as
 * the owner's first tweak round darkened them, 2026-11-13: 「要更加黑暗 有古歐洲風格」): palette tokens
 * and their mixes, each named once here. Smoky leather close to charcoal, blackened iron, dull
 * wool and hemp; its ink is `palette.ink`, never black. Nothing of it is amber or brass.
 */
export const BACKPACK_TONES = {
  /** The body: a deep, smoky brown. */
  leather: mix(palette.ground, palette.ink, 0.15),
  /** The flap and the shoulder strap, a step darker. */
  leatherDark: mix(palette.ground, palette.ink, 0.42),
  /** The side turned from the light, under its hatching. */
  leatherSide: mix(palette.ground, palette.ink, 0.32),
  /** The flap's tooled border: its incised lines, worn a little paler than the leather. */
  tooling: mix(palette.ground, palette.hudLabel, 0.3),
  /** The hasp, its ring and the rivets: blackened iron. */
  iron: mix(palette.wall, palette.ink, 0.2),
  /** Iron's one dull highlight. */
  ironLit: mix(palette.wallTop, palette.wall, 0.35),
  /** The bedroll: a rolled, dull grey-green wool blanket. */
  wool: shade(mix(palette.hudFaint, palette.safeDeep, 0.35), 0.35),
  /** The blanket's rolled end, turned from the light. */
  woolEnd: shade(mix(palette.hudFaint, palette.safeDeep, 0.35), 0.55),
  /** The hemp rope that ties it, and the pouch's drawstring. */
  rope: shade(mix(palette.hudLabel, palette.floor, 0.4), 0.32),
  /** The ink: outlines, part lines, hatching, tooling, stitches and scratches. */
  ink: palette.ink,
} as const;

/**
 * Under the pointer the whole drawing lifts a little toward light, every tone but its ink: the
 * owner dropped the amber edge (「外匡不要了」, 2026-11-13), so this and the label are the hover.
 */
export const BACKPACK_HOVER_LIFT = 0.15;

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
    else if (icon.spec.icon === "inventory") drawBackpack(g, cx, cy, icon.hovered);
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
// centre. An old haversack seen from the front, turned a little so its right side shows: a wool
// blanket rolled across its top and tied with hemp, a rounded flap with a tooled border shut by an
// iron hasp and ring, iron rivets, a drawstring pouch hanging on the side and the shoulder strap
// curving down behind that side (the owner's first tweak round, 2026-11-13).

type Pt = readonly [number, number];

/** The silhouette's ink line: over 2 px, so WebGL joins its corners (§ Facts). */
const OUTLINE_W = 2.5;
/** Lines between parts. */
const PART_W = 1.25;
/** Stitches, scratches, tooling, the blanket's turns and the iron's own edges. */
const FINE_W = 0.75;
/** Hatching: fine, faint ink, so it reads as shade and not as a second outline (R2). */
const HATCH_W = 1;
const HATCH_ALPHA = 0.55;
const STITCH_ALPHA = 0.85;
const SCRATCH_ALPHA = 0.7;

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

/** A whole circle, as a closed outline. */
const disc = (x: number, y: number, r: number) => oval(x, y, r, r, 0, 2 * Math.PI, 16).slice(0, -1);

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

/**
 * The closed, clockwise outline `points` moved `d` along its normal at every point: outward for
 * a positive `d`, inward for a negative one.
 */
function offset(points: Pt[], d: number): Pt[] {
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
    // a miter, capped so a sharp turn cannot throw the point far
    const cos = Math.max(0.5, mx * ay - my * ax);
    out.push([x + (mx * d) / cos, y + (my * d) / cos]);
  }
  return out;
}

/** The blanket roll: its top and bottom, its rounded left end, and its rolled right end turned to the viewer. */
const ROLL_TOP = -15;
const ROLL_BOTTOM = -8;
const ROLL_LEFT = -14;
const ROLL_END = { x: 11.5, y: -11.5, rx: 2.6, ry: 3.5 };
/** The shoulder strap's outer edge, from behind the roll's end to behind the pouch's neck. */
const STRAP_OUTER = bend([13.6, -9.4], [19.2, -4.5], [14.9, 2.4], 10);
/** The drawstring pouch's round belly, hanging on the side. */
const SACK = { x: 13.3, y: 7.9, rx: 3.2, ry: 3.6 };

/** The whole pack's outer edge, clockwise from the roll's top left (R2). */
const SILHOUETTE = rounded([
  [ROLL_LEFT, ROLL_TOP, 3.5],
  [ROLL_END.x, ROLL_TOP, 0],
  ...sharp(oval(ROLL_END.x, ROLL_END.y, ROLL_END.rx, ROLL_END.ry, -Math.PI / 2, 0.6, 10).slice(1)),
  ...sharp(STRAP_OUTER.slice(0, -1)),
  [14.9, 2.4, 0.6],
  [14.4, 4.5, 0.6],
  ...sharp(oval(SACK.x, SACK.y, SACK.rx, SACK.ry, -Math.PI / 3, 1.62, 12)),
  [13, 11.8, 2],
  [8, 14.5, 1],
  [-1.8, 15.2, 8],
  [-11.5, 14.5, 5.5],
  [-12.2, 3, 8],
  [-10.6, ROLL_BOTTOM, 0.5],
  [ROLL_LEFT, ROLL_BOTTOM, 3.5],
]);

/** The pack's parts, back to front. */
const STRAP = [[13.6, -9.4] as Pt, ...STRAP_OUTER, [12.6, 2.4] as Pt, [12.6, -9.4] as Pt];
const SIDE = rounded([
  [7.5, -9, 0],
  [13, -9, 0],
  [13, 11.8, 2.5],
  [8, 14.5, 1],
]);
const SIDE_FLAP = rounded([
  [7.5, -9.5, 0],
  [13, -9.5, 0],
  [13, -0.5, 1.5],
  [8, 1.5, 1],
]);
const FRONT = rounded([
  [-10.5, -9, 0],
  [7.5, -9, 0],
  [8, 14.5, 1],
  [-1.8, 15.2, 8],
  [-11.5, 14.5, 5.5],
  [-12.2, 3, 8],
]);
/** The flap: a rounded haversack flap over the front's upper half. */
const FLAP = rounded([
  [-10.9, -9.5, 0],
  [7.8, -9.5, 0],
  [7.85, -7, 0],
  [8, 3.6, 5.5],
  [-1.6, 5.4, 9],
  [-11.3, 3.6, 5.5],
  [-11, -7, 0],
]);
/** Its tooled border: two incised lines just inside its edge, below the roll. */
const TOOLING = [1.3, 2.1].map((d) => offset(FLAP, -d).filter(([, y]) => y >= -7.1));
/** The flap's lower edge, from its right side round to its left. */
const FLAP_HEM = FLAP.filter(([, y]) => y > 1);
/** The iron hasp hanging from the flap's middle, its slot, and the ring it is shut on. */
const HASP_X = -1.6;
const HASP = rounded([
  [HASP_X - 1.6, 1.2, 0.7],
  [HASP_X + 1.6, 1.2, 0.7],
  [HASP_X + 1.1, 7.4, 1],
  [HASP_X - 1.1, 7.4, 1],
]);
const HASP_SLOT = rounded([
  [HASP_X - 0.5, 5.2, 0.3],
  [HASP_X + 0.5, 5.2, 0.3],
  [HASP_X + 0.5, 6.8, 0.3],
  [HASP_X - 0.5, 6.8, 0.3],
]);
const RING = { x: HASP_X, y: 8.6, r: 2.1, hole: 1.1 };
/** Iron's dull highlights: down the hasp, and over the ring's upper left. */
const HASP_LIT: [Pt, Pt] = [
  [HASP_X - 0.9, 2.1],
  [HASP_X - 0.6, 4.6],
];
const RING_LIT = oval(RING.x, RING.y, 1.6, 1.6, Math.PI * 1.05, Math.PI * 1.45, 4);
/** Iron rivets: the flap's lower corners, the hasp's head, the pouch's thong. */
const RIVETS: Pt[] = [
  [-8.3, 1],
  [5.2, 1],
  [HASP_X, 2.4],
  [11.6, -1.4],
];
const RIVET_R = 0.85;
/** The drawstring pouch: its gathered neck and round belly. */
const SACK_SHAPE = rounded([
  [11.7, 2.4, 0.6],
  [14.9, 2.4, 0.6],
  [14.4, 4.5, 0.6],
  ...sharp(oval(SACK.x, SACK.y, SACK.rx, SACK.ry, -Math.PI / 3, (4 * Math.PI) / 3, 20).slice(1, -1)),
  [12.2, 4.5, 0.6],
]);
const SACK_GATHERS: [Pt, Pt][] = [
  [[12.5, 2.7], [12.7, 4.2]],
  [[13.3, 2.7], [13.3, 4.2]],
  [[14.1, 2.7], [13.9, 4.2]],
];
/** The pouch's thong up to its rivet, its drawstring round the neck, and the string's two ends. */
const SACK_THONG = [[11.6, -1.4] as Pt, ...bend([11.6, -1.4], [12.2, 1], [13.3, 2.5], 4)];
const SACK_STRING = [[12, 4.6] as Pt, [14.6, 4.6] as Pt];
const SACK_STRING_ENDS = [
  [[14.2, 4.7] as Pt, ...bend([14.2, 4.7], [15.4, 5.8], [15.1, 7.6], 4)],
  [[14.2, 4.7] as Pt, ...bend([14.2, 4.7], [14.6, 6.4], [14.1, 8], 4)],
];
const BEDROLL = rounded([
  [ROLL_LEFT, ROLL_TOP, 3.5],
  [ROLL_END.x, ROLL_TOP, 0],
  [ROLL_END.x, ROLL_BOTTOM, 0],
  [ROLL_LEFT, ROLL_BOTTOM, 3.5],
]);
const ROLL_FACE = oval(ROLL_END.x, ROLL_END.y, ROLL_END.rx, ROLL_END.ry, 0, 2 * Math.PI, 20).slice(0, -1);
/** The blanket wound round itself on the rolled face, a turn of it near that end, and the left end's curl. */
const ROLL_SPIRAL = oval(ROLL_END.x + 0.2, ROLL_END.y + 0.2, 1.4, 2, -Math.PI / 2, Math.PI, 12);
const ROLL_TURN = [[9, -14.8] as Pt, ...bend([9, -14.8], [7.4, -11.5], [9, -8.2], 8)];
const ROLL_CURL = [[-11.4, -13.8] as Pt, ...bend([-11.4, -13.8], [-12.9, -11.5], [-11.4, -9.2], 6)];
/** The hemp: a rope round the roll, and its two loose ends hanging over the flap. */
const ROPE_XS = [-9, 5.6];
const ropeOf = (x: number) => ({
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

/** Short strokes, one every `gap` along the line `along`, each from just past it by (dx, dy). */
function hatchAlong(along: Pt[], gap: number, dx: number, dy: number, from = 0.9): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  let next = gap / 2;
  let walked = 0;
  for (let i = 1; i < along.length; i++) {
    const [x0, y0] = along[i - 1];
    const [x1, y1] = along[i];
    const step = Math.hypot(x1 - x0, y1 - y0);
    while (next <= walked + step) {
      const t = (next - walked) / step;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t + from;
      out.push([[x, y], [x + dx, y + dy]]);
      next += gap;
    }
    walked += step;
  }
  return out;
}

const HATCH = {
  side: hatchBox(8.2, -8.6, 12.6, 12.4, 1.4),
  underRoll: hatchAlong([[-10.2, ROLL_BOTTOM - 0.1], [7.4, ROLL_BOTTOM - 0.1]], 1.3, 0.8, 1.6),
  underFlap: hatchAlong(FLAP_HEM, 1.3, 0.8, 1.8),
  rollUnderside: hatchAlong([[-12.4, ROLL_BOTTOM - 3], [8.4, ROLL_BOTTOM - 3]], 1.3, 0.9, 1.8),
  // the pouch's belly, its lower right turned from the light
  sack: hatchAlong(oval(SACK.x, SACK.y, SACK.rx - 1.2, SACK.ry - 1.2, -0.2, 1.9, 8), 1.1, 0.6, 1, 0),
};

/** Stitches: dashes along a curve, a gap between each. */
function stitches(along: Pt[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < along.length; i += 2) out.push([along[i], along[i + 1]]);
  return out;
}

const STITCHES = {
  // down the shoulder strap
  strap: stitches(bend([14.2, -8.4], [17.4, -4.6], [14.4, 1.4], 9)),
  // along the front's bottom seam
  seam: stitches(bend([-8.6, 12.4], [-1.8, 14], [6.4, 12.4], 16)),
};

const SCRATCHES: [Pt, Pt][] = [
  [[-9, 8], [-7.2, 9.6]],
  [[3.4, 9.2], [5, 11]],
  [[-7.8, -5.6], [-6.4, -4.2]],
  [[3.2, -4.4], [4.8, -5.6]],
];

/** The middle of the box round the silhouette: the point laid on the slot's centre. */
const SIL_MID = (() => {
  const xs = SILHOUETTE.map(([x]) => x);
  const ys = SILHOUETTE.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as const;
})();

/**
 * The Inventory icon (FS-3EBCA § Change: The inventory icon is an inked backpack, R1–R5, as the
 * owner's first tweak round changed it): a small, dark inked illustration of an old haversack,
 * centred on (cx, cy). Flat fills of smoky leather, blackened iron and dull wool inside a heavy ink
 * outline, ink part lines, hatching for its shade, a tooled border, stitches and scratches; no
 * gradient, no amber. `lifted`, under the pointer, draws every tone but the ink a little lighter
 * ({@link BACKPACK_HOVER_LIFT}), the one thing that changes.
 */
export function drawBackpack(g: FilledInk, cx: number, cy: number, lifted: boolean): void {
  const ox = cx - SIL_MID[0];
  const oy = cy - SIL_MID[1];
  const T = BACKPACK_TONES;
  const tone = (c: number) => (lifted && c !== T.ink ? tint(c, BACKPACK_HOVER_LIFT) : c);
  const trace = (points: Pt[], closed: boolean) => {
    g.beginPath();
    g.moveTo(ox + points[0][0], oy + points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(ox + points[i][0], oy + points[i][1]);
    if (closed) g.closePath();
  };
  const fill = (points: Pt[], colour: number) => {
    g.fillStyle(tone(colour), 1);
    trace(points, true);
    g.fillPath();
  };
  // the line style before the path: WebGL takes each point's width as the point is laid
  const line = (points: Pt[], width: number, colour: number, alpha: number, closed: boolean) => {
    g.lineStyle(width, tone(colour), alpha);
    trace(points, closed);
    g.strokePath();
  };
  const part = (points: Pt[], colour: number, width = PART_W) => {
    fill(points, colour);
    line(points, width, T.ink, 1, true);
  };
  const strokes = (segments: [Pt, Pt][], width: number, colour: number, alpha: number) => {
    g.lineStyle(width, tone(colour), alpha);
    for (const [[x0, y0], [x1, y1]] of segments) g.lineBetween(ox + x0, oy + y0, ox + x1, oy + y1);
  };
  const rivet = ([x, y]: Pt) => {
    part(disc(x, y, RIVET_R), T.iron, 0.6);
    fill(disc(x - 0.3, y - 0.3, 0.3), T.ironLit);
  };

  // the shoulder strap, behind the side; the side, turned from the light, hatched
  part(STRAP, T.leatherDark);
  strokes(STITCHES.strap, FINE_W, T.ink, STITCH_ALPHA);
  fill(SIDE, T.leatherSide);
  strokes(HATCH.side, HATCH_W, T.ink, HATCH_ALPHA);
  line(SIDE, PART_W, T.ink, 1, true);
  part(SIDE_FLAP, T.leatherDark);

  // the front, shaded under the flap, seamed and worn
  part(FRONT, T.leather);
  strokes(HATCH.underFlap, HATCH_W, T.ink, HATCH_ALPHA);
  strokes(STITCHES.seam, FINE_W, T.ink, STITCH_ALPHA);
  strokes(SCRATCHES.slice(0, 2), FINE_W, T.ink, SCRATCH_ALPHA);

  // the flap, shaded under the roll, its border tooled, worn, riveted at its corners
  fill(FLAP, T.leatherDark);
  strokes(HATCH.underRoll, HATCH_W, T.ink, HATCH_ALPHA);
  line(FLAP, PART_W, T.ink, 1, true);
  for (const groove of TOOLING) line(groove, FINE_W, T.tooling, 1, false);
  strokes(SCRATCHES.slice(2), FINE_W, T.ink, SCRATCH_ALPHA);

  // the iron hasp over the flap's edge, shut on its ring
  part(HASP, T.iron, FINE_W);
  strokes([HASP_LIT], FINE_W, T.ironLit, 1);
  fill(HASP_SLOT, T.ink);
  part(disc(RING.x, RING.y, RING.r), T.iron, FINE_W);
  part(disc(RING.x, RING.y, RING.hole), T.leather, FINE_W);
  line(RING_LIT, FINE_W, T.ironLit, 1, false);
  for (const at of RIVETS) rivet(at);

  // the drawstring pouch hanging on the side by its thong
  line(SACK_THONG, 1, T.rope, 1, false);
  part(SACK_SHAPE, T.leather);
  strokes(HATCH.sack, HATCH_W, T.ink, HATCH_ALPHA);
  strokes(SACK_GATHERS, FINE_W, T.ink, STITCH_ALPHA);
  line(SACK_STRING, PART_W, T.rope, 1, false);
  for (const end of SACK_STRING_ENDS) line(end, 1, T.rope, 1, false);

  // the wool blanket rolled across the top, its rolled end showing, tied with hemp
  fill(BEDROLL, T.wool);
  strokes(HATCH.rollUnderside, HATCH_W, T.ink, HATCH_ALPHA);
  line(BEDROLL, PART_W, T.ink, 1, true);
  line(ROLL_TURN, FINE_W, T.ink, 1, false);
  line(ROLL_CURL, FINE_W, T.ink, 1, false);
  part(ROLL_FACE, T.woolEnd);
  line(ROLL_SPIRAL, FINE_W, T.ink, 1, false);
  for (const x of ROPE_XS) {
    const rope = ropeOf(x);
    line(rope.tie, 1.5, T.rope, 1, false);
    for (const end of rope.ends) line(end, 1, T.rope, 1, false);
  }

  // last, the heavy ink line round the whole silhouette
  line(SILHOUETTE, OUTLINE_W, T.ink, 1, true);
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
