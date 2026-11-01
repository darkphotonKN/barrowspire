/**
 * The player's silhouette (FS-9PN7X §E.3, CONTEXT.md "Silhouette"): while a building exterior
 * stands between the player and the camera, a dim, tinted copy of the player's current body frame
 * shows through it, so they are never lost behind a closed building. It replaces the occluder fade
 * for buildings; trees and tall props still fade.
 *
 * It shows only where the covering pieces' own pixels are: a hidden render texture holds them,
 * redrawn each frame, and masks the copy, so the part of the player still in sight (a head over a
 * roof's eave) stays the player, not brass. The mask is WebGL's (a bitmap mask); under the canvas
 * renderer Phaser ignores it and the whole body is tinted, as before.
 *
 * The helper only draws. Who is copied (the player, never anyone else, §E.2) and which pieces
 * cover them (`covering`, while outside every building, §E.1, §E.5) are the scene's rules.
 */

import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";

/**
 * The silhouette's fill: the player's own marker colour (brass, `palette.markerSelf`), so it reads
 * as "you, behind this" without opening the building. A flat fill of the body's shape, not a tint
 * over its colours, so it never reads as the body itself drawn through the wall.
 */
export const SILHOUETTE_TINT = palette.markerSelf;

/** Dim: the building stays the thing in front. */
export const SILHOUETTE_ALPHA = 0.45;

/**
 * Above the whole world band (every building piece sorts by `worldDepth`, ≥ 100 and well short
 * of this), under the light-map (135) so it is lit like the player it copies, and so under the
 * indoor blackout (500), the markers and the HUD.
 */
export const SILHOUETTE_DEPTH = 134;

/**
 * The mask's texture, around the body's drawn position (its feet): wide and tall enough for the
 * largest character frame baked (`char_wizard_base`, 194 × 170, anchor 0.43, 0.75) with room over.
 */
export const SILHOUETTE_MASK = { width: 320, height: 320, above: 240 } as const;

/** A container a body sits in: only its offset is read (characters are never scaled or turned). */
interface Parent {
  x: number;
  y: number;
  parentContainer: Parent | null;
}

/** The slice of a body sprite the silhouette copies. */
export interface SilhouetteBody {
  texture: { key: string };
  frame: { name: string | number };
  x: number;
  y: number;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  parentContainer: Parent | null;
}

interface SilhouetteImage {
  setTexture(key: string, frame?: string | number): this;
  setPosition(x: number, y: number): this;
  setOrigin(x: number, y: number): this;
  setScale(x: number, y: number): this;
  setFlipX(flip: boolean): this;
  setDepth(depth: number): this;
  setAlpha(alpha: number): this;
  setTintFill(color: number): this;
  setVisible(visible: boolean): this;
  setMask(mask: Phaser.Display.Masks.BitmapMask): this;
  destroy(): void;
}

/** A drawn piece covering the player: a building part, drawn into the mask where it stands. */
export interface SilhouetteCover {
  x: number;
  y: number;
  visible: boolean;
}

interface MaskTexture {
  setOrigin(x: number, y: number): this;
  setPosition(x: number, y: number): this;
  setVisible(visible: boolean): this;
  clear(): this;
  draw(entry: SilhouetteCover, x: number, y: number): this;
  createBitmapMask(): Phaser.Display.Masks.BitmapMask;
  destroy(): void;
}

/** The slice of a Phaser scene the silhouette draws with. */
export interface SilhouetteScene {
  add: {
    image(x: number, y: number, texture: string): SilhouetteImage;
    renderTexture(x: number, y: number, width: number, height: number): MaskTexture;
  };
}

/** Phaser's always-present blank texture: what the image holds before it copies a body. */
const BLANK = "__DEFAULT";

export class Silhouette {
  private readonly image: SilhouetteImage;
  /** The covering pieces, drawn afresh each frame; never on screen itself, only as the mask. */
  private readonly mask: MaskTexture;

  constructor(scene: SilhouetteScene) {
    const { width, height } = SILHOUETTE_MASK;
    this.mask = scene.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setVisible(false);
    this.image = scene.add
      .image(0, 0, BLANK)
      .setTintFill(SILHOUETTE_TINT)
      .setAlpha(SILHOUETTE_ALPHA)
      .setDepth(SILHOUETTE_DEPTH)
      .setMask(this.mask.createBitmapMask())
      .setVisible(false);
  }

  /**
   * Once a frame: while any piece is `covering` the player, copy `body`'s current frame onto its
   * drawn position and show it where those pieces are; otherwise (or with no body: not spawned,
   * dead, gone) hide.
   */
  update(body: SilhouetteBody | null, covering: readonly SilhouetteCover[]): void {
    if (!body || covering.length === 0) {
      this.image.setVisible(false);
      return;
    }
    let x = body.x;
    let y = body.y;
    for (let p = body.parentContainer; p; p = p.parentContainer) {
      x += p.x;
      y += p.y;
    }
    this.image
      .setTexture(body.texture.key, body.frame.name)
      .setPosition(x, y)
      .setOrigin(body.originX, body.originY)
      .setScale(body.scaleX, body.scaleY)
      .setFlipX(body.flipX)
      .setVisible(true);
    this.cover(x, y, covering);
  }

  /** Redraws the mask around the body's feet at (`x`, `y`) from the pieces covering it. */
  private cover(x: number, y: number, covering: readonly SilhouetteCover[]): void {
    const left = x - SILHOUETTE_MASK.width / 2;
    const top = y - SILHOUETTE_MASK.above;
    this.mask.setPosition(left, top).clear();
    for (const piece of covering)
      if (piece.visible) this.mask.draw(piece, piece.x - left, piece.y - top);
  }

  destroy(): void {
    this.image.destroy();
    this.mask.destroy();
  }
}
