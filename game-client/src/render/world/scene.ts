/**
 * Phaser side of the world dressing (FS-2325V §C.1–§C.6): turns the pure plans in this folder into
 * sprites. Scenes ask for "the ground", "these walls", "this house's roof"; frame geometry stays
 * in the art library, and anything the library cannot resolve comes back as its placeholder.
 *
 * Every helper takes an `ArtLibrary` and returns null when there is no manifest at all, so the
 * scene keeps its own placeholder graphics (FS-2325V "Edge States": manifest missing or corrupt).
 */

import type Phaser from "phaser";
import { artSprite, showArt } from "@/render/art/phaser";
import type { ArtLibrary } from "@/render/art/library";
import {
  projectedBounds,
  worldDepth,
  worldToScreen,
  type Point,
  type Rect,
} from "@/render/iso";
import type { WallState } from "@/types/gameState";
import {
  sourceFromManifest,
  type LightSource,
} from "@/render/lighting/lighting";
import {
  OUTDOOR_GROUND,
  planGroundLayer,
  tileHash,
  type GroundLook,
  type GroundPiece,
  type WorldKind,
} from "./ground";
import type { House } from "./houses";
import { FADED_ALPHA, occludes, stepAlpha } from "./occlusion";
import { planPerimeter } from "./perimeter";
import { planRoof } from "./roofs";
import type { DressingPiece } from "./runDressing";
import { TIMBER_WALLS, planWalls, trimCrop, type WallSheets } from "./walls";

/** Below every world object: the ground is flat and everything stands on it. */
export const GROUND_DEPTH = -1;
/** Screen px of ground drawn past the projected map, for tiles and decals that overhang it. */
const GROUND_MARGIN = 48;

/** The ground one floor is painted with: its look, and the seed its tiles hash from. */
export interface FloorGround {
  look: GroundLook;
  seed: number;
}

/**
 * The ground, painted once into a render texture (it never moves): the world theme's ground look
 * (outdoor tiles, decals and flagstone under each house; or a tower's flags and planked rooms).
 * Repainted when the houses become known, and with the next floor's look and seed on a climb
 * (FS-8RBQY §C.3).
 */
export class GroundLayer {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly origin: Point;
  private floor?: FloorGround;

  constructor(
    scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly world: {
      width: number;
      height: number;
      kind: WorldKind;
      paths?: readonly Rect[];
      look?: GroundLook;
    },
  ) {
    const b = projectedBounds(world.width, world.height, GROUND_MARGIN);
    this.origin = { x: b.x, y: b.y };
    this.rt = scene.add.renderTexture(
      b.x,
      b.y,
      Math.ceil(b.width),
      Math.ceil(b.height),
    );
    this.rt.setOrigin(0, 0).setDepth(GROUND_DEPTH);
    this.paint([]);
  }

  /** Whether the ground has art; when not, the scene keeps its placeholder floor. */
  static available(
    art: ArtLibrary,
    kind: WorldKind,
    look: GroundLook = OUTDOOR_GROUND,
  ): boolean {
    return art.has(
      look.hall ?? (kind === "hub" ? "ground_grass" : "ground_dirt"),
    );
  }

  /** Paints `houses`' floors over the ground; with `floor`, that floor's ground from now on. */
  paint(houses: readonly House[], floor?: FloorGround): void {
    if (floor) this.floor = floor;
    const { look: worldLook = OUTDOOR_GROUND, ...world } = this.world;
    const look = this.floor?.look ?? worldLook;
    this.rt.clear();
    this.rt.beginDraw();
    this.draw(planGroundLayer({ ...world, houses, look, seed: this.floor?.seed }));
    this.rt.endDraw();
  }

  private draw(pieces: readonly GroundPiece[]): void {
    for (const p of pieces) {
      const sheet = this.art.sheet(p.sheet);
      const frame = this.art.resolve(p.sheet, {
        animation: p.animation,
        index: p.index,
      });
      if (!sheet || frame.placeholder) continue;
      const s = worldToScreen(p.at.x, p.at.y);
      this.rt.batchDrawFrame(
        frame.texture,
        frame.frame,
        Math.round(s.x - sheet.anchor.x * sheet.frameWidth - this.origin.x),
        Math.round(s.y - sheet.anchor.y * sheet.frameHeight - this.origin.y),
      );
    }
  }
}

/** A light source for a sprite's sheet, if its manifest entry declares one. */
function lightOf(
  art: ArtLibrary,
  sheet: string,
  anchor: Point,
  seed: number,
): LightSource | undefined {
  const light = art.light(sheet);
  return light && sourceFromManifest(light, anchor, seed);
}

/** A baked prop standing on a world position, sorted by its footprint. */
export function addProp(
  scene: Phaser.Scene,
  art: ArtLibrary,
  sheet: string,
  at: Point,
  query: { animation?: string; index?: number; layer?: number } = {},
): { sprite: Phaser.GameObjects.Sprite; light?: LightSource } {
  const s = worldToScreen(at.x, at.y);
  const sprite = artSprite(scene, art, s.x, s.y, sheet, query);
  sprite.setDepth(worldDepth(at.x, at.y, query.layer ?? 0));
  return {
    sprite,
    light: lightOf(
      art,
      sheet,
      s,
      tileHash(Math.round(at.x), Math.round(at.y), 17),
    ),
  };
}

/** A floor's run dressing as drawn (FS-8RBQY §C.4): sprites, the tall ones, and brazier light. */
export interface BuiltDressing {
  sprites: Phaser.GameObjects.Sprite[];
  /** Tall enough to stand over a delver: they fade like any occluder. */
  tall: Phaser.GameObjects.Sprite[];
  lights: LightSource[];
}

/**
 * Run dressing as baked props, each sorted by its footprint. Decoration only: the sprites are
 * never made interactive and never join a physics group or collider. A piece whose sheet is
 * missing is skipped (§B.8), and with no manifest at all there is no dressing.
 */
export function addDressing(
  scene: Phaser.Scene,
  art: ArtLibrary,
  pieces: readonly DressingPiece[],
): BuiltDressing {
  const built: BuiltDressing = { sprites: [], tall: [], lights: [] };
  if (!art.available) return built;
  for (const p of pieces) {
    if (!art.has(p.sheet)) continue;
    // the sheet's own animation: variants for the strewn props, the one frame for a brazier
    const { sprite, light } = addProp(scene, art, p.sheet, p.at, {
      index: p.index,
    });
    built.sprites.push(sprite);
    if (p.tall) built.tall.push(sprite);
    if (light) built.lights.push(light);
  }
  return built;
}

export interface BuiltWalls {
  /** Every piece and post, by the server wall it belongs to. */
  byWall: Map<string, Phaser.GameObjects.Sprite[]>;
  /** Full-height pieces: tall enough to hide a delver standing behind them. */
  tall: Phaser.GameObjects.Sprite[];
  /** Declared lights, with the wall they hang on; a back wall's stand under its house's roof. */
  lights: { source: LightSource; wallId: string; underRoof: boolean }[];
}

/**
 * Server walls as baked pieces and corner posts, in timber unless other sheets are named. Null
 * without a manifest, or without those sheets: the scene draws its placeholder blocks instead.
 */
export function addWalls(
  scene: Phaser.Scene,
  art: ArtLibrary,
  walls: readonly WallState[],
  seed: number,
  sheets: WallSheets = TIMBER_WALLS,
): BuiltWalls | null {
  if (!art.available || !art.has(`${sheets.prefix}wall_back_plain_x`))
    return null;
  const built: BuiltWalls = { byWall: new Map(), tall: [], lights: [] };
  const keep = (wallId: string, sprite: Phaser.GameObjects.Sprite) => {
    const list = built.byWall.get(wallId);
    if (list) list.push(sprite);
    else built.byWall.set(wallId, [sprite]);
  };
  const { pieces, posts } = planWalls(walls, seed, sheets);

  for (const p of pieces) {
    const s = worldToScreen(p.at.x, p.at.y);
    const sprite = artSprite(scene, art, s.x, s.y, p.sheet, {
      animation: "variants",
      index: p.index,
    });
    sprite.setDepth(worldDepth(p.depthAt.x, p.depthAt.y));
    const sheet = art.sheet(p.sheet);
    if (p.keep < 1 && sheet) {
      const crop = trimCrop(p.axis, p.keep, {
        width: sheet.frameWidth,
        anchorX: sheet.anchor.x,
      });
      sprite.setCrop(crop.x, 0, crop.width, sheet.frameHeight);
    }
    keep(p.wallId, sprite);
    if (p.height === "back") built.tall.push(sprite);
    const light = lightOf(
      art,
      p.sheet,
      s,
      tileHash(Math.round(p.at.x), Math.round(p.at.y), seed),
    );
    if (light)
      built.lights.push({
        source: light,
        wallId: p.wallId,
        underRoof: p.height === "back",
      });
  }
  for (const post of posts) {
    const s = worldToScreen(post.at.x, post.at.y);
    const sprite = artSprite(scene, art, s.x, s.y, post.sheet);
    sprite.setDepth(worldDepth(post.at.x, post.at.y, 1));
    keep(post.wallId, sprite);
    if (post.height === "back") built.tall.push(sprite);
  }
  return built;
}

/** The tower's outer wall as drawn: its sprites, and the cold light each arrow slit lets in. */
export interface BuiltPerimeter {
  sprites: Phaser.GameObjects.Sprite[];
  lights: LightSource[];
}

/**
 * The tower's outer wall around a `width` × `height` play area (FS-8RBQY §B.5). Null without a
 * manifest or without the tower's perimeter sheets: the wall is then left out (§B.8, R4).
 */
export function addPerimeter(
  scene: Phaser.Scene,
  art: ArtLibrary,
  width: number,
  height: number,
): BuiltPerimeter | null {
  if (!art.available || !art.has("tower_perimeter_back_plain_x")) return null;
  const built: BuiltPerimeter = { sprites: [], lights: [] };
  const { pieces, posts } = planPerimeter(width, height);
  for (const p of pieces) {
    const s = worldToScreen(p.at.x, p.at.y);
    const sprite = artSprite(scene, art, s.x, s.y, p.sheet, {
      animation: "variants",
      index: p.index,
    });
    built.sprites.push(sprite.setDepth(worldDepth(p.depthAt.x, p.depthAt.y)));
    const light = lightOf(
      art,
      p.sheet,
      s,
      tileHash(Math.round(p.at.x), Math.round(p.at.y), 29),
    );
    if (light) built.lights.push(light);
  }
  for (const post of posts) {
    const s = worldToScreen(post.at.x, post.at.y);
    const sprite = artSprite(scene, art, s.x, s.y, post.sheet);
    built.sprites.push(
      sprite.setDepth(worldDepth(post.rect.x, post.rect.y, 1)),
    );
  }
  return built;
}

/** A house's roof as baked slope and ridge pieces, or null without a manifest. */
export function addRoof(
  scene: Phaser.Scene,
  art: ArtLibrary,
  house: House,
): Phaser.GameObjects.Sprite[] | null {
  if (!art.available) return null;
  return planRoof(house).map((p) => {
    const s = worldToScreen(p.at.x, p.at.y);
    const sprite = artSprite(scene, art, s.x, s.y - p.lift, p.sheet, {
      animation: p.animation,
    });
    return sprite.setDepth(worldDepth(p.at.x, p.at.y, 2));
  });
}

/**
 * Shows an interactable's baked frame for its server state (FS-2325V §C.4). Without that sheet it
 * keeps the scene's own placeholder texture when one is given, else the library's placeholder.
 */
export function showState(
  sprite: Phaser.GameObjects.Sprite,
  art: ArtLibrary,
  sheet: string,
  state: string,
  fallbackTexture?: string,
): void {
  if (!art.has(sheet) && fallbackTexture) {
    sprite.setTexture(fallbackTexture).setOrigin(0.5, 0.5);
    return;
  }
  showArt(sprite, art, sheet, { animation: state });
}

/**
 * Trees, tall props, back walls and roofs that fade while they stand over the delver (§C.5).
 * Occluders do not move, so their bounds are taken once.
 */
export class Occluders {
  private readonly items: {
    sprite: Phaser.GameObjects.Sprite;
    bounds: Rect;
  }[] = [];

  add(sprites: readonly Phaser.GameObjects.Sprite[]): void {
    for (const sprite of sprites) {
      const b = sprite.getBounds();
      this.items.push({
        sprite,
        bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      });
    }
  }

  /** How many occluders are held. */
  get size(): number {
    return this.items.length;
  }

  /** Let go of every occluder: the floor they stood on has been torn down (FS-F6F88 req 33). */
  clear(): void {
    this.items.length = 0;
  }

  /** Eases each occluder toward faded or restored; `subject` is the delver, or null if gone. */
  update(subject: { bounds: Rect; depth: number } | null, dtMs: number): void {
    for (const { sprite, bounds } of this.items) {
      if (!sprite.active) continue;
      const target =
        subject && occludes({ bounds, depth: sprite.depth }, subject)
          ? FADED_ALPHA
          : 1;
      if (sprite.alpha !== target)
        sprite.setAlpha(stepAlpha(sprite.alpha, target, dtMs));
    }
  }
}
