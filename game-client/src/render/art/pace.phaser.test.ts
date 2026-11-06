import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type Phaser from "phaser";
import {
  RESIDENT_ART_PAGES,
  artLoaderStandin,
  shippedManifest,
} from "./artLoader.standin";
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
let SceneManagerProto: Manager & { stop(key: unknown): void };
let SystemsShutdown: (this: unknown, data?: unknown) => void;
let ClockClass: new (scene: unknown) => {
  _active: unknown[];
  _pendingInsertion: unknown[];
};
let LOADING: number;
let RUNNING: number;
let SHUTDOWN: number;

const anything = (): unknown =>
  new Proxy(function () {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive
        ? () => 0
        : key === "then"
          ? undefined
          : anything(),
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
  SceneManagerProto = (
    Phaser.Scenes.SceneManager as unknown as {
      prototype: typeof SceneManagerProto;
    }
  ).prototype;
  SystemsShutdown = (
    Phaser.Scenes.Systems as unknown as {
      prototype: { shutdown: typeof SystemsShutdown };
    }
  ).prototype.shutdown;
  ClockClass = Phaser.Time.Clock as unknown as typeof ClockClass;
  LOADING = Phaser.Scenes.LOADING;
  RUNNING = Phaser.Scenes.RUNNING;
  SHUTDOWN = Phaser.Scenes.SHUTDOWN;
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
        bar: () => (
          order.push(`${Date.now()} bar shown`),
          {
            progress: () => undefined,
            destroy: () => order.push(`${Date.now()} bar destroyed`),
          }
        ),
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
    expect(order).toEqual([
      "300 bar shown",
      "1050 bar destroyed",
      "1050 create",
    ]);
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

/**
 * The hub booted by Phaser's own scene manager on Phaser's own Clock (`time/Clock.js`, stepped
 * here frame by frame as `SceneManager.update` steps a LOADING scene), stopped by Phaser's own
 * `SceneManager.stop` → `Systems.shutdown`. The stand-in's loader resets and drops its listeners on
 * that SHUTDOWN, as `LoaderPlugin.shutdown` does.
 */
function hubOnPhasersClock(opts: { removalFails?: boolean } = {}) {
  const art = artLoaderStandin({
    manifest: shippedManifest(),
    cachedManifest: true,
    textures: RESIDENT_ART_PAGES.map(atlasTextureKey),
    hold: true,
  });
  const manager = Object.assign(
    Object.create(SceneManagerProto) as typeof SceneManagerProto,
    { scenes: [] as unknown[] },
  );
  const events = art.scene.events;
  const order: string[] = [];
  let now = 0;
  const sys = {
    settings: {
      status: 0,
      data: undefined,
      isTransition: false,
      active: true,
      visible: true,
    },
    load: art.scene.load,
    events,
    game: { scene: manager, loop: { time: 0 } },
    isTransitioning: () => false,
    shutdown(data?: unknown) {
      SystemsShutdown.call(sys, data);
    },
  };
  const scene: Record<string, unknown> = {
    ...art.scene,
    sys,
    preload() {
      preloadArt(scene as unknown as Phaser.Scene, SCENE_ART.HubScene, {
        bar: () => (
          order.push(`${now} bar shown`),
          {
            progress: () => undefined,
            destroy: () => order.push(`${now} bar destroyed`),
          }
        ),
        fadeIn: true,
      });
    },
    create() {
      order.push(`${now} create`);
    },
  };
  const clock = new ClockClass(scene);
  scene.time = clock;
  manager.scenes.push(scene);
  Object.assign(art.scene.load, { scene });
  events.once("shutdown", () => {
    art.scene.load.reset();
    art.scene.load.removeAllListeners();
  });
  if (opts.removalFails) {
    // as if a Phaser upgrade attached the manager's listener some other way: the removal misses it
    const off = art.scene.load.off.bind(art.scene.load);
    art.scene.load.off = ((event: string, ...rest: unknown[]) =>
      event === "complete"
        ? art.scene.load
        : off(event, ...(rest as []))) as typeof art.scene.load.off;
  }
  // Systems.start: the clock boots and starts before the scene manager boots the scene
  events.emit("boot");
  events.emit("start");
  const frames = (ms: number) => {
    for (const end = now + ms; now < end; ) {
      now += 10;
      events.emit("preupdate", now, 10);
      events.emit("update", now, 10);
    }
  };
  const pending = () => clock._active.length + clock._pendingInsertion.length;
  return { art, manager, scene, sys, order, frames, pending };
}

describe("the paced create on Phaser 4.2.1's own Clock, stopped by its own SceneManager.stop (FS-C4JWH A1.8)", () => {
  it("should enter on Phaser's clock as it does on the stand-in's", () => {
    const { art, manager, scene, sys, order, frames } = hubOnPhasersClock();

    manager.bootScene(scene);
    frames(400);
    art.finish();
    frames(1000);

    expect(order).toEqual([
      "300 bar shown",
      "1050 bar destroyed",
      "1050 create",
    ]);
    expect(sys.settings.status).toBe(RUNNING);
  });

  it.each([
    ["while it still downloads", false],
    ["while the bar waits out its 600 ms after the load", true],
  ])(
    "should never create, and leave no timer on the clock, when stopped %s",
    (_when, loadedFirst) => {
      const { art, manager, scene, sys, order, frames, pending } =
        hubOnPhasersClock();

      manager.bootScene(scene);
      frames(400);
      if (loadedFirst) art.finish();
      frames(100);
      manager.stop(scene);
      art.finish();
      frames(2000);

      expect(order).toEqual(["300 bar shown"]);
      expect(sys.settings.status).toBe(SHUTDOWN);
      expect(pending()).toBe(0);
    },
  );

  // S1: a removal that misses degrades to creating on the load's completion, never twice
  it("should create once, on the load's completion, when taking the manager's listener off misses", () => {
    const { art, manager, scene, sys, order, frames } = hubOnPhasersClock({
      removalFails: true,
    });

    manager.bootScene(scene);
    frames(400);
    art.finish();
    frames(1000);

    expect(order.filter((o) => o.endsWith("create"))).toEqual(["400 create"]);
    expect(sys.settings.status).toBe(RUNNING);
  });
});
