/**
 * The indoor blackout (FS-9PN7X §D): while the player stands in a building, everything outside it
 * is filled with the canvas's darkest ink. One module for every scene (§D.5): the scene says which
 * building, if any, and how tall its walls stand; the module owns the one Graphics and its depth.
 *
 * The geometry is the throwaway spike's (`spike/opaque-interiors`, 6aa8f625, `spikeDrawMask`),
 * which is also the run scene's dormant `updateIndoorMask`; re-implemented here, not merged.
 */

import type Phaser from "phaser";
// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { outsideConvex, projectRect, raise } from "@/render/iso/shapes";
import type { Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import type { House } from "./houses";

export const BLACKOUT = {
  /** World px the hole is grown by, so a wall's outer face is never clipped. */
  pad: 5,
  /**
   * Screen px kept clear over the wall top: the back walls' coping and no more, so the hole
   * follows the walls' actual top and nothing beyond shows above them (the owner's trim of the
   * spike's 24 px, 2026-11-01). Measured on the baked masonry and timber back pieces and posts in
   * the servers' 20 px walls: the corner posts, the tallest pieces, stand about 5 px over the
   * walls' coping and clear the hole's edge by a fraction of a px; the edge, straight between
   * them, runs about 5 px over the walls between. No back piece's dressing (sconce, banner,
   * cobweb, torch, window) stands above the coping.
   */
  headroom: 2,
  /**
   * Over the world, the light-map (135), its halos (136) and world effects (≥ 140); under the
   * dust (902), the vignette (905), markers (950, 951) and the HUD (≥ 1000) (§D.3).
   */
  depth: 500,
} as const;

/**
 * The part of the screen a building keeps (§D.2): its floor rect grown by the pad, projected,
 * with its back corners raised by the wall top plus the headroom (the coping, not the spike's
 * 24 px band). The hexagon
 * `[topUp, rightUp, right, bottom, left, leftUp]`, convex, clockwise on screen.
 */
export function blackoutHole(house: House, wallTop: number): Point[] {
  const { pad, headroom } = BLACKOUT;
  const floor = projectRect(house.x - pad, house.y - pad, house.width + pad * 2, house.height + pad * 2);
  const [, right, bottom, left] = floor;
  const [topUp, rightUp, , leftUp] = raise(floor, wallTop + headroom);
  return [topUp, rightUp, right, bottom, left, leftUp];
}

/** The dark around a building: quads covering everything within `reach` of its hole but none of it. */
export function blackoutQuads(house: House, wallTop: number, reach: number): Point[][] {
  return outsideConvex(blackoutHole(house, wallTop), reach);
}

/** What the blackout needs of a scene: somewhere to make its Graphics. */
export interface BlackoutStage {
  add: { graphics(): Phaser.GameObjects.Graphics };
}

export interface BlackoutGeometry {
  /**
   * How tall the buildings' walls stand, in screen px: `BAKE.WALL_BACK * BAKE.VPX` with baked
   * walls, the scene's placeholder wall height without. Read on each change, so walls baked
   * after the blackout was made still count.
   */
  wallTop: () => number;
  /** How far the dark reaches from the hole: enough to cover the whole map. */
  reach: number;
}

/**
 * The blackout itself: one Graphics at `BLACKOUT.depth` in `palette.inkDeep`, drawn around the
 * player's building and hidden while they are in none (§D.4). Drawn only when the building (or the
 * wall top) changes, so a scene can hand it the player's building every frame.
 */
export class Blackout {
  private readonly dark: Phaser.GameObjects.Graphics;
  private around?: House;
  private drawnTop?: number;

  constructor(
    stage: BlackoutStage,
    private readonly geometry: BlackoutGeometry,
  ) {
    this.dark = stage.add.graphics().setDepth(BLACKOUT.depth).setVisible(false);
  }

  /** The building the dark is around, if any. */
  get house(): House | undefined {
    return this.around;
  }

  /** Darkens everything but `house`, or nothing while it is undefined. The same frame (§A.4). */
  show(house: House | undefined): void {
    const wallTop = house ? this.geometry.wallTop() : undefined;
    if (house === this.around && wallTop === this.drawnTop) return;
    this.around = house;
    this.drawnTop = wallTop;
    this.dark.clear();
    this.dark.setVisible(!!house);
    if (!house || wallTop === undefined) return;
    this.dark.fillStyle(palette.inkDeep, 1);
    for (const quad of blackoutQuads(house, wallTop, this.geometry.reach)) this.dark.fillPoints(quad, true);
  }

  /** Off and forgotten, for a floor's teardown: the next `show` draws afresh. */
  clear(): void {
    this.show(undefined);
  }

  /** Gone with its scene. */
  destroy(): void {
    this.around = undefined;
    this.drawnTop = undefined;
    this.dark.destroy();
  }
}
