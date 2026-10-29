import * as Phaser from "phaser";

import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { preloadMenuArt } from "@/render/art/menuFigure";
import {
  addTorchPool,
  drawBackdrop,
  drawPanel,
  sharpenText,
} from "@/ui/menuChrome";

const ui = palette.menu;

/**
 * The first frame a player ever sees, between the site's "Lighting the Torch" loader and the
 * main menu. It wears the menus' Bone & Soot (design-guideline "UI Chrome") so the hand-off from
 * the page to the canvas to the menu is one room, not three. Presentation only; the load logic
 * is untouched.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    sharpenText(this);
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Soot, dust and a vignette, the same backdrop the main menu stands on.
    drawBackdrop(this, 120);

    const barWidth = 320;
    const barHeight = 24;
    const barX = width / 2 - barWidth / 2;
    const barY = height / 2 - barHeight / 2;
    const inset = 4;

    // The one lit place in the room, under the bar.
    addTorchPool(this, width / 2, height / 2, 560, 200, 0.7);

    // A stone trough with an iron hairline, the canvas form of the site's card.
    const progressBox = this.add.graphics();
    drawPanel(progressBox, barX, barY, barWidth, barHeight);

    const progressBar = this.add.graphics();

    // Body serif, not blackletter: this sits well below the 28px floor.
    const loadingText = this.add.text(
      width / 2,
      barY - 30,
      "LIGHTING THE TORCH",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(ui.text),
        letterSpacing: 4,
      },
    );
    loadingText.setOrigin(0.5, 0.5);

    const flavourText = this.add.text(
      width / 2,
      barY + barHeight + 26,
      "THE SPIRE IS WAITING",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(ui.label),
        letterSpacing: 3,
      },
    );
    flavourText.setOrigin(0.5, 0.5);

    this.load.on("progress", (value: number) => {
      progressBar.clear();
      const fillWidth = (barWidth - inset * 2) * value;
      // Bone is this view's one torch: the light being kindled, lit along its top edge.
      progressBar.fillStyle(ui.torch, 1);
      progressBar.fillRect(
        barX + inset,
        barY + inset,
        fillWidth,
        barHeight - inset * 2,
      );
      progressBar.lineStyle(1, ui.torchBright, 0.8);
      progressBar.lineBetween(
        barX + inset,
        barY + inset + 0.5,
        barX + inset + fillWidth,
        barY + inset + 0.5,
      );
    });

    this.load.on("complete", () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      flavourText.destroy();
    });

    // The baked art, behind the torch bar: the main menu shows the cast straight after this
    // (FS-2325V §F), and every later scene finds it already loaded.
    preloadMenuArt(this);
  }

  create(): void {
    this.scene.start("MainMenuScene");
  }
}
