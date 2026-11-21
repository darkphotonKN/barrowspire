import { EventEmitter } from "eventemitter3";

/**
 * Test-only: what a scene test hands `vi.mock("phaser", ...)`, so the scene suites share one Phaser
 * stand-in instead of each hand-rolling its own.
 *
 *   vi.mock("phaser", async () => (await import("./phaser.standin")).phaserStandIn());
 *
 * The stand-in holds the scene base class on the same emitter Phaser builds scene events from, the
 * event names, key codes and `JustDown` the scenes poll with, and the math and geometry they draw
 * with. With `absorbing`, any other namespace answers every read and call (`absorbing()`), so a
 * scene's whole `create()` can run on it.
 */
export function phaserStandIn({ absorbing: absorbs = false }: { absorbing?: boolean } = {}) {
  class Scene {
    events = new EventEmitter();
    constructor(_config: unknown) {}
  }
  class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
    static Contains(): boolean {
      return true;
    }
  }
  const phaser: Record<string, unknown> = {
    Scene,
    Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy", WAKE: "wake", SLEEP: "sleep" } },
    Scale: { Events: { RESIZE: "resize" } },
    Core: { Events: { BLUR: "blur", HIDDEN: "hidden" } },
    Animations: { Events: { ANIMATION_COMPLETE: "animationcomplete" } },
    GameObjects: { Sprite: class {} },
    BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
    Geom: { Rectangle },
    Input: {
      Keyboard: {
        // Phaser's JustDown: true once per press, and reading it clears the press
        JustDown: (key: { justDown: boolean }) => {
          const pressed = key.justDown;
          key.justDown = false;
          return pressed;
        },
        // the codes the scenes bind, as Phaser's KeyCodes has them
        KeyCodes: { W: 87, A: 65, S: 83, D: 68, TAB: 9, ESC: 27, ENTER: 13, ONE: 49, TWO: 50 },
      },
    },
    Math: {
      Linear: (a: number, b: number, t: number) => a + (b - a) * t,
      Between: () => 0,
      FloatBetween: () => 0,
      Distance: {
        Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1),
      },
    },
  };
  if (!absorbs) return { ...phaser, default: phaser };
  const any = absorbing();
  const open = new Proxy(phaser, { get: (t, k) => (typeof k === "string" && !(k in t) ? any : t[k as string]) });
  return { ...phaser, default: open };
}

/**
 * Test-only: an object that answers every read, call and `new` with itself, a number where one is
 * asked for, and is no thenable: what a scene's systems stand in as where only their being there
 * matters.
 */
export function absorbing(): unknown {
  const any: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : any),
    apply: () => any,
    construct: () => any as object,
  });
  return any;
}

/** The systems Phaser hands a scene, each an absorbing stand-in, and a real scene emitter. */
export const SCENE_SYSTEMS = [
  "add",
  "anims",
  "cache",
  "cameras",
  "game",
  "input",
  "lights",
  "load",
  "make",
  "physics",
  "registry",
  "renderer",
  "scale",
  "scene",
  "sound",
  "sys",
  "textures",
  "time",
  "tweens",
] as const;

/**
 * A scene on absorbing systems, its `input` recording each call made on it or on what it hands back
 * (`input.keyboard.on("keydown-ESC", ...)` as `keyboard.on keydown-ESC`), so a test reads what the
 * scene bound.
 */
export function onAbsorbingSystems<T extends object>(scene: T): { scene: T; bound: string[] } {
  const bound: string[] = [];
  const recording = (path: string): unknown =>
    new Proxy(function () {}, {
      get: (_t, k) =>
        k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : recording(`${path}.${String(k)}`),
      apply: (_t, _self, args: unknown[]) => {
        bound.push([path, ...args.filter((a) => typeof a === "string" || typeof a === "number")].join(" "));
        return recording(path);
      },
    });
  const target = scene as Record<string, unknown>;
  for (const system of SCENE_SYSTEMS) target[system] = absorbing();
  target.input = recording("input");
  target.events = new EventEmitter();
  return { scene, bound };
}
