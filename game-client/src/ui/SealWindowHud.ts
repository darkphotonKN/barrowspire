/**
 * The Braziers window's countdown on the UI scene (FS-5FZ4J §J R53): the shared countdown
 * (FS-B3NDZ) in a HUD panel at the top centre, built by the HUD slot on the first window a run
 * hands, shown while one runs and hidden between. The clock and the frame are `sealWindow.ts`'s.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { COUNTDOWN_SECONDS_PX, countdownSecondsText, drawCountdownBar } from "./countdownBar";
import { SEAL_WINDOW_LINE, sealWindowFrame, type SealWindowView } from "./sealWindow";
import type { HudPiece } from "./uiSceneHud";

/** The HUD's depth, under the notices (2000). */
const DEPTH = 1000;
const LINE_PX = 15;

export class SealWindowHud implements HudPiece<SealWindowView | null> {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly line: Phaser.GameObjects.Text;
  private readonly seconds: Phaser.GameObjects.Text;
  private shown: SealWindowView | null = null;

  constructor(scene: Phaser.Scene) {
    const text = (px: number, colour: number) =>
      scene.add
        .text(0, 0, "", { fontFamily: CANVAS_FONT.body, fontSize: `${px}px`, color: toCss(colour) })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH);
    this.panel = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
    this.line = text(LINE_PX, palette.hudText).setText(SEAL_WINDOW_LINE);
    this.seconds = text(COUNTDOWN_SECONDS_PX, palette.hudText);
    this.draw();
  }

  /** The window now, or none: hidden. */
  show(view: SealWindowView | null): void {
    this.shown = view;
    this.draw();
  }

  relayout(): void {
    this.draw();
  }

  destroy(): void {
    for (const o of [this.panel, this.bar, this.line, this.seconds]) o.destroy();
  }

  private draw(): void {
    const view = this.shown;
    for (const o of [this.panel, this.bar, this.line, this.seconds]) o.setVisible(view !== null);
    if (!view) return;
    const f = sealWindowFrame(viewport.width);
    this.panel.clear();
    this.panel.fillStyle(palette.hudPanel, 0.85);
    this.panel.fillRect(f.panel.x, f.panel.y, f.panel.width, f.panel.height);
    this.panel.lineStyle(1, palette.frame, 0.6);
    this.panel.strokeRect(f.panel.x, f.panel.y, f.panel.width, f.panel.height);
    this.line.setPosition(f.line.x + f.line.width / 2, f.line.y + f.line.height / 2);
    this.seconds.setPosition(f.seconds.x + f.seconds.width / 2, f.seconds.y + f.seconds.height / 2);
    this.seconds.setText(countdownSecondsText(view.seconds));
    this.bar.clear();
    drawCountdownBar(this.bar, f.bar, view.fraction);
  }
}
