/**
 * The contract's heading line on the UI scene (FS-4EC7Z §G R34; ADR-0086: screen-fixed): a small line
 * in the HUD's text, centred under the run's notices, built by the HUD slot on the first line a run
 * hands, shown while the contract is active and hidden after. The words and the place are
 * `contractLines.ts`'s.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { contractLineAt } from "./contractLines";
import type { HudPiece } from "./uiSceneHud";

/** The HUD's depth, under the notices (2000). */
const DEPTH = 1000;
const LINE_PX = 13;

export class ContractLineHud implements HudPiece<string | null> {
  private readonly text: Phaser.GameObjects.Text;
  private shown: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(0, 0, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${LINE_PX}px`,
        color: toCss(palette.hudText),
        stroke: toCss(palette.markerStroke),
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH);
    this.draw();
  }

  /** The line now, or none: hidden. */
  show(line: string | null): void {
    this.shown = line;
    this.draw();
  }

  relayout(): void {
    this.draw();
  }

  destroy(): void {
    this.text.destroy();
  }

  private draw(): void {
    this.text.setVisible(this.shown !== null);
    if (this.shown === null) return;
    const at = contractLineAt(viewport.width);
    this.text.setText(this.shown).setPosition(at.x, at.y);
  }
}
