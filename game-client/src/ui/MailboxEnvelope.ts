/**
 * The mailbox's envelope at the bottom-right of the town HUD (FS-1GZGD R33, R35; D11): a bare line
 * envelope, drawn with Phaser graphics straight over the world, with no plate under it and no seal
 * on it (FS-J1672 R1, R7; no emoji, no Heroicon, no baked art). While letters wait, a small ember
 * badge at its top-right corner carries their number, and none shows when nothing does (FS-J1672
 * R8, R9); a newer letter than the player last saw makes the envelope glow a few times, then the
 * badge simply stays (R10). Pressing it opens the letter panel, and pressing it again closes it; it
 * stands in the corner row's Mailbox slot and names itself "Mailbox" under the pointer (FS-1GZGD
 * § Change).
 *
 * Game palette (ADR-0025): the envelope's lines are amber because it can always be pressed; the
 * badge wears the lit seal's ember and rim; the pulse is the torch's glow. It reads the mailbox
 * store and decides nothing: what the badge shows and when it pulses is `@/mailbox/mailbox` and the
 * store's (`sealState`).
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import { sealState } from "@/mailbox/mailbox";
import type { MailboxState } from "@/stores/mailboxStore";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { viewport } from "@/render/viewport";
import { envelopeFrame, type Rect } from "./letterPanelLayout";
import { CornerLabel } from "./cornerLabel";
import { CORNER_LABEL } from "./hudCornerLayout";

export interface MailboxEnvelopeDeps {
  store: StoreApi<MailboxState>;
  /** Whether a dialogue or the menu owns the screen now: a press then opens nothing. */
  blocked: () => boolean;
  /**
   * Closes the other windows just before the panel opens: the letter panel is full-screen, so it
   * stands alone (FS-1GZGD § Change C4; FS-3EBCA R15).
   */
  opening?: () => void;
}

const HUD_DEPTH = 1000;
/** One glow up and down, and how many more follow it: three glows in all (D12, "a few times"). */
const PULSE_MS = 420;
const PULSE_REPEATS = 2;
/** The highest count the badge prints; more reads as this. */
const BADGE_MAX = 99;
/** The count badge (FS-J1672 R9): 14 px tall, its count 4 px in from each side, never under 14 wide. */
const BADGE_H = 14;
const BADGE_PAD_X = 4;
/** The badge's rim, inset in its ember as the lit seal's is in its wax. */
const BADGE_RIM_INSET = 1.5;

/**
 * Strokes a pill `w` × `h` centred on (x, y), its ends half circles: a circle when it is no wider
 * than tall. Not `strokeRoundedRect`, which at a radius of half the height (and, when square, half
 * the width) puts lines of no length in its path (Phaser 4.2.1 Graphics.strokeRoundedRect), and the
 * WebGL renderer's DrawLine divides by a segment's length. Here every segment has length: each
 * arc's start joins the last point by the pill's top, and closing the path draws its foot.
 */
function strokePill(
  g: Pick<
    Phaser.GameObjects.Graphics,
    "strokeCircle" | "beginPath" | "arc" | "closePath" | "strokePath"
  >,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = h / 2;
  if (w <= h) {
    g.strokeCircle(x, y, r);
    return;
  }
  const reach = w / 2 - r;
  g.beginPath();
  g.arc(x - reach, y, r, Math.PI / 2, (Math.PI * 3) / 2);
  g.arc(x + reach, y, r, -Math.PI / 2, Math.PI / 2);
  g.closePath();
  g.strokePath();
}

/**
 * Draws a wax seal at (x, y): ember wax with a bright rim when lit, dark iron-rimmed wax when not.
 * The letter list's unread dot; the envelope itself wears none (FS-J1672 R7, R11).
 */
export function drawWaxSeal(
  g: Pick<
    Phaser.GameObjects.Graphics,
    "fillStyle" | "fillCircle" | "lineStyle" | "strokeCircle"
  >,
  x: number,
  y: number,
  r: number,
  lit: boolean,
): void {
  if (lit) {
    // a drip or two at the rim, so it reads as pressed wax rather than a dot
    g.fillStyle(palette.ember, 1);
    g.fillCircle(x - r * 0.75, y + r * 0.55, r * 0.35);
    g.fillCircle(x + r * 0.7, y - r * 0.6, r * 0.28);
    g.fillCircle(x, y, r);
    g.lineStyle(1, palette.interactableBright, 0.85);
    g.strokeCircle(x, y, r - 1.5);
    return;
  }
  g.fillStyle(palette.ink, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(1, palette.frame, 0.45);
  g.strokeCircle(x, y, r - 1);
}

/**
 * The one line width of every corner-row glyph, the envelope's lines and the greyed Mailbox's
 * included (FS-QHN87 R1): over the WebGL renderer's 2 px join threshold, so a path's corners are
 * joined (Phaser 4.2.1 StrokePath). Named here, not in `HudCorner`, which imports the envelope's
 * lines: the other way round would be a cycle.
 */
export const GLYPH_LINE_W = 2.25;

/** The envelope's lines inside the icon's 58 × 46 rect. */
function envelopeRect(f: Rect): Rect {
  return { x: f.x + 11, y: f.y + 11, width: f.width - 22, height: f.height - 21 };
}

/** The flap's point on an envelope drawn in rect `f`: where its two lines meet. */
export function envelopeFlapPoint(f: Rect): { x: number; y: number } {
  const e = envelopeRect(f);
  return { x: e.x + e.width / 2, y: e.y + e.height * 0.58 };
}

type Pt = { x: number; y: number };

/** The bottom-left corner turned over: cut this far up its side and along its foot (FS-QHN87 R6). */
const FOLD = 6.5;
/** The cord: from the foot this far in from the left, up to the right side this far down. */
const CORD = { foot: 12, side: 11 };
/** The knot: this far along the cord from its foot, clear of the flap point and the middle. */
const KNOT_AT = 0.78;
/** Its crossing strokes: each this long each side of the knot, slanted this far off the cord. */
const KNOT_ARM = 2.5;
const KNOT_SLANT = (50 * Math.PI) / 180;
/** Its loose ends: this long, hanging at these angles (down is a quarter turn). */
const KNOT_END = 4.2;
const KNOT_ENDS = [(55 * Math.PI) / 180, (125 * Math.PI) / 180];
/** The creases: this far inside each flap line, over this stretch of it from its top corner. */
const CREASE_IN = 3.2;
const CREASE_SPAN = [0.26, 0.56] as const;
/** Past the cord's own width, a hair more of a line under it is left undrawn, so it lies on top. */
const HAIR = 0.4;
/** The corners' radius, as the rounded rect had it, and how finely each is drawn. */
const CORNER_R = 2;
const CORNER_STEPS = 4;

/** How far `p` stands from the segment a–b. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** The runs of the line a–b left in view where `hidden` hides it, each as its two ends. */
function brokenLine(a: Pt, b: Pt, hidden: (p: Pt) => boolean): [Pt, Pt][] {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
  const at = (i: number): Pt => ({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
  const runs: [Pt, Pt][] = [];
  let from: number | undefined;
  for (let i = 0; i <= steps + 1; i++) {
    if (i <= steps && !hidden(at(i))) from ??= i;
    else if (from !== undefined) {
      if (i - 1 > from) runs.push([at(from), at(i - 1)]);
      from = undefined;
    }
  }
  return runs;
}

/**
 * The envelope's lines in rect `f`, in `ink` (R33; FS-QHN87 R6), all in the row's one width: its
 * edge with the bottom-left corner turned over, the flap down to its point as one path, a crease
 * inside each flap line by its top corner, the folds at the foot, and a cord tied across it on a
 * diagonal, knotted on the right with two loose ends, the lines under it left undrawn. No circle,
 * nothing round in the middle, and none of the cord, knot or fold under the count badge (FS-J1672
 * R7). Only the stroke methods the letter panel's stand-in knows (R11). The corner row draws the
 * greyed Mailbox with it too (FS-3EBCA R9).
 */
export function drawEnvelopeLines(
  g: Pick<
    Phaser.GameObjects.Graphics,
    "lineStyle" | "lineBetween" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "strokePath"
  >,
  f: Rect,
  ink: number,
  alpha: number,
): void {
  const e = envelopeRect(f);
  const at = (x: number, y: number): Pt => ({ x: e.x + x, y: e.y + y });
  const w = e.width;
  const h = e.height;
  const point = envelopeFlapPoint(f);
  const path = (pts: Pt[], closed = false) => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    if (closed) g.closePath();
    g.strokePath();
  };
  const line = (a: Pt, b: Pt) => g.lineBetween(a.x, a.y, b.x, b.y);
  const corner = (cx: number, cy: number, from: number): Pt[] =>
    Array.from({ length: CORNER_STEPS + 1 }, (_, i) => {
      const a = from + (Math.PI / 2) * (i / CORNER_STEPS);
      return at(cx + Math.cos(a) * CORNER_R, cy + Math.sin(a) * CORNER_R);
    });

  // the turned-over corner: cut from its side (a) to its foot (b), its tip (c) laid inside
  const fold = { a: at(0, h - FOLD), c: at(FOLD, h - FOLD), b: at(FOLD, h) };
  // the cord, its knot's crossing strokes and loose ends: what lies on top of the other lines
  const cord = [at(CORD.foot, h), at(w, CORD.side)] as const;
  const knot = {
    x: cord[0].x + (cord[1].x - cord[0].x) * KNOT_AT,
    y: cord[0].y + (cord[1].y - cord[0].y) * KNOT_AT,
  };
  const slope = Math.atan2(cord[1].y - cord[0].y, cord[1].x - cord[0].x);
  const arms = [slope + KNOT_SLANT, slope - KNOT_SLANT].map((a) => {
    const d = { x: Math.cos(a) * KNOT_ARM, y: Math.sin(a) * KNOT_ARM };
    return [
      { x: knot.x - d.x, y: knot.y - d.y },
      { x: knot.x + d.x, y: knot.y + d.y },
    ] as const;
  });
  const [left, right] = KNOT_ENDS.map((a) => ({ x: knot.x + Math.cos(a) * KNOT_END, y: knot.y + Math.sin(a) * KNOT_END }));
  const ends = [right, knot, left];
  const lying = [cord, ...arms, [right, knot] as const, [knot, left] as const];
  const under = (p: Pt) => lying.some(([a, b]) => toSegment(p, a, b) < GLYPH_LINE_W + HAIR);

  g.lineStyle(GLYPH_LINE_W, ink, alpha);
  // the edge, its corners rounded as before but the turned-over one, which the cut closes
  path(
    [
      fold.a,
      ...corner(CORNER_R, CORNER_R, Math.PI),
      ...corner(w - CORNER_R, CORNER_R, -Math.PI / 2),
      ...corner(w - CORNER_R, h - CORNER_R, 0),
      fold.b,
    ],
    true,
  );
  path([fold.a, fold.c, fold.b]);
  // the flap, down to its point and up again: one path, so its point is joined
  path([at(1, 1), point, at(w - 1, 1)]);
  // a crease inside each flap line by its top corner
  for (const top of [at(1, 1), at(w - 1, 1)]) {
    const len = Math.hypot(point.x - top.x, point.y - top.y);
    const along = { x: (point.x - top.x) / len, y: (point.y - top.y) / len };
    // inside: away from the flap, toward the envelope's side
    const side = Math.sign(e.x + w / 2 - top.x);
    const inward = { x: -along.y * side, y: along.x * side };
    const [s0, s1] = CREASE_SPAN.map((t) => ({
      x: top.x + (point.x - top.x) * t + inward.x * CREASE_IN,
      y: top.y + (point.y - top.y) * t + inward.y * CREASE_IN,
    }));
    line(s0, s1);
  }
  // the folds at the foot: the left one from the turned corner's tip, the right one under the cord
  line(fold.c, at(w * 0.36, h * 0.5));
  for (const [a, b] of brokenLine(at(w - 1, h - 1), at(w * 0.64, h * 0.5), under)) line(a, b);
  // the cord and its knot, on top
  line(cord[0], cord[1]);
  for (const [a, b] of arms) line(a, b);
  path(ends);
}

export class MailboxEnvelope {
  private frame: Rect;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Graphics;
  private readonly badge: Phaser.GameObjects.Graphics;
  private readonly zone: Phaser.GameObjects.Zone;
  private count?: Phaser.GameObjects.Text;
  private pulse?: Phaser.Tweens.Tween;
  private hovered = false;
  private readonly label: CornerLabel;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: MailboxEnvelopeDeps,
  ) {
    this.frame = envelopeFrame(viewport);
    this.label = new CornerLabel(scene);
    const hud = <T extends Phaser.GameObjects.Graphics>(g: T) =>
      g.setScrollFactor(0).setDepth(HUD_DEPTH);
    this.glow = hud(scene.add.graphics());
    this.glow.setAlpha(0);
    this.body = hud(scene.add.graphics());
    this.badge = hud(scene.add.graphics());
    const { x, y, width, height } = this.frame;
    this.zone = scene.add
      .zone(x, y, width, height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setInteractive({ useHandCursor: true });
    this.zone.on("pointerdown", () => this.press());
    this.zone.on("pointerover", () => this.hover(true));
    this.zone.on("pointerout", () => this.hover(false));

    this.drawGlow();
    this.drawBody();
    this.drawBadge();
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (state.summary !== prev.summary) this.drawBadge();
      if (state.pulses > prev.pulses) this.playPulse();
    });
  }

  /** The logical view changed: the envelope goes back to its slot in the corner row (FS-ZAJMH R12, R13). */
  relayout(): void {
    this.frame = envelopeFrame(viewport);
    this.zone.setPosition(this.frame.x, this.frame.y);
    this.drawGlow();
    this.drawBody();
    this.drawBadge();
    if (this.hovered) this.label.show(this.frame, CORNER_LABEL.mail);
  }

  destroy(): void {
    this.unsubscribe();
    this.label.hide();
    this.pulse?.stop();
    this.pulse = undefined;
    this.glow.destroy();
    this.body.destroy();
    this.badge.destroy();
    this.count?.destroy();
    this.count = undefined;
    this.zone.destroy();
  }

  /**
   * A press toggles the letter panel (§ Change C1): an open one always closes; a shut one opens
   * unless refused, the other windows closing first (C4).
   */
  private press(): void {
    const mailbox = this.deps.store.getState();
    if (mailbox.panelOpen) return mailbox.closePanel();
    if (this.deps.blocked()) return;
    this.deps.opening?.();
    void mailbox.openPanel();
  }

  private hover(on: boolean): void {
    if (this.hovered === on) return;
    this.hovered = on;
    this.drawBody();
    if (on) this.label.show(this.frame, CORNER_LABEL.mail);
    else this.label.hide();
  }

  /** The envelope's lines, bare over the world (FS-J1672 R1): amber, brighter under the pointer. */
  private drawBody(): void {
    const g = this.body.clear();
    const f = this.frame;
    drawEnvelopeLines(
      g,
      f,
      this.hovered ? palette.interactableBright : palette.interactable,
      this.hovered ? 1 : 0.85,
    );
  }

  /**
   * The count badge (FS-J1672 R8, R9): while anything waits, an ember pill with a bright rim, as the
   * letter list's lit seal wears, and the count on it, centred on the envelope's top-right corner,
   * moved left only as far as keeps it inside the icon's rect; nothing when nothing waits.
   */
  private drawBadge(): void {
    const { lit, count } = sealState(this.deps.store.getState().summary);
    const g = this.badge.clear();
    this.count?.destroy();
    this.count = undefined;
    if (!lit) return;
    const text = this.scene.add
      .text(0, 0, String(Math.min(count, BADGE_MAX)), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        fontStyle: "bold",
        color: toCss(palette.hudText),
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    const f = this.frame;
    const e = envelopeRect(f);
    const w = Math.max(BADGE_H, text.width + BADGE_PAD_X * 2);
    const x = Math.min(e.x + e.width, f.x + f.width - w / 2);
    const y = e.y;
    const r = BADGE_H / 2;
    g.fillStyle(palette.ember, 1);
    g.fillRoundedRect(x - w / 2, y - r, w, BADGE_H, r);
    g.lineStyle(1, palette.interactableBright, 0.85);
    strokePill(g, x, y, w - BADGE_RIM_INSET * 2, BADGE_H - BADGE_RIM_INSET * 2);
    this.count = text.setPosition(x, y);
  }

  /**
   * The torch's soft glow round the icon's rect, where its plate once stood, faded in and out by
   * the pulse (FS-J1672 R10).
   */
  private drawGlow(): void {
    const g = this.glow.clear();
    const f = this.frame;
    for (let spread = 14; spread >= 1; spread -= 1) {
      g.fillStyle(palette.torch, 0.035);
      g.fillRoundedRect(
        f.x - spread,
        f.y - spread,
        f.width + spread * 2,
        f.height + spread * 2,
        6 + spread,
      );
    }
  }

  /** A few glows, then the badge simply stays (D12; FS-J1672 R10). A new pulse restarts the glows. */
  private playPulse(): void {
    this.pulse?.stop();
    this.glow.setAlpha(0);
    this.pulse = this.scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0, to: 1 },
      duration: PULSE_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: PULSE_REPEATS,
      onComplete: () => this.glow.setAlpha(0),
    });
  }
}
