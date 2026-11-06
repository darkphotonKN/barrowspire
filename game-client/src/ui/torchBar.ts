/**
 * The torch bar (FS-C4JWH §D): the boot screen's loading bar, drawn by PreloadScene at boot and by
 * a world or menu scene while its own art downloads, so both are one piece of code and look the
 * same. It wears the menus' Bone & Soot (design-guideline "UI Chrome"): the soot backdrop, one
 * torch pool, a stone trough with an iron hairline, and a bone bar kindled along it.
 *
 *   const bar = drawTorchBar(this);
 *   this.load.on("progress", (v: number) => bar.progress(v));
 *   this.load.once("complete", () => bar.destroy());
 *
 * Laid out on the 1080-wide stage, centred in whatever width the view has (FS-ZAJMH R11). A world
 * scene's camera is its own (bounds, follow): {@link TorchBar.destroy} lets the stage go before the
 * world's create sets it up, so the camera is the one it would have had with no bar.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import {
  LOGICAL_HEIGHT,
  STAGE_WIDTH,
  centreStage,
  releaseStage,
  viewport,
} from "@/render/viewport";
import { addTorchPool, drawBackdrop, drawPanel } from "./menuChrome";

const ui = palette.menu;

const BAR_WIDTH = 320;
const BAR_HEIGHT = 24;
const INSET = 4;
const MOTES = 120;

export interface TorchBar {
  /** Fills the bar to `value`, 0 to 1: the loader's `progress`. */
  progress(value: number): void;
  /** Takes down the trough, the bar and both lines, leaving the backdrop and the pool (the boot screen's). */
  destroyBar(): void;
  /** Takes down everything it drew and lets the stage go. */
  destroy(): void;
}

export function drawTorchBar(scene: Phaser.Scene): TorchBar {
  const camera = scene.cameras.main;
  centreStage(camera);
  const width = STAGE_WIDTH;
  const height = LOGICAL_HEIGHT;
  const barX = width / 2 - BAR_WIDTH / 2;
  const barY = height / 2 - BAR_HEIGHT / 2;

  // Soot, dust and a vignette, the same backdrop the main menu stands on.
  const backdrop = drawBackdrop(scene, MOTES);

  // The one lit place in the room, under the bar.
  const pool = addTorchPool(scene, width / 2, height / 2, 560, 200, 0.7);

  // A stone trough with an iron hairline, the canvas form of the site's card.
  const trough = scene.add.graphics();
  drawPanel(trough, barX, barY, BAR_WIDTH, BAR_HEIGHT);

  const fill = scene.add.graphics();

  // Body serif, not blackletter: this sits well below the 28px floor. Rasterised at the render
  // scale, as `sharpenText` does in a menu (FS-ZAJMH R5).
  const title = scene.add
    .text(width / 2, barY - 30, "LIGHTING THE TORCH", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "16px",
      color: toCss(ui.text),
      letterSpacing: 4,
    })
    .setResolution(viewport.renderScale)
    .setOrigin(0.5, 0.5);

  const flavour = scene.add
    .text(width / 2, barY + BAR_HEIGHT + 26, "THE SPIRE IS WAITING", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "12px",
      color: toCss(ui.label),
      letterSpacing: 3,
    })
    .setResolution(viewport.renderScale)
    .setOrigin(0.5, 0.5);

  const destroyBar = () => {
    for (const object of [trough, fill, title, flavour]) object.destroy();
  };
  return {
    progress: (value) => {
      fill.clear();
      const fillWidth = (BAR_WIDTH - INSET * 2) * value;
      // Bone is this view's one torch: the light being kindled, lit along its top edge.
      fill.fillStyle(ui.torch, 1);
      fill.fillRect(
        barX + INSET,
        barY + INSET,
        fillWidth,
        BAR_HEIGHT - INSET * 2,
      );
      fill.lineStyle(1, ui.torchBright, 0.8);
      fill.lineBetween(
        barX + INSET,
        barY + INSET + 0.5,
        barX + INSET + fillWidth,
        barY + INSET + 0.5,
      );
    },
    destroyBar,
    destroy: () => {
      destroyBar();
      pool.destroy();
      backdrop.destroy();
      releaseStage(camera);
    },
  };
}
