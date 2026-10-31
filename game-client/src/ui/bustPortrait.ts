/**
 * A medallion bust on a scene: head and shoulders cut from a standing figure's frame (`bust.ts`),
 * scaled into a circle and masked to it. The NPC dialogue card and the party frames (FS-R82NV R34)
 * both draw theirs through this, so the two crops never drift apart.
 */

import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import { bustCrop, bustSize, type Bounds } from "./bust";

/** The frame to cut a bust from. */
export interface Portrait {
  texture: string;
  frame: string | number;
}

/** The scene slice a bust draws with; without textures there is nothing to cut. */
export type BustStage = Pick<Phaser.Scene, "add"> &
  Partial<Pick<Phaser.Scene, "make" | "textures">>;

export interface MaskedBust {
  image: Phaser.GameObjects.Image;
  /** Lives outside any container: its owner destroys it with the image. */
  mask?: Phaser.GameObjects.Graphics;
}

interface Figure {
  bounds: Bounds;
  /** The middle of the opaque pixels across the bust's rows. */
  centreX: number;
}

const figureCache = new Map<string, Figure | undefined>();

/** Where the figure is in its frame, read once from the frame's pixels and remembered. */
function figureOf(
  scene: Phaser.Scene,
  texture: string,
  frameName: string | number,
): Figure | undefined {
  const cacheKey = `${texture}:${frameName}`;
  if (figureCache.has(cacheKey)) return figureCache.get(cacheKey);

  let figure: Figure | undefined;
  const frame = scene.textures.getFrame(texture, frameName);
  const image = frame?.source.image as CanvasImageSource | undefined;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (frame && image && ctx) {
    const w = (canvas.width = frame.cutWidth);
    const h = (canvas.height = frame.cutHeight);
    ctx.drawImage(image, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const solid = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 40;

    let left = w,
      top = h,
      right = 0,
      bottom = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!solid(x, y)) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    }
    if (right > left) {
      const bounds = { left, top, right, bottom };
      let sum = 0,
        count = 0;
      for (let y = top; y < Math.min(h, top + bustSize(bounds)); y++) {
        for (let x = left; x < right; x++) {
          if (!solid(x, y)) continue;
          sum += x;
          count++;
        }
      }
      figure = { bounds, centreX: sum / count };
    }
  }
  figureCache.set(cacheKey, figure);
  return figure;
}

function bustImage(
  scene: BustStage,
  portrait: Portrait,
  mx: number,
  my: number,
  r: number,
): Phaser.GameObjects.Image | undefined {
  if (!scene.textures) return undefined;
  const frame = scene.textures.getFrame(portrait.texture, portrait.frame);
  const figure = figureOf(
    scene as Phaser.Scene,
    portrait.texture,
    portrait.frame,
  );
  if (!frame || !figure) return undefined;
  const crop = bustCrop(figure.bounds, figure.centreX, frame.cutWidth);
  const scale = (r * 2) / crop.size;
  // Placed by the figure's centre, not the crop's edge: a figure near its frame's edge has
  // its crop clamped, and would otherwise sit off-centre in the ring.
  return scene.add
    .image(
      mx - figure.centreX * scale,
      my - r - crop.y * scale,
      portrait.texture,
      portrait.frame,
    )
    .setOrigin(0, 0)
    .setCrop(crop.x, crop.y, crop.size, crop.size)
    .setScale(scale);
}

/**
 * The bust in a circle of radius `r` centred on (mx, my), masked to `r - 1`, camera-fixed. None
 * when the frame is missing or blank: the caller's medallion stays an empty disc.
 */
export function maskedBust(
  scene: BustStage,
  portrait: Portrait,
  mx: number,
  my: number,
  r: number,
): MaskedBust | undefined {
  const image = bustImage(scene, portrait, mx, my, r);
  if (!image) return undefined;
  if (!scene.make) return { image };
  const mask = scene.make.graphics({}, false).setScrollFactor(0);
  // a geometry mask reads only the shape: its fill is never drawn, so any token will do
  mask.fillStyle(palette.hudText);
  mask.fillCircle(mx, my, r - 1);
  image.setMask(mask.createGeometryMask());
  return { image, mask };
}
