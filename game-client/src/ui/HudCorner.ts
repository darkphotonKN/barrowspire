/**
 * The corner row (FS-3EBCA): the panel icons in the bottom-right corner of every world, from the
 * right Menu (a gear: one Esc press), Inventory (a bag: the inventory), Character (a bust: the
 * character panel), Party (two busts: the party panel) and the Mailbox. In the town the Mailbox is the mailbox's own envelope
 * (`MailboxEnvelope`, FS-1GZGD § Change), which this row leaves its slot to; elsewhere it is drawn
 * here, greyed (R9).
 *
 * Each icon is its bare glyph in 1.5 px lines over the world, with no plate under it and nothing
 * filled (FS-J1672 R1–R3): the interactable amber, brighter under the pointer, where a small label
 * names the icon and its key (R3, R5). Its 58 × 46 rect stays its press area (FS-J1672 R4). Drawn
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
  "lineStyle" | "strokeCircle" | "lineBetween" | "beginPath" | "arc" | "strokePath" | "closePath"
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
    else if (icon.spec.icon === "inventory") drawBag(g, cx, cy, ink, alpha);
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

/**
 * A bag (R3): a rounded pouch under a gathered neck tied with a cord, a flap across its top.
 * The pouch is a half circle closed by a straight top, the neck a short gathered band above it.
 */
export function drawBag(g: Ink, cx: number, cy: number, ink: number, alpha: number): void {
  const top = cy - 3;
  const r = 11;
  g.lineStyle(LINE_W, ink, alpha);
  // the pouch: its rounded belly below the flap's line
  g.beginPath();
  g.arc(cx, top, r, 0, Math.PI, false);
  g.closePath();
  g.strokePath();
  // the flap: a shallow curve from shoulder to shoulder, its point at the middle
  g.lineBetween(cx - r, top, cx, top + 5);
  g.lineBetween(cx, top + 5, cx + r, top);
  // the gathered neck and the cord tied round it
  g.lineBetween(cx - 4, top, cx - 3, top - 6);
  g.lineBetween(cx + 4, top, cx + 3, top - 6);
  g.lineBetween(cx - 5, top - 3, cx + 5, top - 3);
  g.lineBetween(cx - 3, top - 6, cx + 3, top - 6);
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
