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

  type File = { type: "image" | "json"; key: string };
  const loaderEvents = new EventEmitter();
  let list: File[] = [];
  let total = 0;
  let done = 0;
  let loading = false;
  /** Every image key queued, across loads, in order. */
  const queued: string[] = [];

  const exists = (file: File) =>
    (file.type === "image" ? textures.exists(file.key) : json.has(file.key)) ||
    list.some((f) => f.key === file.key);
  const add = (file: File) => {
    if (exists(file)) return;
    list.push(file);
    if (file.type === "image") queued.push(file.key);
    if (loading) total++;
  };
  const completeOne = (file: File) => {
    list = list.filter((f) => f !== file);
    done++;
    if (!failing.has(file.key)) {
      if (file.type === "image") textures.addImage(file.key);
      else json.set(file.key, opts.manifest);
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
    image: (key: string, _url?: string) => add({ type: "image", key }),
    json: (key: string, _url?: string) => add({ type: "json", key }),
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

  const scene = {
    load,
    textures,
    anims,
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
    /** A scene stop mid-load (`LoaderPlugin.shutdown`). */
    stop() {
      load.reset();
      loaderEvents.removeAllListeners();
    },
  };
}

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
