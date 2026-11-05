import { beforeEach, describe, expect, it, vi } from "vitest";
import { BARROW_HEX } from "@/utils/theme";

vi.mock("phaser", async () => {
  const { EventEmitter } = await import("eventemitter3");
  // `import * as Phaser` reads the module namespace, so the stand-in is the module itself.
  const phaser = {
    Events: { EventEmitter },
    BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
    Scale: { Events: { RESIZE: "resize" } },
    Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
    WEBGL: 2,
  };
  return { ...phaser, default: phaser };
});

const { LightMap } = await import("./LightMap");
const { EventEmitter } = await import("eventemitter3");

interface Stamp {
  x: number;
  y: number;
  tint: number;
  alpha: number;
  scale: number;
}

/**
 * A scene double: just what LightMap touches, recording each pool stamp. Its camera is fitted as
 * the viewport fits one (origin 0, zoomed by the render scale, sized to the backing store), and
 * its `worldView` is the wrong one Phaser computes under origin 0, so reading it shows.
 */
function fakeScene(renderScale = 1, scroll = { x: 0, y: 0 }) {
  const stamps: Stamp[] = [];
  const events = new EventEmitter();
  /** The light-map textures made, in order: the last is the live one. */
  const made: { width: number; height: number; destroyed: boolean }[] = [];
  const makeTexture = (width: number, height: number) => {
    const t = {
      width,
      height,
      destroyed: false,
      fill: vi.fn(),
      destroy: () => void (t.destroyed = true),
      stamp: (
        _key: string,
        _frame: unknown,
        x: number,
        y: number,
        cfg: { tint: number; alpha: number; scale: number },
      ) => {
        stamps.push({ x, y, tint: cfg.tint, alpha: cfg.alpha, scale: cfg.scale });
      },
    };
    made.push(t);
    return t;
  };
  /** The light-map's own image: where it stands, and how it is scaled. */
  const placed = { origin: [-1, -1], scale: 1, size: [0, 0], textures: 0 };
  const image = (_x: number, _y: number, key: string) => {
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
    if (key === "lightmap") {
      img.setOrigin = (x: number, y: number) => ((placed.origin = [x, y]), img);
      img.setScale = (k: number) => ((placed.scale = k), img);
      img.setSize = (w: number, h: number) => ((placed.size = [w, h]), img);
      img.setTexture = () => (placed.textures++, img);
    }
    return img;
  };
  const addDynamicTexture = vi.fn((_key: string, w: number, h: number) => makeTexture(w, h));
  const scene = {
    events,
    cameras: {
      main: {
        width: Math.round(1080 * renderScale),
        height: Math.round(720 * renderScale),
        zoomX: renderScale,
        scrollX: scroll.x,
        scrollY: scroll.y,
        displayWidth: 1080,
        displayHeight: 720,
        worldView: { x: 9999, y: 9999, width: 1, height: 1 },
      },
    },
    textures: {
      // the falloff and halo canvases exist already; the light-map itself is made here
      exists: (key: string) => key !== "lightmap" || made.some((t) => !t.destroyed),
      get: () => made.at(-1),
      addDynamicTexture,
    },
    add: { image },
    scale: { on: vi.fn(), off: vi.fn() },
    sys: { renderer: { type: 1 } },
  };
  return {
    scene,
    stamps,
    events,
    addDynamicTexture,
    made,
    get texture() {
      return made.at(-1)!;
    },
    placed,
  };
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

  it("should keep a hidden source but stamp nothing for it until it is shown (FS-9PN7X §C.2)", () => {
    const light = map.addTransient({ x: 300, y: 200, ...pool });
    light.hidden = true;
    frame(0);
    expect(fake.stamps).toEqual([]);
    expect(light.alive).toBe(true);
    light.hidden = false;
    frame(16);
    expect(fake.stamps).toEqual([expect.objectContaining({ x: 300, y: 200 })]);
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

describe("LightMap fixed sources removed one at a time (FS-9PN7X §D.6)", () => {
  const pool = { radius: 100, color: BARROW_HEX.ember, intensity: 0.8, flicker: 0, seed: 1 };

  it("should stamp a removed fixed source no more, and leave the rest and an unknown source be", () => {
    const fake = fakeScene();
    const map = new LightMap(fake.scene as unknown as Scene, BARROW_HEX.slate);
    const kept = { x: 100, y: 100, ...pool };
    const gone = { x: 200, y: 200, ...pool };
    map.add(kept);
    map.add(gone, () => true);
    map.remove(gone);
    map.remove({ x: 300, y: 300, ...pool });
    map.update(0);
    expect(fake.stamps.map((s) => `${s.x},${s.y}`)).toEqual(["100,100"]);
  });
});

describe("LightMap at a render scale (FS-ZAJMH R6: follows the backing store, aligned with the world)", () => {
  const pool = { radius: 100, color: BARROW_HEX.ember, intensity: 0.8, flicker: 0, seed: 1 };

  it.each([1, 1.5, 2])("should be as big as the backing store at render scale %s, drawn back over the logical view", (rs) => {
    const fake = fakeScene(rs);
    const map = new LightMap(fake.scene as unknown as Scene, BARROW_HEX.slate);
    map.update(0);
    expect([fake.texture.width, fake.texture.height]).toEqual([Math.round(1080 * rs), Math.round(720 * rs)]);
    expect(fake.placed.origin).toEqual([0, 0]);
    expect(fake.placed.scale).toBe(1 / rs);
  });

  it("should stamp each pool at its place in the view, in backing px, as big as the world draws it", () => {
    const fake = fakeScene(2, { x: 100, y: 50 });
    const map = new LightMap(fake.scene as unknown as Scene, BARROW_HEX.slate);
    map.add({ x: 300, y: 200, ...pool });
    // outside the view the camera really shows (100..1180, 50..770): culled
    map.add({ x: 1500, y: 200, ...pool });
    map.update(0);
    const [stamp] = fake.stamps;
    expect(fake.stamps).toHaveLength(1);
    expect([stamp.x, stamp.y]).toEqual([400, 300]);
    const atOne = fakeScene(1, { x: 100, y: 50 });
    const flat = new LightMap(atOne.scene as unknown as Scene, BARROW_HEX.slate);
    flat.add({ x: 300, y: 200, ...pool });
    flat.update(0);
    expect(stamp.scale).toBeCloseTo(atOne.stamps[0].scale * 2);
  });

  // Phaser 3.90's DynamicTexture.setSize leaves its GL target at the old size (seen in a headless
  // harness: the pools stamped at the new size missed), so a new size is a new texture.
  it("should follow a re-fit to another render scale on the next frame, on a texture made at the new size", () => {
    const fake = fakeScene(1);
    const map = new LightMap(fake.scene as unknown as Scene, BARROW_HEX.slate);
    map.update(0);
    Object.assign(fake.scene.cameras.main, { width: 2160, height: 1440, zoomX: 2 });
    map.update(16);
    expect(fake.made.map((t) => [t.width, t.height, t.destroyed])).toEqual([
      [1080, 720, true],
      [2160, 1440, false],
    ]);
    expect(fake.placed.textures).toBe(1);
    expect(fake.placed.scale).toBe(0.5);
  });

  it("should make its texture afresh when a scene starts at another render scale than the last", () => {
    const fake = fakeScene(1);
    new LightMap(fake.scene as unknown as Scene, BARROW_HEX.slate);
    Object.assign(fake.scene.cameras.main, { width: 1620, height: 1080, zoomX: 1.5 });
    new LightMap(fake.scene as unknown as Scene, BARROW_HEX.slate);
    expect(fake.made.map((t) => [t.width, t.height, t.destroyed])).toEqual([
      [1080, 720, true],
      [1620, 1080, false],
    ]);
  });
});
