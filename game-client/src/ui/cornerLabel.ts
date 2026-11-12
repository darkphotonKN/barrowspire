/**
 * The corner row's hover label (FS-3EBCA R5), shared by `HudCorner` and the mailbox's envelope.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, rgba, toCss } from "@/utils/canvasPalette";
import { cornerLabelAt, type Rect } from "./hudCornerLayout";

const HUD_DEPTH = 1000;

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

