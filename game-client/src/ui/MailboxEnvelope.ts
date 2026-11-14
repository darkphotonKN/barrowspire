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
import { PASS_THROUGH, type UiActWrapper, type UiEffect } from "@/audio/uiSounds";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { viewport } from "@/render/viewport";
import { envelopeFrame, type Rect } from "./letterPanelLayout";
import { CornerLabel } from "./cornerLabel";
import { CORNER_LABEL } from "./hudCornerLayout";
import { BRONZE, Knockout, oval, type KnockoutPicture, type Pt } from "./knockout";

export interface MailboxEnvelopeDeps {
  store: StoreApi<MailboxState>;
  /** Whether a dialogue or the menu owns the screen now: a press then opens nothing. */
  blocked: () => boolean;
  /**
   * Closes the other windows just before the panel opens: the letter panel is full-screen, so it
   * stands alone (FS-1GZGD § Change C4; FS-3EBCA R15).
   */
  opening?: () => void;
  /**
   * Runs the envelope's press, the player's own input, as the town runs its own (the interface sounds' wrapper,
   * FS-WDM0X S9). None, and it runs as it is.
   */
  wrapper?: UiActWrapper;
  /**
   * Plays an interface sound (FS-WDM0X § Change: Menu, dialog and notice sounds): `menu_hover` as the
   * pointer comes onto it, `menu_error` for a press refused, `notify` as it glows for a newer letter.
   * None, and it plays nothing.
   */
  play?: (effect: UiEffect) => void;
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

/** The envelope's lines: 36 × 25, centred across the icon's rect, 11 px down from its top. */
const ENVELOPE_LINES = { width: 36, height: 25, top: 11 };
function envelopeRect(f: Rect): Rect {
  return {
    x: f.x + (f.width - ENVELOPE_LINES.width) / 2,
    y: f.y + ENVELOPE_LINES.top,
    width: ENVELOPE_LINES.width,
    height: ENVELOPE_LINES.height,
  };
}

/** The flap's point on an envelope drawn in rect `f`: where its two lines meet. */
export function envelopeFlapPoint(f: Rect): { x: number; y: number } {
  const e = envelopeRect(f);
  return { x: e.x + e.width / 2, y: e.y + e.height * 0.58 };
}

/**
 * The envelope's lines in rect `f`, in `ink` (R33): its edge, the flap down to its point and the
 * folds at the foot, as before FS-QHN87 (the owner's round 1, 2026-11-13: 「信箱有點怪 還是回到上一版好了」),
 * in the row's one width. The flap is one path through its point, so the renderer joins it there
 * (FS-QHN87 R2). The corner row draws the greyed Mailbox with it too (FS-3EBCA R9).
 */
export function drawEnvelopeLines(
  g: Pick<
    Phaser.GameObjects.Graphics,
    "lineStyle" | "strokeRoundedRect" | "lineBetween" | "beginPath" | "moveTo" | "lineTo" | "strokePath"
  >,
  f: Rect,
  ink: number,
  alpha: number,
): void {
  const e = envelopeRect(f);
  const point = envelopeFlapPoint(f);
  g.lineStyle(GLYPH_LINE_W, ink, alpha);
  g.strokeRoundedRect(e.x, e.y, e.width, e.height, 2);
  // the flap, down to its point and up again
  g.beginPath();
  g.moveTo(e.x + 1, e.y + 1);
  g.lineTo(point.x, point.y);
  g.lineTo(e.x + e.width - 1, e.y + 1);
  g.strokePath();
  // the folds at the foot
  g.lineBetween(e.x + 1, e.y + e.height - 1, e.x + e.width * 0.36, e.y + e.height * 0.5);
  g.lineBetween(e.x + e.width - 1, e.y + e.height - 1, e.x + e.width * 0.64, e.y + e.height * 0.5);
}

/**
 * The envelope as a knockout (FS-7TQN4 R7), about the centre of the rect `f` it stands in: one
 * solid rounded rect in the envelope's rect, radius 2, its flap cut as one path down to its point
 * and up again, and its two foot folds cut, as its lines run. The corner row's greyed Mailbox is
 * the same (R9).
 */
export function envelopeKnockout(f: Rect): KnockoutPicture {
  const e = envelopeRect(f);
  const point = envelopeFlapPoint(f);
  const [cx, cy] = [f.x + f.width / 2, f.y + f.height / 2];
  const local = (x: number, y: number): Pt => [x - cx, y - cy];
  const r = 2;
  const corner = (x: number, y: number, from: number) =>
    oval(x - cx, y - cy, r, r, from, from + Math.PI / 2, 6);
  const [l, t, rt, b] = [e.x, e.y, e.x + e.width, e.y + e.height];
  return {
    silhouette: [
      [
        ...corner(l + r, t + r, Math.PI),
        ...corner(rt - r, t + r, 1.5 * Math.PI),
        ...corner(rt - r, b - r, 0),
        ...corner(l + r, b - r, Math.PI / 2),
      ],
    ],
    cuts: [
      { path: [local(l + 1, t + 1), local(point.x, point.y), local(rt - 1, t + 1)] },
      { path: [local(l + 1, b - 1), local(l + e.width * 0.36, t + e.height * 0.5)] },
      { path: [local(rt - 1, b - 1), local(l + e.width * 0.64, t + e.height * 0.5)] },
    ],
  };
}

export class MailboxEnvelope {
  private frame: Rect;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Graphics;
  private readonly badge: Phaser.GameObjects.Graphics;
  /** The envelope as a knockout, where the scene can draw one (FS-7TQN4 R7, R12). */
  private readonly knockout: Knockout;
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
    // drawn at the render scale and again at a new one, which the scene's relayout does not
    // report (FS-7TQN4 R13); each image it makes goes under the badge, so over the glow (R8)
    this.knockout = new Knockout({
      scene,
      depth: HUD_DEPTH,
      picture: envelopeKnockout(this.frame),
      ink: BRONZE,
      name: "the envelope",
      built: (image) => scene.children.moveBelow(image as Phaser.GameObjects.GameObject, this.badge),
      lost: () => this.drawBody(),
    });
    const { x, y, width, height } = this.frame;
    this.zone = scene.add
      .zone(x, y, width, height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setInteractive();
    this.zone.on("pointerdown", () => (this.deps.wrapper ?? PASS_THROUGH).act(() => this.press()));
    this.zone.on("pointerover", () => this.hover(true));
    this.zone.on("pointerout", () => this.hover(false));

    this.drawGlow();
    this.drawBody();
    this.drawBadge();
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (state.summary !== prev.summary) this.drawBadge();
      if (state.pulses > prev.pulses) {
        this.playPulse();
        // a new letter arrived (§ Change M16)
        this.deps.play?.("notify");
      }
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
    this.knockout.destroy();
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
    // refused while a dialogue holds the screen (§ Change M10)
    if (this.deps.blocked()) return this.deps.play?.("menu_error");
    this.deps.opening?.();
    void mailbox.openPanel();
  }

  private hover(on: boolean): void {
    if (this.hovered === on) return;
    this.hovered = on;
    this.drawBody();
    if (on) this.label.show(this.frame, CORNER_LABEL.mail);
    else this.label.hide();
    if (on) this.deps.play?.("menu_hover");
  }

  /**
   * The envelope, bare over the world (FS-J1672 R1): a bronze knockout, lifted under the pointer
   * (FS-7TQN4 R7, R10); its lines, amber and brighter under the pointer, where the scene cannot
   * draw the knockout (R15).
   */
  private drawBody(): void {
    const g = this.body.clear();
    const f = this.frame;
    if (this.knockout.show(f, this.hovered)) return;
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
