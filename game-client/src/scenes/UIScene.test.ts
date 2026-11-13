import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EventEmitter } from "eventemitter3";

// Only the UI scene's own config and its fit are under test: a Phaser stand-in whose Scene records
// the config it was made with, and the scene plugin base ViewportFit extends.
vi.mock("phaser", () => {
  class Scene {
    static configs: unknown[] = [];
    constructor(config: unknown) {
      Scene.configs.push(config);
    }
  }
  class ScenePlugin {
    systems: unknown;
    constructor(scene: { sys: unknown }) {
      this.systems = scene.sys;
    }
  }
  const phaser = {
    Scene,
    Plugins: { ScenePlugin },
    Scenes: { Events: { READY: "ready", DESTROY: "destroy" } },
  };
  return { ...phaser, default: phaser };
});

const Phaser = await import("phaser");
const { UIScene } = await import("./UIScene");
const { UI_SCENE } = await import("@/components/uiSceneLifecycle");
const { ViewportFit } = await import("@/render/viewport/ViewportFit");
const { fitGame, viewport } = await import("@/render/viewport");
const { Viewport } = await import("@/render/viewport/viewport");

/** A camera that records its size and zoom as the viewport fits it. */
function camera() {
  const fitted: string[] = [];
  const cam = {
    width: 0,
    height: 0,
    zoomX: 1,
    displayWidth: 1080,
    displayHeight: 720,
    scrollX: 0,
    scrollY: 0,
    roundPixels: true,
    renderRoundPixels: true,
    useBounds: false,
    setSize: (w: number, h: number) => void fitted.push(`size ${w}x${h}`),
    setZoom: (z: number) => void fitted.push(`zoom ${z}`),
    setOrigin: () => undefined,
    setBounds: () => undefined,
    setScroll: () => undefined,
    setFollowOffset: () => undefined,
    startFollow: () => undefined,
    clampX: (x: number) => x,
    clampY: (y: number) => y,
    preRender: () => undefined,
    getViewMatrix: () => ({ translate: () => undefined }),
    matrixCombined: { translate: () => undefined },
  };
  return { cam, fitted };
}

describe("UIScene (FS-TQZ5J R1, R6)", () => {
  const before = viewport.current();
  afterEach(() => viewport.set(before));

  it("should be the scene keyed UIScene, and name no scene plugins of its own: the game's, ViewportFit among them, are its (R1, R6)", () => {
    const configs = (Phaser.Scene as unknown as { configs: unknown[] }).configs;

    new UIScene();

    // a `plugins` list in a scene's config replaces the game's default scene plugins
    // (Phaser 4.2.1 scene/GetScenePlugins.js), so the UI scene would go unfitted
    expect(configs.at(-1)).toEqual({ key: UI_SCENE });
    expect(UI_SCENE).toBe("UIScene");
  });

  it("should have its camera fitted as it starts, and re-fitted on a render-scale change while it sleeps (R6)", () => {
    const { cam, fitted } = camera();
    const sys = { events: new EventEmitter(), cameras: { main: cam } };
    viewport.set({ width: 1080, height: 720, renderScale: 1.5 });
    new ViewportFit({ sys } as never, {} as never, "viewportFit").boot();

    sys.events.emit("ready");
    expect(fitted).toEqual(["size 1620x1080", "zoom 1.5"]);

    // fitGame re-fits every scene in the game's list, a sleeping one included (getScenes(false))
    const view = new Viewport();
    fitGame(
      {
        scale: { resize: () => undefined, setZoom: () => undefined },
        scene: {
          getScenes: (isActive: boolean) =>
            isActive ? [] : [{ sys: { settings: { status: 7 } }, cameras: { main: cam } }],
        },
      },
      view,
    );
    view.set({ width: 1080, height: 720, renderScale: 2 });

    expect(fitted.slice(2)).toEqual(["size 2160x1440", "zoom 2"]);
  });
});

// FS-TQZ5J R8, R9 and the acceptance criterion "no scene calls another": each world scene reports
// its world as its create runs, and the UI scene knows only the bridge. Pinned from the source, as
// the world scenes' create order is pinned in their own tests.
describe("the worlds and the UI scene know only the UI bridge (FS-TQZ5J R8, R9)", () => {
  const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  const createOf = (file: string) =>
    source(file).match(/\n {2}create\(\): void \{\n([\s\S]*?)\n {2}\}\n/)?.[1] ?? "";

  it.each([
    ["./HubScene.ts", "hub"],
    ["./FieldScene.ts", "field"],
    ["./BarrowspireScene.ts", "run"],
  ])("should have %s report its world, %s, in create", (file, world) => {
    expect(createOf(file)).toContain(`reportWorld(this, "${world}");`);
  });

  it("should have the UI scene import no other scene", () => {
    const imports = source("./UIScene.ts").match(/from "[^"]+"/g) ?? [];
    expect(imports.filter((from) => /Scene"$/.test(from))).toEqual([]);
  });
});
