import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import type Phaser from "phaser";
import { registerArt, preloadArt, MANIFEST_KEY, type ArtScene } from "./phaser";
import { PLACEHOLDER_TEXTURE, atlasTextureKey } from "./library";

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

/**
 * A loader that behaves as Phaser's does: queuing a key its cache already holds is skipped
 * silently (`LoaderPlugin.keyExists`), so no `filecomplete` event ever fires for it.
 */
function loadingScene(opts: { cachedManifest: boolean; textures: string[] }) {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const images: string[] = [];
  const scene = {
    cache: {
      json: {
        exists: (key: string) => opts.cachedManifest && key === MANIFEST_KEY,
        get: (key: string) => (opts.cachedManifest && key === MANIFEST_KEY ? manifest : undefined),
      },
    },
    textures: { exists: (key: string) => opts.textures.includes(key) },
    load: {
      once: (event: string, fn: (...args: unknown[]) => void) => listeners.set(event, fn),
      json: (key: string) => {
        if (opts.cachedManifest) return; // Phaser: cache conflict, file skipped
        listeners.get(`filecomplete-json-${key}`)?.(key, "json", manifest);
      },
      image: (key: string) => images.push(key),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, images };
}

describe("preloadArt", () => {
  it("should queue every atlas when the manifest loads with the scene", () => {
    const { scene, images } = loadingScene({ cachedManifest: false, textures: [] });
    preloadArt(scene);
    expect(images.sort()).toEqual([atlasTextureKey("props-0"), atlasTextureKey("props-1")].sort());
  });

  // A refresh: the server names the hub while the preload scene is still fetching the atlases,
  // so the hub starts with the manifest cached and the atlases not yet in.
  it("should still queue the atlases not yet loaded when another scene already cached the manifest", () => {
    const { scene, images } = loadingScene({ cachedManifest: true, textures: [atlasTextureKey("props-0")] });
    preloadArt(scene);
    expect(images).toEqual([atlasTextureKey("props-1")]);
  });
});

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

  describe("a sheet spilled over two pages (FS-Q14EV §B.7)", () => {
    const spilled = () => {
      const m = structuredClone(manifest);
      Object.assign(m.sheets.switch.animations.active, {
        atlas: "props-1",
        frames: [[{ x: 100, y: 0 }]],
      });
      return m;
    };

    it("registers each animation's frames on the texture of the page it sits on", () => {
      const { scene, frames } = fakeScene(spilled(), [
        "art:props-0",
        "art:props-1",
      ]);
      registerArt(scene, { warn: vi.fn() });
      expect(frames["art:props-0"]).toEqual(["switch/inactive/0/0"]);
      expect(frames["art:props-1"]).toContain("switch/active/0/0");
    });

    it("skips the whole sheet when one of its pages did not load", () => {
      const { scene, frames } = fakeScene(spilled(), ["art:props-0"]);
      const lib = registerArt(scene, { warn: vi.fn() });
      expect(frames["art:props-0"] ?? []).not.toContain("switch/inactive/0/0");
      expect(lib.has("switch")).toBe(false);
    });
  });
});

/**
 * Phaser's own texture frame (4.2.1, ADR-0057), and the size and origin a sprite takes from one,
 * from the module the game runs: a frame and those components are pure JS, no canvas or WebGL,
 * so a trimmed frame is checked against the real thing. Phaser 4 exports only its bundle (no
 * `phaser/src/...` subpaths), and reads the browser as it loads (device detection, a blend-mode
 * probe image), so the browser is stood in by an object that answers anything, as
 * `render/viewport/rounding.phaser.test.ts` does; none of it reaches a frame or a sprite's size.
 */
interface RealFrame {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  realWidth: number;
  realHeight: number;
  cutX: number;
  cutY: number;
  cutWidth: number;
  cutHeight: number;
  trimmed: boolean;
  setTrim(w: number, h: number, x: number, y: number, dw: number, dh: number): RealFrame;
  setCropUVs(crop: Crop, x: number, y: number, w: number, h: number, flipX: boolean, flipY: boolean): Crop;
}
interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  cw: number;
  ch: number;
}
interface RealSprite {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  displayOriginX: number;
  displayOriginY: number;
  setScale(x: number, y?: number): RealSprite;
  setOrigin(x: number, y: number): RealSprite;
  setSizeToFrame(frame: RealFrame): RealSprite;
}
type PhaserFrameClass = new (
  texture: unknown,
  name: string,
  sourceIndex: number,
  x: number,
  y: number,
  w: number,
  h: number,
) => RealFrame;
type SpriteLikeClass = new (frame: RealFrame) => RealSprite;
let PhaserFrame: PhaserFrameClass;
/** A sprite's sizing as Phaser's `Size` and `Origin` components do it (setFrame → setSizeToFrame). */
let SpriteLike: SpriteLikeClass;

const anything = (): unknown =>
  new Proxy(function () {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => 0 : key === "then" ? undefined : anything(),
    apply: () => anything(),
    construct: () => anything() as object,
    set: () => true,
  });

async function loadPhaser(): Promise<void> {
  vi.stubGlobal("navigator", { userAgent: "node", maxTouchPoints: 0 });
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", anything());
  vi.stubGlobal("Image", function () {
    return anything();
  });
  vi.stubGlobal("HTMLCanvasElement", function () {});
  vi.stubGlobal("screen", anything());
  const phaser = await import("phaser");
  expect(phaser.VERSION).toBe("4.2.1");
  PhaserFrame = phaser.Textures.Frame as unknown as PhaserFrameClass;
  // the class factory and the components are in the bundle, though Phaser's types give the
  // components only as interfaces
  const { Class: PhaserClass, GameObjects } = phaser as unknown as {
    Class: new (definition: object) => SpriteLikeClass;
    GameObjects: { Components: { Size: object; Origin: object } };
  };
  SpriteLike = new PhaserClass({
    Mixins: [GameObjects.Components.Size, GameObjects.Components.Origin],
    initialize: function SpriteLike(
      this: RealSprite & { frame: RealFrame; scaleX: number; scaleY: number; input: null },
      frame: RealFrame,
    ) {
      this.frame = frame;
      this.scaleX = 1;
      this.scaleY = 1;
      this.input = null;
      this.setSizeToFrame(frame);
    },
    setScale(this: RealSprite & { scaleX: number; scaleY: number }, x: number, y = x) {
      this.scaleX = x;
      this.scaleY = y;
      return this;
    },
  });
}

describe("a trimmed sheet's frames (spike/archer-2x)", () => {
  beforeAll(loadPhaser);
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const FRAME = { width: 160, height: 140 };
  const ANCHOR = { x: 0.4, y: 0.75 };
  // two idle frames, each cut to its pixels on whole screen px (the sheet is 2x)
  const cuts = [
    { x: 40, y: 18, w: 64, h: 96 },
    { x: 36, y: 20, w: 72, h: 94 },
  ];
  const sheetManifest = (trimmed: boolean) => ({
    ...manifest,
    atlases: {
      "archer-0": { image: "archer-0.png", width: 512, height: 256, sha256: "f".repeat(64) },
    },
    sheets: {
      archer: {
        atlas: "archer-0",
        frameWidth: FRAME.width,
        frameHeight: FRAME.height,
        scale: 2,
        ...(trimmed ? { trimmed: true } : {}),
        anchor: ANCHOR,
        directions: 1,
        animations: {
          idle: {
            fps: 5,
            loop: true,
            frames: [
              trimmed
                ? [
                    { x: 2, y: 2, trim: cuts[0] },
                    { x: 68, y: 2, trim: cuts[1] },
                  ]
                : [
                    { x: 2, y: 2 },
                    { x: 164, y: 2 },
                  ],
            ],
          },
        },
        source: "authored: test",
        licence: "Barrowspire-original",
      },
    },
  });

  /** Registers the sheet on a scene whose textures make Phaser's real frames. */
  function registered(trimmed: boolean): RealFrame[] {
    const made = new Map<string, RealFrame>();
    const texture = { key: "art:archer-0", source: [{ width: 512, height: 256 }] };
    const scene = {
      cache: { json: { get: (key: string) => (key === MANIFEST_KEY ? sheetManifest(trimmed) : undefined) } },
      textures: {
        exists: () => true,
        get: () => ({
          has: (name: string) => made.has(name),
          add: (name: string, source: number, x: number, y: number, w: number, h: number) => {
            const frame = new PhaserFrame(texture, name, source, x, y, w, h);
            made.set(name, frame);
            return frame;
          },
        }),
      },
      anims: { exists: () => false, create: () => undefined },
      add: { graphics: () => new Proxy({}, { get: () => () => undefined }) },
    } as unknown as ArtScene;
    registerArt(scene, { warn: vi.fn() });
    return ["archer/idle/0/0", "archer/idle/0/1"].map((name) => made.get(name)!);
  }

  it("registers each frame as its cut, put back where it was cut from (Phaser's Frame.setTrim)", () => {
    registered(true).forEach((frame, i) => {
      expect(frame.trimmed).toBe(true);
      expect([frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight]).toEqual([i === 0 ? 2 : 68, 2, cuts[i].w, cuts[i].h]);
      expect([frame.x, frame.y]).toEqual([cuts[i].x, cuts[i].y]);
      expect([frame.realWidth, frame.realHeight]).toEqual([FRAME.width, FRAME.height]);
    });
    for (const frame of registered(false)) expect(frame.trimmed).toBe(false);
  });

  it("gives a sprite the size, display size and origin the whole frame gives it, at the 2x sheet's half scale", () => {
    const [cut, whole] = [registered(true), registered(false)];
    cut.forEach((frame, i) => {
      const a = new SpriteLike(frame).setScale(0.5).setOrigin(ANCHOR.x, ANCHOR.y);
      const b = new SpriteLike(whole[i]).setScale(0.5).setOrigin(ANCHOR.x, ANCHOR.y);
      const look = (s: RealSprite) => [s.width, s.height, s.displayWidth, s.displayHeight, s.displayOriginX, s.displayOriginY];
      expect(look(a)).toEqual(look(b));
      expect(look(a)).toEqual([160, 140, 80, 70, 64, 105]);
      // an arcade body is sized from the frame's real size (Body: `frame.realWidth`)
      expect([frame.realWidth, frame.realHeight]).toEqual([whole[i].realWidth, whole[i].realHeight]);
    });
  });

  it("draws every px of the cut where the whole frame draws it", () => {
    // the renderer draws a frame's texels from (-displayOriginX + frame.x) (Phaser 4's
    // TransformerImage.run: x = -displayOriginX + uvSource.x, the frame's when uncropped)
    const [cut, whole] = [registered(true), registered(false)];
    cut.forEach((frame, i) => {
      // atlas px cutX + k holds frame px (trim.x, or 0) + k, drawn at local x -dox + frame.x + k
      const drawnAt = (framePx: number, f: RealFrame) => {
        const dox = new SpriteLike(f).setOrigin(ANCHOR.x, ANCHOR.y).displayOriginX;
        return -dox + f.x + (framePx - (f.trimmed ? cuts[i].x : 0));
      };
      for (const px of [cuts[i].x, cuts[i].x + 17, cuts[i].x + cuts[i].w - 1])
        expect(drawnAt(px, frame)).toBe(drawnAt(px, whole[i]));
    });
  });

  it("crops a menu portrait to the same frame px, the part outside the cut being clear", () => {
    const [cut, whole] = [registered(true), registered(false)];
    const window = { x: 30, y: 10, w: 88, h: 112 };
    const crop = (f: RealFrame) => f.setCropUVs({} as Crop, window.x, window.y, window.w, window.h, false, false);
    cut.forEach((frame, i) => {
      const a = crop(frame);
      const b = crop(whole[i]);
      // frame px p is atlas px cx + (p - x) in both: the same px drawn at the same place
      expect(a.cx - frame.cutX + cuts[i].x - a.x).toBe(0);
      expect(b.cx - whole[i].cutX - b.x).toBe(0);
      // the cut's crop lies inside the whole frame's: the rest is the frame's clear margin
      expect(a.x).toBeGreaterThanOrEqual(b.x);
      expect(a.y).toBeGreaterThanOrEqual(b.y);
      expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.width);
      expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height);
    });
  });

  it("is cropped by Phaser from the last frame's overlap on a frame change: why MenuFigure sets its window again", () => {
    const [first, second] = registered(true);
    const window = { x: 30, y: 10, w: 88, h: 112 };
    const crop = first.setCropUVs({} as Crop, window.x, window.y, window.w, window.h, false, false);
    expect(crop.x).toBe(cuts[0].x);
    // AnimationState.setCurrentFrame → Frame.updateCropUVs(crop): the window is now the overlap
    second.setCropUVs(crop, crop.x, crop.y, crop.width, crop.height, false, false);
    expect(crop.x).toBe(cuts[0].x);
    const fresh = second.setCropUVs({} as Crop, window.x, window.y, window.w, window.h, false, false);
    expect(fresh.x).toBe(cuts[1].x);
  });
});
