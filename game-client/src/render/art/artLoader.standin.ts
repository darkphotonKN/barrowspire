import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "eventemitter3";
import type { ArtManifest } from "./manifest";
import { MANIFEST_KEY } from "./phaser";

/** Test-only: the shipped manifest, `public/art/manifest.json`. */
export const shippedManifest = (): ArtManifest =>
  JSON.parse(
    readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
  ) as ArtManifest;

/**
 * The shipped manifest's resident pages (FS-C4JWH §A R3), written out rather than derived, so a
 * test that compares against them checks the table: the four class groups and the 13 small ones.
 */
export const RESIDENT_ART_PAGES = [
  "archer-0",
  "architecture-0",
  "building-0",
  "containers-0",
  "forest-0",
  "fx-0",
  "ground-0",
  "icons-0",
  "interior-0",
  "knight-0",
  "mercenary-0",
  "nature-0",
  "props-0",
  "spire-0",
  "tower-0",
  "town-0",
  "wizard-0",
] as const;

/**
 * Test-only: the slice of a Phaser 4.2.1 scene the art loading touches (its loader, texture
 * manager, animation manager and JSON cache), behaving as Phaser's own do:
 *
 * - `load.image` / `load.json` skip a key the texture manager or cache already holds, or the load
 *   already has (`LoaderPlugin.addFile` → `keyExists`), so no `filecomplete` fires for it.
 * - `load.start` with nothing queued emits `complete` at once, synchronously
 *   (`LoaderPlugin.start`, `list.size === 0`). Otherwise each file completes in turn: an image
 *   becomes a texture, the manifest is cached, then `filecomplete-<type>-<key>` and `progress`
 *   (files done over files queued, `updateProgress`) fire; a file added meanwhile joins the load.
 *   Once every file has finished or failed, `complete` fires.
 * - `boot(scene, data)` runs a scene as `SceneManager.bootScene` does: `init(data)`, the loader
 *   reset, `preload()`, then the manager's own `complete` listener (calling `create(data)`) added
 *   after `preload()` returned, then `start()`. A `complete` listener added in `preload()` runs
 *   first.
 * - `stop()` is a scene stop mid-load: the loader resets and drops every listener
 *   (`LoaderPlugin.shutdown`), so `create` never runs.
 *
 * With `{ hold: true }` a load starts but completes only on `finish()`, so a test can look at the
 * scene while it downloads.
 */
export function artLoaderStandin(opts: {
  manifest: unknown;
  /** The manifest is already in the JSON cache (an earlier scene loaded it). */
  cachedManifest?: boolean;
  /** Texture keys already in the texture manager. */
  textures?: string[];
  /** Keys whose download fails. */
  failing?: string[];
}) {
  const json = new Map<string, unknown>(
    opts.cachedManifest ? [[MANIFEST_KEY, opts.manifest]] : [],
  );
  const textures = new TextureManagerStandIn(opts.textures ?? []);
  const anims = new AnimationManagerStandIn();
  const failing = new Set(opts.failing ?? []);

  /**
   * A queued file, as far as Phaser's `File` goes here: its XHR (`xhrLoader`, `resetXHR`) and the
   * step that adds it to its cache (`onProcessComplete` → `LoaderPlugin.fileProcessComplete` →
   * `addToCache`). A file in flight when its loader is reset keeps going: its download lands later
   * and still adds itself, unless its XHR was aborted or its completion taken away.
   */
  type File = {
    type: "image" | "json";
    key: string;
    xhrLoader: { aborted: boolean; abort(): void } | null;
    resetXHR(): void;
    onProcessComplete(): void;
    onProcessError(): void;
  };
  const loaderEvents = new EventEmitter();
  let list: File[] = [];
  /** Files in flight when their loader was reset (a stop mid-load): {@link landStrays} lands them. */
  let strays: File[] = [];
  let total = 0;
  let done = 0;
  let loading = false;
  /** Every image key queued, across loads, in order. */
  const queued: string[] = [];
  /** What Phaser would print with `console.error`: `TextureManager.checkKey` on a key in use. */
  const consoleErrors: string[] = [];

  const exists = (type: File["type"], key: string) =>
    (type === "image" ? textures.exists(key) : json.has(key)) ||
    list.some((f) => f.key === key);
  const addToCache = (file: File) => {
    if (file.type === "json") return void json.set(file.key, opts.manifest);
    if (textures.exists(file.key)) consoleErrors.push(`Texture key already in use: ${file.key}`);
    else textures.addImage(file.key);
  };
  const add = (type: File["type"], key: string) => {
    if (exists(type, key)) return;
    const xhr = { aborted: false, abort: () => void (xhr.aborted = true) };
    const file: File = {
      type,
      key,
      xhrLoader: xhr,
      resetXHR: () => undefined,
      onProcessComplete: () => addToCache(file),
      onProcessError: () => undefined,
    };
    list.push(file);
    if (type === "image") queued.push(key);
    if (loading) total++;
    loaderEvents.emit("addfile", key, type, load, file);
  };
  const completeOne = (file: File) => {
    list = list.filter((f) => f !== file);
    done++;
    if (!failing.has(file.key)) {
      file.onProcessComplete();
      loaderEvents.emit(`filecomplete-${file.type}-${file.key}`, file.key, file.type, opts.manifest);
    }
    loaderEvents.emit("progress", 1 - list.length / total);
  };
  const complete = () => {
    loading = false;
    list = [];
    loaderEvents.emit("complete", load, done, 0);
  };

  let hold = false;
  const load = Object.assign(loaderEvents, {
    image: (key: string, _url?: string) => add("image", key),
    json: (key: string, _url?: string) => add("json", key),
    reset: () => {
      list = [];
      loading = false;
    },
    start: () => {
      total = list.length;
      done = 0;
      if (list.length === 0) return complete();
      loading = true;
      loaderEvents.emit("progress", 0);
      if (!hold) finish();
    },
    get isLoading() {
      return loading;
    },
  });
  const finish = () => {
    while (list.length > 0) completeOne(list[0]);
    complete();
  };

  const stage = drawingStage(textures);
  const scene = {
    load,
    textures,
    anims,
    add: stage.add,
    cameras: { main: stage.camera },
    events: stage.events,
    cache: {
      json: {
        exists: (key: string) => json.has(key),
        get: (key: string) => json.get(key),
      },
    },
  };

  return {
    scene,
    textures,
    anims,
    queued,
    /** Runs `target` (which carries `scene`'s plugins) as Phaser's scene manager boots a scene. */
    boot(
      target: { init?(data?: unknown): void; preload?(): void; create?(data?: unknown): void },
      data?: unknown,
      run: { hold?: boolean } = {},
    ) {
      hold = run.hold ?? false;
      target.init?.(data);
      load.reset();
      target.preload?.();
      load.once("complete", () => target.create?.(data));
      load.start();
    },
    /** Completes a held load. */
    finish,
    consoleErrors,
    /**
     * The downloads a stop left in flight arrive: each adds itself to its cache as Phaser's would,
     * unless its XHR was aborted (no `onload` then) or its completion was taken away.
     */
    landStrays() {
      for (const file of strays.splice(0))
        if (!failing.has(file.key) && !file.xhrLoader?.aborted) file.onProcessComplete();
    },
    /** What the scene drew, in order (`add.graphics`, `add.text`, `add.image`). */
    drawn: stage.drawn,
    camera: stage.camera,
    /**
     * A scene stop mid-load: the loader resets and drops its listeners (`LoaderPlugin.shutdown`),
     * the display list destroys every child (`DisplayList.shutdown`), then SHUTDOWN is heard.
     */
    stop() {
      strays.push(...list);
      load.reset();
      loaderEvents.removeAllListeners();
      for (const object of stage.drawn) object.destroy();
      stage.events.emit("shutdown");
    },
  };
}

/** One object a scene drew, and every call made on it. */
export interface Drawn {
  kind: "graphics" | "text" | "image";
  /** The arguments it was added with: its position, then its text or texture. */
  args: unknown[];
  calls: string[];
  destroyed: boolean;
  destroy(): void;
}

/**
 * Test-only: the game-object factory, main camera and scene events of a scene, recording what is
 * drawn. Every call on a drawn object is recorded and returns the object, as Phaser's chainable
 * setters do; the camera does Phaser's arithmetic for size, zoom and scroll.
 */
export function drawingStage(textures: { addImage(key: string): void; exists(key: string): boolean }) {
  const drawn: Drawn[] = [];
  const make = (kind: Drawn["kind"], args: unknown[]) => {
    const record: Drawn = {
      kind,
      args,
      calls: [],
      destroyed: false,
      destroy: () => {
        record.destroyed = true;
      },
    };
    const object: unknown = new Proxy(record, {
      get(target, key) {
        if (key in target) return Reflect.get(target, key);
        if (typeof key === "symbol" || key === "then") return undefined;
        return (...callArgs: unknown[]) => {
          target.calls.push(`${String(key)}(${callArgs.map(show).join(", ")})`);
          // registerArt's placeholder becomes a texture
          if (key === "generateTexture") textures.addImage(String(callArgs[0]));
          return object;
        };
      },
    });
    drawn.push(record);
    return object;
  };
  const camera = {
    width: 1080,
    height: 720,
    zoomX: 1,
    scrollX: 0,
    scrollY: 0,
    background: undefined as unknown,
    get displayWidth() {
      return this.width / this.zoomX;
    },
    get displayHeight() {
      return this.height / this.zoomX;
    },
    setScroll(x: number, y: number) {
      this.scrollX = x;
      this.scrollY = y;
      return this;
    },
    setBackgroundColor(color: unknown) {
      this.background = color;
      return this;
    },
  };
  return {
    drawn,
    camera,
    events: new EventEmitter(),
    add: {
      graphics: () => make("graphics", []),
      text: (...args: unknown[]) => make("text", args),
      image: (...args: unknown[]) => make("image", args),
    },
  };
}

const show = (value: unknown): string =>
  typeof value === "number"
    ? String(Math.round(value * 1000) / 1000)
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);

class TextureManagerStandIn {
  private readonly frames = new Map<string, Map<string, unknown>>();
  readonly removed: string[] = [];

  constructor(keys: string[]) {
    for (const key of keys) this.addImage(key);
  }

  exists(key: string): boolean {
    return this.frames.has(key);
  }

  addImage(key: string): void {
    this.frames.set(key, new Map());
  }

  /** The menu chrome's gradient canvases are not drawn here: no canvas, as Phaser without one. */
  createCanvas(): null {
    return null;
  }

  getTextureKeys(): string[] {
    return [...this.frames.keys()];
  }

  get(key: string) {
    const frames = this.frames.get(key) ?? new Map<string, unknown>();
    return {
      key,
      has: (name: string) => frames.has(name),
      add: (name: string) => {
        if (frames.has(name)) return null;
        const frame = { name, setTrim: () => frame };
        frames.set(name, frame);
        return frame;
      },
      getFrameNames: () => [...frames.keys()],
    };
  }

  remove(key: string): this {
    if (this.frames.delete(key)) this.removed.push(key);
    return this;
  }
}

class AnimationManagerStandIn {
  readonly list = new Map<string, { key: string; frames: { key: string; frame: string }[] }>();
  readonly removed: string[] = [];

  exists(key: string): boolean {
    return this.list.has(key);
  }

  create(config: { key: string; frames: { key: string; frame: string }[] }) {
    if (this.list.has(config.key)) return false;
    this.list.set(config.key, config);
    return config;
  }

  remove(key: string) {
    const anim = this.list.get(key);
    if (anim) {
      this.list.delete(key);
      this.removed.push(key);
    }
    return anim;
  }
}
