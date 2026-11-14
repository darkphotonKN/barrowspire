/**
 * The player's own level and experience bar on the HUD (FS-BDA7X req 42, as FS-77DVN moves it),
 * and the brief cue when the level rises (req 43, FS-77DVN §D.16). Shown in the town, every field
 * and every run: each scene makes one, hands it every state's progress and calls `relayout()` when
 * the view changes. The widget keeps the last level it showed, so a fresh widget (a new start, a
 * reconnect) takes its first state as the baseline and raises no cue for it.
 *
 * Along the bottom middle, between the chat window and the corner row (`xpBarLayout`): no panel,
 * a bright-brass bar on its charcoal track in a brass rim, a brass stud at each end, this level and
 * the next (or "Cap") as bare stroked numerals. Body serif throughout (the blackletter bound). It
 * sits at the HUD's depth, under the notices.
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import {
  levelRose,
  levelUpCue,
  xpBarEnds,
  xpFraction,
  type Progress,
} from "./progress";
import { xpBarFrame, type XpBarFrame, type XpBarView } from "./xpBarLayout";

const HUD_DEPTH = 1000;
/** The stud: brass, with a bright-brass highlight up and to the left, as the chat window's. */
const STUD_R = 2;
const STUD_LIGHT_R = 0.9;
const STUD_LIGHT_ALPHA = 0.9;
const STUD_LIGHT_OFFSET = -0.5;
/** The cue's bottom stands this far over the piece, and rises this far as it fades. */
const CUE_GAP = 6;
const CUE_RISE = 12;
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
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly left: Phaser.GameObjects.Text;
  private readonly right: Phaser.GameObjects.Text;
  private frame: XpBarFrame;
  private shownLevel?: number;
  private progress?: Progress;
  /** What the piece last drew, so the ~30 states a second that change nothing redraw nothing. */
  private drawn?: string;

  constructor(
    private readonly scene: Phaser.Scene,
    view: XpBarView = viewport,
  ) {
    this.frame = xpBarFrame(view);
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this.left = this.numeral(this.frame.numerals.left).setOrigin(1, 0.5);
    this.right = this.numeral(this.frame.numerals.right).setOrigin(0, 0.5);
  }

  /** This state's progress: redraws the piece, and plays the cue if the level rose. */
  show(progress: Progress): void {
    if (levelRose(this.shownLevel, progress.level)) this.cue(progress.level);
    this.shownLevel = progress.level;
    this.progress = progress;
    this.draw();
  }

  /**
   * The view changed (FS-77DVN §A.4): the piece placed again by the same rule, its numerals
   * re-crispened at the render scale of now (FS-ZAJMH R5).
   */
  relayout(view: XpBarView = viewport): void {
    this.frame = xpBarFrame(view);
    const { left, right } = this.frame.numerals;
    this.left.setPosition(left.x, left.y);
    this.right.setPosition(right.x, right.y);
    crispen([this.left, this.right]);
    this.draw();
  }

  private draw(): void {
    const p = this.progress;
    if (!p) return;
    const { piece } = this.frame;
    const key = `${p.level}:${p.experience}:${p.level_floor}:${p.next_level_at}@${piece.x},${piece.y},${piece.width}`;
    if (key === this.drawn) return;
    this.drawn = key;

    const ends = xpBarEnds(p);
    this.left.setText(ends.left);
    this.right.setText(ends.right);

    const { bar, studs } = this.frame;
    const g = this.graphics;
    g.clear();
    drawXpBar(g, bar.x, bar.y, bar.width, bar.height, xpFraction(p));
    for (const stud of [studs.left, studs.right]) {
      g.fillStyle(palette.frame, 1);
      g.fillCircle(stud.x, stud.y, STUD_R);
      g.fillStyle(palette.frameBright, STUD_LIGHT_ALPHA);
      g.fillCircle(
        stud.x + STUD_LIGHT_OFFSET,
        stud.y + STUD_LIGHT_OFFSET,
        STUD_LIGHT_R,
      );
    }
  }

  /** A bare end numeral: stroked so it reads over a lit ground with no panel behind it. */
  private numeral(at: { x: number; y: number }): Phaser.GameObjects.Text {
    return this.scene.add
      .text(at.x, at.y, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudText),
        stroke: toCss(palette.markerStroke),
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  /** Above the piece's centre, rising a little as it fades: brief, and it takes no input. */
  private cue(level: number): void {
    const { piece } = this.frame;
    const bottom = piece.y - CUE_GAP;
    const cue = this.scene.add
      .text(piece.x + piece.width / 2, bottom, levelUpCue(level), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(palette.levelUp),
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.scene.tweens.add({
      targets: cue,
      alpha: 0,
      y: bottom - CUE_RISE,
      delay: CUE_HOLD_MS,
      duration: CUE_FADE_MS,
      onComplete: () => cue.destroy(),
    });
  }
}
