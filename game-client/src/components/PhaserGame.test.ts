import { afterEach, describe, expect, it, vi } from "vitest";

// Only what the game bridge does as it loads, and as it builds its game, is under test: a Phaser
// stand-in with Phaser 4.2.1's rounding decision (gameobjects/GameObject.js), a Game that records
// its registry, and bare classes for the rest.
vi.mock("phaser", async () => {
  class GameObject {
    vertexRoundMode = "safeAuto";
    willRoundVertices(camera: { roundPixels: boolean }, onlyTranslated: boolean) {
      if (this.vertexRoundMode === "fullAuto") return camera.roundPixels;
      return this.vertexRoundMode === "safeAuto" && onlyTranslated && camera.roundPixels;
    }
  }
  class Scene {
    constructor(_config: unknown) {}
  }
  class ScenePlugin {}
  /** A game as the bridge builds it: its registry, the per-game store a scene reads as `this.registry`. */
  class Game {
    static made: Game[] = [];
    readonly held = new Map<string, unknown>();
    readonly registry = {
      get: (key: string) => this.held.get(key),
      set: (key: string, value: unknown) => void this.held.set(key, value),
    };
    readonly events = { once: () => {}, off: () => {} };
    /** The scenes the game's scene manager was asked for, by key. */
    readonly asked: string[] = [];
    readonly scene = {
      getScene: (key: string) => {
        this.asked.push(key);
        return null;
      },
    };
    constructor(readonly config: unknown) {
      Game.made.push(this);
    }
  }
  // `import * as Phaser` reads the module namespace, so the stand-in is the module itself.
  const phaser = { AUTO: 0, Scale: { NONE: 0 }, Game, Scene, Plugins: { ScenePlugin }, GameObjects: { GameObject } };
  return { ...phaser, default: phaser };
});

// React's hooks as a single call of the component runs them: an effect at once, a ref a plain box,
// so the bridge's effect can be driven without a DOM (vitest runs in node here)
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    useEffect: (effect: () => void) => void effect(),
    useCallback: <T,>(fn: T) => fn,
    useRef: <T,>(initial: T) => ({ current: initial }),
  };
});
// what the game is fitted to and listened on is not under test here
vi.mock("@/render/crispText", () => ({ installCrispText: vi.fn() }));
vi.mock("./gameFocus", () => ({ keepTab: () => () => {}, takeFocusOnPress: () => () => {} }));
vi.mock("./disconnectNotice", () => ({ watchConnectionLoss: () => () => {} }));
vi.mock("@/render/viewport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/render/viewport")>()),
  mountViewport: () => () => {},
}));

describe("the game bridge (ADR-0057: rounding installed once, where the game is configured)", () => {
  it("should round every game object as soon as it is loaded, before any game or scene exists", async () => {
    await import("./PhaserGame");
    const { GameObjects } = (await import("phaser")) as unknown as {
      GameObjects: { GameObject: new () => { willRoundVertices(c: object, o: boolean): boolean } };
    };
    // a quad zoomed by 1.25 is never "only translated"
    expect(new GameObjects.GameObject().willRoundVertices({ roundPixels: true }, false)).toBe(true);
  });
});

// FS-T3DWX R12: the page that owns the game frame lends the frame's fullscreen to the game it builds
describe("the game bridge lends the frame's fullscreen to its game (FS-T3DWX R12)", () => {
  afterEach(() => void vi.unstubAllGlobals());

  /** The page with `doc` for its document, the bridge mounted on a frame, its game built; the frame records its asks. */
  async function built(doc: object) {
    const asked: string[] = [];
    const frame = {
      clientWidth: 1080,
      clientHeight: 720,
      requestFullscreen: async () => void asked.push("request"),
    };
    let paint: (() => void) | undefined;
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", {
      fullscreenElement: null,
      addEventListener() {},
      removeEventListener() {},
      ...doc,
    });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("requestAnimationFrame", (fn: () => void) => ((paint = fn), 1));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { default: PhaserGame } = await import("./PhaserGame");
    const { Game } = (await import("phaser")) as unknown as {
      Game: { made: { registry: { get(key: string): unknown } }[] };
    };
    Game.made.length = 0;
    // the refs the frame's markup would fill, filled as the browser paints it
    const markup = PhaserGame() as unknown as { props: { frame: { current: unknown }; canvas: { current: unknown } } };
    markup.props.frame.current = frame;
    markup.props.canvas.current = {};
    paint?.();
    expect(Game.made).toHaveLength(1);
    return { game: Game.made[0], asked };
  }

  it("should put the frame's fullscreen in the new game's registry, the toggle asking the frame", async () => {
    const { lentFullscreen } = await import("@/ui/gameFullscreen");
    const { game, asked } = await built({ fullscreenEnabled: true });

    const lent = lentFullscreen(game.registry);
    expect(lent).not.toBeNull();
    expect(lent!.active()).toBe(false);
    lent!.toggle();
    expect(asked).toEqual(["request"]);
  });

  it("should lend none where the browser has no fullscreen to offer (FS-T3DWX R7)", async () => {
    const { lentFullscreen } = await import("@/ui/gameFullscreen");
    const { game } = await built({});
    expect(lentFullscreen(game.registry)).toBeNull();
  });
});

// FS-TQZ5J R1, R7, R8: the UI scene in the game's list above every world and under the disconnect
// notice, and one UI bridge per game, lent through its registry
describe("the game bridge's UI scene and UI bridge (FS-TQZ5J R1, R7, R8)", () => {
  afterEach(() => void vi.unstubAllGlobals());

  /** The game the bridge builds on a mounted frame. */
  async function builtGame() {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", { fullscreenElement: null, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("navigator", {});
    let paint: (() => void) | undefined;
    vi.stubGlobal("requestAnimationFrame", (fn: () => void) => ((paint = fn), 1));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { default: PhaserGame } = await import("./PhaserGame");
    const { Game } = (await import("phaser")) as unknown as {
      Game: { made: { config: { scene: unknown[] }; registry: { get(key: string): unknown } }[] };
    };
    Game.made.length = 0;
    const markup = PhaserGame() as unknown as { props: { frame: { current: unknown }; canvas: { current: unknown } } };
    markup.props.frame.current = { clientWidth: 1080, clientHeight: 720 };
    markup.props.canvas.current = {};
    paint?.();
    return Game.made[0];
  }

  // Phaser hands a press to the top scene first and draws in list order: below the worlds, a world
  // would take the UI scene's presses (FS-TQZ5J § Spike findings (a)); the notice stays over all
  it("should list the UI scene after the three world scenes and before the disconnect notice (R1, R7)", async () => {
    const game = await builtGame();
    const { UIScene } = await import("@/scenes/UIScene");
    const { HubScene } = await import("@/scenes/HubScene");
    const { BarrowspireScene } = await import("@/scenes/BarrowspireScene");
    const { FieldScene } = await import("@/scenes/FieldScene");
    const { DisconnectNoticeScene } = await import("@/scenes/DisconnectNoticeScene");
    const at = (scene: unknown) => game.config.scene.indexOf(scene);

    expect(at(UIScene)).toBeGreaterThan(-1);
    for (const world of [HubScene, BarrowspireScene, FieldScene]) expect(at(UIScene)).toBeGreaterThan(at(world));
    expect(at(DisconnectNoticeScene)).toBe(game.config.scene.length - 1);
    expect(at(UIScene)).toBe(at(DisconnectNoticeScene) - 1);
  });

  it("should lend the new game one UI bridge, standing outside the worlds (R8)", async () => {
    const game = await builtGame();
    const { uiBridgeOf } = await import("@/ui/uiBridge");

    const bridge = uiBridgeOf(game.registry);

    expect(bridge).not.toBeNull();
    expect(bridge!.world).toBeNull();
  });

  it("should have the lent bridge's world reports drive this game's UI scene (R2, R3)", async () => {
    const game = (await builtGame()) as unknown as { registry: { get(key: string): unknown }; asked: string[] };
    const { uiBridgeOf } = await import("@/ui/uiBridge");

    const shut = { menu: false, letter: false, party: false, inventory: false, character: false };
    uiBridgeOf(game.registry)!.report({ world: "hub", windows: () => shut });

    expect(game.asked).toContain("UIScene");
  });
});
