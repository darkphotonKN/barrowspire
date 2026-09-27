/**
 * The art library: manifest names in, atlas frames out (FS-2325V §B.6).
 *
 * Scenes ask for art by manifest name ("door_x", state "open") and never see frame geometry.
 * Anything the library cannot resolve (no manifest, a missing sheet, an atlas that failed to
 * load, an unknown state) comes back as the placeholder, logged once, so a scene keeps drawing
 * instead of crashing (FS-2325V "Edge States").
 *
 * Phaser-free on purpose: this is the resolution logic, testable without a canvas. The Phaser
 * side (loading, registering frames and animations, building sprites) is `phaser.ts`.
 */

import type { ArtLight, ArtManifest, ArtSheet } from "./manifest";

/** Texture key of the neutral stand-in `phaser.ts` generates for anything unresolved. */
export const PLACEHOLDER_TEXTURE = "art:placeholder";

/** The anchor a placeholder stands on: bottom centre, like a prop on its footprint. */
const PLACEHOLDER_ANCHOR = { x: 0.5, y: 1 } as const;

export interface ArtLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface FrameQuery {
  /** Animation, state or variant set. Defaults to the sheet's first. */
  animation?: string;
  /** 0 for single-direction sheets; 0..7 clockwise from screen-east for 8-way sheets. */
  direction?: number;
  /** Frame within the animation. Wraps, so a hash can pick a variant directly. */
  index?: number;
}

export type ResolvedFrame =
  | {
      placeholder: false;
      texture: string;
      frame: string;
      anchor: { x: number; y: number };
    }
  | {
      placeholder: true;
      texture: typeof PLACEHOLDER_TEXTURE;
      anchor: { x: number; y: number };
    };

export const atlasTextureKey = (atlas: string) => `art:${atlas}`;

export const frameName = (
  sheet: string,
  animation: string,
  direction: number,
  index: number,
) => `${sheet}/${animation}/${direction}/${index}`;

export const animationName = (
  sheet: string,
  animation: string,
  direction: number,
) => `${sheet}/${animation}/${direction}`;

const wrap = (i: number, n: number) => ((Math.trunc(i) % n) + n) % n;

export class ArtLibrary {
  private readonly warned = new Set<string>();

  /**
   * @param loadedAtlases the atlases whose images actually loaded; a sheet on any other atlas
   *   resolves to the placeholder. Omitted means every atlas in the manifest loaded.
   */
  constructor(
    private readonly manifest: ArtManifest | null,
    private readonly logger: ArtLogger,
    private readonly loadedAtlases?: ReadonlySet<string>,
  ) {}

  /** A library with no manifest: everything is the placeholder. */
  static empty(logger: ArtLogger): ArtLibrary {
    return new ArtLibrary(null, logger);
  }

  /** False when there is no manifest, so a scene can keep its own placeholder graphics. */
  get available(): boolean {
    return this.manifest !== null;
  }

  has(name: string): boolean {
    return this.sheet(name) !== undefined;
  }

  /** The sheet, if it exists and its atlas loaded. */
  sheet(name: string): ArtSheet | undefined {
    const sheet = this.manifest?.sheets[name];
    if (!sheet) return undefined;
    if (this.loadedAtlases && !this.loadedAtlases.has(sheet.atlas))
      return undefined;
    return sheet;
  }

  light(name: string): ArtLight | undefined {
    return this.sheet(name)?.light;
  }

  resolve(name: string, query: FrameQuery = {}): ResolvedFrame {
    const sheet = this.sheet(name);
    if (!sheet)
      return this.placeholder(name, "no such sheet, or its atlas did not load");

    const animation = query.animation ?? Object.keys(sheet.animations)[0];
    const anim = sheet.animations[animation];
    if (!anim)
      return this.placeholder(`${name}/${animation}`, "no such animation");

    const direction = wrap(query.direction ?? 0, sheet.directions);
    const index = wrap(query.index ?? 0, anim.frames[direction].length);
    return {
      placeholder: false,
      texture: atlasTextureKey(sheet.atlas),
      frame: frameName(name, animation, direction, index),
      anchor: sheet.anchor,
    };
  }

  /** The registered Phaser animation key, or undefined when there is nothing to play. */
  animationKey(
    name: string,
    animation: string,
    direction = 0,
  ): string | undefined {
    const sheet = this.sheet(name);
    const anim = sheet?.animations[animation];
    if (!sheet || !anim || anim.frames[0].length < 2) return undefined;
    return animationName(name, animation, wrap(direction, sheet.directions));
  }

  private placeholder(what: string, reason: string): ResolvedFrame {
    if (!this.warned.has(what)) {
      this.warned.add(what);
      this.logger.warn(`art: "${what}" drawn as placeholder`, { reason });
    }
    return {
      placeholder: true,
      texture: PLACEHOLDER_TEXTURE,
      anchor: PLACEHOLDER_ANCHOR,
    };
  }
}
