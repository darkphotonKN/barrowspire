/**
 * Burning trails on the canvas (FS-4R9M9 req 36, 56, 61): the strip of fire a `burning_dash`
 * wearer leaves along the path dashed. The broadcast carries every live trail every tick, so the
 * set is diffed by `entity_id` like the stairs, and each live trail is repainted from its time
 * left, fading as it burns out. A trail that leaves state (burnt out, its wearer gone, the floor
 * changed) is taken down.
 *
 * Fire harms monsters, so it burns in the damage family (oxblood bed, ember flame), never amber:
 * a trail is not something the delver can act on (guideline "Gameplay accent"). It is drawn in
 * two marks: a bed on the ground, under everything that stands, and a thin additive core above
 * the light-map, so the fire reads as burning in the barrow's dark rather than as a stain.
 *
 * Phaser-free: it paints through {@link TrailBrush} and gets its marks from {@link TrailStage},
 * so it is tested without a canvas.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import type { TrailState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";

/**
 * Where a trail's bed sorts: just above the ground (-1), under everything that stands (the world
 * band, 100+). Its glow sorts with the flame halos, just above the light-map (the scene's call).
 */
export const TRAIL_BED_DEPTH = 0;

/** How long a trail burns from the dash, in seconds (FS-4R9M9 R36). */
export const TRAIL_SECONDS = 3;

/** How far a trail has burnt down: 1 when fresh, 0 when out. */
export function trailFade(remaining: number): number {
  return Math.min(1, Math.max(0, remaining / TRAIL_SECONDS));
}

/**
 * The trail's burning ground on screen: the world rect `half_width × share` either side of the
 * path, run on past each end by as much, projected. Four corners, ready for `fillPoints`. A dash
 * that went nowhere still burns round the point it started from.
 */
export function trailOutline(trail: TrailState, share = 1): Point[] {
  const { from, to } = trail;
  const reach = trail.half_width * share;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const dx = length > 0 ? (to.x - from.x) / length : 1;
  const dy = length > 0 ? (to.y - from.y) / length : 0;
  // along the path, and across it
  const ax = dx * reach;
  const ay = dy * reach;
  const nx = -dy * reach;
  const ny = dx * reach;
  const start = { x: from.x - ax, y: from.y - ay };
  const end = { x: to.x + ax, y: to.y + ay };
  return [
    worldToScreen(start.x - nx, start.y - ny),
    worldToScreen(end.x - nx, end.y - ny),
    worldToScreen(end.x + nx, end.y + ny),
    worldToScreen(start.x + nx, start.y + ny),
  ];
}

/** What painting a trail asks of a graphics object. */
export interface TrailBrush {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
}

/** What the set asks of the scene: a fresh ground bed and a fresh glow for a new trail. */
export interface TrailStage<B extends TrailBrush & { destroy(): void }> {
  bed(trailId: string): B;
  glow(trailId: string): B;
  /**
   * Whether a trail's flame is in sight; absent means always. The glow sorts above the roofs, so
   * a trail under a roof the delver is outside of must not glow through it, as a sconce's halo
   * must not (guideline "Lighting"). The bed sorts under the roof and needs no gate.
   */
  glowShown?(trail: TrailState): boolean;
}

/** A flame's lick, from the time left alone, so every client's trail flickers alike. */
function flicker(remaining: number): number {
  return 0.85 + 0.15 * Math.sin(remaining * 17);
}

function paintBed(g: TrailBrush, trail: TrailState, fade: number): void {
  g.clear();
  g.fillStyle(palette.trailScorch, 0.5 * fade);
  g.fillPoints(trailOutline(trail), true);
  g.fillStyle(palette.trailFlame, 0.55 * fade);
  g.fillPoints(trailOutline(trail, 0.6 * flicker(trail.remaining)), true);
}

function paintGlow(g: TrailBrush, trail: TrailState, fade: number): void {
  g.clear();
  g.fillStyle(palette.trailCore, 0.45 * fade);
  g.fillPoints(trailOutline(trail, 0.3 * flicker(trail.remaining + 0.4)), true);
}

export class TrailSet<B extends TrailBrush & { destroy(): void }> {
  private readonly drawn = new Map<string, { bed: B; glow: B }>();

  constructor(private readonly stage: TrailStage<B>) {}

  /** Make the canvas match the broadcast: the broadcast is the whole truth. */
  sync(trails: TrailState[]): void {
    const present = new Set(trails.map((t) => t.entity_id));
    for (const [id, marks] of this.drawn) {
      if (present.has(id)) continue;
      marks.bed.destroy();
      marks.glow.destroy();
      this.drawn.delete(id);
    }

    for (const trail of trails) {
      let marks = this.drawn.get(trail.entity_id);
      if (!marks) {
        marks = {
          bed: this.stage.bed(trail.entity_id),
          glow: this.stage.glow(trail.entity_id),
        };
        this.drawn.set(trail.entity_id, marks);
      }
      const fade = trailFade(trail.remaining);
      paintBed(marks.bed, trail, fade);
      if (this.stage.glowShown?.(trail) === false) marks.glow.clear();
      else paintGlow(marks.glow, trail, fade);
    }
  }

  /** Destroy every trail and forget it: the floor it burnt on is gone. */
  clear(): void {
    for (const { bed, glow } of this.drawn.values()) {
      bed.destroy();
      glow.destroy();
    }
    this.drawn.clear();
  }

  /** Forget every trail without touching it: the scene has already destroyed its objects. */
  forget(): void {
    this.drawn.clear();
  }
}
