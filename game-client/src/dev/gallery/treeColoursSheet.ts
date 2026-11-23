/**
 * The Tree colours sheet (FS-8RZ51 §Change: A lit node glows in its own colour, L13): every class's
 * nodes in their three states (`treeColours.ts`), each plate and picture drawn by the overlay's own
 * `drawNodePlate`, on the panel ground the tree stands on, so what is approved is what ships. Its own
 * canvas. It draws at the viewport's render scale, its knockouts rebuilding at each, and again in any
 * look the panel previews; a preview is never saved.
 */

import * as Phaser from "phaser";
import { fitCamera } from "@/render/viewport/camera";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import type { Knockout } from "@/ui/knockout";
import { drawPanelFrame, drawPanelTitle } from "@/ui/panelFrame";
import { TREE_DEPTH, TREE_LOOK, drawNodePlate, rankInk, type TreeLook } from "@/ui/PassiveTreeOverlay";
import { TREE_RANK_GAP } from "@/ui/passiveTreeLayout";
import { inState, sheetLayout, type SheetLayout } from "./treeColours";

/** The sheet's size in logical units, the same at every render scale. */
export const TREE_SHEET: Pick<SheetLayout, "width" | "height"> = (() => {
  const { width, height } = sheetLayout();
  return { width, height };
})();

export class TreeColoursScene extends Phaser.Scene {
  private look: TreeLook = TREE_LOOK;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private knockouts: Knockout[] = [];
  private started = false;

  constructor() {
    super({ key: "TreeColoursScene" });
  }

  create(): void {
    fitCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);
    this.started = true;
    this.draw();
  }

  /** Draws the sheet again in `look`: a live preview, never saved. Held until the scene has started. */
  preview(look: TreeLook): void {
    this.look = look;
    if (this.started) this.draw();
  }

  private draw(): void {
    this.clear();
    const layout = sheetLayout();
    const text = (x: number, y: number, words: string, px: number, color: number, origin: [number, number] = [0.5, 0.5]) => {
      const t = this.add
        .text(x, y, words, { fontFamily: CANVAS_FONT.body, fontSize: `${px}px`, color: toCss(color) })
        .setOrigin(...origin)
        .setDepth(TREE_DEPTH + 1);
      this.parts.push(t);
      return t;
    };
    for (const block of layout.blocks) {
      const frame = this.add.graphics().setDepth(TREE_DEPTH);
      drawPanelFrame(this, frame, block.panel, { close: false });
      const title = drawPanelTitle(this, block.panel, block.cls).setDepth(TREE_DEPTH + 1);
      const plates = this.add.graphics().setDepth(TREE_DEPTH + 1);
      this.parts.push(frame, title, plates);
      for (const { state, x, y } of block.labels) text(x, y, state, 11, palette.hudLabel, [0, 0.5]);
      for (const col of block.columns) {
        const { node, ids } = col.entry;
        text(col.x, col.nameY, ids.length > 1 ? `${node.name} ×${ids.length}` : node.name, 10, palette.hudText);
        for (const { state, plate } of col.cells) {
          const shown = inState(node, state);
          const knockout = drawNodePlate(this, plates, shown, plate, this.look);
          if (knockout) this.knockouts.push(knockout);
          const { rect } = plate;
          // the rank under the plate, as the tree writes it
          text(rect.x + rect.width / 2, rect.y + rect.height + TREE_RANK_GAP, `${shown.rank} / ${shown.maxRank}`, 10, rankInk(shown), [0.5, 0]);
        }
        const hue = node.hue!;
        text(col.x, col.hueY, hue, 10, palette.hudLabel, [0.5, 0]);
        text(col.x, col.hueY + 12, toCss(this.look.hues[hue]), 10, this.look.hues[hue], [0.5, 0]);
      }
    }
  }

  private clear(): void {
    for (const k of this.knockouts) k.destroy();
    this.knockouts = [];
    for (const p of this.parts) p.destroy();
    this.parts = [];
  }
}
