import { describe, it, expect, vi } from "vitest";
import { ArtLibrary, PLACEHOLDER_TEXTURE } from "./library";
import type { ArtManifest } from "./manifest";

function manifest(): ArtManifest {
  return {
    version: 1,
    tile: { width: 64, height: 32 },
    atlases: {
      "props-0": {
        image: "props-0.png",
        width: 512,
        height: 256,
        sha256: "b".repeat(64),
      },
      "props-1": {
        image: "props-1.png",
        width: 512,
        height: 256,
        sha256: "c".repeat(64),
      },
    },
    sheets: {
      door_x: {
        atlas: "props-0",
        frameWidth: 50,
        frameHeight: 90,
        anchor: { x: 0.5, y: 0.9 },
        directions: 1,
        animations: {
          locked: { fps: 0, loop: false, frames: [[{ x: 0, y: 0 }]] },
          unlocked: { fps: 0, loop: false, frames: [[{ x: 50, y: 0 }]] },
          open: { fps: 0, loop: false, frames: [[{ x: 100, y: 0 }]] },
        },
        source: "procedural",
        licence: "Barrowspire-original",
      },
      ground_grass: {
        atlas: "props-0",
        frameWidth: 64,
        frameHeight: 32,
        anchor: { x: 0.5, y: 0.5 },
        directions: 1,
        animations: {
          variants: {
            fps: 0,
            loop: false,
            frames: [
              [
                { x: 0, y: 100 },
                { x: 64, y: 100 },
                { x: 128, y: 100 },
              ],
            ],
          },
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
          default: { fps: 0, loop: false, frames: [[{ x: 0, y: 0 }]] },
        },
        light: {
          offset: { x: 0, y: -40 },
          radius: 180,
          color: "amber",
          flicker: 0.6,
        },
        source: "procedural",
        licence: "Barrowspire-original",
      },
    },
  };
}

const logger = () => ({ warn: vi.fn() });

describe("ArtLibrary.resolve", () => {
  it("resolves a manifest name to its atlas texture, frame and anchor", () => {
    const lib = new ArtLibrary(manifest(), logger());
    expect(lib.resolve("door_x", { animation: "open" })).toEqual({
      placeholder: false,
      texture: "art:props-0",
      frame: "door_x/open/0/0",
      anchor: { x: 0.5, y: 0.9 },
    });
  });

  it("defaults to the sheet's first animation, direction 0, frame 0", () => {
    const lib = new ArtLibrary(manifest(), logger());
    expect(lib.resolve("door_x")).toMatchObject({ frame: "door_x/locked/0/0" });
  });

  it("wraps a variant index onto the frames the sheet has", () => {
    const lib = new ArtLibrary(manifest(), logger());
    expect(lib.resolve("ground_grass", { index: 4 })).toMatchObject({
      frame: "ground_grass/variants/0/1",
    });
  });

  it("returns a placeholder and logs for an unknown name", () => {
    const log = logger();
    const lib = new ArtLibrary(manifest(), log);
    const frame = lib.resolve("dragon");
    expect(frame.placeholder).toBe(true);
    expect(frame.texture).toBe(PLACEHOLDER_TEXTURE);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("dragon"),
      expect.anything(),
    );
  });

  it("logs a missing name once, not on every frame it is asked for", () => {
    const log = logger();
    const lib = new ArtLibrary(manifest(), log);
    lib.resolve("dragon");
    lib.resolve("dragon");
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it("returns a placeholder for an unknown animation of a known sheet", () => {
    const lib = new ArtLibrary(manifest(), logger());
    expect(lib.resolve("door_x", { animation: "smashed" }).placeholder).toBe(
      true,
    );
  });

  it("returns a placeholder per sheet whose atlas failed to load, and keeps the rest", () => {
    const lib = new ArtLibrary(manifest(), logger(), new Set(["props-0"]));
    expect(lib.resolve("brazier").placeholder).toBe(true);
    expect(lib.has("brazier")).toBe(false);
    expect(lib.resolve("door_x").placeholder).toBe(false);
  });
});

describe("ArtLibrary without a manifest", () => {
  it("is unavailable and resolves everything to the placeholder", () => {
    const lib = ArtLibrary.empty(logger());
    expect(lib.available).toBe(false);
    expect(lib.has("door_x")).toBe(false);
    expect(lib.resolve("door_x").placeholder).toBe(true);
  });
});

describe("ArtLibrary lookups", () => {
  it("exposes a sheet's declared light source", () => {
    const lib = new ArtLibrary(manifest(), logger());
    expect(lib.light("brazier")).toEqual({
      offset: { x: 0, y: -40 },
      radius: 180,
      color: "amber",
      flicker: 0.6,
    });
    expect(lib.light("door_x")).toBeUndefined();
  });

  it("names the animation key only for animations with more than one frame", () => {
    const m = manifest();
    m.sheets.brazier.animations.burn = {
      fps: 8,
      loop: true,
      frames: [
        [
          { x: 40, y: 0 },
          { x: 80, y: 0 },
        ],
      ],
    };
    const lib = new ArtLibrary(m, logger());
    expect(lib.animationKey("brazier", "burn")).toBe("brazier/burn/0");
    expect(lib.animationKey("brazier", "default")).toBeUndefined();
    expect(lib.animationKey("dragon", "walk")).toBeUndefined();
  });
});
