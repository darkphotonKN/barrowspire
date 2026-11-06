/**
 * The target frame (FS-48CTQ §C, §E): one frame at the top centre of a `frame` floor naming a
 * single monster, its plate (`nameplate`, an elite's prefix apart in the hostile accent) over its
 * health bar in the marker bar's colours. Which monster is the scene's to say (`pickTarget`); the
 * frame draws it, fades in over {@link TARGET_FADE_IN_MS} and out over {@link TARGET_FADE_OUT_MS},
 * switches content at once, and hides at once while covered (the spectate HUD, the floor veil).
 *
 * The look is the HUD's (design-guideline "UI Chrome"): a `hudPanel` backing with a 1px brass rim
 * and the body serif, the name in the hostile channel ("Gameplay accent"). Diablo II is the
 * behaviour reference, not the look. Colours are tokens only (ADR-0013).
 *
 * It is driven once a frame through {@link TargetFrame.update}, so the fade needs no tween, and
 * draws through {@link TargetFrameStage}, the narrow slice of Phaser it needs.
 */

import { MARKER_BAR } from "@/render/markers";
import { elitePlate, nameplate, seatPlate } from "@/render/creatures/monsters";
import type { MonsterState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { Rect } from "./partyPanelLayout";

/** The frame's top edge, in logical px (§E.14). */
export const TARGET_FRAME_TOP = 10;
/** A normal frame's size: within 280 × 52, ending above the notice band at y ≈ 78 (§E.14). */
export const TARGET_FRAME = { width: 260, height: 46 } as const;
/** The HUD band (§E.16): over the floor veil (950), under the passing notices (2000). */
export const TARGET_FRAME_DEPTH = 1000;
export const TARGET_FADE_IN_MS = 120;
export const TARGET_FADE_OUT_MS = 200;

const NAME_PX = 15;
/** Px between an elite's prefix and the rest: a word space at 15px. */
const PREFIX_GAP = 4;
/** From the frame's top to the name line's top. */
const NAME_TOP = 6;
/** The bar's inset from the frame's sides and bottom, and its height. */
const BAR_INSET_X = 12;
const BAR_INSET_BOTTOM = 8;
const BAR_H = 8;

/** Where the frame stands: its top at y 10, centred on `centreX` (§E.14). */
export function targetFrameRect(centreX: number, size: { width: number; height: number } = TARGET_FRAME): Rect {
  return {
    x: centreX - size.width / 2,
    y: TARGET_FRAME_TOP,
    width: size.width,
    height: size.height,
  };
}

/** One frame of the fade (§C.8): toward 1 over 120 ms while showing, toward 0 over 200 ms. */
export function fadeStep(alpha: number, deltaMs: number, showing: boolean): number {
  return showing
    ? Math.min(1, alpha + deltaMs / TARGET_FADE_IN_MS)
    : Math.max(0, alpha - deltaMs / TARGET_FADE_OUT_MS);
}

/** What of a Phaser display object the frame sets on each of its parts. */
interface FramePart {
  setAlpha(alpha: number): unknown;
  setVisible(visible: boolean): unknown;
  setDepth(depth: number): unknown;
  setScrollFactor(factor: number): unknown;
  destroy(): void;
}

export interface FrameText extends FramePart {
  /** Drawn width in logical px, to seat an elite's prefix beside the rest. */
  readonly width: number;
  setText(text: string): unknown;
  setPosition(x: number, y: number): unknown;
  setOrigin(x: number, y: number): unknown;
}

export interface FrameGraphics extends FramePart {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRect(x: number, y: number, w: number, h: number): unknown;
}

export interface FrameTextStyle {
  fontFamily: string;
  fontSize: string;
  color: string;
  stroke: string;
  strokeThickness: number;
}

/** What the frame asks of the scene: `this.add.text` and `this.add.graphics`, in effect. */
export interface TargetFrameStage {
  text(content: string, style: FrameTextStyle): FrameText;
  graphics(): FrameGraphics;
}

const lettering = (ink: number): FrameTextStyle => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: `${NAME_PX}px`,
  color: toCss(ink),
  stroke: toCss(palette.markerStroke),
  strokeThickness: 2,
});

/** What a drawn frame shows: redrawn only when one of these changes. */
const drawnKey = (m: MonsterState, centreX: number) =>
  [m.entity_id, m.name, m.level, m.elite, m.archetype, m.current_health, m.max_health, centreX].join("|");

export class TargetFrame {
  private readonly panel: FrameGraphics;
  private readonly prefix: FrameText;
  private readonly name: FrameText;
  private alpha = 0;
  /** The monster last drawn: kept while the frame fades out. */
  private shown?: MonsterState;
  private drawn?: string;

  /** `centreX` reads the logical view's centre now (`viewport.centerX`). */
  constructor(
    stage: TargetFrameStage,
    private readonly centreX: () => number,
  ) {
    this.panel = stage.graphics();
    this.prefix = stage.text("", lettering(palette.markerElite));
    this.prefix.setOrigin(1, 0);
    this.name = stage.text("", lettering(palette.markerHostile));
    this.name.setOrigin(0.5, 0);
    for (const part of this.parts()) {
      part.setScrollFactor(0);
      part.setDepth(TARGET_FRAME_DEPTH);
    }
    this.apply();
  }

  /** The frame's text, for a re-layout's crispen (FS-ZAJMH R5). */
  texts(): FrameText[] {
    return [this.prefix, this.name];
  }

  /**
   * One frame: `target` is the monster to name, or `null` to fade out; `covered` hides it at once
   * (the spectate HUD or the floor veil holds the top centre, §E.15–16).
   */
  update(deltaMs: number, target: MonsterState | null, covered: boolean): void {
    if (covered) {
      this.alpha = 0;
      this.apply();
      return;
    }
    if (target) this.draw(target);
    this.alpha = fadeStep(this.alpha, deltaMs, target !== null);
    this.apply();
  }

  /** Back to the view's centre (FS-ZAJMH R13), whatever it shows. */
  relayout(): void {
    this.drawn = undefined;
    if (this.shown) this.draw(this.shown);
  }

  destroy(): void {
    for (const part of this.parts()) part.destroy();
  }

  private parts(): FramePart[] {
    return [this.panel, this.prefix, this.name];
  }

  private apply(): void {
    const on = this.alpha > 0 && this.shown !== undefined;
    const plate = this.shown && elitePlate(this.shown);
    for (const part of this.parts()) {
      part.setAlpha(this.alpha);
      part.setVisible(on && (part !== this.prefix || Boolean(plate)));
    }
  }

  private draw(monster: MonsterState): void {
    const centreX = this.centreX();
    const key = drawnKey(monster, centreX);
    this.shown = monster;
    if (key === this.drawn) return;
    this.drawn = key;

    const r = targetFrameRect(centreX);
    const g = this.panel;
    g.clear();
    g.fillStyle(palette.hudPanel, 0.85);
    g.fillRect(r.x, r.y, r.width, r.height);
    g.lineStyle(1, palette.frame, 0.6);
    g.strokeRect(r.x, r.y, r.width, r.height);

    const bar = {
      x: r.x + BAR_INSET_X,
      y: r.y + r.height - BAR_INSET_BOTTOM - BAR_H,
      width: r.width - BAR_INSET_X * 2,
      height: BAR_H,
    };
    g.fillStyle(MARKER_BAR.backing, 0.9);
    g.fillRect(bar.x, bar.y, bar.width, bar.height);
    g.lineStyle(1, MARKER_BAR.rim, 0.9);
    g.strokeRect(bar.x, bar.y, bar.width, bar.height);
    const ratio = Math.max(0, Math.min(1, monster.current_health / Math.max(1, monster.max_health)));
    if (ratio > 0) {
      g.fillStyle(MARKER_BAR.hp, 1);
      g.fillRect(bar.x, bar.y, bar.width * ratio, bar.height);
    }

    const plate = elitePlate(monster);
    const y = r.y + NAME_TOP;
    this.name.setText(plate?.rest ?? nameplate(monster));
    this.prefix.setText(plate?.prefix ?? "");
    const seat = seatPlate(centreX, this.name.width, plate ? this.prefix.width : 0, PREFIX_GAP);
    this.name.setPosition(seat.rest, y);
    this.prefix.setPosition(seat.prefix, y);
  }
}
