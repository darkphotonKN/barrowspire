/**
 * Eviction (FS-C4JWH §C, ADR-0059): once a scene's preload has completed, and before its create
 * builds anything, every page of every scene-scoped group that is a texture and not in the
 * scene's set is removed, with every animation registered on it. `preloadArt` hooks it on the
 * loader's `complete`, so no scene can forget it.
 *
 * Why the animations go first: Phaser 4.2.1 removes nothing from the animation manager when a
 * texture goes (`TextureManager.remove` → `Texture.destroy` destroys the frames only), so an
 * animation would keep pointing at dead frames, and `registerFrames` skips a key that exists,
 * so a re-loaded page would never get its animations back (`phaser.ts`).
 *
 * Why it is safe: only one scene runs at a time, and the old one has stopped before the new one
 * starts (`enterWorld`, a scene's own `scene.start`), its display list destroyed with it. A sprite
 * on a removed frame would throw on its next render (`SubmitterQuad.js:189` reads
 * `frame.source.glTexture`), so nothing outside a running scene may hold a frame, texture or
 * animation of a scene-scoped group (ADR-0059 Decision 5). Reviewed 2026-11-06: the module-level
 * state that touches art keeps no such thing. `bustPortrait.ts`'s `figureCache` keeps numbers read
 * from a frame (bounds, a centre), true again for the same PNG re-loaded; cursors (`cursors.ts`)
 * are data-URL copies; item icons are read by the DOM; party busts, rivals and the menu figure
 * draw class sheets, which are resident.
 */

import { animationName, atlasTextureKey } from "./library";
import { animationAtlas, type ArtManifest } from "./manifest";
import { SCENE_SCOPED_GROUPS, atlasGroup, type SceneGroups } from "./sceneArt";

/** The slice of a Phaser scene eviction uses: its texture and animation managers. */
export interface EvictingScene {
  textures: { exists(key: string): boolean; remove(key: string): unknown };
  anims: { remove(key: string): unknown };
}

/**
 * Evicts every scene-scoped page that is a texture and not one of `groups`' pages: first every
 * animation on it, then the texture, which frees its GPU memory. Returns the atlases evicted.
 */
export function evictOutside(
  scene: EvictingScene,
  manifest: ArtManifest,
  groups: SceneGroups,
): string[] {
  const evicted = Object.keys(manifest.atlases).filter((atlas) => {
    const group = atlasGroup(atlas);
    return (
      SCENE_SCOPED_GROUPS.has(group) &&
      !groups.includes(group) &&
      scene.textures.exists(atlasTextureKey(atlas))
    );
  });
  for (const atlas of evicted) {
    for (const key of animationsOn(manifest, atlas)) scene.anims.remove(key);
    scene.textures.remove(atlasTextureKey(atlas));
  }
  return evicted;
}

/** Every animation key `registerFrames` makes on `atlas`: each sheet, clip and direction on it. */
function animationsOn(manifest: ArtManifest, atlas: string): string[] {
  return Object.entries(manifest.sheets).flatMap(([name, sheet]) =>
    Object.entries(sheet.animations).flatMap(([clip, anim]) =>
      animationAtlas(sheet, anim) === atlas
        ? anim.frames.map((_, direction) =>
            animationName(name, clip, direction),
          )
        : [],
    ),
  );
}
