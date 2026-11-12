/**
 * The corner row (FS-3EBCA): the panel icons in the bottom-right corner of every world, from the
 * right Menu (a gear: one Esc press), Character (a bust: the gear and bag overlay), Party (two
 * busts: the party panel) and the Mailbox. In the town the Mailbox is the mailbox's own envelope
 * (`MailboxEnvelope`, FS-1GZGD § Change), which this row leaves its slot to; elsewhere it is drawn
 * here, greyed (R9).
 *
 * Each plate is the envelope's: a carved plate at 0.85 with its glyph in 1.5 px lines, the
 * interactable amber, brighter under the pointer, where a small label names the icon and its key
 * (R3, R5). Drawn in code from palette tokens (ADR-0013). The row decides nothing: what a press
 * does is the scene's, handed in per icon, and it answers no press while the gear overlay covers
 * it (R11).
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, rgba, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import {
  CORNER_LABEL,
  cornerIconFrame,
  cornerLabelAt,
  type CornerIcon,
  type Rect,
} from "./hudCornerLayout";

const HUD_DEPTH = 1000;
/** The plate's opacity and the glyph's lines, the envelope's. */
const PLATE_OPACITY = 0.85;
const LINE_W = 1.5;

export interface CornerIconSpec {
  icon: CornerIcon;
  /** What a press does; the scene's own key path (Esc, I, T). */
  press?: () => void;
}

export interface HudCornerDeps {
  icons: CornerIconSpec[];
  /** Whether the open gear overlay covers this screen point: the row then answers nothing (R11). */
  covered?: (x: number, y: number) => boolean;
}

type Ink = Pick<
  Phaser.GameObjects.Graphics,
  | "lineStyle"
  | "strokeCircle"
  | "lineBetween"
  | "beginPath"
  | "arc"
  | "strokePath"
  | "closePath"
  | "fillPath"
  | "fillStyle"
  | "fillCircle"
>;

/**
 * The corner's hover label (R5): 12 px vellum on the HUD panel, centred over its plate and kept
 * inside the view's right edge. The Mailbox's envelope shows its own through it too.
 */
export class CornerLabel {
  private text?: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {}

  show(plate: Rect, words: string): void {
    this.hide();
    const t = this.scene.add
      .text(0, 0, words, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudText),
        backgroundColor: rgba(palette.hudPanel, 0.85),
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    const at = cornerLabelAt(plate, t.width, viewport);
    t.setPosition(at.x, at.bottom);
    this.text = t;
  }

  hide(): void {
    this.text?.destroy();
    this.text = undefined;
  }
}

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

  constructor(
    scene: Phaser.Scene,
    private readonly deps: HudCornerDeps,
  ) {
    this.label = new CornerLabel(scene);
    this.icons = deps.icons.map((spec) => {
      const frame = cornerIconFrame(spec.icon, viewport);
      const graphics = scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
      const zone = scene.add
        .zone(frame.x, frame.y, frame.width, frame.height)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH)
        .setInteractive({ useHandCursor: true });
      const drawn: DrawnIcon = { spec, frame, graphics, zone, hovered: false };
      zone.on("pointerdown", () => this.press(drawn));
      zone.on("pointerover", () => this.hover(drawn, true));
      zone.on("pointerout", () => this.hover(drawn, false));
      this.draw(drawn);
      return drawn;
    });
  }

  /** Whether a screen point lies on a plate: a press there is the row's, never the world's (R10). */
  covers(x: number, y: number): boolean {
    return this.icons.some(({ frame: f }) => x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height);
  }

  /** The logical view changed: every plate back to the corner (FS-ZAJMH R12, R13). */
  relayout(): void {
    for (const icon of this.icons) {
      icon.frame = cornerIconFrame(icon.spec.icon, viewport);
      icon.zone.setPosition(icon.frame.x, icon.frame.y);
      this.draw(icon);
    }
    const hovered = this.icons.find((i) => i.hovered);
    if (hovered) this.label.show(hovered.frame, CORNER_LABEL[hovered.spec.icon]);
  }

  destroy(): void {
    this.label.hide();
    for (const { graphics, zone } of this.icons) {
      graphics.destroy();
      zone.destroy();
    }
  }

  private coveredAt(f: Rect): boolean {
    return this.deps.covered?.(f.x + f.width / 2, f.y + f.height / 2) ?? false;
  }

  private press(icon: DrawnIcon): void {
    if (this.coveredAt(icon.frame)) return;
    icon.spec.press?.();
  }

  private hover(icon: DrawnIcon, on: boolean): void {
    const shown = on && !this.coveredAt(icon.frame);
    if (icon.hovered === shown) return;
    icon.hovered = shown;
    this.draw(icon);
    if (shown) this.label.show(icon.frame, CORNER_LABEL[icon.spec.icon]);
    else this.label.hide();
  }

  private draw(icon: DrawnIcon): void {
    const g = icon.graphics.clear();
    const f = icon.frame;
    carvedPanel(g, f.x, f.y, f.width, f.height, { opacity: PLATE_OPACITY });
    const ink = icon.hovered ? palette.interactableBright : palette.interactable;
    const alpha = icon.hovered ? 1 : 0.85;
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    if (icon.spec.icon === "menu") drawGear(g, cx, cy, ink, alpha);
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
 * A bust (R3): a head over the curve of the shoulders, `s` its scale. With `fill`, the shape is
 * first filled in that colour, so a bust drawn over another hides the lines behind it.
 */
export function drawBust(
  g: Ink,
  cx: number,
  cy: number,
  s: number,
  ink: number,
  alpha: number,
  fill?: number,
): void {
  const headY = cy - 6 * s;
  const headR = 5 * s;
  const shoulderY = cy + 12 * s;
  const shoulderR = 11 * s;
  if (fill !== undefined) {
    g.fillStyle(fill, 1);
    g.fillCircle(cx, headY, headR + LINE_W);
    g.beginPath();
    g.arc(cx, shoulderY, shoulderR + LINE_W, Math.PI, 0, false);
    g.closePath();
    g.fillPath();
  }
  g.lineStyle(LINE_W, ink, alpha);
  g.strokeCircle(cx, headY, headR);
  g.beginPath();
  g.arc(cx, shoulderY, shoulderR, Math.PI, 0, false);
  g.strokePath();
}

/** Two busts (R3): one stepped behind and above the other, the front one drawn over it. */
export function drawParty(g: Ink, cx: number, cy: number, ink: number, alpha: number): void {
  drawBust(g, cx - 6, cy - 2, 0.8, ink, alpha);
  drawBust(g, cx + 5, cy + 2, 0.85, ink, alpha, palette.hudPanel);
}
