/**
 * The player's status marks on the UI scene (FS-5FZ4J §J R55; ADR-0086: screen-fixed): a small
 * square per mark just right of the own health bar, each a well of the HUD panel in a brass rim with
 * its glyph drawn in code; the Blessing's a haloed cross in the hallowed altar's gold. The pointer
 * over a mark shows its hover line (`STATUS_MARK_LINES`) under it, in the item-tip band (2200), heard
 * by the mark's own ground, as the ability bar's tooltips are. Built by the HUD slot on the first
 * mark a run hands, redrawn only on a change; none takes every mark down.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { STATUS_MARK_LINES, statusMarkRects, statusTipAt, type MarkRect, type StatusMark } from "./statusMarks";
import type { HudPiece } from "./uiSceneHud";

/** The corner row's band, with the bars (ADR-0086 Decision 4). */
const MARK_DEPTH = 1000;
/** The item-tip band, over the windows and the menu (ADR-0086 Decision 4). */
export const STATUS_TIP_DEPTH = 2200;
const WELL_ALPHA = 0.85;
const RIM_ALPHA = 0.6;
const TIP_PAD = 6;

type Graphics = Pick<Phaser.GameObjects.Graphics, "fillStyle" | "fillRect" | "lineStyle" | "strokeRect" | "strokeCircle">;

/** The Blessing's glyph in a mark's square: a cross inside a halo, in the altar's gold. */
function drawBlessing(g: Graphics, r: MarkRect): void {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  g.lineStyle(1, palette.blessed, 0.9);
  g.strokeCircle(cx, cy, r.width / 2 - 3);
  g.fillStyle(palette.blessed, 1);
  g.fillRect(cx - 1, r.y + 3, 2, r.height - 6);
  g.fillRect(r.x + 5, cy - 2, r.width - 10, 2);
}

const GLYPHS: Readonly<Record<StatusMark, (g: Graphics, r: MarkRect) => void>> = {
  blessed: drawBlessing,
};

interface DrawnMark {
  ground: Phaser.GameObjects.Zone;
}

export class StatusMarksHud implements HudPiece<StatusMark[]> {
  private face?: Phaser.GameObjects.Graphics;
  private marks: DrawnMark[] = [];
  private tip?: { ground: Phaser.GameObjects.Graphics; line: Phaser.GameObjects.Text };
  private drawn = "";

  /** `x`, `y` are the first mark's top-left. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
  ) {}

  show(marks: StatusMark[]): void {
    const key = marks.join(",");
    if (key === this.drawn) return;
    this.drawn = key;
    this.takeDown();
    if (marks.length === 0) return;

    const rects = statusMarkRects({ x: this.x, y: this.y }, marks.length);
    const g = (this.face = this.scene.add.graphics().setScrollFactor(0).setDepth(MARK_DEPTH));
    marks.forEach((mark, i) => {
      const r = rects[i];
      g.fillStyle(palette.hudPanel, WELL_ALPHA);
      g.fillRect(r.x, r.y, r.width, r.height);
      g.lineStyle(1, palette.frame, RIM_ALPHA);
      g.strokeRect(r.x, r.y, r.width, r.height);
      GLYPHS[mark](g, r);
      // its ground: an interactive zone that draws nothing, so the UI scene hears the pointer over it
      const ground = this.scene.add
        .zone(r.x, r.y, r.width, r.height)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(MARK_DEPTH)
        .setInteractive();
      ground.on("pointerover", () => this.showTip(mark, r));
      ground.on("pointerout", () => this.takeTipDown());
      this.marks.push({ ground });
    });
  }

  destroy(): void {
    this.takeDown();
    this.drawn = "";
  }

  /** A mark's hover line under it, on its own ground. */
  private showTip(mark: StatusMark, r: MarkRect): void {
    this.takeTipDown();
    const at = statusTipAt(r);
    const ground = this.scene.add.graphics().setScrollFactor(0).setDepth(STATUS_TIP_DEPTH);
    const line = this.scene.add
      .text(at.x + TIP_PAD, at.y + TIP_PAD, STATUS_MARK_LINES[mark], {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.hudText),
      })
      .setScrollFactor(0)
      .setDepth(STATUS_TIP_DEPTH);
    const width = Math.ceil(line.width) + TIP_PAD * 2;
    const height = Math.ceil(line.height) + TIP_PAD * 2;
    ground.fillStyle(palette.hudPanel, WELL_ALPHA);
    ground.fillRect(at.x, at.y, width, height);
    ground.lineStyle(1, palette.frame, RIM_ALPHA);
    ground.strokeRect(at.x, at.y, width, height);
    this.tip = { ground, line };
    // heard every frame while it shows: a window opening over a still pointer takes it
    this.scene.input.setPollAlways();
  }

  private takeTipDown(): void {
    if (!this.tip) return;
    this.tip.ground.destroy();
    this.tip.line.destroy();
    this.tip = undefined;
    this.scene.input.setPollOnMove();
  }

  private takeDown(): void {
    this.takeTipDown();
    this.face?.destroy();
    this.face = undefined;
    for (const { ground } of this.marks) ground.destroy();
    this.marks = [];
  }
}
