import { beforeEach, describe, expect, it, vi } from "vitest";
import { BARROW_HEX } from "@/utils/theme";

vi.mock("phaser", async () => {
  const { EventEmitter } = await import("eventemitter3");
  return {
    default: {
      Events: { EventEmitter },
      BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
      Scale: { Events: { RESIZE: "resize" } },
      Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
      WEBGL: 2,
    },
  };
});

const { LightMap } = await import("./LightMap");
const { EventEmitter } = await import("eventemitter3");

interface Stamp {
  x: number;
  y: number;
  tint: number;
  alpha: number;
}

/** A scene double: just what LightMap touches, recording each pool stamp. */
function fakeScene() {
  const stamps: Stamp[] = [];
  const events = new EventEmitter();
  const texture = {
    width: 1080,
    height: 720,
    fill: vi.fn(),
    setSize: vi.fn(),
    stamp: (
      _key: string,
      _frame: unknown,
      x: number,
      y: number,
      cfg: { tint: number; alpha: number },
    ) => {
      stamps.push({ x, y, tint: cfg.tint, alpha: cfg.alpha });
    },
  };
  const image = () => {
    const img: Record<string, unknown> = {};
    for (const m of [
      "setOrigin",
      "setScrollFactor",
      "setDepth",
      "setBlendMode",
      "setVisible",
      "setPosition",
      "setTint",
      "setAlpha",
      "setScale",
      "setSize",
    ])
      img[m] = () => img;
    return img;
  };
  const addDynamicTexture = vi.fn(() => texture);
  const scene = {
    events,
    cameras: {
      main: {
        width: 1080,
        height: 720,
        worldView: { x: 0, y: 0, width: 1080, height: 720 },
      },
    },
    textures: {
      // the falloff and halo canvases exist already; the light-map itself is made here
      exists: (key: string) => key !== "lightmap",
      get: () => texture,
      addDynamicTexture,
    },
    add: { image },
    scale: { on: vi.fn(), off: vi.fn() },
    sys: { renderer: { type: 1 } },
  };
  return { scene, stamps, events, addDynamicTexture };
}

type Scene = ConstructorParameters<typeof LightMap>[0];

describe("LightMap short-lived sources (FS-KYPQ9 §C)", () => {
  let fake: ReturnType<typeof fakeScene>;
  let map: InstanceType<typeof LightMap>;
  const pool = { radius: 100, color: BARROW_HEX.ember, intensity: 0.8 };
  /** The pools stamped by the last update, by position. */
  const stampedAt = () => fake.stamps.map((s) => `${s.x},${s.y}`);
  const frame = (t: number) => {
    fake.stamps.length = 0;
    map.update(t);
  };

  beforeEach(() => {
    fake = fakeScene();
    map = new LightMap(fake.scene as unknown as Scene, BARROW_HEX.slate);
  });

  it("should light at most 16 at once, dropping the oldest first", () => {
    const handles = Array.from({ length: 17 }, (_, i) =>
      map.addTransient({ x: 10 + i, y: 50, ...pool }),
    );
    frame(0);
    expect(fake.stamps).toHaveLength(16);
    expect(stampedAt()).not.toContain("10,50");
    expect(stampedAt()).toContain("26,50");
    expect(handles[0].alive).toBe(false);
    expect(handles[1].alive).toBe(true);
  });

  it("should stamp a short-lived source in its colour while it is alive", () => {
    const light = map.addTransient({ x: 300, y: 200, ...pool });
    frame(0);
    expect(fake.stamps).toEqual([
      expect.objectContaining({ x: 300, y: 200, tint: BARROW_HEX.ember }),
    ]);
    expect(light.alive).toBe(true);
  });

  it("should stamp nothing for it once removed", () => {
    const light = map.addTransient({ x: 300, y: 200, ...pool });
    frame(0);
    light.remove();
    frame(16);
    expect(fake.stamps).toEqual([]);
    expect(light.alive).toBe(false);
  });

  it("should remove itself once its lifetime has run, counted from its first frame", () => {
    const light = map.addTransient({ x: 300, y: 200, ...pool }, 200);
    frame(1000);
    frame(1199);
    expect(stampedAt()).toEqual(["300,200"]);
    frame(1200);
    expect(fake.stamps).toEqual([]);
    expect(light.alive).toBe(false);
  });

  it("should move when its handle moves, and fade with its intensity", () => {
    const light = map.addTransient({ x: 300, y: 200, ...pool });
    frame(0);
    light.x = 340;
    light.y = 230;
    light.intensity = 0.4;
    frame(16);
    expect(fake.stamps).toEqual([
      expect.objectContaining({ x: 340, y: 230, alpha: 0.4 }),
    ]);
  });

  it("should be culled like a fixed source when its pool is out of view", () => {
    map.addTransient({ x: -500, y: 200, ...pool });
    frame(0);
    expect(fake.stamps).toEqual([]);
  });

  it("should never drop fixed sources or the carried pool to make room", () => {
    map.add({ x: 500, y: 500, ...pool, flicker: 0, seed: 1 });
    map.carry({ x: 600, y: 600 });
    for (let i = 0; i < 40; i++) map.addTransient({ x: i, y: 10, ...pool });
    frame(0);
    expect(stampedAt()).toContain("500,500");
    expect(stampedAt()).toContain("600,600");
    expect(fake.stamps).toHaveLength(16 + 2);
  });

  it("should build the light-map texture once and never again", () => {
    for (let i = 0; i < 20; i++) map.addTransient({ x: i, y: 10, ...pool }, 50);
    frame(0);
    frame(100);
    map.clearTransient();
    frame(200);
    expect(fake.addDynamicTexture).toHaveBeenCalledTimes(1);
  });

  it("should clear every short-lived source on clearTransient and on scene SHUTDOWN", () => {
    const a = map.addTransient({ x: 300, y: 200, ...pool });
    map.clearTransient();
    frame(0);
    expect(fake.stamps).toEqual([]);
    expect(a.alive).toBe(false);

    const b = map.addTransient({ x: 300, y: 200, ...pool });
    fake.events.emit("shutdown");
    frame(16);
    expect(fake.stamps).toEqual([]);
    expect(b.alive).toBe(false);
  });

  it("should shrug off a second removal, never taking out another light", () => {
    const a = map.addTransient({ x: 100, y: 100, ...pool }, 50);
    const b = map.addTransient({ x: 200, y: 200, ...pool });
    a.remove();
    a.remove();
    frame(0);
    expect(stampedAt()).toEqual(["200,200"]);

    // a removal after the light-map already let it go: expired, dropped past the cap, cleared
    const expiring = map.addTransient({ x: 300, y: 300, ...pool }, 50);
    frame(100);
    frame(200);
    expect(expiring.alive).toBe(false);
    expiring.remove();
    map.clearTransient();
    b.remove();
    expect(() => b.remove()).not.toThrow();
    const c = map.addTransient({ x: 400, y: 400, ...pool });
    a.remove();
    expiring.remove();
    frame(300);
    expect(stampedAt()).toEqual(["400,400"]);
    expect(c.alive).toBe(true);
  });
});
