/**
 * The archer's Arrow Rain aim circle (FS-04EEA R38): a ring of the rain's 70 world px round the point it will
 * fall on, laid on the ground in the iso projection, over a faint fill so the ground it covers reads. Vellum
 * for every archer, like the Heavy Shot's aim line: not amber, it is not an interactable.
 *
 * A held drawing, not a table effect, like the Shadow Shot's aim line (`aimLine.ts`): the scene redraws it
 * every frame of the aim and clears it when the aim ends. Local only (ADR-0030): nothing about it is sent, and
 * teammates never see it. The centre comes in already pulled in to the reach (`arrowRainCentre`).
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import { ARROW_RAIN_RADIUS } from "@/scenes/arrowRainAim";
import { palette } from "@/utils/canvasPalette";
import { AIM_LINE_DEPTH } from "./aimLine";

/** With the aim line: over the light-map and the vignette, under the markers, read in the dark. */
export const AIM_CIRCLE_DEPTH = AIM_LINE_DEPTH;

/** Points round the ring: smooth at the rain's size on screen. */
export const AIM_CIRCLE_SEGMENTS = 48;

/** Screen px of the ring's stroke. */
export const AIM_CIRCLE_WIDTH = 3;

/** The ring plain, the fill a wash under it. */
export const AIM_CIRCLE_ALPHA = { ring: 0.85, fill: 0.15 } as const;

/** The slice of a Phaser Graphics the circle draws with. */
export interface AimCircleGraphics {
  clear(): unknown;
  lineStyle(width: number, color: number, alpha: number): unknown;
  fillStyle(color: number, alpha: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  strokePoints(points: Point[], closeShape?: boolean): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

/** The ring's screen points: the world circle of `radius` round `centre`, each point projected. */
export function aimCirclePoints(centre: Point, radius: number = ARROW_RAIN_RADIUS): Point[] {
  return Array.from({ length: AIM_CIRCLE_SEGMENTS }, (_, i) => {
    const a = (i / AIM_CIRCLE_SEGMENTS) * Math.PI * 2;
    return worldToScreen(centre.x + Math.cos(a) * radius, centre.y + Math.sin(a) * radius);
  });
}

/** One aim circle, made on its first draw and redrawn in place each frame of the aim. */
export class AimCircle {
  private graphics?: AimCircleGraphics;

  constructor(private readonly make: () => AimCircleGraphics) {}

  get drawn(): boolean {
    return this.graphics !== undefined;
  }

  /** Draws the circle for this frame round the world point `centre`. */
  draw(centre: Point): void {
    if (!this.graphics) {
      this.graphics = this.make();
      this.graphics.setDepth(AIM_CIRCLE_DEPTH);
    }
    const g = this.graphics;
    const ring = aimCirclePoints(centre);
    g.clear();
    g.fillStyle(palette.rainAimFill, AIM_CIRCLE_ALPHA.fill);
    g.fillPoints(ring, true);
    g.lineStyle(AIM_CIRCLE_WIDTH, palette.rainAimRing, AIM_CIRCLE_ALPHA.ring);
    g.strokePoints(ring, true);
  }

  /** The aim is over: no circle is left behind. */
  clear(): void {
    this.graphics?.destroy();
    this.graphics = undefined;
  }

  /** The scene's objects are already gone (a teardown): drop the reference, touch nothing. */
  forget(): void {
    this.graphics = undefined;
  }
}
