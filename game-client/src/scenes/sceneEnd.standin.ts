import { EventEmitter } from "eventemitter3";

/**
 * Test-only: a scene's Systems and its plugins, ended in the order Phaser 4.2.1 ends them.
 *
 * - A stop: `Systems.shutdown` emits SHUTDOWN. The input plugin subscribed to it as the scene
 *   started (InputPlugin.start), so it has shut down, its manager kept, before any handler the
 *   scene added in create() or init().
 * - A game destroy (leaving /game): `Game.runDestroy` → `SceneManager.destroy` → `Systems.destroy`
 *   emits DESTROY only, never SHUTDOWN, then drops every listener. Each plugin subscribed to DESTROY
 *   at boot, so each has destroyed itself before the scene's handlers run: InputPlugin.destroy and
 *   KeyboardPlugin.destroy null their `manager`, and `setDefaultCursor`, `addCapture` and the like
 *   then throw a TypeError on it (node_modules/phaser/src/scene/Systems.js `destroy`,
 *   input/InputPlugin.js `boot` and `destroy`, input/keyboard/KeyboardPlugin.js `destroy`).
 *
 * Every plugin, the input, its keyboard and any the test passes in, records in `touched` each call
 * and each write made on it after the destroy: a dead plugin is asked to do nothing. Letting go of a
 * listener (`off`) is the exception, as Phaser's own plugins do on each other while they go: the
 * plugin's emitter is still an emitter.
 */
export function sceneSystems(plugins: Record<string, object> = {}) {
  const events = new EventEmitter();
  const touched: string[] = [];
  let destroyed = false;
  const input = new InputStandIn(events);

  const LETTING_GO = new Set<PropertyKey>(["off", "removeListener"]);
  const watched = <T extends object>(name: string, plugin: T): T =>
    new Proxy(plugin, {
      get(target, key) {
        const value: unknown = Reflect.get(target, key);
        if (typeof value === "function") {
          return (...args: unknown[]) => {
            if (destroyed && !LETTING_GO.has(key))
              touched.push(`${name}.${String(key)}()`);
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        // a plugin's own plugin (the input's keyboard) is watched the same way
        if (value instanceof EventEmitter)
          return watched(`${name}.${String(key)}`, value);
        return value;
      },
      set(target, key, value) {
        if (destroyed) touched.push(`${name}.${String(key)} =`);
        return Reflect.set(target, key, value);
      },
    });

  // boot: every plugin subscribes to DESTROY before the scene's own code runs
  events.once("destroy", () => {
    destroyed = true;
    input.destroy();
  });

  const scene = {
    events,
    input: watched("input", input),
    ...Object.fromEntries(
      Object.entries(plugins).map(([name, plugin]) => [
        name,
        watched(name, plugin),
      ]),
    ),
  };

  return {
    scene,
    input,
    touched,
    /** A scene start after a stop: the input plugin listens for the next SHUTDOWN. */
    start: () => input.start(),
    shutdown: () => {
      events.emit("shutdown");
    },
    destroy: () => {
      events.emit("destroy");
      events.removeAllListeners();
    },
  };
}

/** Phaser's input manager: the game's, shared by every scene. */
interface InputManager {
  defaultCursor: string;
  captures: number[];
  setDefaultCursor(cursor: string): void;
}

function inputManager(): InputManager {
  return {
    defaultCursor: "",
    captures: [],
    setDefaultCursor(cursor) {
      this.defaultCursor = cursor;
    },
  };
}

/** InputPlugin and its KeyboardPlugin, to the depth a scene's teardown reaches. */
class InputStandIn extends EventEmitter {
  state: "running" | "shut down" | "destroyed" = "running";
  manager: InputManager | null = inputManager();
  readonly keyboard: KeyboardStandIn;

  constructor(private readonly events: EventEmitter) {
    super();
    this.keyboard = new KeyboardStandIn(this.manager!);
    this.start();
  }

  start(): void {
    this.state = "running";
    this.events.once("shutdown", this.shutdown, this);
  }

  setDefaultCursor(cursor: string): this {
    // InputPlugin.setDefaultCursor: `this.manager.setDefaultCursor(cursor)`
    this.manager!.setDefaultCursor(cursor);
    return this;
  }

  /**
   * InputPlugin.shutdown: it emits its plugins' SHUTDOWN, and KeyboardPlugin.shutdown destroys the
   * scene's keys (`removeAllKeys(true)`, the captures kept: they are the game's) and drops its
   * listeners, all before the scene's own SHUTDOWN handler runs.
   */
  private shutdown(): void {
    this.state = "shut down";
    this.keyboard.shutdown();
    this.removeAllListeners();
  }

  destroy(): void {
    this.shutdown();
    this.state = "destroyed";
    this.keyboard.destroy();
    this.manager = null;
  }
}

/** A Phaser Key, as far as a scene binds and tears it down: an emitter, as Phaser's Key is. */
export interface KeyStandIn extends EventEmitter {
  keyCode: number;
  destroyed: boolean;
}

/** Phaser's KeyCodes for the cursor keys `createCursorKeys` adds. */
const CURSOR_CODES = {
  up: 38,
  down: 40,
  left: 37,
  right: 39,
  space: 32,
  shift: 16,
} as const;

class KeyboardStandIn extends EventEmitter {
  enabled = true;
  keys: KeyStandIn[] = [];

  constructor(private manager: InputManager | null) {
    super();
  }

  /** KeyboardPlugin.addKey: `enableCapture` defaults to true, and a capture is the game's. */
  addKey(keyCode: number, enableCapture = true): KeyStandIn {
    const key: KeyStandIn = Object.assign(new EventEmitter(), {
      keyCode,
      destroyed: false,
    });
    this.keys.push(key);
    if (enableCapture) this.addCapture(keyCode);
    return key;
  }

  createCursorKeys(): Record<keyof typeof CURSOR_CODES, KeyStandIn> {
    const keys = Object.entries(CURSOR_CODES).map(([name, code]) => [
      name,
      this.addKey(code),
    ]);
    return Object.fromEntries(keys) as Record<
      keyof typeof CURSOR_CODES,
      KeyStandIn
    >;
  }

  /** KeyboardPlugin.addCapture: one code or several, as Phaser's KeyboardManager takes them. */
  addCapture(keyCode: number | number[]): this {
    for (const code of [keyCode].flat())
      if (!this.manager!.captures.includes(code)) this.manager!.captures.push(code);
    return this;
  }

  /** KeyboardPlugin.removeCapture: one code or several. */
  removeCapture(keyCode: number | number[]): this {
    const codes = [keyCode].flat();
    this.manager!.captures = this.manager!.captures.filter(
      (code) => !codes.includes(code),
    );
    return this;
  }

  removeKey(key: KeyStandIn, destroy?: boolean, removeCapture?: boolean): this {
    const at = this.keys.indexOf(key);
    if (at < 0) return this;
    this.keys.splice(at, 1);
    if (removeCapture) this.removeCapture(key.keyCode);
    if (destroy) key.destroyed = true;
    return this;
  }

  /** KeyboardPlugin.shutdown: `removeAllKeys(true)` (no removeCapture), then `removeAllListeners`. */
  shutdown(): void {
    for (const key of this.keys) key.destroyed = true;
    this.keys = [];
    this.removeAllListeners();
  }

  destroy(): void {
    this.shutdown();
    this.manager = null;
  }
}
