import { describe, it, expect, vi } from "vitest";
import { registerArt, MANIFEST_KEY, type ArtScene } from "./phaser";
import { PLACEHOLDER_TEXTURE } from "./library";

const manifest = {
  version: 1,
  tile: { width: 64, height: 32 },
  facings: ["e", "se", "s", "sw", "w", "nw", "n", "ne"],
  atlases: {
    "props-0": {
      image: "props-0.png",
      width: 256,
      height: 128,
      sha256: "d".repeat(64),
    },
    "props-1": {
      image: "props-1.png",
      width: 256,
      height: 128,
      sha256: "e".repeat(64),
    },
  },
  sheets: {
    switch: {
      atlas: "props-0",
      frameWidth: 30,
      frameHeight: 40,
      anchor: { x: 0.5, y: 0.8 },
      directions: 1,
      animations: {
        inactive: { fps: 0, loop: false, frames: [[{ x: 0, y: 0 }]] },
        active: { fps: 0, loop: false, frames: [[{ x: 30, y: 0 }]] },
      },
      source: "procedural",
      licence: "Barrowspire-original",
    },
    brazier: {
      atlas: "props-1",
      frameWidth: 40,
      frameHeight: 60,
      anchor: { x: 0.5, y: 0.8 },
      directions: 1,
      animations: {
        burn: {
          fps: 8,
          loop: true,
          frames: [
            [
              { x: 0, y: 0 },
              { x: 40, y: 0 },
            ],
          ],
        },
      },
      source: "procedural",
      licence: "Barrowspire-original",
    },
  },
};

/** A scene double exposing only what registerArt touches. */
function fakeScene(json: unknown, loadedTextures: string[]) {
  const frames: Record<string, string[]> = {};
  const textures = new Set(loadedTextures);
  const anims = new Map<string, unknown>();
  const scene: ArtScene = {
    cache: {
      json: { get: (key: string) => (key === MANIFEST_KEY ? json : undefined) },
    },
    textures: {
      exists: (key: string) => textures.has(key),
      get: (key: string) => ({
        has: (name: string) => (frames[key] ?? []).includes(name),
        add: (name: string) => {
          (frames[key] ??= []).push(name);
          return null;
        },
      }),
    },
    anims: {
      exists: (key: string) => anims.has(key),
      create: (config: { key: string }) => {
        anims.set(config.key, config);
        return false;
      },
    },
    add: {
      graphics: () => ({
        fillStyle: () => undefined,
        fillRect: () => undefined,
        lineStyle: () => undefined,
        strokeRect: () => undefined,
        generateTexture: (key: string) => {
          textures.add(key);
        },
        destroy: () => undefined,
      }),
    },
  } as unknown as ArtScene;
  return { scene, frames, anims, textures };
}

describe("registerArt", () => {
  it("registers every frame of every sheet on its atlas texture", () => {
    const { scene, frames } = fakeScene(manifest, [
      "art:props-0",
      "art:props-1",
    ]);
    registerArt(scene, { warn: vi.fn() });
    expect(frames["art:props-0"]).toEqual([
      "switch/inactive/0/0",
      "switch/active/0/0",
    ]);
    expect(frames["art:props-1"]).toEqual([
      "brazier/burn/0/0",
      "brazier/burn/0/1",
    ]);
  });

  it("creates a Phaser animation for each multi-frame animation", () => {
    const { scene, anims } = fakeScene(manifest, [
      "art:props-0",
      "art:props-1",
    ]);
    registerArt(scene, { warn: vi.fn() });
    expect(anims.get("brazier/burn/0")).toMatchObject({
      frameRate: 8,
      repeat: -1,
      frames: [
        { key: "art:props-1", frame: "brazier/burn/0/0" },
        { key: "art:props-1", frame: "brazier/burn/0/1" },
      ],
    });
    expect(anims.has("switch/inactive/0")).toBe(false);
  });

  it("always provides the placeholder texture", () => {
    const { scene, textures } = fakeScene(undefined, []);
    registerArt(scene, { warn: vi.fn() });
    expect(textures.has(PLACEHOLDER_TEXTURE)).toBe(true);
  });

  it("falls back to an empty library and logs when the manifest is missing", () => {
    const log = { warn: vi.fn() };
    const { scene } = fakeScene(undefined, []);
    const lib = registerArt(scene, log);
    expect(lib.available).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("manifest"),
      expect.anything(),
    );
  });

  it("falls back to an empty library and logs when the manifest is corrupt", () => {
    const log = { warn: vi.fn() };
    const { scene } = fakeScene({ version: 1, sheets: "nope" }, []);
    const lib = registerArt(scene, log);
    expect(lib.available).toBe(false);
    expect(log.warn).toHaveBeenCalled();
  });

  it("falls back per sheet when one atlas failed to load", () => {
    const log = { warn: vi.fn() };
    const { scene } = fakeScene(manifest, ["art:props-0"]);
    const lib = registerArt(scene, log);
    expect(lib.has("switch")).toBe(true);
    expect(lib.has("brazier")).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("props-1"),
      expect.anything(),
    );
  });
});
