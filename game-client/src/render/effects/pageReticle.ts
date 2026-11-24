/**
 * The armed page's reticle (FS-X2CMM §H R41; CONTEXT "Armed page"): the look alone, so it can be swapped
 * without touching the arming (`src/scenes/pageAim.ts`) or the run's wiring. A ground page lays a ring
 * of its effect size at the pointer (Witchlight's 3-cell glow, the rune's 1.5 cells), the hound a paw mark;
 * an ally page a ring under the body it snapped to, in the ally channel; an interactable page one in the
 * interactable channel. Each is laid on the ground in the iso projection, over a faint wash, plain on a
 * valid target and faint where a click would do nothing.
 *
 * A held drawing, like the Arrow Rain's aim circle (`aimCircle.ts`): the run redraws it every frame while
 * a page is armed and clears it as it is cast or disarmed. Local only (R44, ADR-0030): nothing about it is
 * sent, and teammates never see it.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import type { ArmedKind, Reticle } from "@/scenes/pageAim";
import { palette } from "@/utils/canvasPalette";
import { AIM_CIRCLE_DEPTH, AIM_CIRCLE_SEGMENTS, AIM_CIRCLE_WIDTH, aimCirclePoints, type AimCircleGraphics } from "./aimCircle";

/** With the Arrow Rain's circle: over the light-map and the vignette, under the markers. */
export const PAGE_RETICLE_DEPTH = AIM_CIRCLE_DEPTH;

/** The ring and its wash, plain on a valid target and faint on none (R41). */
export const RETICLE_ALPHA = {
  valid: { ring: 0.85, fill: 0.15 },
  faint: { ring: 0.3, fill: 0.05 },
} as const;

/** The ring's ink by what the page is aimed at: vellum on the ground, the ally and interactable channels on a body. */
export function reticleInk(kind: ArmedKind): number {
  if (kind === "ally") return palette.reticleAlly;
  if (kind === "interactable") return palette.reticleInteractable;
  return palette.reticleGround;
}

/** A world ellipse round `centre`, `rx` by `ry`, turned `turn` radians, projected. */
function ellipse(centre: Point, rx: number, ry: number, turn = 0, segments = AIM_CIRCLE_SEGMENTS / 2): Point[] {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    const [x, y] = [Math.cos(a) * rx, Math.sin(a) * ry];
    return worldToScreen(centre.x + x * c - y * s, centre.y + x * s + y * c);
  });
}

/** The hound's paw mark round `centre`, `radius` across: a pad and four toes fanned over it. */
function paw(centre: Point, radius: number): Point[][] {
  const pad = ellipse({ x: centre.x, y: centre.y + radius * 0.25 }, radius * 0.45, radius * 0.38);
  const toes = [-0.75, -0.25, 0.25, 0.75].map((k) => {
    const a = -Math.PI / 2 + k * 0.9;
    const at = { x: centre.x + Math.cos(a) * radius * 0.62, y: centre.y + radius * 0.1 + Math.sin(a) * radius * 0.62 };
    return ellipse(at, radius * 0.17, radius * 0.22, a + Math.PI / 2, 12);
  });
  return [pad, ...toes];
}

/** The screen shapes a reticle lays: one ring, or the hound's paw (R41). */
export function reticleShapes(reticle: Reticle): Point[][] {
  if (reticle.page === "call_the_hound") return paw(reticle.at, reticle.radius);
  return [aimCirclePoints(reticle.at, reticle.radius)];
}

/** One reticle, made on its first draw and redrawn in place each frame a page is armed. */
export class PageReticle {
  private graphics?: AimCircleGraphics;

  constructor(private readonly make: () => AimCircleGraphics) {}

  get drawn(): boolean {
    return this.graphics !== undefined;
  }

  /** Draws the reticle for this frame. */
  draw(reticle: Reticle): void {
    if (!this.graphics) {
      this.graphics = this.make();
      this.graphics.setDepth(PAGE_RETICLE_DEPTH);
    }
    const g = this.graphics;
    const alpha = reticle.valid ? RETICLE_ALPHA.valid : RETICLE_ALPHA.faint;
    const ink = reticleInk(reticle.kind);
    g.clear();
    for (const shape of reticleShapes(reticle)) {
      g.fillStyle(palette.reticleFill, alpha.fill);
      g.fillPoints(shape, true);
      g.lineStyle(AIM_CIRCLE_WIDTH, ink, alpha.ring);
      g.strokePoints(shape, true);
    }
  }

  /** The page was cast or disarmed: nothing is left behind. */
  clear(): void {
    this.graphics?.destroy();
    this.graphics = undefined;
  }

  /** The scene's objects are already gone (a teardown): drop the reference, touch nothing. */
  forget(): void {
    this.graphics = undefined;
  }
}
