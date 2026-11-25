import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";

// the module reaches Phaser only for its random helpers
vi.mock("phaser", () => ({
  Math: { Between: (lo: number) => lo, FloatBetween: (lo: number) => lo },
}));

const { createAtmosphere } = await import("./atmosphere");
const { WORLD_ZOOM, viewport, zoomWorld } = await import("@/render/viewport");

/** A canvas as far as the vignette paints it. */
function fakeCanvas() {
  const grad = { addColorStop: () => undefined };
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      createRadialGradient: () => grad,
      fillRect: () => undefined,
      fillStyle: undefined as unknown,
    }),
  };
}

/** A scene whose texture manager holds what is added until it is removed, as Phaser's does. */
function fakeScene() {
  const textures = new Map<string, ReturnType<typeof fakeCanvas>>();
  const handlers = new Map<string, Set<() => void>>();
  /** Every image and circle made, where and at what scale. */
  const made: { x: number; y: number; scale: number }[] = [];
  const object = (x: number, y: number) => {
    const o: Record<string, unknown> = {};
    const at = { x, y, scale: 1 };
    made.push(at);
    for (const m of ["setScrollFactor", "setDepth", "destroy"]) o[m] = () => o;
    o.setScale = (scale: number) => ((at.scale = scale), o);
    return o;
  };
  /** The scene's main camera, as far as a fit drives it. */
  const main = {
    width: 0,
    height: 0,
    zoomX: 1,
    roundPixels: true,
    setSize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    setZoom(z: number) {
      this.zoomX = z;
    },
    setOrigin: () => undefined,
    preRender: () => undefined,
  };
  const scene = {
    cameras: { main },
    textures: {
      exists: (key: string) => textures.has(key),
      get: (key: string) => ({ getSourceImage: () => textures.get(key) }),
      addCanvas: (key: string, canvas: ReturnType<typeof fakeCanvas>) =>
        void textures.set(key, canvas),
      remove: (key: string) => textures.delete(key),
    },
    add: { image: object, circle: object },
    tweens: { add: () => undefined, killTweensOf: () => undefined },
    events: {
      once: (event: string, fn: () => void) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(fn);
      },
      off: (event: string, fn: () => void) => handlers.get(event)?.delete(fn),
    },
  };
  /** The scene stops: what listened for it lets go. */
  const shutdown = () => {
    for (const fn of [...(handlers.get("shutdown") ?? [])]) fn();
  };
  return { scene: scene as unknown as Phaser.Scene, textures, shutdown, made, main };
}

describe("createAtmosphere's vignette (FS-ZAJMH R13: rebuilt for each new view)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => fakeCanvas() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
  });

  it("should keep one vignette texture however many widths the view settles at, painted at the latest", () => {
    const { scene, textures, shutdown } = fakeScene();
    createAtmosphere(scene);
    for (const width of [1100, 1180, 1240, 1280]) {
      viewport.set({ width, height: 720, renderScale: 1 });
    }
    expect(textures.size).toBe(1);
    const [painted] = textures.values();
    expect([painted.width, painted.height]).toEqual([1280, 720]);
    shutdown();
  });

  it("should reuse the texture while the view keeps its size", () => {
    const { scene, textures, shutdown } = fakeScene();
    createAtmosphere(scene);
    const [first] = textures.values();
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    createAtmosphere(scene);
    expect([...textures.values()]).toEqual([first]);
    shutdown();
  });
});

describe("createAtmosphere on a world camera that stands closer (FS-ZAJMH § Change: Closer world camera)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => fakeCanvas() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
  });

  it("should lay the vignette and the dust out at 1/WORLD_ZOOM, so the zoomed camera draws them over the screen as before", () => {
    const { scene, made, main, shutdown } = fakeScene();
    zoomWorld(main as never, WORLD_ZOOM);
    createAtmosphere(scene);
    const [vignette, ...dust] = made;
    // drawn at (zoom × place): the vignette's middle is the view's, its size the view's
    expect(vignette.x * WORLD_ZOOM).toBeCloseTo(1080 / 2, 10);
    expect(vignette.y * WORLD_ZOOM).toBeCloseTo(720 / 2, 10);
    expect(vignette.scale * WORLD_ZOOM).toBeCloseTo(1, 10);
    expect(dust.length).toBeGreaterThan(0);
    for (const mote of dust) expect(mote.scale * WORLD_ZOOM).toBeCloseTo(1, 10);
    shutdown();
  });

  it("should lay them out at the view itself on a camera at the render scale", () => {
    const { scene, made, shutdown } = fakeScene();
    createAtmosphere(scene);
    expect(made[0]).toEqual({ x: 540, y: 360, scale: 1 });
    shutdown();
  });
});
