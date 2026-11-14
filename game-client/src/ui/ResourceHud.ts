/**
 * The player's Health bar and class resource bar at the top left of a run or a field (FS-8AY7S
 * req 20–25). The scene hands it every state's bars (`hudBars` in `./resources`); an empty list
 * takes the panel down, so it is up only while the player is in the delve.
 *
 * Neutral HUD, as `ProgressHud`: vellum labels in the body serif (the blackletter bound) on the
 * HUD panel, a brass frame, each bar on a dark track in a brass rim. Parry charges are pips. It
 * sits at the HUD's depth and grows down from its top edge, on the left-edge column the level/XP
 * bar and the party frames share.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { PROGRESS_HUD_AT, PROGRESS_HUD_H, PROGRESS_HUD_W } from "./ProgressHud";
import type { HudBar, HudChannel } from "./resources";

/** One column with the level/XP bar and the party frames, so it clears the T panel. */
export const RESOURCE_HUD_W = PROGRESS_HUD_W;
/** The gap kept under the run's XP bar. */
const UNDER_XP_BAR = 6;
/**
 * Where each scene stands the panel, its top-left corner: under the XP bar in a run, in the corner
 * of a field, which has none. A hub has no bars.
 */
export const RESOURCE_HUD_AT: Readonly<
  Record<"run" | "field", { x: number; y: number }>
> = {
  run: {
    x: PROGRESS_HUD_AT.run.x,
    y: PROGRESS_HUD_AT.run.y + PROGRESS_HUD_H + UNDER_XP_BAR,
  },
  field: { x: 10, y: 16 },
};
const HUD_DEPTH = 1000;
const PAD = 10;
/** Panel padding above the first row and below the last. */
const PAD_Y = 6;
const ROW_H = 20;
/** The label column: wide enough for "Stamina:" at 14px. */
const LABEL_W = 62;
const BAR_H = 8;
const PIP_GAP = 6;

/** Each bar's fill colour by channel; the creation lore card shares it (FS-MAMHR §G.30). */
export const HUD_BAR_FILL: Readonly<Record<HudChannel, number>> = {
  health: palette.hudHealth,
  mana: palette.hudMana,
  stamina: palette.hudStamina,
  parry: palette.hudParry,
  unknown: palette.hudResourceOther,
};

/** The panel's height for `rows` bars: what the potion cell and the party frames measure from. */
export function resourceHudHeight(rows: number): number {
  return rows * ROW_H + PAD_Y * 2;
}

export class ResourceHud {
  private panel?: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  /** What the panel last drew, so the states that change nothing redraw nothing. */
  private drawn?: string;

  /** `top` is the screen y of the panel's top edge. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly top: number,
  ) {}

  show(bars: HudBar[]): void {
    const key = JSON.stringify(bars);
    if (key === this.drawn) return;
    this.drawn = key;
    if (bars.length === 0) {
      this.takeDown();
      return;
    }

    const { top } = this;
    const g = (this.panel ??= this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH));
    g.clear();
    g.fillStyle(palette.hudPanel, 0.85);
    g.fillRect(this.x, top, RESOURCE_HUD_W, resourceHudHeight(bars.length));
    g.lineStyle(1, palette.frame, 0.35);
    g.strokeRect(this.x, top, RESOURCE_HUD_W, resourceHudHeight(bars.length));

    this.fitLabels(bars.length, top);
    bars.forEach((bar, i) => {
      const rowY = top + PAD_Y + i * ROW_H;
      this.labels[i]
        .setText(bar.label ?? "")
        .setPosition(this.x + PAD, rowY + 1);
      const barX = this.x + PAD + LABEL_W;
      const barW = RESOURCE_HUD_W - PAD * 2 - LABEL_W;
      const barY = rowY + Math.round((ROW_H - BAR_H) / 2);
      if (bar.pips) drawHudPips(g, barX, barY, barW, BAR_H, bar.pips);
      else
        drawHudBar(
          g,
          barX,
          barY,
          barW,
          BAR_H,
          bar.fill,
          HUD_BAR_FILL[bar.channel],
        );
    });
  }

  /** Taken down for good: its world left the UI scene (FS-TQZ5J § Change: Batch 5, R67). */
  destroy(): void {
    this.takeDown();
    this.drawn = undefined;
  }

  /** One label per row: new ones made at their row, spare ones dropped. */
  private fitLabels(rows: number, top: number): void {
    while (this.labels.length > rows) this.labels.pop()?.destroy();
    while (this.labels.length < rows) {
      const rowY = top + PAD_Y + this.labels.length * ROW_H;
      this.labels.push(
        this.scene.add
          .text(this.x + PAD, rowY + 1, "", {
            fontFamily: CANVAS_FONT.body,
            fontSize: "14px",
            color: toCss(palette.hudText),
          })
          .setScrollFactor(0)
          .setDepth(HUD_DEPTH),
      );
    }
  }

  private takeDown(): void {
    this.panel?.destroy();
    this.panel = undefined;
    this.labels.forEach((label) => label.destroy());
    this.labels = [];
  }
}

export type BarGraphics = Pick<
  Phaser.GameObjects.Graphics,
  "fillStyle" | "fillRect" | "lineStyle" | "strokeRect"
>;

/**
 * A continuous bar, `fill` (0 to 1) full: a dark track in a brass rim. The HUD's own bar style,
 * which the party frames draw at half its height (FS-R82NV R34).
 */
export function drawHudBar(
  g: BarGraphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  color: number,
): void {
  g.fillStyle(palette.hudTrack, 0.9);
  g.fillRect(x, y, w, h);
  if (fill > 0) {
    g.fillStyle(color, 1);
    g.fillRect(x, y, Math.round(w * fill), h);
  }
  g.lineStyle(1, palette.frame, 0.6);
  g.strokeRect(x, y, w, h);
}

/** Parry charges: one stud per pip across the bar's width, bright brass for each charge held. */
export function drawHudPips(
  g: BarGraphics,
  x: number,
  y: number,
  w: number,
  h: number,
  pips: boolean[],
): void {
  const pipW = Math.floor((w - PIP_GAP * (pips.length - 1)) / pips.length);
  pips.forEach((lit, i) => {
    const px = x + i * (pipW + PIP_GAP);
    g.fillStyle(lit ? palette.hudParry : palette.hudTrack, lit ? 1 : 0.9);
    g.fillRect(px, y, pipW, h);
    g.lineStyle(1, palette.frame, 0.6);
    g.strokeRect(px, y, pipW, h);
  });
}
