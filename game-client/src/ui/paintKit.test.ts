import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { canvasImage } from "./paintKit";

// FS-56CKV §A.2: the minimap's vignette, an image of a canvas texture painted once.

/** A scene whose texture manager keeps what is made, as Phaser's does, and whose images record their origin. */
function fakeScene() {
  const textures = new Map<string, { refresh: () => void }>();
  const images: { key: string; origin?: number }[] = [];
  const scene = {
    textures: {
      exists: (key: string) => textures.has(key),
      createCanvas: (key: string) => {
        const texture = { getContext: () => ({}), refresh: vi.fn() };
        textures.set(key, texture);
        return texture;
      },
    },
    add: {
      image: (_x: number, _y: number, key: string) => {
        const image: {
          key: string;
          origin?: number;
          setOrigin(o: number): unknown;
        } = {
          key,
          setOrigin: (o) => ((image.origin = o), image),
        };
        images.push(image);
        return image;
      },
    },
  };
  return { scene: scene as unknown as Phaser.Scene, textures, images };
}

describe("canvasImage", () => {
  it("should paint the texture the first time its key is asked for, and only then", () => {
    const { scene, textures } = fakeScene();
    const paint = vi.fn();
    canvasImage(scene, "k", 216, 108, paint);
    canvasImage(scene, "k", 216, 108, paint);
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint).toHaveBeenCalledWith(expect.anything(), 216, 108);
    expect(textures.get("k")!.refresh).toHaveBeenCalledTimes(1);
  });

  it("should make an image of the texture each time, its origin its top-left", () => {
    const { scene, images } = fakeScene();
    canvasImage(scene, "k", 216, 108, () => undefined);
    canvasImage(scene, "k", 216, 108, () => undefined);
    expect(images).toEqual([
      expect.objectContaining({ key: "k", origin: 0 }),
      expect.objectContaining({ key: "k", origin: 0 }),
    ]);
  });
});
