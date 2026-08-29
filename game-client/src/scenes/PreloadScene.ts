import Phaser from "phaser";

import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";

/**
 * The first frame a delver ever sees. It used to be a white bar on a grey box
 * with the word "Loading..." — a stock engine demo standing in front of the
 * game. Presentation only; the load logic is untouched.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.cameras.main.setBackgroundColor(palette.mapBackground);

    const barWidth = 320;
    const barHeight = 24;
    const barX = width / 2 - barWidth / 2;
    const barY = height / 2 - barHeight / 2;

    // A well cut into stone, with a brass hairline around it — the same
    // carved-edge idiom the DOM panels use.
    const progressBox = this.add.graphics();
    progressBox.fillStyle(palette.hudPanelDeep, 0.9);
    progressBox.fillRect(barX, barY, barWidth, barHeight);
    progressBox.lineStyle(1, palette.frame, 0.5);
    progressBox.strokeRect(barX, barY, barWidth, barHeight);

    const progressBar = this.add.graphics();

    // Body serif, not blackletter: this sits well below the 28px floor.
    const loadingText = this.add.text(
      width / 2,
      barY - 28,
      "Lighting the torch",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "18px",
        color: toCss(palette.hudText),
      },
    );
    loadingText.setOrigin(0.5, 0.5);

    const flavourText = this.add.text(
      width / 2,
      barY + barHeight + 24,
      "Few return whole.",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.hudLabel),
      },
    );
    flavourText.setOrigin(0.5, 0.5);

    this.load.on("progress", (value: number) => {
      progressBar.clear();
      // The fill is torchlight, not an interactable — it reads as the light
      // being kindled rather than as something to click.
      progressBar.fillStyle(palette.torchCore, 1);
      progressBar.fillRect(
        barX + 3,
        barY + 3,
        (barWidth - 6) * value,
        barHeight - 6,
      );
    });

    this.load.on("complete", () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      flavourText.destroy();
    });
  }

  create(): void {
    this.scene.start("MainMenuScene");
  }
}
