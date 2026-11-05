import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";

// the module reaches Phaser only for its random helpers
vi.mock("phaser", () => ({
  Math: { Between: (lo: number) => lo, FloatBetween: (lo: number) => lo },
}));

const { createAtmosphere } = await import("./atmosphere");
const { viewport } = await import("@/render/viewport");

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
  const object = () => {
    const o: Record<string, unknown> = {};
    for (const m of ["setScrollFactor", "setDepth", "destroy"]) o[m] = () => o;
    return o;
  };
  const scene = {
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
  return { scene: scene as unknown as Phaser.Scene, textures, shutdown };
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
