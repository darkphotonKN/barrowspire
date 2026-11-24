/**
 * The Page roundels sheet (FS-X2CMM §I R46, the art gate): every page in its four looks
 * (`pageRoundels.ts`), each drawn by the real renderer (`PageRoundel`), its sweep by `drawRoundelSweep`
 * and, where a roundel cannot stand, its lines by `drawPageLines`, on the windows' panel. Its own
 * canvas, drawn at the viewport's render scale; the roundels rebuild at each.
 */

import * as Phaser from "phaser";
import { installCrispText } from "@/render/crispText";
import { backingSize, fitGame, viewport } from "@/render/viewport";
import { fitCamera } from "@/render/viewport/camera";
import { onSceneEnd } from "@/scenes/sceneEnd";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { BARROW, BARROW_HEX } from "@/utils/theme";
import { drawPanelFrame } from "@/ui/panelFrame";
import { PAGE_ICONS } from "@/ui/pageIcons";
import { PageRoundel, drawPageLines, drawRoundelSweep } from "@/ui/pageRoundel";
import { lookOf, sheetLayout, type SheetLayout } from "./pageRoundels";

/** The sheet's size in logical units, the same at every render scale. */
export const PAGE_SHEET: Pick<SheetLayout, "width" | "height"> = (() => {
  const { width, height } = sheetLayout();
  return { width, height };
})();

/** The roundels' depth; the sweeps stand one over them. */
const DEPTH = 10;

export class PageRoundelsScene extends Phaser.Scene {
  private parts: Phaser.GameObjects.GameObject[] = [];
  private roundels: PageRoundel[] = [];
  private started = false;

  constructor() {
    super({ key: "PageRoundelsScene" });
  }

  create(): void {
    fitCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);
    this.started = true;
    // a roundel's layers watch the shared view until destroyed: none outlives the sheet
    onSceneEnd(this, () => this.dispose());
    this.draw();
  }

  /** Takes the sheet down, every roundel with it. Its scene's end calls it; the panel calls it first. */
  dispose(): void {
    this.started = false;
    this.clear();
  }

  private draw(): void {
    this.clear();
    if (!this.started) return;
    const text = (x: number, y: number, words: string, px: number, color: number, origin: [number, number]) => {
      const t = this.add
        .text(x, y, words, { fontFamily: CANVAS_FONT.body, fontSize: `${px}px`, color: toCss(color) })
        .setOrigin(...origin)
        .setDepth(DEPTH + 1);
      this.parts.push(t);
    };
    for (const block of sheetLayout().blocks) {
      const frame = this.add.graphics().setDepth(DEPTH - 1);
      drawPanelFrame(this, frame, block.panel, { close: false });
      // over the roundels: the sweeps, and any roundel's lines where it cannot stand
      const over = this.add.graphics().setDepth(DEPTH + 1);
      this.parts.push(frame, over);
      for (const { size, x, y } of block.groups) text(x, y, `${size} px`, 11, palette.hudText, [0.5, 1]);
      for (const { look, x, y } of block.heads) text(x, y, look, 10, palette.hudLabel, [0.5, 1]);
      for (const row of block.rows) {
        const icon = PAGE_ICONS[row.id];
        text(row.label.x, row.label.y - 7, row.id, 11, palette.hudText, [0, 0.5]);
        text(row.label.x, row.label.y + 8, icon.pigment, 10, palette.bookPigment[icon.pigment], [0, 0.5]);
        for (const cell of row.cells) {
          const { state, hovered, swept } = lookOf(cell.look);
          const roundel = new PageRoundel({ scene: this, depth: DEPTH, icon, size: cell.size, name: row.id, lost: () => this.draw() });
          this.roundels.push(roundel);
          if (!roundel.show(cell.box, state, hovered)) drawPageLines(over, icon, cell.box, cell.size, state);
          drawRoundelSweep(over, cell.box, cell.size, swept);
        }
      }
    }
  }

  private clear(): void {
    for (const r of this.roundels) r.destroy();
    this.roundels = [];
    for (const p of this.parts) p.destroy();
    this.parts = [];
  }
}

/** The sheet's own game on `parent`, in the sheet's own view. `unmount` ends it and puts the page's view back. */
export function mountPageRoundels(parent: HTMLElement): { sheet: PageRoundelsScene; unmount(): void } {
  const before = viewport.current();
  viewport.set({ ...PAGE_SHEET, renderScale: 1, cssScale: 1 });
  installCrispText();
  const sheet = new PageRoundelsScene();
  const backing = backingSize(viewport.current());
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    scale: { mode: Phaser.Scale.NONE, width: backing.width, height: backing.height, zoom: 1 },
    backgroundColor: BARROW.pitch,
    render: { roundPixels: true, antialias: true, pixelArt: false },
    scene: [sheet],
  });
  const unfit = fitGame(game);
  return {
    sheet,
    unmount: () => {
      unfit();
      sheet.dispose();
      game.destroy(true);
      viewport.set(before);
    },
  };
}
