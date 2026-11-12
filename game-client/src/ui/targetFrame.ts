/**
 * The target frame (FS-48CTQ §C, §E): one frame at the top centre of a `frame` floor naming a
 * single monster, its plate (`nameplate`, an elite's prefix apart in the hostile accent) over its
 * health bar, in the overhead bar's look with its damage chip (`paintHealthBar`, §F.21–22). Which monster is the scene's to say (`pickTarget`); the
 * frame draws it, fades in over {@link TARGET_FADE_IN_MS} and out over {@link TARGET_FADE_OUT_MS},
 * switches content at once, and hides at once while covered (the spectate HUD, the floor veil).
 * A boss's frame is wider (§D.12): its bar 1.5 × the normal bar's width and twice its height.
 *
 * The look is the HUD's (design-guideline "UI Chrome"): a `hudPanel` backing with a 1px brass rim
 * and the body serif, the name in the hostile channel ("Gameplay accent"). Diablo II is the
 * behaviour reference, not the look. Colours are tokens only (ADR-0013).
 *
 * It is driven once a frame through {@link TargetFrame.update}, so the fade needs no tween, and
 * draws through {@link TargetFrameStage}, the narrow slice of Phaser it needs.
 */

import { DamageChip, healthBarKey, paintHealthBar } from "@/render/markers";
import {
  elitePlate,
  healthFraction,
  nameplate,
  seatPlate,
} from "@/render/creatures/monsters";
import type { MonsterState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";

/** The frame's top edge, in logical px (§E.14). */
export const TARGET_FRAME_TOP = 10;
/** A normal frame's size: within 280 × 52, ending above the notice band at y ≈ 78 (§E.14). */
export const TARGET_FRAME = { width: 260, height: 46 } as const;
/** The HUD band (§E.16): over the arrival card (960), under the passing notices (2000). */
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

/**
 * A boss's frame (§D.12, §E.14): around a bar 1.5 × the normal bar's width and twice its height,
 * with the same insets and name line, so 378 × 54, within 420 × 60. At the 1080 minimum it spans
 * x 351–729, clear of the top-right column from x 854, and ends at y 64, above the notices.
 */
export const TARGET_BOSS_FRAME = {
  width: (TARGET_FRAME.width - BAR_INSET_X * 2) * 1.5 + BAR_INSET_X * 2,
  height: TARGET_FRAME.height + BAR_H,
} as const;

/** Each kind of frame: its size and its bar's height. */
const FRAME_STYLES = {
  normal: { size: TARGET_FRAME, barHeight: BAR_H },
  boss: { size: TARGET_BOSS_FRAME, barHeight: BAR_H * 2 },
} as const;

/** A box in logical units: the frame's own, so it borrows no other panel's layout type. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the frame stands: its top at y 10, centred on `centreX` (§E.14). */
export function targetFrameRect(
  centreX: number,
  size: { width: number; height: number } = TARGET_FRAME,
): FrameRect {
  return {
    x: centreX - size.width / 2,
    y: TARGET_FRAME_TOP,
    width: size.width,
    height: size.height,
  };
}

/** One frame of the fade (§C.8): toward 1 over 120 ms while showing, toward 0 over 200 ms. */
export function fadeStep(
  alpha: number,
  deltaMs: number,
  showing: boolean,
): number {
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

/** What a drawn frame shows: redrawn only when one of these changes, its bar in backing px. */
const drawnKey = (m: MonsterState, centreX: number, bar: string) =>
  [m.entity_id, m.name, m.level, m.elite, m.archetype, m.boss, centreX, bar].join("|");

export class TargetFrame {
  private readonly panel: FrameGraphics;
  private readonly prefix: FrameText;
  private readonly name: FrameText;
  private alpha = 0;
  /** The monster last drawn: kept while the frame fades out. */
  private shown?: MonsterState;
  /** Whether the monster drawn is an elite with a prefix to letter apart. */
  private prefixed = false;
  private drawn?: string;
  /** The named monster's health and damage chip (§F.22), and whose they are. */
  private chip?: DamageChip;
  private chipFor?: string;

  /**
   * `centreX` reads the logical view's centre now (`viewport.centerX`), `renderScale` its backing
   * px per logical unit (`viewport.renderScale`), so the bar's fill ends on a whole backing px.
   */
  constructor(
    stage: TargetFrameStage,
    private readonly centreX: () => number,
    private readonly renderScale: () => number = () => 1,
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
    if (target) {
      this.track(target, deltaMs);
      this.draw(target);
    }
    this.alpha = fadeStep(this.alpha, deltaMs, target !== null);
    this.apply();
  }

  /**
   * Its box while it is drawn, fading in or out, or null (FS-56CKV §Change: Map name, E7): what
   * the map name beside the enlarged map gives way to.
   */
  shownRect(): FrameRect | null {
    if (this.alpha <= 0 || !this.shown) return null;
    return targetFrameRect(this.centreX(), FRAME_STYLES[this.shown.boss ? "boss" : "normal"].size);
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
    for (const part of this.parts()) {
      part.setAlpha(this.alpha);
      part.setVisible(on && (part !== this.prefix || this.prefixed));
    }
  }

  /** The chip follows the monster named; a new one starts with none (§F.22). */
  private track(monster: MonsterState, deltaMs: number): void {
    const fill = healthFraction(monster);
    if (!this.chip || this.chipFor !== monster.entity_id) {
      this.chip = new DamageChip(fill);
      this.chipFor = monster.entity_id;
      return;
    }
    this.chip.set(fill, fill < this.chip.fill);
    this.chip.step(deltaMs);
  }

  private draw(monster: MonsterState): void {
    const centreX = this.centreX();
    const scale = this.renderScale() || 1;
    const style = FRAME_STYLES[monster.boss ? "boss" : "normal"];
    const r = targetFrameRect(centreX, style.size);
    const bar = {
      x: r.x + BAR_INSET_X,
      y: r.y + r.height - BAR_INSET_BOTTOM - style.barHeight,
      width: r.width - BAR_INSET_X * 2,
      height: style.barHeight,
    };
    const fill = this.chip?.fill ?? healthFraction(monster);
    const chip = this.chip?.chip ?? fill;
    const key = drawnKey(monster, centreX, healthBarKey(bar, fill, chip, scale));
    this.shown = monster;
    if (key === this.drawn) return;
    this.drawn = key;

    const g = this.panel;
    g.clear();
    g.fillStyle(palette.hudPanel, 0.85);
    g.fillRect(r.x, r.y, r.width, r.height);
    g.lineStyle(1, palette.frame, 0.6);
    g.strokeRect(r.x, r.y, r.width, r.height);

    paintHealthBar(g, bar, fill, chip, scale);

    const plate = elitePlate(monster);
    this.prefixed = plate !== null;
    const y = r.y + NAME_TOP;
    this.name.setText(plate?.rest ?? nameplate(monster));
    this.prefix.setText(plate?.prefix ?? "");
    const seat = seatPlate(
      centreX,
      this.name.width,
      plate ? this.prefix.width : 0,
      PREFIX_GAP,
    );
    this.name.setPosition(seat.rest, y);
    this.prefix.setPosition(seat.prefix, y);
  }
}
