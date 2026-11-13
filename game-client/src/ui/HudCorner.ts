/**
 * The corner row (FS-3EBCA): the panel icons in the bottom-right corner of every world, from the
 * right Menu (a riveted gear: one Esc press), Inventory (a round rucksack: the inventory), Character
 * (a strapped bust with pauldrons: the character panel), Party (three busts: the party panel) and
 * the Mailbox.
 * In the town the Mailbox is the mailbox's own envelope (`MailboxEnvelope`, FS-1GZGD § Change),
 * which this row leaves its slot to; elsewhere it is drawn here, greyed (R9).
 *
 * Each icon is a **knockout** (FS-7TQN4; FS-3EBCA § Change: The inventory icon is a bronze
 * knockout rucksack): one solid silhouette in bronze, its inner lines cut through to the world,
 * drawn by the shared knockout renderer (`Knockout`) in its own texture, bare over the world with
 * no plate under it (FS-J1672 R1), lifted toward the bright amber under the pointer, where a small
 * label names the icon and its key (R3, R5); the greyed Mailbox is the same in the faint grey.
 * Where the scene cannot make that texture, each icon is drawn as its line glyph instead: in the
 * envelope's one line width, `GLYPH_LINE_W` (FS-QHN87 R1), every angled corner a vertex inside one
 * path so the renderer joins it (R2), nothing filled (FS-J1672 R3).
 * Each icon's rect stays its press area (FS-J1672 R4). Drawn
 * in code from palette tokens (ADR-0013). The row decides nothing: what a press does is the
 * scene's, handed in per icon. The gear overlay's panels stop above it, so it answers
 * while they are open too (R11; FS-HRH2J § Change C12).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
import { CornerLabel } from "./cornerLabel";
import { GLYPH_LINE_W, drawEnvelopeLines, envelopeKnockout } from "./MailboxEnvelope";
import { BRONZE, CUT_W, Knockout, bend, oval, type KnockoutCut, type KnockoutInk, type KnockoutPicture, type Pt } from "./knockout";
import { RUCKSACK, drawRucksackLines } from "./knockoutRucksack";
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
/** The greyed Mailbox's knockout: the faint grey, never brightening under the pointer (FS-7TQN4 R9). */
const GREYED: KnockoutInk = {
  idle: { tint: palette.hudFaint, alpha: GREYED_ALPHA },
  hover: { tint: palette.hudFaint, alpha: GREYED_ALPHA },
};

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
 * What a line glyph draws with: lines only, never a fill (FS-J1672 R3; FS-7TQN4 R16). A knockout's
 * fills are the shared renderer's own, in its own texture.
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
  /** The icon as a knockout, where the scene can draw one (FS-7TQN4 R1). */
  knockout: Knockout;
  hovered: boolean;
}

/** What each icon is as a knockout, about its slot's centre (FS-7TQN4 R3–R7). */
function pictureOf(spec: CornerIconSpec, frame: Rect): KnockoutPicture {
  if (spec.greyed || spec.icon === "mail") return envelopeKnockout(frame);
  if (spec.icon === "menu") return GEAR_KNOCKOUT;
  if (spec.icon === "inventory") return RUCKSACK;
  if (spec.icon === "character") return CHARACTER_KNOCKOUT;
  return PARTY_KNOCKOUT;
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
      // its texture is drawn at the render scale, and drawn again at a new one (FS-7TQN4 R13); where
      // that fails, the icon goes back to its lines
      const knockout = new Knockout({
        scene,
        depth: HUD_DEPTH,
        picture: pictureOf(spec, frame),
        ink: spec.greyed ? GREYED : BRONZE,
        name: `the ${spec.icon} icon`,
        lost: () => this.draw(drawn),
      });
      const drawn: DrawnIcon = { spec, frame, graphics, zone, knockout, hovered: false };
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
    for (const { graphics, zone, knockout } of this.icons) {
      knockout.destroy();
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
    // a knockout where the scene can draw one; today's line glyph where it cannot (FS-7TQN4 R15)
    if (icon.knockout.show(f, icon.hovered)) return;
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
    else if (icon.spec.icon === "inventory") drawRucksackLines(g, cx, cy, ink, alpha);
    else if (icon.spec.icon === "character") drawCharacter(g, cx, cy + 1, ink, alpha);
    else if (icon.spec.icon === "party") drawParty(g, cx, cy, ink, alpha);
  }
}

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
  g.lineStyle(LINE_W, ink, alpha);
  strokeLine(g, gearOutline(cx, cy), true);
  g.strokeCircle(cx, cy, GEAR_RING);
  for (let i = 0; i < GEAR_RIVETS; i++) {
    const [x, y] = at(((i + 0.5) * 2 * Math.PI) / GEAR_RIVETS, GEAR_RING);
    g.strokeCircle(x, y, GEAR_RIVET_R);
  }
}

/** The gear's teeth and the rim between them, one closed outline about (cx, cy). */
function gearOutline(cx: number, cy: number): Pt[] {
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
  return outline;
}

/** Strokes a line through `points` as one path, closed back to its first when `closed`. */
function strokeLine(g: Ink, points: readonly Pt[], closed = false): void {
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  if (closed) g.closePath();
  g.strokePath();
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

// ── The knockouts (FS-7TQN4, the owner 2026-11-13: 「其他icon不是也要反白嗎」): each icon a solid
//    silhouette with its lines cut, for the shared knockout renderer. In local px about the slot's
//    centre, x to the right and y down. The line glyphs above stay as the fallback (R15).

/**
 * Menu (R3): today's gear outline, solid; a hole at its centre, a ring cut round it and four rivet
 * holes between the ring and the teeth, each with bronze to spare round it at render scale 1.
 */
const GEAR_HOLE_R = 2.75;
const GEAR_RING_CUT = 5.2;
const GEAR_RIVET_OUT = 8.5;
const GEAR_RIVET_HOLE = 1.3;
const GEAR_KNOCKOUT: KnockoutPicture = {
  silhouette: [gearOutline(0, 0)],
  cuts: [{ ring: { x: 0, y: 0, r: GEAR_RING_CUT } }],
  holes: [
    { x: 0, y: 0, r: GEAR_HOLE_R },
    ...[1, 3, 5, 7].map((i) => ({
      x: Math.cos((i * Math.PI) / 4) * GEAR_RIVET_OUT,
      y: Math.sin((i * Math.PI) / 4) * GEAR_RIVET_OUT,
      r: GEAR_RIVET_HOLE,
    })),
  ],
};

/**
 * The solid bust (R4, R5; the owner: 「目前反白前的肩胛有點怪在調整一下」), at scale 1 about the bust's
 * centre: a head disc over a shoulder mass whose upper outline is one smooth convex curve: up each
 * arm, over a rounded shoulder cap, and across the shoulders under the neck on a long, low arc
 * that meets each cap without a corner. The caps are the plates; each carries one seam.
 */
const BUST = {
  /** The mass's half-width (its arms) and its foot, the old shoulders' foot. */
  half: 12,
  foot: SHOULDERS.y,
  /** The shoulders' top under the neck, and the radius of the long arc across them. */
  top: 0.8,
  across: 30,
  /** Each shoulder cap's radius: the plate's rounding. */
  cap: 7,
  /** How far inside the cap's edge its seam runs, and where it stops short of the neck. */
  seamIn: 3,
  seamEnd: 5.4,
};
/** The long arc's centre, and each cap's (the left; the right is its mirror), tangent to it. */
const ACROSS_O: Pt = [0, BUST.top + BUST.across];
const CAP_O: Pt = [
  -(BUST.half - BUST.cap),
  ACROSS_O[1] - Math.sqrt((BUST.across - BUST.cap) ** 2 - (BUST.half - BUST.cap) ** 2),
];
/** Where the left cap meets the long arc, as an angle about each. */
const CAP_MEETS = Math.atan2(CAP_O[1] - ACROSS_O[1], CAP_O[0] - ACROSS_O[0]) + 2 * Math.PI;
const mirror = (ps: readonly Pt[]): Pt[] => ps.map(([x, y]) => [-x, y] as Pt);
const arcAbout = (o: Pt, r: number, from: number, to: number, steps: number): Pt[] => oval(o[0], o[1], r, r, from, to, steps);
/** The mass's left half, from the arm's foot up over the cap to the top under the neck. */
const MASS_LEFT: Pt[] = [
  [-BUST.half, BUST.foot],
  [-BUST.half, (BUST.foot + CAP_O[1]) / 2],
  ...arcAbout(CAP_O, BUST.cap, Math.PI, CAP_MEETS, 12),
  ...arcAbout(ACROSS_O, BUST.across, CAP_MEETS, 1.5 * Math.PI, 8).slice(1),
];
/** The shoulder mass: the left half, then its mirror back down the right arm. */
const MASS: Pt[] = [...MASS_LEFT, ...mirror(MASS_LEFT.slice(0, -1)).reverse()];
const HEAD_DISC: Pt[] = oval(0, HEAD.y, HEAD.r, HEAD.r, -Math.PI / 2, 1.5 * Math.PI, 48).slice(0, -1);
/**
 * The left cap's seam, `seamIn` inside its edge: from the arm up round the cap and in along the
 * long arc, stopping short of the neck at `seamEnd` out, so the plate reads laid over the shoulder.
 */
const SEAM_LEFT: Pt[] = (() => {
  const inner = BUST.across - BUST.seamIn;
  const stop = Math.PI * 1.5 - Math.asin(BUST.seamEnd / inner);
  return [
    [-BUST.half + BUST.seamIn, BUST.foot - 2.5],
    ...arcAbout(CAP_O, BUST.cap - BUST.seamIn, Math.PI, CAP_MEETS, 8),
    ...arcAbout(ACROSS_O, inner, CAP_MEETS, stop, 4).slice(1),
  ];
})();
const SEAMS: Pt[][] = [SEAM_LEFT, mirror(SEAM_LEFT).reverse()];
/** Where the baldric starts: on the left shoulder's top, inside the seam's end, toward the neck. */
const BALDRIC_FROM: Pt = [-3.5, ACROSS_O[1] - Math.sqrt(BUST.across ** 2 - 3.5 ** 2)];
const BALDRIC_TO: Pt = [7, BUST.foot];
/**
 * The baldric's buckle, a frame across the strap 0.7 of the way down, and the strap cut either
 * side of it: meeting it end to side, so no cut crosses another (R4).
 */
const BALDRIC = (() => {
  const [[x0, y0], [x1, y1]] = [BALDRIC_FROM, BALDRIC_TO];
  const len = Math.hypot(x1 - x0, y1 - y0);
  const along: Pt = [(x1 - x0) / len, (y1 - y0) / len];
  const across: Pt = [-along[1], along[0]];
  const mid: Pt = [x0 + (x1 - x0) * BUCKLE.at, y0 + (y1 - y0) * BUCKLE.at];
  const off = (a: number, c: number): Pt => [
    mid[0] + (along[0] * a * BUCKLE.long) / 2 + (across[0] * c * BUCKLE.wide) / 2,
    mid[1] + (along[1] * a * BUCKLE.long) / 2 + (across[1] * c * BUCKLE.wide) / 2,
  ];
  return {
    buckle: [off(-1, -1), off(1, -1), off(1, 1), off(-1, 1)],
    strap: [
      [BALDRIC_FROM, off(-1, 0)],
      [off(1, 0), BALDRIC_TO],
    ],
  };
})();

/** A solid bust's parts laid at (dx, dy), scale s. */
function solidBust(dx: number, dy: number, s: number) {
  const place = (ps: readonly Pt[]) => ps.map(([x, y]) => [dx + x * s, dy + y * s] as Pt);
  return { head: place(HEAD_DISC), mass: place(MASS), seams: SEAMS.map(place), place };
}

/** Character (R4, R5): one solid bust, 1 px below the slot's centre, its seams, baldric and buckle. */
const CHARACTER_KNOCKOUT: KnockoutPicture = (() => {
  const b = solidBust(0, 1, 1);
  return {
    silhouette: [b.head, b.mass],
    cuts: [
      ...b.seams.map((path) => ({ path })),
      ...BALDRIC.strap.map((path) => ({ path: b.place(path) })),
      { path: b.place(BALDRIC.buckle), closed: true },
    ],
  };
})();

/** How finely the Party's gap follows the front bust's outline. */
const GAP_STEP = 0.25;

/** The outline `ps`, closed, moved out from its inside by `by`, in points no more than `GAP_STEP` apart. */
function outward(ps: readonly Pt[], by: number): Pt[] {
  const n = ps.length;
  const moved = ps.map((p, i) => {
    const [a, b] = [ps[(i + n - 1) % n], ps[(i + 1) % n]];
    // each edge's outward normal (the outline runs clockwise on the screen, y down), and their mitre
    const normal = (u: Pt, v: Pt): Pt => {
      const l = Math.hypot(v[0] - u[0], v[1] - u[1]);
      return [(v[1] - u[1]) / l, -(v[0] - u[0]) / l];
    };
    const [na, nb] = [normal(a, p), normal(p, b)];
    const m: Pt = [na[0] + nb[0], na[1] + nb[1]];
    const k = by / (1 + na[0] * nb[0] + na[1] * nb[1]);
    return [p[0] + m[0] * k, p[1] + m[1] * k] as Pt;
  });
  const out: Pt[] = [];
  moved.forEach((p, i) => {
    const q = moved[(i + 1) % n];
    const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / GAP_STEP));
    for (let k = 0; k < steps; k++) out.push([p[0] + ((q[0] - p[0]) * k) / steps, p[1] + ((q[1] - p[1]) * k) / steps]);
  });
  return out;
}

/**
 * The runs of the closed line `ps` that lie over `shapes`, each one point longer at either end so
 * the cut reaches the shape's edge; read from a point off them, so a run across the line's first
 * point stays one path.
 */
function overRuns(ps: readonly Pt[], shapes: readonly (readonly Pt[])[]): Pt[][] {
  const over = ps.map(([x, y]) => shapes.some((s) => within(s, x, y)));
  const from = over.indexOf(false);
  if (from < 0) return [[...ps, ps[0]]];
  const order = [...ps.keys()].map((i) => (from + i) % ps.length);
  const out: Pt[][] = [];
  let run: number[] = [];
  for (const i of [...order, from]) {
    if (over[i]) run.push(i);
    else if (run.length) {
      const before = (run[0] + ps.length - 1) % ps.length;
      out.push([before, ...run, i].map((j) => ps[j]));
      run = [];
    }
  }
  return out;
}

/**
 * Party (R6): three solid busts in today's places, one fill; the front one's seams cut, and a gap
 * cut along its outline, just outside it, wherever it lies over a bust behind, so the front bust
 * reads whole and each behind it as its own shape. Its gorget's arc is left out: with the two
 * seams it read as a face at render scale 1.
 */
const PARTY_KNOCKOUT: KnockoutPicture = (() => {
  const front = solidBust(PARTY_BUSTS.front.dx, PARTY_BUSTS.front.dy, PARTY_BUSTS.front.s);
  const back = PARTY_BUSTS.back.map(({ dx, dy, s }) => solidBust(dx, dy, s));
  const behind = back.flatMap((b) => [b.head, b.mass]);
  const gaps: KnockoutCut[] = [front.head, front.mass].flatMap((outline) =>
    overRuns(outward(outline, CUT_W / 2), behind).map((path) => ({ path })),
  );
  return {
    silhouette: [...behind, front.head, front.mass],
    cuts: [...gaps, ...front.seams.map((path) => ({ path }))],
  };
})();
