/**
 * Phaser side of the art pipeline (FS-2325V §B.6): load the manifest and its atlases, register
 * every frame and animation once, and build sprites by manifest name.
 *
 *   preload() { preloadArt(this, SCENE_ART.HubScene); }
 *   create()  { const art = registerArt(this, SCENE_ART.HubScene); artSprite(this, art, x, y, "door_x", { animation: "open" }); }
 *
 * Frame geometry never leaves this module and `library.ts`: scenes speak manifest names only.
 */

import type Phaser from "phaser";
import { BARROW_HEX } from "@/utils/theme";
import {
  ArtLibrary,
  PLACEHOLDER_TEXTURE,
  animationName,
  atlasTextureKey,
  frameName,
  type ArtLogger,
  type FrameQuery,
} from "./library";
import {
  animationAtlas,
  sheetAtlases,
  validateManifest,
  type ArtManifest,
} from "./manifest";
import { onSceneEnd } from "@/scenes/sceneEnd";
import { palette } from "@/utils/canvasPalette";
import { evictOutside } from "./evict";
import { LOAD_PACE, paceLoad, type Curtain, type PaceClock } from "./loadPace";
import { atlasGroup, sceneAtlases, type SceneGroups } from "./sceneArt";

export const MANIFEST_KEY = "art:manifest";
export const DEFAULT_ART_URL = "/art/";

const PLACEHOLDER_SIZE = 32;

/** The slice of a Phaser texture frame that {@link registerArt} uses: `Frame.setTrim`. */
export interface TrimmableFrame {
  setTrim(
    actualWidth: number,
    actualHeight: number,
    destX: number,
    destY: number,
    destWidth: number,
    destHeight: number,
  ): unknown;
}

/** The slice of a Phaser scene that {@link registerArt} uses. */
export interface ArtScene {
  cache: { json: { get(key: string): unknown } };
  textures: {
    exists(key: string): boolean;
    get(key: string): {
      has(name: string): boolean;
      /** Phaser's `Texture.add`: the new frame, or null when the name is taken. */
      add(
        name: string,
        source: number,
        x: number,
        y: number,
        w: number,
        h: number,
      ): TrimmableFrame | null;
    };
  };
  anims: {
    exists(key: string): boolean;
    create(config: Phaser.Types.Animations.Animation): unknown;
  };
  add: {
    graphics(): {
      fillStyle(color: number, alpha?: number): unknown;
      fillRect(x: number, y: number, w: number, h: number): unknown;
      lineStyle(width: number, color: number, alpha?: number): unknown;
      strokeRect(x: number, y: number, w: number, h: number): unknown;
      generateTexture(key: string, w: number, h: number): unknown;
      destroy(): void;
    };
  };
}

/**
 * Queues, on the scene's loader, the manifest if it is not cached, then every atlas page of the
 * scene's set (every resident page, and the pages of its own scene-scoped `groups`, `sceneArt.ts`)
 * that is not already a texture, and nothing else (FS-C4JWH §B R6–R7). Call from `preload()`, with
 * the scene's {@link SCENE_ART} entry; then {@link registerArt} in `create()` with the same one.
 * A missing manifest only fails its own file; {@link registerArt} then falls back.
 *
 * Once the load completes, and before `create`, the scene-scoped pages outside the scene's set
 * are evicted with their animations (`evict.ts`, FS-C4JWH §C). A `complete` listener added here
 * runs before the scene manager's own, which calls `create`: Phaser 4.2.1 `SceneManager.bootScene`
 * adds that one after `preload()` returns; with nothing queued, `start` completes synchronously
 * and the same order holds. A scene stopped mid-load drops this listener with its loader's
 * (`LoaderPlugin.shutdown`), and the next scene's load evicts instead.
 *
 * Given a bar, a queued load is paced (FS-C4JWH A1, `loadPace.ts`): the bar shows only past the
 * show delay and stays its minimum, and the scene manager's own `complete` listener is held back
 * until the bar is down, so eviction still runs on the load's completion and `create` after the
 * bar (`pacedEntry`). A world scene (`fadeIn`) fades in from black as its `create` runs.
 *
 * The manifest may already be cached by another scene whose atlases are still in flight: a
 * refresh lands the player in the hub while the preload scene is still fetching. Phaser skips a
 * cached key without firing `filecomplete`, so the atlases are queued straight from the cache
 * then, or this scene would finish loading with none of them and draw only placeholders.
 */
export function preloadArt(
  scene: Phaser.Scene,
  groups: SceneGroups,
  options: PreloadOptions = {},
): void {
  const baseUrl = options.baseUrl ?? DEFAULT_ART_URL;
  let queued = 0;
  // what this load queues, so a stop mid-load can call its downloads off (below)
  const files: LoaderFile[] = [];
  const collect = (key: string, _t: string, _l: unknown, file: LoaderFile) => {
    if (key === MANIFEST_KEY || key.startsWith("art:")) files.push(file);
  };
  scene.load.on("addfile", collect);

  const queueAtlases = (data: unknown) => {
    const result = validateManifest(data);
    if (!result.ok) return; // registerArt reports it with the scene's logger
    const { atlases } = result.manifest;
    for (const key of sceneAtlases(result.manifest, groups))
      if (!scene.textures.exists(atlasTextureKey(key))) {
        scene.load.image(
          atlasTextureKey(key),
          `${baseUrl}${atlases[key].image}`,
        );
        queued++;
      }
  };

  if (scene.cache.json.exists(MANIFEST_KEY)) {
    queueAtlases(scene.cache.json.get(MANIFEST_KEY));
  } else {
    scene.load.once(
      `filecomplete-json-${MANIFEST_KEY}`,
      (_key: string, _type: string, data: unknown) => queueAtlases(data),
    );
    scene.load.json(MANIFEST_KEY, `${baseUrl}manifest.json`);
    queued++;
  }

  // Paced only over a real download: no bar unless it still runs 300 ms in, and a bar shown stays
  // long enough to be read, `create` waiting for it (FS-C4JWH A1, `loadPace.ts`).
  const pace =
    queued > 0 && options.bar
      ? pacedEntry(scene, options.bar, options.fadeIn ?? false, () =>
          cancelEnd(),
        )
      : undefined;
  if (pace) scene.load.on("progress", pace.progress);

  // A stop mid-load (a world switch) resets the loader, but Phaser 4.2.1 aborts nothing: each
  // download in flight still lands and adds itself to the texture manager (LoaderPlugin.reset clears
  // its Sets only; File.onLoad → nextFile → onProcess → fileProcessComplete → addToCache), after
  // the next scene has evicted, or as a second copy of a key the next scene queued. So its
  // downloads are called off (FS-C4JWH Edge States). A game destroy frees everything instead. A
  // stop behind the bar, after the load, cancels the pacing, and the scene's create never runs.
  let complete = false;
  const cancelEnd =
    queued > 0
      ? onSceneEnd(scene, (end) => {
          if (end === "shutdown" && !complete) files.forEach(callOff);
          pace?.end(end);
        })
      : () => undefined;

  /**
   * The eviction moment (ADR-0059 Decision 3): the scene's load has completed and its `create` has
   * not run. The scene-scoped pages outside the scene's set go now, under the bar if it is up
   * (FS-C4JWH §C R11, A1.3); then the pacing enters the scene, at once or once the bar is down.
   */
  const loaded = () => {
    complete = true;
    scene.load.off("addfile", collect);
    const result = validateManifest(scene.cache.json.get(MANIFEST_KEY));
    if (result.ok) evictOutside(scene, result.manifest, groups);
    if (pace) {
      scene.load.off("progress", pace.progress);
      pace.loaded();
      return;
    }
    cancelEnd();
    // nothing to pace: a world still fades in rather than cutting (A1.4)
    if (options.fadeIn) cameraCurtain(scene).fadeIn(LOAD_PACE.worldFade);
  };
  scene.load.once("complete", loaded);
}

/** Phaser 4.2.1's `Phaser.Scenes.LOADING` (`scene/const.js`), kept here so this module stays type-only on Phaser. */
const SCENE_LOADING = 3;

/** The scene manager's own step from a completed load to `create` (Phaser 4.2.1 `SceneManager`). */
interface SceneStarter {
  loadComplete(loader: unknown): void;
}

/**
 * Paces a scene's load (`loadPace.ts`) and holds its `create` until the pacing is done (FS-C4JWH
 * A1.3). Phaser 4.2.1 `SceneManager.bootScene` calls `preload()`, then adds its own
 * `loader.once(COMPLETE, this.loadComplete, this)`, then `loader.start()`, whose `START` is emitted
 * before any file completes; taken off the loader on that `START`, the manager's `loadComplete`
 * (→ `create`) runs when the pacing calls it, and the scene stays LOADING until then: a world
 * switch stops it as any scene still loading, and its stop drops nothing of the manager's
 * (`SceneManager.stop` takes the same listener off, a no-op now).
 */
function pacedEntry(
  scene: Phaser.Scene,
  bar: () => LoadingBar,
  fadeIn: boolean,
  entered: () => void,
) {
  const manager = scene.sys.game.scene as unknown as SceneStarter;
  scene.load.once("start", () =>
    scene.load.off("complete", manager.loadComplete, manager),
  );
  return paceLoad({
    clock: sceneClock(scene),
    curtain: cameraCurtain(scene),
    bar,
    fadeIn,
    enter: () => {
      entered();
      // Only a scene still LOADING is entered: if the removal above ever misses (a Phaser upgrade
      // attaching the listener another way), Phaser has already created it on the load's
      // completion, and a second create would build the world twice.
      if (scene.sys.settings.status === SCENE_LOADING)
        manager.loadComplete(scene.load);
    },
  });
}

/**
 * The scene's own clock, which steps while the scene is LOADING (`SceneManager.update` steps every
 * scene from LOADING to RUNNING) and stops with the game loop in a hidden tab.
 */
function sceneClock(scene: Phaser.Scene): PaceClock {
  return {
    after: (ms, step) => {
      const event = scene.time.delayedCall(ms, step);
      return () => event.remove(false);
    },
  };
}

/** The canvas's soot, the game's background and the bar's ground: what a fade comes from and goes to. */
const SOOT = palette.menu.ground;
const SOOT_RGB = [
  (SOOT >> 16) & 0xff,
  (SOOT >> 8) & 0xff,
  SOOT & 0xff,
] as const;

/**
 * The main camera's own fade (FS-C4JWH A1.5): Phaser 4.2.1 fills the camera's rectangle over every
 * object it drew (`renderNodes/Camera.js`, after the children), so the HUD is faded too, and
 * neither zoom, origin nor scroll changes (ADR-0056). A finished fade-in is reset, or Phaser would
 * keep drawing its spent fill each frame (`Fade.postRenderWebGL` returns `isComplete`).
 */
function cameraCurtain(scene: Phaser.Scene): Curtain {
  return {
    fadeIn: (ms) => {
      const camera = scene.cameras.main;
      camera.fadeIn(ms, ...SOOT_RGB);
      camera.once("camerafadeincomplete", () => camera.fadeEffect.reset());
    },
    fadeOut: (ms) => void scene.cameras.main.fadeOut(ms, ...SOOT_RGB),
  };
}

/** A Phaser 4.2.1 loader `File`, as far as calling its download off goes. */
interface LoaderFile {
  xhrLoader?: { abort(): void } | null;
  resetXHR?(): void;
  onProcessComplete(): void;
  onProcessError(): void;
}

/**
 * Calls a queued file's download off: its XHR loses its handlers (`File.resetXHR`) and is aborted,
 * so `onLoad` never runs, and a file already decoding (`ImageFile.onProcess`) no longer completes,
 * so it never reaches `addToCache`. A file that has landed already is untouched by either.
 */
function callOff(file: LoaderFile): void {
  file.resetXHR?.();
  file.xhrLoader?.abort();
  file.onProcessComplete = () => undefined;
  file.onProcessError = () => undefined;
}

/** A loading bar shown while a scene's art downloads: the torch bar (`ui/torchBar.ts`) in the game. */
export interface LoadingBar {
  /** The loader's `progress`, files done over files queued, 0 to 1. */
  progress(value: number): void;
  /** Takes down everything it drew. */
  destroy(): void;
}

export interface PreloadOptions {
  /**
   * The bar to show over a download still running {@link LOAD_PACE}`.showDelay` after `preload()`,
   * filled by the loader's `progress`, kept at least `minVisible`, faded in and out; `create`
   * waits until it is down (FS-C4JWH §D R17, A1). With a bar given, a queued load is paced; a
   * scene stopped while paced takes the bar down with its display list.
   */
  bar?: () => LoadingBar;
  /**
   * A world scene: it fades in from black as its `create` runs, a bar shown or not (A1.4). A menu
   * leaves it off, and fades in only after a bar.
   */
  fadeIn?: boolean;
  baseUrl?: string;
}

/**
 * Registers the scene's loaded art and returns the library it draws from: the atlas pages of its
 * set (`groups`, as given to {@link preloadArt}) that are textures. One that is not warns once
 * and its sheets draw as placeholders (FS-C4JWH §B R10, §E R19); a page outside the set is not
 * the scene's, is never warned about, and its sheets draw as the placeholder even while it is
 * still a texture (§E R20), except an on-demand group's once {@link onDemandArt} has fetched it
 * and told the library (`ArtLibrary.admit`). Idempotent: a second scene registering the same
 * manifest reuses the frames and animations already there.
 */
export function registerArt(
  scene: ArtScene,
  groups: SceneGroups,
  logger: ArtLogger = console,
): ArtLibrary {
  ensurePlaceholder(scene);

  const data = scene.cache.json.get(MANIFEST_KEY);
  if (data === undefined) {
    logger.warn("art: manifest missing; drawing placeholders", {
      key: MANIFEST_KEY,
    });
    return ArtLibrary.empty(logger);
  }
  const result = validateManifest(data);
  if (!result.ok) {
    logger.warn("art: manifest invalid; drawing placeholders", {
      errors: result.errors,
    });
    return ArtLibrary.empty(logger);
  }

  const loaded = new Set<string>();
  for (const key of sceneAtlases(result.manifest, groups)) {
    if (scene.textures.exists(atlasTextureKey(key))) loaded.add(key);
    else
      logger.warn(
        `art: atlas ${key} did not load; its sheets draw as placeholders`,
        { key },
      );
  }
  registerFrames(scene, result.manifest, loaded);
  return new ArtLibrary(result.manifest, logger, loaded);
}

/**
 * Fetches a running scene's on-demand groups (FS-VHGE7 §F, ADR-0071), one per scene start. The
 * first `fetch` of a group queues its pages not yet textures, once, on the scene's loader; no bar,
 * no fade, nothing held back. Only when the load is done and every page is a texture are its frames
 * and animations registered, `art` told, and then `landed` called (§F R47); a page that failed
 * leaves the group out with one warning, and it is not asked for again in this scene (R50).
 *
 * A stop while it downloads calls the pages off as a stop does a preload's (`callOff`): the loader
 * drops its listeners on the stop, and without this each page would still land in the next scene.
 */
export function onDemandArt(
  scene: Phaser.Scene,
  art: ArtLibrary,
  logger: ArtLogger = console,
  baseUrl = DEFAULT_ART_URL,
): { fetch(group: string, landed: () => void): void } {
  const asked = new Set<string>();

  return {
    fetch(group, landed) {
      if (asked.has(group)) return;
      asked.add(group);
      const result = validateManifest(scene.cache.json.get(MANIFEST_KEY));
      if (!result.ok) return; // registerArt reported it with the scene's logger
      const { manifest } = result;
      const pages = Object.keys(manifest.atlases).filter((atlas) => atlasGroup(atlas) === group);
      const absent = () => pages.filter((atlas) => !scene.textures.exists(atlasTextureKey(atlas)));

      const settle = () => {
        const missing = absent();
        if (pages.length === 0 || missing.length > 0) {
          logger.warn(`art: on-demand group ${group} did not load; its stand-in stays`, {
            group,
            missing,
          });
          return;
        }
        registerFrames(scene, manifest, new Set(pages));
        art.admit(pages);
        landed();
      };

      const toFetch = absent();
      if (toFetch.length === 0) return settle();

      const files: LoaderFile[] = [];
      const collect = (_k: string, _t: string, _l: unknown, file: LoaderFile) => void files.push(file);
      scene.load.on("addfile", collect);
      for (const atlas of toFetch)
        scene.load.image(atlasTextureKey(atlas), `${baseUrl}${manifest.atlases[atlas].image}`);
      scene.load.off("addfile", collect);

      const cancelEnd = onSceneEnd(scene, (end) => {
        if (end === "shutdown") files.forEach(callOff);
      });
      scene.load.once("complete", () => {
        cancelEnd();
        settle();
      });
      scene.load.start();
    },
  };
}

function registerFrames(
  scene: ArtScene,
  manifest: ArtManifest,
  loaded: ReadonlySet<string>,
) {
  for (const [name, sheet] of Object.entries(manifest.sheets)) {
    if (!sheetAtlases(sheet).every((a) => loaded.has(a))) continue;
    for (const [animation, anim] of Object.entries(sheet.animations)) {
      // an oversized sheet's animation may sit on another page (FS-Q14EV §B.7)
      const textureKey = atlasTextureKey(animationAtlas(sheet, anim));
      const texture = scene.textures.get(textureKey);
      anim.frames.forEach((frames, direction) => {
        const names = frames.map((pos, index) => {
          const frame = frameName(name, animation, direction, index);
          if (!texture.has(frame)) {
            const trim = pos.trim;
            const added = texture.add(
              frame,
              0,
              pos.x,
              pos.y,
              trim?.w ?? sheet.frameWidth,
              trim?.h ?? sheet.frameHeight,
            );
            // A trimmed frame (FS-HF0WW): the atlas holds only its cut, so it is put back
            // where it was cut from, as Phaser's own TexturePacker parsers do. The frame then
            // reports the whole frame's size (`realWidth`), which sizes the sprite, its origin
            // and its arcade body, and the cut is drawn at its offset.
            if (trim)
              added?.setTrim(
                sheet.frameWidth,
                sheet.frameHeight,
                trim.x,
                trim.y,
                trim.w,
                trim.h,
              );
          }
          return frame;
        });
        const key = animationName(name, animation, direction);
        if (names.length > 1 && !scene.anims.exists(key))
          scene.anims.create({
            key,
            frames: names.map((frame) => ({ key: textureKey, frame })),
            frameRate: anim.fps,
            repeat: anim.loop ? -1 : 0,
          });
      });
    }
  }
}

/** A neutral, clearly-not-final stand-in: a slate block with a brass edge. */
function ensurePlaceholder(scene: ArtScene) {
  if (scene.textures.exists(PLACEHOLDER_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(BARROW_HEX.slate, 1);
  g.fillRect(0, 0, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
  g.lineStyle(2, BARROW_HEX.brass, 1);
  g.strokeRect(1, 1, PLACEHOLDER_SIZE - 2, PLACEHOLDER_SIZE - 2);
  g.generateTexture(PLACEHOLDER_TEXTURE, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
  g.destroy();
}

/** A sprite standing on (x, y) by its anchor, showing the named art (or the placeholder). */
export function artSprite(
  scene: Phaser.Scene,
  art: ArtLibrary,
  x: number,
  y: number,
  name: string,
  query: FrameQuery = {},
): Phaser.GameObjects.Sprite {
  const resolved = art.resolve(name, query);
  const sprite = resolved.placeholder
    ? scene.add.sprite(x, y, resolved.texture)
    : scene.add.sprite(x, y, resolved.texture, resolved.frame);
  return sprite.setOrigin(resolved.anchor.x, resolved.anchor.y);
}

/**
 * Shows a state, variant or animation on an existing sprite: plays it when it has several
 * frames, otherwise sets the single frame. Used for server-state swaps (door locked → open).
 */
export function showArt(
  sprite: Phaser.GameObjects.Sprite,
  art: ArtLibrary,
  name: string,
  query: FrameQuery = {},
): void {
  const key =
    query.animation && art.animationKey(name, query.animation, query.direction);
  if (key) {
    sprite.play(key, true);
    return;
  }
  const resolved = art.resolve(name, query);
  if (resolved.placeholder) sprite.setTexture(resolved.texture);
  else sprite.setTexture(resolved.texture, resolved.frame);
  sprite.setOrigin(resolved.anchor.x, resolved.anchor.y);
}
