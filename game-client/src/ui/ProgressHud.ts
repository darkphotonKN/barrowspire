/**
 * The delver's own level and experience bar on the HUD (FS-BDA7X req 42), and the brief cue when
 * the level rises (req 43). Shared by the run and the hub: each scene places one and hands it
 * every state's progress. The widget keeps the last level it showed, so a fresh widget (a new
 * start, a reconnect) takes its first state as the baseline and raises no cue for it.
 *
 * Neutral HUD: vellum words on the HUD panel, a brass frame, a bright-brass bar. Body serif
 * throughout (the blackletter bound). It sits at the HUD's depth, under the notices.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import {
  levelLabel,
  levelRose,
  levelUpCue,
  xpCount,
  xpFraction,
  type Progress,
} from "./progress";

export const PROGRESS_HUD_W = 180;
/** Kept short: in the run the panel ends at y 78, above the notice band that starts there. */
export const PROGRESS_HUD_H = 34;
const HUD_DEPTH = 1000;
const PAD = 10;
const BAR_H = 5;
/** The bar's distance from the panel's bottom edge. */
const BAR_INSET = 5;
/** How long the cue holds before it fades, and the fade, in ms. */
const CUE_HOLD_MS = 900;
const CUE_FADE_MS = 1400;

/** The slice of a Phaser graphics the bar is drawn with. */
type BarGraphics = Pick<
  Phaser.GameObjects.Graphics,
  "fillStyle" | "fillRect" | "lineStyle" | "strokeRect"
>;

/**
 * An experience bar, `fraction` (0 to 1) full: a dark track in a brass rim. Shared by the HUD and
 * the character list, so the two read alike.
 */
export function drawXpBar(
  g: BarGraphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fraction: number,
): void {
  g.fillStyle(palette.xpTrack, 0.9);
  g.fillRect(x, y, w, h);
  if (fraction > 0) {
    g.fillStyle(palette.xpFill, 1);
    g.fillRect(x, y, Math.round(w * fraction), h);
  }
  g.lineStyle(1, palette.frame, 0.6);
  g.strokeRect(x, y, w, h);
}

export class ProgressHud {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly count: Phaser.GameObjects.Text;
  private shownLevel?: number;
  /** What the panel last drew, so the ~30 states a second that change nothing redraw nothing. */
  private drawn?: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
  ) {
    this.panel = scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this.label = scene.add
      .text(x + PAD, y + 5, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.hudText),
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.count = scene.add
      .text(x + PROGRESS_HUD_W - PAD, y + 7, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudLabel),
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  /** This state's progress: redraws the bar, and plays the cue if the level rose. */
  show(progress: Progress): void {
    if (levelRose(this.shownLevel, progress.level)) this.cue(progress.level);
    this.shownLevel = progress.level;

    const key = `${progress.level}:${progress.experience}:${progress.level_floor}:${progress.next_level_at}`;
    if (key === this.drawn) return;
    this.drawn = key;

    this.label.setText(levelLabel(progress));
    this.count.setText(xpCount(progress) ?? "");

    this.panel.clear();
    this.panel.fillStyle(palette.hudPanel, 0.85);
    this.panel.fillRect(this.x, this.y, PROGRESS_HUD_W, PROGRESS_HUD_H);
    this.panel.lineStyle(1, palette.frame, 0.35);
    this.panel.strokeRect(this.x, this.y, PROGRESS_HUD_W, PROGRESS_HUD_H);
    drawXpBar(
      this.panel,
      this.x + PAD,
      this.y + PROGRESS_HUD_H - BAR_INSET - BAR_H,
      PROGRESS_HUD_W - PAD * 2,
      BAR_H,
      xpFraction(progress),
    );
  }

  /** Beside the panel, rising a little as it fades: brief, and it takes no input. */
  private cue(level: number): void {
    const cue = this.scene.add
      .text(this.x + PROGRESS_HUD_W + 10, this.y + 8, levelUpCue(level), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(palette.levelUp),
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.scene.tweens.add({
      targets: cue,
      alpha: 0,
      y: this.y - 4,
      delay: CUE_HOLD_MS,
      duration: CUE_FADE_MS,
      onComplete: () => cue.destroy(),
    });
  }
}
