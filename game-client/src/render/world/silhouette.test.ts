import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import { worldDepth } from "@/render/iso";
import { palette } from "@/utils/canvasPalette";
import {
  SILHOUETTE_ALPHA,
  SILHOUETTE_DEPTH,
  SILHOUETTE_MASK,
  SILHOUETTE_TINT,
  Silhouette,
  type SilhouetteBody,
  type SilhouetteScene,
} from "./silhouette";

/** The indoor blackout's depth (FS-9PN7X §D): the silhouette stays under it. */
const BLACKOUT_DEPTH = 500;
/** The light-map's depth (`LIGHTMAP_DEPTH`): the silhouette is lit like the player it copies. */
const LIGHTMAP_DEPTH = 135;

function stubScene() {
  const image = {
    calls: {} as Record<string, unknown[][]>,
    visible: true,
  };
  const record =
    (name: string, then?: (...a: unknown[]) => void) =>
    (...a: unknown[]) => {
      (image.calls[name] ??= []).push(a);
      then?.(...a);
      return obj;
    };
  const obj: Record<string, unknown> = {};
  for (const m of [
    "setTexture",
    "setPosition",
    "setOrigin",
    "setScale",
    "setFlipX",
    "setDepth",
    "setAlpha",
    "setTintFill",
    "setMask",
    "destroy",
  ])
    obj[m] = record(m);
  obj.setVisible = record("setVisible", (v) => (image.visible = v as boolean));

  // the mask's render texture: what it was cleared to and drawn with, frame by frame
  const mask = { calls: {} as Record<string, unknown[][]>, bitmap: { kind: "bitmap-mask" } };
  const rt: Record<string, unknown> = {};
  for (const m of ["setOrigin", "setPosition", "setVisible", "clear", "draw", "destroy"])
    rt[m] = (...a: unknown[]) => {
      (mask.calls[m] ??= []).push(a);
      return rt;
    };
  rt.createBitmapMask = () => mask.bitmap;

  const add = { image: vi.fn(() => obj), renderTexture: vi.fn(() => rt) };
  const last = (name: string) => image.calls[name]?.at(-1);
  return { scene: { add } as unknown as SilhouetteScene, image, last, add, mask };
}

/** A body sprite in a character's container, as the scenes build them. */
const body = (frame: string, at = { x: 300, y: 200 }): SilhouetteBody => ({
  texture: { key: "art:characters-0" },
  frame: { name: frame },
  x: 0,
  y: -4,
  originX: 0.5,
  originY: 0.9,
  scaleX: 1,
  scaleY: 1,
  flipX: false,
  parentContainer: { x: at.x, y: at.y, parentContainer: null },
});

/** A covering piece as the scenes hand them over: a drawn game object where it stands. */
const piece = (x: number, y: number, visible = true) => ({ x, y, visible });
const ROOF = [piece(280, 120)];

describe("Silhouette (FS-9PN7X §E.3)", () => {
  // checked by `tsc`: a real scene and a real body sprite fit the slices the helper reads
  it("should take a Phaser scene and a body sprite", () => {
    const fits = (scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite) => {
      const s: SilhouetteScene = scene;
      const b: SilhouetteBody = sprite;
      return [s, b];
    };
    expect(fits).toBeTypeOf("function");
  });

  it("should be a dim copy tinted with a canvas token, drawn over the buildings and under the blackout", () => {
    const { scene, last } = stubScene();
    new Silhouette(scene);
    expect(SILHOUETTE_TINT).toBe(palette.markerSelf);
    expect(last("setTintFill")).toEqual([SILHOUETTE_TINT]);
    expect(SILHOUETTE_ALPHA).toBeGreaterThan(0);
    expect(SILHOUETTE_ALPHA).toBeLessThan(1);
    expect(last("setAlpha")).toEqual([SILHOUETTE_ALPHA]);
    expect(last("setDepth")).toEqual([SILHOUETTE_DEPTH]);
    // over every world piece, however far into the map it sorts
    expect(SILHOUETTE_DEPTH).toBeGreaterThan(worldDepth(100_000, 100_000, 9));
    expect(SILHOUETTE_DEPTH).toBeLessThan(LIGHTMAP_DEPTH);
    expect(SILHOUETTE_DEPTH).toBeLessThan(BLACKOUT_DEPTH);
  });

  it("should start hidden", () => {
    const { scene, image } = stubScene();
    new Silhouette(scene);
    expect(image.visible).toBe(false);
  });

  it("should show while covered, copying the body's current frame on its drawn position", () => {
    const { scene, image, last } = stubScene();
    const s = new Silhouette(scene);
    s.update(body("hero/walk/2/1"), ROOF);
    expect(image.visible).toBe(true);
    expect(last("setTexture")).toEqual(["art:characters-0", "hero/walk/2/1"]);
    expect(last("setPosition")).toEqual([300, 196]);
    expect(last("setOrigin")).toEqual([0.5, 0.9]);
    expect(last("setScale")).toEqual([1, 1]);
    expect(last("setFlipX")).toEqual([false]);
  });

  it("should follow the body frame by frame", () => {
    const { scene, last } = stubScene();
    const s = new Silhouette(scene);
    s.update(body("hero/walk/2/1"), ROOF);
    s.update({ ...body("hero/walk/2/2", { x: 310, y: 205 }), flipX: true }, ROOF);
    expect(last("setTexture")).toEqual(["art:characters-0", "hero/walk/2/2"]);
    expect(last("setPosition")).toEqual([310, 201]);
    expect(last("setFlipX")).toEqual([true]);
  });

  it("should hide the instant nothing covers, and with no body at all", () => {
    const { scene, image } = stubScene();
    const s = new Silhouette(scene);
    s.update(body("hero/idle/0/0"), ROOF);
    s.update(body("hero/idle/0/0"), []);
    expect(image.visible).toBe(false);
    s.update(body("hero/idle/0/0"), ROOF);
    s.update(null, ROOF);
    expect(image.visible).toBe(false);
  });

  it("should let go of its image and its mask when destroyed", () => {
    const { scene, image, mask } = stubScene();
    new Silhouette(scene).destroy();
    expect(image.calls.destroy).toHaveLength(1);
    expect(mask.calls.destroy).toHaveLength(1);
  });

  // Seen in I-9PN7X-6's shots: half behind a room, the player's visible head and shoulders went
  // brass too. The silhouette shows only where the covering pieces' own pixels are.
  describe("only the covered part", () => {
    it("should be masked by a hidden texture of the covering pieces, never drawn on its own", () => {
      const { scene, last, mask, add } = stubScene();
      new Silhouette(scene);
      expect(add.renderTexture).toHaveBeenCalledTimes(1);
      expect(last("setMask")).toEqual([mask.bitmap]);
      expect(mask.calls.setVisible?.at(-1)).toEqual([false]);
      expect(mask.calls.setOrigin?.at(-1)).toEqual([0, 0]);
    });

    it("should redraw the mask each frame from the pieces covering the player, where they stand", () => {
      const { scene, mask } = stubScene();
      const s = new Silhouette(scene);
      const wall = piece(320, 230);
      const roof = piece(280, 120);
      s.update(body("hero/walk/2/1"), [wall, roof]);
      // the mask sits around the body's drawn position, its feet SILHOUETTE_MASK.above from the top
      const left = 300 - SILHOUETTE_MASK.width / 2;
      const top = 196 - SILHOUETTE_MASK.above;
      expect(mask.calls.setPosition?.at(-1)).toEqual([left, top]);
      expect(mask.calls.clear).toHaveLength(1);
      expect(mask.calls.draw).toEqual([
        [wall, 320 - left, 230 - top],
        [roof, 280 - left, 120 - top],
      ]);

      s.update(body("hero/walk/2/1"), [roof]);
      expect(mask.calls.clear).toHaveLength(2);
      expect(mask.calls.draw.at(-1)).toEqual([roof, 280 - left, 120 - top]);
      expect(mask.calls.draw).toHaveLength(3);
    });

    it("should leave a hidden piece out of the mask", () => {
      const { scene, mask } = stubScene();
      const s = new Silhouette(scene);
      s.update(body("hero/walk/2/1"), [piece(320, 230, false), piece(280, 120)]);
      expect(mask.calls.draw).toHaveLength(1);
    });

    it("should hold the whole body frame, however tall the character stands", () => {
      // the largest character frame baked today: char_wizard_base, 194 × 170, anchor (0.43, 0.75)
      expect(SILHOUETTE_MASK.above).toBeGreaterThanOrEqual(170 * 0.75);
      expect(SILHOUETTE_MASK.height - SILHOUETTE_MASK.above).toBeGreaterThanOrEqual(170 * 0.25);
      expect(SILHOUETTE_MASK.width / 2).toBeGreaterThanOrEqual(194 * (1 - 0.43));
    });
  });
});
