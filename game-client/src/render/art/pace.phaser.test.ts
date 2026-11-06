import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { RESIDENT_ART_PAGES, artLoaderStandin, shippedManifest } from "./artLoader.standin";
import { atlasTextureKey } from "./library";
import { preloadArt } from "./phaser";
import { SCENE_ART } from "./sceneArt";

/**
 * The hold on `create` (FS-C4JWH A1.3) against the REAL Phaser 4.2.1 scene manager: its own
 * `bootScene` (preload, then its `once(COMPLETE, this.loadComplete, this)`, then `loader.start()`),
 * `loadComplete` and `create` (status CREATING, then RUNNING), on the stand-in's loader. A stand-in
 * manager cannot show that taking the manager's listener off on `START` keeps Phaser's own create
 * from running on the load's completion.
 *
 * Phaser reads the browser as it loads; none of that matters to the scene manager's prototype, so
 * the browser is stood in by an object that answers anything (as `rounding.phaser.test.ts`).
 */
type Manager = {
  bootScene(scene: unknown): void;
  loadComplete(loader: unknown): void;
  create(scene: unknown): void;
};
let SceneManagerProto: Manager;
let LOADING: number;
let RUNNING: number;

const anything = (): unknown =>
  new Proxy(function () {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => 0 : key === "then" ? undefined : anything(),
    apply: () => anything(),
    construct: () => anything() as object,
    set: () => true,
  });

beforeAll(async () => {
  vi.stubGlobal("navigator", { userAgent: "node", maxTouchPoints: 0 });
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", anything());
  vi.stubGlobal("Image", function () {
    return anything();
  });
  vi.stubGlobal("HTMLCanvasElement", function () {});
  vi.stubGlobal("screen", anything());
  const Phaser = await import("phaser");
  expect(Phaser.VERSION).toBe("4.2.1");
  SceneManagerProto = (Phaser.Scenes.SceneManager as unknown as { prototype: Manager }).prototype;
  LOADING = Phaser.Scenes.LOADING;
  RUNNING = Phaser.Scenes.RUNNING;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

/** The hub booted by Phaser's own scene manager, its folk download held by the stand-in. */
function hubBootedByPhaser() {
  const art = artLoaderStandin({
    manifest: shippedManifest(),
    cachedManifest: true,
    textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    hold: true,
  });
  const manager = Object.create(SceneManagerProto) as Manager;
  const order: string[] = [];
  const events = art.scene.events;
  const scene = {
    ...art.scene,
    sys: {
      settings: { status: 0, data: undefined, isTransition: false },
      load: art.scene.load,
      events,
      game: { scene: manager },
    },
    preload() {
      preloadArt(scene as unknown as Phaser.Scene, SCENE_ART.HubScene, {
        bar: () => (order.push(`${Date.now()} bar shown`), { progress: () => undefined, destroy: () => order.push(`${Date.now()} bar destroyed`) }),
        fadeIn: true,
      });
    },
    create() {
      order.push(`${Date.now()} create`);
    },
  };
  // Phaser's loader knows its scene (`LoaderPlugin.scene`), which `loadComplete` creates
  Object.assign(art.scene.load, { scene });
  // the stand-in boots nothing here: Phaser's own bootScene does
  return { art, manager, scene, order };
}

describe("the paced create on Phaser 4.2.1's own scene manager (FS-C4JWH A1.3)", () => {
  it("should hold Phaser's create past the load's completion until the bar is down", () => {
    const { art, manager, scene, order } = hubBootedByPhaser();

    manager.bootScene(scene);
    vi.advanceTimersByTime(400);
    art.finish();
    const atCompletion = scene.sys.settings.status;
    vi.runAllTimers();

    expect(atCompletion).toBe(LOADING);
    expect(order).toEqual(["300 bar shown", "1050 bar destroyed", "1050 create"]);
    expect(scene.sys.settings.status).toBe(RUNNING);
  });

  it("should let Phaser's create run on the load's completion when it ends within the delay", () => {
    const { art, manager, scene, order } = hubBootedByPhaser();

    manager.bootScene(scene);
    vi.advanceTimersByTime(200);
    art.finish();

    expect(order).toEqual(["200 create"]);
    expect(scene.sys.settings.status).toBe(RUNNING);
  });
});
