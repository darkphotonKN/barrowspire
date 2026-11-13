/**
 * The corner row (FS-3EBCA): the panel icons in the bottom-right corner of every world, from the
 * right Menu (a riveted gear: one Esc press), Inventory (a round rucksack: the inventory), Character
 * (a strapped bust with pauldrons: the character panel), Party (three busts: the party panel) and
 * the Mailbox.
 * In the town the Mailbox is the mailbox's own envelope (`MailboxEnvelope`, FS-1GZGD § Change),
 * which this row leaves its slot to; elsewhere it is drawn here, greyed (R9).
 *
 * Each icon is its bare glyph over the world, with no plate under it and nothing filled (FS-J1672
 * R1–R3), in the envelope's one line width, `GLYPH_LINE_W` (FS-QHN87 R1), every angled corner a
 * vertex inside one path so the renderer joins it (R2): the interactable amber, brighter under the
 * pointer, where a small label names the icon and its key (R3, R5). The glyphs are drawn richer so
 * the row stops looking empty (FS-QHN87). The Inventory icon is the one exception: a bronze
 * knockout, a solid silhouette with its lines cut through to the world, in its own texture
 * (`KnockoutRucksack`; FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack), or
 * the same rucksack in lines where the scene cannot make that texture.
 * Each icon's rect stays its press area (FS-J1672 R4). Drawn
 * in code from palette tokens (ADR-0013). The row decides nothing: what a press does is the
 * scene's, handed in per icon. The gear overlay's panels stop above it, so it answers
 * while they are open too (R11; FS-HRH2J § Change C12).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
import { CornerLabel } from "./cornerLabel";
import { GLYPH_LINE_W, drawEnvelopeLines } from "./MailboxEnvelope";
import { KnockoutRucksack, drawRucksackLines } from "./knockoutRucksack";
import {
  CORNER_LABEL,
  CORNER_LABEL_GREYED_MAIL,
  cornerIconFrame,
  type CornerIcon,
  type Rect,
} from "./hudCornerLayout";

const HUD_DEPTH = 1000;
/** Every glyph's line, the envelope's (FS-QHN87 R1); the cover margins follow it. */
const LINE_W = GLYPH_LINE_W;
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

/**
 * What a glyph draws with: lines only, never a fill (FS-J1672 R3). The knockout rucksack's fill is
 * its own, in its own texture.
 */
type Ink = Pick<
  Phaser.GameObjects.Graphics,
  | "lineStyle"
  | "strokeCircle"
  | "lineBetween"
  | "beginPath"
  | "moveTo"
  | "lineTo"
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
  /** The Inventory icon, where the scene can draw it as a knockout. */
  private readonly rucksack: KnockoutRucksack;
  private readonly unwatch: () => void;

  constructor(scene: Phaser.Scene, deps: HudCornerDeps) {
    this.label = new CornerLabel(scene);
    this.rucksack = new KnockoutRucksack(scene, HUD_DEPTH);
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
    // the rucksack's texture is drawn at the render scale, so a new one draws it again (R7)
    this.unwatch = viewport.onChange(() => {
      for (const icon of this.icons) if (icon.spec.icon === "inventory") this.draw(icon);
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
    this.unwatch();
    this.rucksack.destroy();
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
    else if (icon.spec.icon === "inventory") {
      if (!this.rucksack.show(f, icon.hovered, viewport.renderScale)) drawRucksackLines(g, cx, cy, ink, alpha);
    } else if (icon.spec.icon === "character") drawCharacter(g, cx, cy + 1, ink, alpha);
    else if (icon.spec.icon === "party") drawParty(g, cx, cy, ink, alpha);
  }
}

type Pt = readonly [number, number];

/** The gear (FS-QHN87 R3): its teeth's root and tip radii, and each tooth's half-width there. */
const GEAR = { root: 11, tip: 15, rootHalf: 2.5, tipHalf: 1.5, teeth: 8 };
/** Its inner ring at the hub, and the rivets set on that ring's line as beads. */
const GEAR_RING = 6.2;
/** Four: six (and five) run together into one ring at render scale 1, and even at 2 (FS-QHN87 R3). */
const GEAR_RIVETS = 4;
const GEAR_RIVET_R = 1.1;
/** How many points draw the rim between two teeth. */
const GEAR_RIM_STEPS = 4;

/**
 * The gear (FS-3EBCA R3; FS-QHN87 R3): eight bevelled teeth, each wider at its root than its tip,
 * and the rim between them in one closed outline, so every corner is joined; inside it an inner
 * ring at the hub with rivets set on it as beads.
 */
export function drawGear(g: Ink, cx: number, cy: number, ink: number, alpha: number): void {
  const at = (a: number, r: number): Pt => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const pitch = (2 * Math.PI) / GEAR.teeth;
  const root = Math.asin(GEAR.rootHalf / GEAR.root);
  const tip = Math.asin(GEAR.tipHalf / GEAR.tip);
  const outline: Pt[] = [];
  for (let i = 0; i < GEAR.teeth; i++) {
    const a = i * pitch;
    outline.push(at(a - root, GEAR.root), at(a - tip, GEAR.tip), at(a + tip, GEAR.tip), at(a + root, GEAR.root));
    // the rim on to the next tooth's root
    for (let k = 1; k < GEAR_RIM_STEPS; k++) {
      outline.push(at(a + root + ((pitch - 2 * root) * k) / GEAR_RIM_STEPS, GEAR.root));
    }
  }
  g.lineStyle(LINE_W, ink, alpha);
  strokeLine(g, outline, true);
  g.strokeCircle(cx, cy, GEAR_RING);
  for (let i = 0; i < GEAR_RIVETS; i++) {
    const [x, y] = at(((i + 0.5) * 2 * Math.PI) / GEAR_RIVETS, GEAR_RING);
    g.strokeCircle(x, y, GEAR_RIVET_R);
  }
}

/** Strokes a line through `points` as one path, closed back to its first when `closed`. */
function strokeLine(g: Ink, points: readonly Pt[], closed = false): void {
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  if (closed) g.closePath();
  g.strokePath();
}

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

// ── The bust (FS-3EBCA R3, as FS-QHN87's round 1 made it, the owner 2026-11-13: 「組隊跟角色雖然是斗篷
//    但不知道的會覺得怪 不要斗篷了」): a head over the curve of the shoulders, as before, now with a pair
//    of rounded pauldrons over the shoulders and a collar at the neck. Drawn in local px at scale 1,
//    x to the right and y down from the bust's centre.

/** The head: its centre's height and radius, set a little higher so it stands clear in the row's line. */
const HEAD = { y: -6.6, r: 4.8 };
/** The shoulders: the upper half of this circle, as before. */
const SHOULDERS = { y: 12, r: 11 };
const deg = (d: number) => (d * Math.PI) / 180;
/** A point `r` from the shoulders' centre at angle `a` (a quarter turn up is -π/2). */
const polar = (a: number, r: number): Pt => [Math.cos(a) * r, SHOULDERS.y + Math.sin(a) * r];
/** The shoulders' curve from angle `from` to `to`, both ends kept. */
const shoulderArc = (from: number, to: number, steps: number): Pt[] =>
  Array.from({ length: steps + 1 }, (_, i) => polar(from + ((to - from) * i) / steps, SHOULDERS.r));
/**
 * A pauldron: a rounded plate over the shoulder, from the arm up to by the neck, standing this far
 * out from the shoulders' curve at its middle; the curve under it is the plate's, so none is drawn.
 */
const PAULDRON = { arm: deg(190), neck: deg(236), out: 2.8 };
function pauldronArc(from: number, to: number): Pt[] {
  const a = polar(from, SHOULDERS.r);
  const b = polar(to, SHOULDERS.r);
  const peak = polar((from + to) / 2, SHOULDERS.r + PAULDRON.out);
  // the quadratic whose middle is the peak: its pull is twice the peak less the chord's middle
  return bend(a, [2 * peak[0] - (a[0] + b[0]) / 2, 2 * peak[1] - (a[1] + b[1]) / 2], b, 10);
}
const mirrored = (a: number) => 3 * Math.PI - a;
/**
 * The shoulders' line, one path from the left arm over the top to the right: up the arm, over the
 * left pauldron, across the shoulders, over the right pauldron, down the arm. One path, so where a
 * plate meets the shoulder its corner is joined (FS-QHN87 R2).
 */
const SHOULDER_LINE: Pt[] = [
  ...shoulderArc(Math.PI, PAULDRON.arm, 2),
  ...pauldronArc(PAULDRON.arm, PAULDRON.neck),
  ...shoulderArc(PAULDRON.neck, mirrored(PAULDRON.neck), 16).slice(1),
  ...pauldronArc(mirrored(PAULDRON.neck), mirrored(PAULDRON.arm)),
  ...shoulderArc(mirrored(PAULDRON.arm), 2 * Math.PI, 2).slice(1),
];
/** Each pauldron's plate, closed along the shoulders' curve under it: the shape it covers. */
const PAULDRONS: Pt[][] = [
  [...pauldronArc(PAULDRON.arm, PAULDRON.neck), ...shoulderArc(PAULDRON.neck, PAULDRON.arm, 8)],
  [...pauldronArc(mirrored(PAULDRON.neck), mirrored(PAULDRON.arm)), ...shoulderArc(mirrored(PAULDRON.arm), mirrored(PAULDRON.neck), 8)],
];
/**
 * The collar: a gorget's edge across the chest under the neck, round the shoulders' centre this far
 * out, wide enough that it reads as a plate's edge and not a mark on its own.
 */
const COLLAR_R = 6.2;
const COLLAR: Pt[] = Array.from({ length: 17 }, (_, i) => polar(deg(222) + (deg(96) * i) / 16, COLLAR_R));

/**
 * The Character's detail (FS-QHN87 round 2, the owner 2026-11-13: 「角色畫一個上半身頭像 加一點細節」): a
 * baldric slung from the left shoulder down across the chest to the right of the foot, a small
 * buckle on it, and a rivet on each pauldron. It takes the collar's place.
 */
const STRAP: [Pt, Pt] = [polar(PAULDRON.neck, SHOULDERS.r), [7, SHOULDERS.y]];
/** The buckle: this far down the strap, this long along it and this wide across it. */
const BUCKLE = { at: 0.7, long: 5, wide: 4.4 };
const BUCKLE_SHAPE: Pt[] = (() => {
  const [[x0, y0], [x1, y1]] = STRAP;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const along: Pt = [(x1 - x0) / len, (y1 - y0) / len];
  const across: Pt = [-along[1], along[0]];
  const mid: Pt = [x0 + (x1 - x0) * BUCKLE.at, y0 + (y1 - y0) * BUCKLE.at];
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, c]) => [
    mid[0] + (along[0] * a * BUCKLE.long) / 2 + (across[0] * c * BUCKLE.wide) / 2,
    mid[1] + (along[1] * a * BUCKLE.long) / 2 + (across[1] * c * BUCKLE.wide) / 2,
  ] as Pt);
})();
/** A rivet on each pauldron: at its middle, a little inside the shoulders' curve. */
const RIVETS_AT = [(PAULDRON.arm + PAULDRON.neck) / 2, mirrored((PAULDRON.arm + PAULDRON.neck) / 2)].map((a) =>
  polar(a, SHOULDERS.r - 1.2),
);
const BUST_RIVET_R = 0.6;

/** What a bust wears: its collar (on by default), and the Character's strap, buckle and rivets. */
export interface BustDress {
  collar?: boolean;
  strap?: boolean;
}

/** A bust laid at (cx, cy), scale s: its head, and its lines in screen px. */
function bustAt(cx: number, cy: number, s: number, dress: BustDress = {}) {
  const place = (ps: readonly Pt[]) => ps.map(([x, y]) => [cx + x * s, cy + y * s] as Pt);
  const strap = dress.strap ? place(STRAP) : undefined;
  return {
    head: { x: cx, y: cy + HEAD.y * s, r: HEAD.r * s },
    shoulders: { x: cx, y: cy + SHOULDERS.y * s, r: SHOULDERS.r * s },
    lines: [place(SHOULDER_LINE), ...(dress.collar === false ? [] : [place(COLLAR)])],
    pauldrons: PAULDRONS.map(place),
    strap,
    buckle: strap && place(BUCKLE_SHAPE),
    rivets: dress.strap ? place(RIVETS_AT) : [],
  };
}

/** How far (x, y) stands from the segment a–b. */
function toSegment(x: number, y: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

/** Whether (x, y) lies inside the shape `outline` closes round (its two ends joined). */
function within(outline: readonly Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [a, b] = [outline[i], outline[j]];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/** Whether (x, y) lies on the shape `outline` closes round, its line's width included. */
function covers(outline: readonly Pt[], x: number, y: number): boolean {
  if (within(outline, x, y)) return true;
  return outline.some((a, i) => toSegment(x, y, a, outline[(i + 1) % outline.length]) <= LINE_W);
}

/** How finely a line is cut where a bust in front covers it. */
const COVER_STEP = 0.25;

/**
 * The runs of the line through `points` (closed back to its first when `closed`) that `hidden`
 * leaves in view, each with the points it runs through: the line whole when nothing hides it.
 */
function uncovered(points: readonly Pt[], closed: boolean, hidden: (p: Pt) => boolean): { points: Pt[]; closed: boolean }[] {
  const ring = closed ? [...points, points[0]] : [...points];
  const samples: Pt[] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const [a, b] = [ring[i - 1], ring[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / COVER_STEP));
    for (let k = 1; k <= n; k++) samples.push(k === n ? b : [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const shown = samples.map((p) => !hidden(p));
  if (shown.every(Boolean)) return [{ points: [...points], closed }];
  // a closed line is cut from a hidden point round to itself, so a run across its start stays one
  const from = closed ? shown.indexOf(false) : 0;
  const order = closed ? [...samples.slice(from, -1), ...samples.slice(0, from + 1)] : samples;
  const seen = closed ? [...shown.slice(from, -1), ...shown.slice(0, from + 1)] : shown;
  const runs: { points: Pt[]; closed: boolean }[] = [];
  let run: Pt[] = [];
  order.forEach((p, i) => {
    if (seen[i]) run.push(p);
    if (!seen[i] || i === order.length - 1) {
      if (run.length > 1) runs.push({ points: run, closed: false });
      run = [];
    }
  });
  return runs;
}

/**
 * Whether (x, y) lies on the bust's shape, its line's width included: its head, its shoulders or a
 * pauldron. Where it stands in front, it hides what is behind it.
 */
function onBust(b: ReturnType<typeof bustAt>, x: number, y: number): boolean {
  if (Math.hypot(x - b.head.x, y - b.head.y) <= b.head.r + LINE_W) return true;
  if (y <= b.shoulders.y && Math.hypot(x - b.shoulders.x, y - b.shoulders.y) <= b.shoulders.r + LINE_W) return true;
  return b.pauldrons.some((plate) => covers(plate, x, y));
}

/** Where a bust stands, and at what scale. */
interface BustPlace {
  cx: number;
  cy: number;
  s: number;
}

/**
 * A bust (FS-3EBCA R3; FS-QHN87 rounds 1 and 2), `s` its scale: a head over the curve of the
 * shoulders, a rounded pauldron over each shoulder and a collar at the neck, and, dressed with a
 * strap, a baldric with its buckle and a rivet on each pauldron; no face. With `front`, the bust
 * standing in front of this one, this one's lines are left undrawn where that one covers them, its
 * line's width included (FS-J1672 R3): nothing is filled, so no dark patch is left on the world.
 */
export function drawBust(
  g: Ink,
  cx: number,
  cy: number,
  s: number,
  ink: number,
  alpha: number,
  dress: BustDress = {},
  front?: BustPlace,
): void {
  const b = bustAt(cx, cy, s, dress);
  const cover = front && bustAt(front.cx, front.cy, front.s);
  const strap = b.strap;
  const hidden = (p: Pt) => (cover ? onBust(cover, p[0], p[1]) : false);
  g.lineStyle(LINE_W, ink, alpha);
  const head = Array.from({ length: 73 }, (_, i): Pt => {
    const a = (i / 72) * 2 * Math.PI;
    return [b.head.x + Math.cos(a) * b.head.r, b.head.y + Math.sin(a) * b.head.r];
  });
  // the head is a circle while nothing covers it
  if (head.some(hidden)) for (const run of uncovered(head.slice(0, -1), true, hidden)) strokeLine(g, run.points, run.closed);
  else g.strokeCircle(b.head.x, b.head.y, b.head.r);
  for (const line of b.lines) {
    for (const run of uncovered(line, false, hidden)) strokeLine(g, run.points, run.closed);
  }
  // the strap over the chest, its buckle on it
  if (strap && b.buckle) {
    g.lineBetween(strap[0][0], strap[0][1], strap[1][0], strap[1][1]);
    strokeLine(g, b.buckle, true);
  }
  for (const [x, y] of b.rivets) g.strokeCircle(x, y, BUST_RIVET_R * s);
}

/** The Character (FS-QHN87 round 2): one bust, strapped. */
export function drawCharacter(g: Ink, cx: number, cy: number, ink: number, alpha: number): void {
  // the strap takes the collar's place: crossing it, it left only specks of it at render scale 1
  drawBust(g, cx, cy, 1, ink, alpha, { strap: true, collar: false });
}

/**
 * Where Party's three busts stand round the icon's middle (FS-QHN87 round 2, the owner 2026-11-13:
 * 「組隊畫三個上半身頭像」): one in front in the middle, two behind it at the left and right, higher and
 * smaller, partly hidden by it.
 */
export const PARTY_BUSTS = {
  front: { dx: 0, dy: 1.6, s: 0.8 },
  back: [
    { dx: -10, dy: -2.6, s: 0.66 },
    { dx: 10, dy: -2.6, s: 0.66 },
  ],
};

/** Three busts (FS-QHN87 round 2): the front one whole, the two behind it cut where it covers them. */
export function drawParty(g: Ink, cx: number, cy: number, ink: number, alpha: number): void {
  const at = ({ dx, dy, s }: { dx: number; dy: number; s: number }): BustPlace => ({ cx: cx + dx, cy: cy + dy, s });
  const front = at(PARTY_BUSTS.front);
  for (const back of PARTY_BUSTS.back) {
    const b = at(back);
    drawBust(g, b.cx, b.cy, b.s, ink, alpha, { collar: false }, front);
  }
  drawBust(g, front.cx, front.cy, front.s, ink, alpha);
}
