/**
 * The roll cooldown pip on the UI scene (FS-7P736 §B R16; ADR-0084, ADR-0086: screen-fixed): a small well
 * of the HUD panel one gap right of the ability bar, its key ("Space", from `RUN_ACTIONS.roll.label`) on
 * the bar's cost line under it. Ready, it is lit: its rim 2 px bright brass and its pip, a dot in its
 * middle, in the same brass, the label in vellum. Not ready, the rim falls to the faint frame, and the pip
 * and the label to the faint vellum.
 *
 * While `roll_cooldown` runs a dark wedge sweeps the well, as the ability bar's squares are swept (FS-Q18Q3
 * R18–R20; `abilityCooldown`): stamped on the UI scene's clock when a changed cooldown is heard, run down by
 * the scene's own frames, and corrected by the next. The wedge lies on its own layer over the well and under
 * the rim and the pip, and it alone is redrawn each frame, only while it runs. Colours from `palette`.
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import type { CooldownState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { cooldownSwept, sweepPolygon, type SweepGraphics } from "./abilityCooldown";
import { rollPipFrame, type RollPipFrame, type RollPipView } from "./rollPipView";
import type { HudPiece } from "./uiSceneHud";
import type { XpBarView } from "./xpBarLayout";

/** The corner row's band, with the ability bar (ADR-0086 Decision 4). */
const PIP_DEPTH = 1000;
/** The well's fill and carved line, and its rim, as the bar's squares wear them. */
const WELL_ALPHA = 0.85;
const CARVE_INSET = 2;
const CARVE_ALPHA = 0.5;
const RIM_ALPHA = 0.6;
const LIT_RIM_W = 2;
/** The sweep's wedge over a cooling pip, as over a cooling square. */
const SWEEP_ALPHA = 0.55;
/** The pip itself, a dot in the well's middle. */
const DOT_R = 4;

export class RollPip implements HudPiece<RollPipView | null> {
  private frame: RollPipFrame;
  private wells?: Phaser.GameObjects.Graphics;
  private sweep?: SweepGraphics;
  private face?: Phaser.GameObjects.Graphics;
  private label?: Phaser.GameObjects.Text;
  /** The cooldown as last heard, and when on the UI scene's clock. */
  private heard?: { cooldown: CooldownState; at: number };
  private ticking = false;
  private shown: RollPipView | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: XpBarView = viewport,
  ) {
    this.frame = rollPipFrame(view);
  }

  show(view: RollPipView | null): void {
    if (JSON.stringify(view) === JSON.stringify(this.shown)) return;
    this.shown = view;
    if (!view) return this.takeDown();
    this.hear(view.cooldown);
    this.draw();
  }

  /** The logical view changed: back beside the bar by the same rule. */
  relayout(): void {
    this.frame = rollPipFrame(this.view);
    this.draw();
  }

  destroy(): void {
    this.takeDown();
    this.shown = null;
  }

  /** Stamps a changed cooldown with the time it is heard; an unchanged one keeps its stamp (FS-Q18Q3 R19). */
  private hear(cooldown: CooldownState | null): void {
    const was = this.heard?.cooldown;
    if (!cooldown) this.heard = undefined;
    else if (!was || was.remaining !== cooldown.remaining || was.total !== cooldown.total)
      this.heard = { cooldown: { ...cooldown }, at: this.scene.time.now };
  }

  private readonly drawSweep = (): void => {
    const g = this.sweep?.clear();
    const heard = this.heard;
    const points = heard ? sweepPolygon(this.frame.well, cooldownSwept(heard.cooldown, heard.at, this.scene.time.now)) : [];
    if (g && points.length > 0) {
      g.fillStyle(palette.ink, SWEEP_ALPHA);
      g.fillPoints(points, true);
    }
    this.tick(points.length > 0);
  };

  private tick(on: boolean): void {
    if (on === this.ticking) return;
    this.ticking = on;
    if (on) this.scene.events.on("update", this.drawSweep);
    else this.scene.events.off("update", this.drawSweep);
  }

  private draw(): void {
    const view = this.shown;
    if (!view) return;
    this.build();
    const { well, label } = this.frame;
    const wells = this.wells!.clear();
    wells.fillStyle(palette.hudPanel, WELL_ALPHA);
    wells.fillRect(well.x, well.y, well.width, well.height);
    wells.lineStyle(1, palette.hudPanelDeep, CARVE_ALPHA);
    wells.strokeRect(well.x + CARVE_INSET, well.y + CARVE_INSET, well.width - CARVE_INSET * 2, well.height - CARVE_INSET * 2);

    const face = this.face!.clear();
    if (view.ready) face.lineStyle(LIT_RIM_W, palette.frameBright, 1);
    else face.lineStyle(1, palette.frame, RIM_ALPHA);
    face.strokeRect(well.x, well.y, well.width, well.height);
    face.fillStyle(view.ready ? palette.frameBright : palette.hudFaint, 1);
    face.fillCircle(well.x + well.width / 2, well.y + well.height / 2, DOT_R);

    this.label!
      .setText(view.label)
      .setColor(toCss(view.ready ? palette.hudText : palette.hudFaint))
      .setPosition(label.x + label.width / 2, label.y + label.height / 2);
    this.drawSweep();
    // moved by a re-layout after a render-scale change: rasterised again (FS-ZAJMH R5)
    crispen([this.label!]);
  }

  /** The layers, made once, in this order so the sweep stands over the well and under the rim and the pip. */
  private build(): void {
    if (this.wells) return;
    const layer = () => this.scene.add.graphics().setScrollFactor(0).setDepth(PIP_DEPTH);
    this.wells = layer();
    this.sweep = layer();
    this.face = layer();
    this.label = this.scene.add
      .text(0, 0, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudText),
        stroke: toCss(palette.markerStroke),
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(PIP_DEPTH);
  }

  private takeDown(): void {
    this.tick(false);
    this.heard = undefined;
    for (const g of [this.wells, this.sweep, this.face, this.label]) g?.destroy();
    this.wells = this.sweep = this.face = undefined;
    this.label = undefined;
  }
}
