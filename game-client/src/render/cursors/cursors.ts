/**
 * The baked cursors as CSS (FS-KYPQ9 §H.2): a manifest cursor sheet in, a CSS `cursor` value
 * out, for `scene.input.setDefaultCursor`.
 *
 * The hotspot is the sheet's manifest anchor, scaled to the size of the image the cursor shows,
 * so the click point stays on the gauntlet's fingertip and the strike-mark's centre whatever
 * size the image comes out at. Anything unresolved (no manifest, no such sheet, an atlas that
 * did not load, a frame that cannot be read back) gives the plain browser `fallback`, exactly
 * `default` or `crosshair`, so the pointer always works.
 *
 * Where the image comes from: the frame is cropped from its already-loaded atlas texture to a
 * PNG data URL (Phaser's `textures.getBase64`), see {@link cursorSource}. The bake emits no
 * standalone cursor files: the atlas is the one copy of the art, the manifest the one index, and
 * "the atlas did not load" falls back the same way every other baked sprite does.
 *
 * Phaser-free on purpose: `cursorSource` takes the slice of the texture manager it needs.
 */

import { atlasTextureKey, frameName, type ArtLibrary } from "@/render/art/library";
import type { ArtSheet } from "@/render/art/manifest";

/** The browser cursors the game fell back to before the baked ones, and still does. */
export type CursorFallback = "default" | "crosshair";

export interface CursorImage {
  /** Anything a CSS `url()` takes; a PNG data URL from {@link cursorSource}. */
  url: string;
  width: number;
  height: number;
}

/** Where `cursorCss` reads a cursor's sheet and the image it shows. */
export interface CursorSource {
  sheet(name: string): Pick<ArtSheet, "anchor"> | undefined;
  image(name: string): CursorImage | undefined;
}

/** The slice of Phaser's texture manager that crops a frame to a data URL. */
export interface CursorTextures {
  getBase64(key: string, frame?: string | number): string;
}

const clampPx = (v: number, size: number) =>
  Math.min(size - 1, Math.max(0, Math.round(v)));

/**
 * The CSS `cursor` value for the cursor sheet `name`: `url(...) x y, <fallback>`, the hotspot
 * from the manifest anchor scaled to the image; or exactly `fallback` when there is nothing to
 * show.
 */
export function cursorCss(
  name: string,
  fallback: CursorFallback,
  source: CursorSource | null | undefined,
): string {
  const sheet = source?.sheet(name);
  const image = sheet && source?.image(name);
  if (!sheet || !image) return fallback;
  const x = clampPx(sheet.anchor.x * image.width, image.width);
  const y = clampPx(sheet.anchor.y * image.height, image.height);
  return `url(${image.url}) ${x} ${y}, ${fallback}`;
}

/**
 * A {@link CursorSource} over the scene's art: the sheet when it exists and its atlas loaded,
 * and its first frame cropped from that atlas, at the frame's size.
 */
export function cursorSource(
  art: Pick<ArtLibrary, "sheet">,
  textures: CursorTextures,
): CursorSource {
  return {
    sheet: (name) => art.sheet(name),
    image: (name) => {
      const sheet = art.sheet(name);
      if (!sheet) return undefined;
      const animation = Object.keys(sheet.animations)[0];
      const url = textures.getBase64(
        atlasTextureKey(sheet.atlas),
        frameName(name, animation, 0, 0),
      );
      if (!url) return undefined;
      return { url, width: sheet.frameWidth, height: sheet.frameHeight };
    },
  };
}
