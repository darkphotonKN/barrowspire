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
    Scenes: { Events: { READY: "ready", DESTROY: "destroy", SHUTDOWN: "shutdown" } },
  };
  return { ...phaser, default: phaser };
});

const Phaser = await import("phaser");
const { UIScene } = await import("./UIScene");
const { UI_SCENE } = await import("@/components/uiSceneLifecycle");
const { ViewportFit } = await import("@/render/viewport/ViewportFit");
const { fitGame, viewport } = await import("@/render/viewport");
const { Viewport } = await import("@/render/viewport/viewport");
const { GameUiBridge, lendUiBridge } = await import("@/ui/uiBridge");
const { cornerIconFrame } = await import("@/ui/hudCornerLayout");

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

// FS-TQZ5J R22: the game's one UiSounds is the UI scene's, made as it is created and lent to its
// game's UI bridge, which the worlds' player actions and their minimap's step reach it through
describe("the UI scene's interface sounds (FS-TQZ5J R22, FS-WDM0X S10–S13)", () => {
  /** The UI scene on its game: the registry with the bridge lent, the game's audio cache and sound. */
  function created() {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const added: string[] = [];
    const played: string[] = [];
    // the corner row it builds for the world reported, on a factory that makes anything
    const any: unknown = new Proxy(() => any, { get: (_t, prop) => (prop === "then" ? undefined : () => any) });
    const scene = Object.assign(new UIScene(), {
      registry,
      events: new EventEmitter(),
      add: any,
      cache: { audio: { exists: (key: string) => key.startsWith("sfx:") } },
      sound: {
        locked: false,
        context: { state: "running" },
        get: () => null,
        add: (key: string) => (added.push(key), { play: () => (played.push(key), true) }),
      },
    });
    scene.create();
    return { bridge, added, played };
  }

  it("should make the game's one player as it is created, lent to its game's bridge: a world's action and its minimap's step play on it", () => {
    const { bridge, played } = created();
    let open = false;
    const closed = { menu: false, letter: false, party: false, character: false };
    bridge.report({
      world: "field",
      windows: () => ({ ...closed, inventory: open }),
      blockers: () => ({ dialogue: false }),
      answer: () => {},
    });

    bridge.act(() => void (open = true));
    bridge.play("map_mode_switch");

    expect(played).toEqual(["sfx:inventory_open", "sfx:map_mode_switch"]);
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
    expect(createOf(file)).toContain(`this.ui = reportWorld(this, "${world}", this.worldSide());`);
  });

  // FS-TQZ5J § Acceptance Criteria: the world scenes no longer construct UiSounds (R22)
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s construct no UiSounds and keep no player of its own",
    (file) => {
      expect(source(file)).not.toMatch(/new UiSounds\(|mountUiSounds|this\.sounds\b/);
    },
  );

  // FS-TQZ5J R13, R15 and § Acceptance Criteria: the corner row is the UI scene's; no world builds it,
  // tests its rect in a click path, or leaves its Menu plate through its blocker
  it.each(["./HubScene.ts", "./FieldScene.ts", "./BarrowspireScene.ts"])(
    "should have %s construct no HudCorner and read no corner row",
    (file) => {
      expect(source(file)).not.toMatch(/HudCorner|this\.corner\b|mountCorner/);
    },
  );

  it("should have the UI scene import no other scene", () => {
    const imports = source("./UIScene.ts").match(/from "[^"]+"/g) ?? [];
    expect(imports.filter((from) => /Scene"$/.test(from))).toEqual([]);
  });
});

// FS-TQZ5J §C R13–R15 (I-TQZ5J-3): the corner row is the UI scene's own, built as it is created from
// the world reported then, rebuilt on each world's report, taken down as the world leaves, and held
// each frame while the world reports its own ESC menu open (until the menu moves, I-TQZ5J-4).
describe("the UI scene's corner row (FS-TQZ5J R6, R13; I-TQZ5J-3)", () => {
  type Obj = Record<string, unknown>;
  interface Zone {
    x: number;
    y: number;
    handlers: Record<string, () => void>;
    enabled: boolean;
    destroyed: boolean;
  }
  interface Label {
    words: string;
    resolution: number;
    destroyed: boolean;
  }

  /** The UI scene on its game, on a stand-in for Phaser's factory that keeps a display list. */
  function created(world?: "hub" | "field" | "run") {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const windows = { menu: false, letter: false, party: false, inventory: false, character: false };
    const blockers = { dialogue: false };
    const report = (w: "hub" | "field" | "run") =>
      bridge.report({ world: w, windows: () => windows, blockers: () => blockers, answer: () => {} });
    if (world) report(world);
    const list: unknown[] = [];
    const zones: Zone[] = [];
    const labels: Label[] = [];
    /** Anything else it makes: every call returns it, chained. */
    const any = (): unknown => {
      const self: unknown = new Proxy(() => self, {
        get: (_t, prop) => (prop === "then" ? undefined : () => self),
      });
      list.push(self);
      return self;
    };
    const zone = (x: number, y: number) => {
      const z: Zone = { x, y, handlers: {}, enabled: false, destroyed: false };
      zones.push(z);
      const self: Obj = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "on") return (event: string, fn: () => void) => ((z.handlers[event] = fn), self);
            if (prop === "setInteractive") return () => ((z.enabled = true), self);
            if (prop === "disableInteractive") return () => ((z.enabled = false), self);
            if (prop === "setPosition") return (nx: number, ny: number) => ((z.x = nx), (z.y = ny), self);
            if (prop === "destroy") return () => void (z.destroyed = true);
            return () => self;
          },
        },
      );
      list.push(self);
      return self;
    };
    const text = (_x: number, _y: number, words: string) => {
      const l: Label = { words, resolution: 1, destroyed: false };
      labels.push(l);
      const self: Obj = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "width") return words.length * 6;
            if (prop === "style") return { resolution: l.resolution };
            if (prop === "setResolution") return (r: number) => ((l.resolution = r), self);
            if (prop === "destroy") return () => void ((l.destroyed = true), list.splice(list.indexOf(self), 1));
            return () => self;
          },
        },
      );
      list.push(self);
      return self;
    };
    const events = new EventEmitter();
    const sys = { settings: { status: 5 } };
    const scene = Object.assign(new UIScene(), {
      registry,
      events,
      sys,
      children: { list },
      add: new Proxy({}, { get: (_t, kind) => (kind === "zone" ? zone : kind === "text" ? text : any) }),
      cache: { audio: { exists: () => false } },
      sound: { locked: false, context: { state: "running" }, get: () => null, add: () => ({ play: () => true }) },
    });
    scene.create();
    const live = () => zones.filter((z) => !z.destroyed);
    const plate = (icon: "menu" | "inventory" | "character" | "party" | "mail") => {
      const f = cornerIconFrame(icon, viewport);
      return live().find((z) => z.x === f.x && z.y === f.y);
    };
    return { scene, bridge, report, windows, blockers, events, sys, live, plate, labels };
  }

  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should build the row of the world reported as it is created: the town's four, no Mailbox of its own", () => {
    const { live, plate } = created("hub");

    expect(live()).toHaveLength(4);
    expect(plate("mail")).toBeUndefined();
  });

  it("should build each later world's row on its report, and take the row down as it leaves", () => {
    const { bridge, report, live, plate } = created("hub");
    bridge.left("hub");
    expect(live()).toEqual([]);

    report("field");

    expect(live()).toHaveLength(5);
    expect(plate("mail")).toBeDefined();
  });

  it("should build nothing as it is created with no world reported", () => {
    const { live } = created();

    expect(live()).toEqual([]);
  });

  it("should hold every icon but Menu on its update while the world reports its menu open, and let them go once shut", () => {
    const { scene, windows, plate } = created("run");
    windows.menu = true;
    scene.update();
    expect(plate("inventory")!.enabled).toBe(false);
    expect(plate("menu")!.enabled).toBe(true);

    windows.menu = false;
    scene.update();
    expect(plate("inventory")!.enabled).toBe(true);
  });

  it("should hold every icon, Menu too, on its update while the town reports a dialogue open (its answers lie under the row)", () => {
    const { scene, blockers, live } = created("hub");
    blockers.dialogue = true;
    scene.update();

    expect(live().every((z) => !z.enabled)).toBe(true);
  });

  it("should stop hearing the worlds with the game: a report after its destroy builds nothing (R4)", () => {
    const { bridge, report, events, live } = created("hub");
    events.emit("destroy");
    expect(live()).toEqual([]);
    bridge.left("hub");

    report("field");

    expect(live()).toEqual([]);
  });

  it("should stand the row in the new corner when the view widens (R6; FS-ZAJMH R13)", () => {
    const { plate } = created("field");

    viewport.set({ width: 1280, height: 720, renderScale: 1 });

    expect(plate("menu")?.x).toBe(1280 - 16 - 54);
  });

  // crispen walks every scene started and not stopped (50c41e6b): the row's label, left showing as
  // the UI scene is held under the disconnect notice or put to sleep, is rasterised again at a
  // render scale set meanwhile, so it is sharp as the scene resumes or wakes
  it.each([
    ["paused under the disconnect notice", 6],
    ["asleep", 7],
  ])("should have the row's label rasterised again at a new render scale while the UI scene is %s (R6)", (_how, status) => {
    const { scene, sys, plate, labels } = created("hub");
    plate("inventory")!.handlers.pointerover();
    expect(labels.filter((l) => !l.destroyed).map((l) => l.words)).toEqual(["Inventory (I)"]);
    sys.settings.status = status;
    const view = new Viewport();
    fitGame(
      {
        scale: { resize: () => undefined, setZoom: () => undefined },
        scene: { getScenes: () => [scene as never] },
      },
      view,
    );

    view.set({ width: 1080, height: 720, renderScale: 2 });

    expect(labels.find((l) => !l.destroyed)!.resolution).toBe(2);
  });
});

// FS-TQZ5J Amendment A1 (I-TQZ5J-6): the UI scene's pointer beside the worlds', wired to Phaser's own
// scene-wide events on its input. The rules are uiScenePointer.ts's; the harness proves them against
// real Phaser 4.2.1.
describe("the UI scene's pointer beside the worlds' (FS-TQZ5J A1 R25–R27)", () => {
  /** The UI scene on its game, its input and cameras stand-ins, a world reported that hears moves. */
  function created() {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    const heard: string[] = [];
    bridge.report({
      world: "run",
      windows: () => ({ menu: false, letter: false, party: false, inventory: false, character: false }),
      blockers: () => ({ dialogue: false }),
      answer: () => {},
      hearMove: (_pointer, onUi) => void heard.push(onUi ? "over the UI" : "off it"),
    });
    const any: unknown = new Proxy(() => any, { get: (_t, prop) => (prop === "then" ? undefined : () => any) });
    const pointer = { x: 900, y: 680, isDown: false, event: {} as object };
    const input = Object.assign(new EventEmitter(), { manager: { pointers: [pointer] } });
    const cameras = { cameras: [{ inputEnabled: true }] };
    // the game's text field inside the frame, holding focus
    const field = { blurred: false, blur: () => void (field.blurred = true) };
    const holder = { contains: (el: unknown) => el === field };
    const body = {};
    vi.stubGlobal("document", { activeElement: field, body, documentElement: {} });
    const scene = Object.assign(new UIScene(), {
      registry,
      events: new EventEmitter(),
      add: any,
      input,
      cameras,
      game: { canvas: { parentElement: holder } },
      cache: { audio: { exists: () => false } },
      sound: { locked: false, context: { state: "running" }, get: () => null, add: () => ({ play: () => true }) },
    });
    scene.create();
    return { scene, input, cameras, pointer, field, heard };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("should take its cameras out of the hit test for a press begun in the world, and put them back as it ends (R25)", () => {
    const { input, cameras, pointer } = created();

    pointer.isDown = true;
    input.emit("pointerdown", pointer, []);
    expect(cameras.cameras[0].inputEnabled).toBe(false);

    pointer.isDown = false;
    input.emit("pointerup", pointer, []);
    expect(cameras.cameras[0].inputEnabled).toBe(true);

    pointer.isDown = true;
    input.emit("pointerdown", pointer, []);
    pointer.isDown = false;
    input.emit("pointerupoutside", pointer);
    expect(cameras.cameras[0].inputEnabled).toBe(true);
  });

  it("should put them back on a frame with no button down", () => {
    const { scene, input, cameras, pointer } = created();
    pointer.isDown = true;
    input.emit("pointerdown", pointer, []);
    pointer.isDown = false;

    scene.update();

    expect(cameras.cameras[0].inputEnabled).toBe(true);
  });

  it("should let go of the game's focused text field for a press on one of its pieces (R26)", () => {
    const { input, pointer, field } = created();

    input.emit("pointerdown", pointer, [{ name: "the Party icon" }]);

    expect(field.blurred).toBe(true);
  });

  it("should hand the reported world a move over one of its pieces, and one leaving it (R27)", () => {
    const { input, pointer, heard } = created();

    input.emit("pointermove", pointer, [{ name: "the Party icon" }]);
    pointer.event = {};
    input.emit("pointermove", pointer, []);
    input.emit("pointerout", pointer, [{ name: "the Party icon" }]);

    expect(heard).toEqual(["over the UI", "off it"]);
  });
});
