/**
 * The corner row (FS-3EBCA): the panel icons in the bottom-right corner of every world, from the
 * right Menu (a gear: one Esc press), Inventory (a haversack: the inventory), Character (a bust: the
 * character panel), Party (two busts: the party panel) and the Mailbox. In the town the Mailbox is the mailbox's own envelope
 * (`MailboxEnvelope`, FS-1GZGD § Change), which this row leaves its slot to; elsewhere it is drawn
 * here, greyed (R9).
 *
 * Each icon is its bare glyph in 1.5 px lines over the world, with no plate under it and nothing
 * filled (FS-J1672 R1–R3): the interactable amber, brighter under the pointer, where a small label
 * names the icon and its key (R3, R5). The Inventory icon is the most detailed of them, an old
 * haversack in line (FS-3EBCA § Change: The inventory icon is an inked backpack, as the owner's
 * second tweak round made it). Its 58 × 46 rect stays its press area (FS-J1672 R4). Drawn
 * in code from palette tokens (ADR-0013). The row decides nothing: what a press does is the
 * scene's, handed in per icon. The gear overlay's panels stop above it, so it answers
 * while they are open too (R11; FS-HRH2J § Change C12).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
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
  | "lineStyle"
  | "strokeCircle"
  | "lineBetween"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "arc"
  | "strokePath"
  | "closePath"
>;

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

// ── The haversack (FS-3EBCA § Change: The inventory icon is an inked backpack, as the owner's
//    second tweak round made it a line glyph, 2026-11-13: 「是不是要改成符號線條比較好」) ─────────────
//
// Drawn in local px, x to the right and y down, then laid on the slot's centre: an old haversack
// from the front, in the other glyphs' 1.5 px lines and nothing else. A blanket rolled across its
// top, tied with rope whose ends hang loose; a rounded flap with a tooled line inside its edge,
// shut by an iron hasp on a ring; two rivets; a drawstring pouch hanging at its right side.

type Pt = readonly [number, number];

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
 * A line through `corners`, each corner rounded by its radius (0 keeps it sharp), so a 1.5 px line,
 * which WebGL never joins (§ Facts: only lines over 2 px are), shows no notch at render scale 2.
 * Open: its two ends are kept as they are.
 */
function rounded(corners: readonly (readonly [number, number, number])[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < corners.length; i++) {
    const [x, y, r] = corners[i];
    if (r === 0 || i === 0 || i === corners.length - 1) {
      out.push([x, y]);
      continue;
    }
    const [px, py] = corners[i - 1];
    const [nx, ny] = corners[i + 1];
    const toPrev = Math.hypot(px - x, py - y);
    const toNext = Math.hypot(nx - x, ny - y);
    const cut = Math.min(r, toPrev / 2, toNext / 2);
    const a: Pt = [x + ((px - x) * cut) / toPrev, y + ((py - y) * cut) / toPrev];
    const b: Pt = [x + ((nx - x) * cut) / toNext, y + ((ny - y) * cut) / toNext];
    out.push(a, ...bend(a, [x, y], b, 5));
  }
  return out;
}

/** The blanket roll: its top and bottom, its rounded left end and its rolled right end's face. */
const ROLL_TOP = -15.5;
const ROLL_BOTTOM = -9.5;
const ROLL_MID = (ROLL_TOP + ROLL_BOTTOM) / 2;
const ROLL_LEFT = -10.2;
const ROLL_FACE = { x: 10, y: ROLL_MID, rx: 1.8, ry: (ROLL_BOTTOM - ROLL_TOP) / 2 };
/** Its near side: along the top, round the left end, back along the bottom to the rolled face. */
const ROLL = [
  [ROLL_FACE.x, ROLL_TOP] as Pt,
  ...oval(ROLL_LEFT, ROLL_MID, ROLL_FACE.ry, ROLL_FACE.ry, -Math.PI / 2, -1.5 * Math.PI, 14),
  [ROLL_FACE.x, ROLL_BOTTOM] as Pt,
];
const ROLL_END = oval(ROLL_FACE.x, ROLL_FACE.y, ROLL_FACE.rx, ROLL_FACE.ry, 0, 2 * Math.PI, 16);
/**
 * The rope: a tie round each end of the roll, each with a short loose end hanging out and down past
 * the body's side, clear of its line.
 */
const ROPES = [
  { x: -9.4, out: -1 },
  { x: 8.2, out: 1 },
];
const ropeOf = ({ x, out }: { x: number; out: number }) => ({
  tie: [[x, ROLL_TOP] as Pt, ...bend([x, ROLL_TOP], [x + 1.2, ROLL_MID], [x, ROLL_BOTTOM], 6)],
  end: [x, ROLL_BOTTOM, x + out * 2.2, ROLL_BOTTOM + 2.8] as const,
});

/** The pouch: its round belly, the gathered frill above its drawstring, the drawstring. */
const POUCH = { x: 10.4, y: 11, r: 2.8 };
const POUCH_NECK = { y: 7.2, left: 9.5, right: 11.3 };
const POUCH_BELLY: Pt[] = [
  [POUCH_NECK.left, POUCH_NECK.y],
  // from its upper left down round its bottom and up to its upper right
  ...oval(POUCH.x, POUCH.y, POUCH.r, POUCH.r, (4 * Math.PI) / 3, -Math.PI / 3, 20),
  [POUCH_NECK.right, POUCH_NECK.y],
];
const POUCH_FRILL = [
  [POUCH_NECK.left, POUCH_NECK.y, POUCH_NECK.left - 0.6, POUCH_NECK.y - 1.8],
  [POUCH_NECK.right, POUCH_NECK.y, POUCH_NECK.right + 0.6, POUCH_NECK.y - 1.8],
] as const;
const POUCH_STRING = [POUCH_NECK.left - 0.4, POUCH_NECK.y, POUCH_NECK.right + 0.4, POUCH_NECK.y] as const;
/** The cord it hangs by, from the body's side down to its gathered neck. */
const POUCH_CORD = [8.7, 2.4, POUCH.x, POUCH_NECK.y - 1.6] as const;
/** Whether the pouch, hanging in front, hides a point of the body behind it. */
const behindPouch = ([x, y]: Pt) =>
  Math.hypot(x - POUCH.x, y - POUCH.y) < POUCH.r + LINE_W || (y > POUCH_NECK.y - 2 && y < POUCH.y && Math.abs(x - POUCH.x) < POUCH.r);

/** The body: down from under the roll, bellied, round its rounded bottom and up again. */
const BODY = rounded([
  [-9, ROLL_BOTTOM + 0.5, 0],
  [-11.2, 5, 10],
  [-9.8, 15.5, 6],
  [7.8, 15.5, 6],
  [9.2, 5, 10],
  [7, ROLL_BOTTOM + 0.5, 0],
]);
/** The flap's middle, where it comes to its rounded point. */
const HASP_X = -1;
/** The flap's edge: down its sides, then a rounded tongue to its point under the hasp. */
const FLAP = [
  [-9.9, -2.5] as Pt,
  [-9.6, 1.5] as Pt,
  ...bend([-9.6, 1.5], [HASP_X, 11], [7.6, 1.5], 16),
  [7.9, -2.5] as Pt,
];
const FLAP_POINT = 6.25;
/** The tooled line just inside the flap's edge, from just under the roll: with the edge, a double line. */
const TOOLED = [
  [-7.2, -5.4] as Pt,
  [-7, 0.6] as Pt,
  ...bend([-7, 0.6], [HASP_X, 6.6], [5, 0.6], 14),
  [5.2, -5.4] as Pt,
];
/** The iron hasp hanging from the flap's point, and the ring it is shut on. */
const HASP = rounded([
  [HASP_X - 1.6, FLAP_POINT - 0.4, 0],
  [HASP_X - 1.6, FLAP_POINT + 2.8, 1.1],
  [HASP_X + 1.6, FLAP_POINT + 2.8, 1.1],
  [HASP_X + 1.6, FLAP_POINT - 0.4, 0],
]);
const RING = { x: HASP_X, y: FLAP_POINT + 4.7, r: 1.8 };
/** Two iron rivets low on the body, tiny circles. */
const RIVETS: Pt[] = [
  [-7, 11.6],
  [4, 12.4],
];
const RIVET_R = 0.9;

/** The middle of the box round everything drawn: the point laid on the slot's centre. */
const HAVERSACK_MID = (() => {
  const all = [...ROLL, ...ROLL_END, ...BODY, ...POUCH_BELLY, [POUCH.x + POUCH.r, POUCH.y] as Pt];
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as const;
})();

/**
 * The Inventory icon (FS-3EBCA R3, § Change: The inventory icon is an inked backpack, as the
 * owner's second tweak round made it): an old haversack in the other glyphs' lines, centred on
 * (cx, cy), in `ink` at `alpha`. Nothing filled (FS-J1672 R3). Where the pouch hangs in front of
 * the body, the body's line is left undrawn, as the Party glyph's back bust is.
 */
export function drawBackpack(g: Ink, cx: number, cy: number, ink: number, alpha: number): void {
  const ox = cx - HAVERSACK_MID[0];
  const oy = cy - HAVERSACK_MID[1];
  const path = (points: Pt[], closed = false) => {
    g.beginPath();
    g.moveTo(ox + points[0][0], oy + points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(ox + points[i][0], oy + points[i][1]);
    if (closed) g.closePath();
    g.strokePath();
  };
  const segment = (s: readonly [number, number, number, number]) =>
    g.lineBetween(ox + s[0], oy + s[1], ox + s[2], oy + s[3]);

  g.lineStyle(LINE_W, ink, alpha);
  // the blanket roll and its rope
  path(ROLL);
  path(ROLL_END, true);
  for (const at of ROPES) {
    const rope = ropeOf(at);
    path(rope.tie);
    segment(rope.end);
  }
  // the body, its line broken where the pouch hangs in front of it
  let run: Pt[] = [];
  for (const p of [...BODY, [Infinity, Infinity] as Pt]) {
    if (Number.isFinite(p[0]) && !behindPouch(p)) run.push(p);
    else {
      if (run.length > 1) path(run);
      run = [];
    }
  }
  // the flap, its tooled line, the hasp and its ring, the rivets
  path(FLAP);
  path(TOOLED);
  path(HASP);
  g.strokeCircle(ox + RING.x, oy + RING.y, RING.r);
  for (const [x, y] of RIVETS) g.strokeCircle(ox + x, oy + y, RIVET_R);
  // the pouch at the side
  path(POUCH_BELLY);
  POUCH_FRILL.forEach(segment);
  segment(POUCH_STRING);
  segment(POUCH_CORD);
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
