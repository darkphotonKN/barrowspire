/**
 * The indoor blackout (FS-9PN7X §D): while the player stands in a building, everything outside it
 * is filled with the canvas's darkest ink. One module for every scene (§D.5): the scene says which
 * building, if any, how tall its walls stand and what is its own; the module owns the dark and
 * its depth.
 *
 * Under WebGL the dark is masked by the building's own px (`BlackoutMask`, the owner's model):
 * nothing outside what the building draws is seen, to the px. Under the canvas renderer, which
 * has no bitmap masks (Phaser.AUTO can fall back to it), the dark is the geometric hole below:
 * the throwaway spike's (`spike/opaque-interiors`, 6aa8f625, `spikeDrawMask`), re-implemented
 * here, not merged. It is approximate by design: the ground just outside the walls shows in it.
 */

import type Phaser from "phaser";
// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { outsideConvex, projectRect, raise } from "@/render/iso/shapes";
import type { Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { BlackoutMask, type BlackoutMaskStage, type Stamp } from "./blackoutMask";
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

/** `Phaser.WEBGL`, by value: this module stays free of Phaser's runtime. */
const WEBGL = 2;

/**
 * What the blackout needs of a scene: somewhere to make its geometric Graphics, and under WebGL
 * (its renderer says so) what the mask draws with. A Phaser scene is both.
 */
export interface BlackoutStage {
  add: { graphics(): Phaser.GameObjects.Graphics } & Partial<BlackoutMaskStage["add"]>;
  make?: BlackoutMaskStage["make"];
  cameras?: BlackoutMaskStage["cameras"];
  renderer?: { type: number };
}

/** The stage the mask draws on, when the renderer is WebGL's and the stage has what it needs. */
function maskStage(stage: BlackoutStage): BlackoutMaskStage | undefined {
  const { add, make, cameras, renderer } = stage;
  if (renderer?.type !== WEBGL || !make || !cameras || !add.renderTexture || !add.rectangle) return undefined;
  // the factory itself, not its methods lifted off it: Phaser's factory methods read `this`
  return { add: add as BlackoutMaskStage["add"], make, cameras };
}

/** What the player's building draws as its own, for the mask: its walls' thickness and its stamps. */
export interface BlackoutOwn {
  wall: number;
  stamps: readonly Stamp[];
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
 * The blackout itself, at `BLACKOUT.depth` in `palette.inkDeep`, hidden while the player is in no
 * building (§D.4). Under WebGL, a mask of the building's own px (`BlackoutMask`), redrawn when
 * they change; under canvas, one Graphics drawn around the building's geometric hole, drawn only
 * when the building (or the wall top) changes. Either way a scene hands it the player's building
 * every frame.
 */
export class Blackout {
  /** The geometric dark: the canvas renderer's. */
  private readonly dark?: Phaser.GameObjects.Graphics;
  /** The building's own px: WebGL's. */
  private readonly mask?: BlackoutMask;
  private around?: House;
  private drawnTop?: number;

  constructor(
    stage: BlackoutStage,
    private readonly geometry: BlackoutGeometry,
  ) {
    const masked = maskStage(stage);
    if (masked) this.mask = new BlackoutMask(masked, BLACKOUT.depth);
    else this.dark = stage.add.graphics().setDepth(BLACKOUT.depth).setVisible(false);
  }

  /** The building the dark is around, if any. */
  get house(): House | undefined {
    return this.around;
  }

  /**
   * Darkens everything but `house`, or nothing while it is undefined. The same frame (§A.4).
   * `own` says what the building draws as its own; only the mask asks, and only while inside.
   */
  show(house: House | undefined, own: () => BlackoutOwn = () => ({ wall: 0, stamps: [] })): void {
    if (this.mask) {
      this.around = house;
      this.mask.show(house ? { house, wallTop: this.geometry.wallTop(), ...own() } : undefined);
      return;
    }
    this.showGeometric(house);
  }

  /** Off and forgotten, for a floor's teardown: the next `show` draws afresh. */
  clear(): void {
    this.show(undefined);
  }

  /** Gone with its scene. */
  destroy(): void {
    this.around = undefined;
    this.drawnTop = undefined;
    this.dark?.destroy();
    this.mask?.destroy();
  }

  /** The canvas renderer's dark: everything outside the building's padded, raised hole. */
  private showGeometric(house: House | undefined): void {
    if (!this.dark) return;
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
}
