/**
 * Phaser side of the art pipeline (FS-2325V §B.6): load the manifest and its atlases, register
 * every frame and animation once, and build sprites by manifest name.
 *
 *   preload() { preloadArt(this); }
 *   create()  { const art = registerArt(this, logger); artSprite(this, art, x, y, "door_x", { animation: "open" }); }
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

export const MANIFEST_KEY = "art:manifest";
export const DEFAULT_ART_URL = "/art/";

const PLACEHOLDER_SIZE = 32;

/** The slice of a Phaser scene that {@link registerArt} uses. */
export interface ArtScene {
  cache: { json: { get(key: string): unknown } };
  textures: {
    exists(key: string): boolean;
    get(key: string): {
      has(name: string): boolean;
      add(
        name: string,
        source: number,
        x: number,
        y: number,
        w: number,
        h: number,
      ): unknown;
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
 * Queues the manifest, then every atlas it names, on the scene's loader. Call from `preload()`.
 * A missing manifest only fails its own file; {@link registerArt} then falls back.
 */
export function preloadArt(
  scene: Phaser.Scene,
  baseUrl = DEFAULT_ART_URL,
): void {
  scene.load.once(
    `filecomplete-json-${MANIFEST_KEY}`,
    (_key: string, _type: string, data: unknown) => {
      const result = validateManifest(data);
      if (!result.ok) return; // registerArt reports it with the scene's logger
      for (const [key, atlas] of Object.entries(result.manifest.atlases))
        scene.load.image(atlasTextureKey(key), `${baseUrl}${atlas.image}`);
    },
  );
  scene.load.json(MANIFEST_KEY, `${baseUrl}manifest.json`);
}

/**
 * Registers the loaded art with the scene and returns the library scenes draw from. Idempotent:
 * a second scene registering the same manifest reuses the frames and animations already there.
 */
export function registerArt(
  scene: ArtScene,
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
  for (const key of Object.keys(result.manifest.atlases)) {
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
          if (!texture.has(frame))
            texture.add(
              frame,
              0,
              pos.x,
              pos.y,
              sheet.frameWidth,
              sheet.frameHeight,
            );
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
