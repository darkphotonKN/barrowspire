/**
 * The mailbox's envelope at the bottom-right of the town HUD (FS-1GZGD R33, R35; D11, D12): a line
 * envelope with a small wax seal, drawn with Phaser graphics on a carved plate (no emoji, no
 * Heroicon, no baked art). The seal is lit with the number of letters waiting and dark when none
 * do; a newer letter than the player last saw makes the envelope glow a few times, then the seal
 * stays lit. Pressing it opens the letter panel, and pressing it again closes it; it stands in the
 * corner row's Mailbox slot and names itself "Mailbox" under the pointer (FS-1GZGD § Change).
 *
 * Game palette (ADR-0025): the envelope's lines are amber because it can always be pressed; the
 * lit seal is ember wax; the pulse is the torch's glow. It reads the mailbox store and decides
 * nothing: what the seal shows and when it pulses is `@/mailbox/mailbox` and the store's.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import { sealState } from "@/mailbox/mailbox";
import type { MailboxState } from "@/stores/mailboxStore";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import { viewport } from "@/render/viewport";
import { envelopeFrame, type Rect } from "./letterPanelLayout";
import { CornerLabel } from "./cornerLabel";
import { CORNER_LABEL } from "./hudCornerLayout";

export interface MailboxEnvelopeDeps {
  store: StoreApi<MailboxState>;
  /** Whether a dialogue, a menu or an overlay owns the screen now: a press then opens nothing. */
  blocked: () => boolean;
}

const HUD_DEPTH = 1000;
/** One glow up and down, and how many more follow it: three glows in all (D12, "a few times"). */
const PULSE_MS = 420;
const PULSE_REPEATS = 2;
/** The highest count the seal prints; more reads as this. */
const SEAL_MAX = 99;

/** Draws a wax seal at (x, y): ember wax with a bright rim when lit, dark iron-rimmed wax when not. */
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

/** The envelope inside its plate. */
function envelopeRect(f: Rect): Rect {
  return { x: f.x + 11, y: f.y + 11, width: f.width - 22, height: f.height - 21 };
}

/** Where the seal sits on an envelope drawn in plate `f`: the flap's point. */
export function envelopeSealAt(f: Rect): { x: number; y: number } {
  const e = envelopeRect(f);
  return { x: e.x + e.width / 2, y: e.y + e.height * 0.58 };
}

/**
 * The envelope's lines in plate `f`, in `ink` (R33): its edge, the flap down to the seal and the
 * folds at the foot. The corner row draws the greyed Mailbox with it too (FS-3EBCA R9).
 */
export function drawEnvelopeLines(
  g: Pick<Phaser.GameObjects.Graphics, "lineStyle" | "strokeRoundedRect" | "lineBetween">,
  f: Rect,
  ink: number,
  alpha: number,
): void {
  const e = envelopeRect(f);
  const point = envelopeSealAt(f);
  g.lineStyle(1.5, ink, alpha);
  g.strokeRoundedRect(e.x, e.y, e.width, e.height, 2);
  // the flap, down to the seal
  g.lineBetween(e.x + 1, e.y + 1, point.x, point.y);
  g.lineBetween(point.x, point.y, e.x + e.width - 1, e.y + 1);
  // the folds at the foot
  g.lineBetween(e.x + 1, e.y + e.height - 1, e.x + e.width * 0.36, e.y + e.height * 0.5);
  g.lineBetween(e.x + e.width - 1, e.y + e.height - 1, e.x + e.width * 0.64, e.y + e.height * 0.5);
}

export class MailboxEnvelope {
  private frame: Rect;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Graphics;
  private readonly seal: Phaser.GameObjects.Graphics;
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
    this.seal = hud(scene.add.graphics());
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
    this.drawSeal();
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (state.summary !== prev.summary) this.drawSeal();
      if (state.pulses > prev.pulses) this.playPulse();
    });
  }

  /** The logical view changed: the envelope goes back to its slot in the corner row (FS-ZAJMH R12, R13). */
  relayout(): void {
    this.frame = envelopeFrame(viewport);
    this.zone.setPosition(this.frame.x, this.frame.y);
    this.drawGlow();
    this.drawBody();
    this.drawSeal();
    if (this.hovered) this.label.show(this.frame, CORNER_LABEL.mail);
  }

  destroy(): void {
    this.unsubscribe();
    this.label.hide();
    this.pulse?.stop();
    this.pulse = undefined;
    this.glow.destroy();
    this.body.destroy();
    this.seal.destroy();
    this.count?.destroy();
    this.count = undefined;
    this.zone.destroy();
  }

  /** A press toggles the letter panel (§ Change C1): an open one always closes. */
  private press(): void {
    const mailbox = this.deps.store.getState();
    if (mailbox.panelOpen) return mailbox.closePanel();
    if (this.deps.blocked()) return;
    void mailbox.openPanel();
  }

  private hover(on: boolean): void {
    if (this.hovered === on) return;
    this.hovered = on;
    this.drawBody();
    if (on) this.label.show(this.frame, CORNER_LABEL.mail);
    else this.label.hide();
  }

  /** The carved plate and the envelope's lines: amber, brighter under the pointer. */
  private drawBody(): void {
    const g = this.body.clear();
    const f = this.frame;
    carvedPanel(g, f.x, f.y, f.width, f.height, { opacity: 0.85 });
    drawEnvelopeLines(
      g,
      f,
      this.hovered ? palette.interactableBright : palette.interactable,
      this.hovered ? 1 : 0.85,
    );
  }

  /** The seal: lit with the waiting count, dark with none (R35). */
  private drawSeal(): void {
    const { lit, count } = sealState(this.deps.store.getState().summary);
    const at = envelopeSealAt(this.frame);
    const g = this.seal.clear();
    drawWaxSeal(g, at.x, at.y, 8, lit);
    this.count?.destroy();
    this.count = undefined;
    if (!lit) return;
    this.count = this.scene.add
      .text(at.x, at.y, String(Math.min(count, SEAL_MAX)), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        fontStyle: "bold",
        color: toCss(palette.hudText),
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  /** The torch's soft glow around the plate, faded in and out by the pulse. */
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

  /** A few glows, then the seal simply stays lit (D12). A new pulse restarts the glows. */
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
