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
import type { ArtLibrary, ArtLogger } from "@/render/art/library";
import {
  WALL_HEIGHT,
  WORLD_PX_PER_TILE,
  addUprightBlock,
  addWorldPlane,
  boxFaces,
  projectRect,
  projectedBounds,
  raise,
  splitAlongLength,
  worldDepth,
  worldToScreen,
  type BlockStyle,
  type Point,
  type Rect,
} from "@/render/iso";
import type { WallState } from "@/types/gameState";
import { palette, shade } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import {
  sourceFromManifest,
  type LightSource,
} from "@/render/lighting/lighting";
import {
  OUTDOOR_GROUND,
  planEdgeFade,
  planGroundLayer,
  tileHash,
  type Apron,
  type GroundLook,
  type GroundPiece,
  type WorldKind,
} from "./ground";
import { BAKE } from "./bake";
import {
  darkOpening,
  planBuildings,
  planCap,
  type DarkOpening,
  type DoorGap,
  type WallLook,
} from "./buildingLooks";
import type { House } from "./houses";
import { FADED_ALPHA, occludes, stepAlpha, type Sorted } from "./occlusion";
import { planPerimeter } from "./perimeter";
import { planGables, planRoof } from "./roofs";
import type { DressingPiece } from "./runDressing";
import {
  TIMBER_WALLS,
  planWalls,
  trimCrop,
  type WallPiece,
  type WallSheets,
} from "./walls";

/** Below every world object: the ground is flat and everything stands on it. */
export const GROUND_DEPTH = -1;
/** Screen px of ground drawn past the projected map, for tiles and decals that overhang it. */
const GROUND_MARGIN = 48;

/** The ground one floor is painted with: its look, and the seed its tiles hash from. */
export interface FloorGround {
  look: GroundLook;
  seed: number;
}

/** The world a `GroundLayer` paints: its size and kind, its paths, and its look. */
interface GroundWorldBase {
  width: number;
  height: number;
  kind: WorldKind;
  paths?: readonly Rect[];
  /** Ground under a forest's stands, laid as leaf litter (FS-3QHQZ §Requirements 25). */
  litter?: readonly Rect[];
  look?: GroundLook;
}

/**
 * A `GroundLayer`'s world: either its ground runs on past the edge (aprons, a margin), or it fades
 * out at the edge with nothing painted past it, never both.
 */
export type GroundWorld = GroundWorldBase &
  (
    | {
        /** Ground past the edge (FS-0XMCP R18), within `margin`'s reach of the map. */
        aprons?: readonly Apron[];
        /** Screen px of ground painted past the projected map; absent, GROUND_MARGIN. */
        margin?: number;
        fadeEdge?: false;
      }
    | {
        /**
         * The ground fades out at the map's edge into the camera's background, and nothing is
         * painted past it: a field's edge tint (FS-KSD6K §Requirements 16). So no aprons and no
         * margin: past the edge they would only be erased.
         */
        fadeEdge: true;
        aprons?: never;
        margin?: never;
      }
  );

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
  /** The painted ground again, added over itself: a look's lift. Made the first time one asks. */
  private lifted?: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly world: GroundWorld,
  ) {
    const b = projectedBounds(world.width, world.height, world.margin ?? GROUND_MARGIN);
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
      look.hall ?? (kind === "run" ? "ground_dirt" : "ground_grass"),
    );
  }

  /** Paints `houses`' floors over the ground; with `floor`, that floor's ground from now on. */
  paint(houses: readonly House[], floor?: FloorGround): void {
    if (floor) this.floor = floor;
    const { look: worldLook = OUTDOOR_GROUND, ...world } = this.world;
    const look = this.floor?.look ?? worldLook;
    // a recoloured ground (a field's greens): the whole painted layer under one multiply
    if (look.tint === undefined) this.rt.clearTint();
    else this.rt.setTint(look.tint);
    this.lift(look);
    this.rt.clear();
    this.rt.beginDraw();
    const { fadeEdge, ...plan } = world;
    this.draw(planGroundLayer({ ...plan, houses, look, seed: this.floor?.seed }));
    this.rt.endDraw();
    if (fadeEdge) this.fadeEdge();
  }

  /**
   * Erases the painted ground along the map's edge and past it (`planEdgeFade`), once per paint,
   * so it fades into the background the camera shows there. The lift is the same texture, so it
   * fades with it.
   */
  private fadeEdge(): void {
    const { width, height } = this.world;
    // far enough past the map to cover every px painted around it
    const reach = width + height;
    const g = this.scene.make.graphics({}, false);
    for (const band of planEdgeFade(width, height, reach)) {
      const corners = [
        worldToScreen(band.x, band.y),
        worldToScreen(band.x + band.width, band.y),
        worldToScreen(band.x + band.width, band.y + band.height),
        worldToScreen(band.x, band.y + band.height),
      ].map((p) => ({ x: p.x - this.origin.x, y: p.y - this.origin.y }));
      // only the alpha erases; the colour is never seen
      g.fillStyle(BARROW_HEX.pitch, band.erase);
      g.fillPoints(corners, true);
    }
    this.rt.erase(g, 0, 0);
    g.destroy();
  }

  /**
   * A look's lift (a daylit field): the same painted texture drawn again just over it, additively,
   * at the lift's share and under the same tint, so the ground brightens with its texture intact.
   */
  private lift(look: GroundLook): void {
    const share = look.lift ?? 0;
    if (share <= 0) {
      this.lifted?.setVisible(false);
      return;
    }
    this.lifted ??= this.scene.add
      .image(this.origin.x, this.origin.y, this.rt.texture)
      .setOrigin(0, 0)
      .setDepth(GROUND_DEPTH)
      .setBlendMode("ADD");
    this.lifted.setVisible(true).setAlpha(Math.min(1, share));
    if (look.tint === undefined) this.lifted.clearTint();
    else this.lifted.setTint(look.tint);
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
        p.alpha ?? 1,
        p.shade,
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
  /** Tall enough to stand over a player: they fade like any occluder. */
  tall: Phaser.GameObjects.Sprite[];
  lights: LightSource[];
}

/**
 * Run dressing (and a forest's verges, FS-3QHQZ §Requirements 28) as baked props, each sorted by
 * its footprint. Decoration only: the sprites are
 * never made interactive and never join a physics group or collider. A piece whose sheet is
 * missing is skipped (§B.8), and with no manifest at all there is no dressing.
 */
export function addDressing(
  scene: Phaser.Scene,
  art: ArtLibrary,
  pieces: readonly (Omit<DressingPiece, "sheet"> & { sheet: string })[],
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
  /** Full-height pieces: tall enough to hide a player standing behind them. */
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
    const sprite = pieceSprite(scene, art, p);
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
 * The timber gables closing a roof's two ends (FS-9PN7X §B.3, ADR-0036), each piece on its foot
 * lifted to the roof's line and sorted behind the end wall it rises from, which hides its foot.
 * They are the roof's: shown and hidden with it, and never faded (§E.4). None without a manifest
 * or the gable sheets: the roof then stands open at its ends, as it did before them.
 */
export function addGables(
  scene: Phaser.Scene,
  art: ArtLibrary,
  house: House,
  wallThickness: number,
): Phaser.GameObjects.Sprite[] {
  const pieces = planGables(house, wallThickness);
  if (pieces.length === 0 || !art.has(pieces[0].sheet)) return [];
  return pieces.map((p) => {
    const s = worldToScreen(p.at.x, p.at.y);
    const sprite = artSprite(scene, art, s.x, s.y - p.lift, p.sheet, { animation: p.animation });
    return sprite.setDepth(worldDepth(p.depthAt.x, p.depthAt.y));
  });
}

/** One drawn piece of a building: a baked sprite, or a placeholder block or slab. */
export type BuildingPart =
  | Phaser.GameObjects.Sprite
  | Phaser.GameObjects.Graphics
  | Phaser.GameObjects.Container;

/**
 * A drawn part as cover (FS-9PN7X §E.1): the screen bounds and depth it covers a player by, and
 * the part itself, whose pixels the silhouette shows through (§E.3).
 */
export interface Cover extends Sorted {
  part: BuildingPart;
}

/** Parts as drawn, with what each covers a player by. */
export interface BuiltParts {
  parts: BuildingPart[];
  cover: Cover[];
}

/** One building drawn in both its looks (ADR-0036, FS-9PN7X §B): a scene shows one at a time. */
export interface BuiltBuilding {
  house: House;
  /** Standing in both looks: the north and west walls and the posts already full height. */
  shared: BuildingPart[];
  /** The interior look only: the cut-away fronts and their low posts. */
  interior: BuildingPart[];
  /**
   * The building exterior only: the full-height fronts and their posts, the stone cap of a type
   * that has one, and the dark openings in its door gaps when asked for. The roof is the
   * scene's, as it always was (`addRoof`).
   */
  exterior: BuildingPart[];
  /** Every part drawn from outside (shared and exterior), as what covers the player (§E.1). */
  cover: Cover[];
  /** Lights the interior look's walls declare, as `addWalls` hands them back. */
  lights: { source: LightSource; wallId: string; underRoof: boolean }[];
}

export interface BuildingOptions {
  /** The building type's sheets (FS-9PN7X §B.1); timber unless named. */
  sheets?: WallSheets;
  /**
   * Where the walls leave an entrance that shows a dark opening from outside (§B.5): the hub's
   * town doors are gaps, so it passes `doorGaps`. None by default: where every gap holds a door (a
   * run's rooms), an open door's opening is `addDarkOpening`'s and a shut one is a door.
   */
  openings?: (walls: readonly WallState[]) => readonly DoorGap[];
  /** Placeholder block colours; stone by default. */
  style?: BlockStyle;
  /** Where a missing sheet is reported, once per sheet per art library. */
  logger?: ArtLogger;
}

/** The placeholder block a wall falls back to: stone, as the run scene's pre-art walls. */
export const PLACEHOLDER_STONE: BlockStyle = {
  top: palette.wall,
  south: palette.wallShade,
  east: shade(palette.wall, 0.5),
  edge: { width: 1, color: palette.wallLight, alpha: 0.6 },
};

/** The dark opening's placeholder: flat darkness, every face one ink (§B.7). */
const PLACEHOLDER_DARK: BlockStyle = {
  top: palette.inkDeep,
  south: palette.inkDeep,
  east: palette.inkDeep,
};

/** Sheets already reported missing, per art library: one warning per sheet (FS-9PN7X §B.7). */
const reported = new WeakMap<ArtLibrary, Set<string>>();

function reportMissing(art: ArtLibrary, sheet: string, logger: ArtLogger): void {
  // no manifest at all is reported once by the loader
  if (!art.available) return;
  const seen = reported.get(art) ?? new Set<string>();
  reported.set(art, seen);
  if (seen.has(sheet)) return;
  seen.add(sheet);
  logger.warn(`art: no "${sheet}"; that building part is drawn as a placeholder`, { sheet });
}

/** The screen rect a set of screen points spans. */
function spanOf(points: readonly Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** How tall a placeholder side stands: as the baked pieces beside it, or the pre-art wall. */
function placeholderHeight(art: ArtLibrary, sheets: WallSheets, full: boolean): number {
  const baked = art.has(`${sheets.prefix}wall_${full ? "back" : "front"}_plain_x`);
  if (!baked) return WALL_HEIGHT;
  return (full ? BAKE.WALL_BACK : BAKE.WALL_FRONT) * BAKE.VPX;
}

/** An upright placeholder block on a world rect, with what each of its pieces covers. */
function placeholderBlock(
  scene: Phaser.Scene,
  rect: Rect,
  style: BlockStyle,
  height: number,
): BuiltParts {
  const { x, y, width, height: depth } = rect;
  const parts = addUprightBlock(scene, x, y, width, depth, style, height);
  // addUprightBlock cuts the rect exactly so, one graphics object per piece
  const pieces = splitAlongLength(x, y, width, depth, WORLD_PX_PER_TILE);
  const cover = parts.map((g, i) => {
    const p = pieces[i];
    const { top, south, east } = boxFaces(p.x, p.y, p.width, p.height, height);
    return { bounds: spanOf([...top, ...south, ...east]), depth: g.depth, part: g };
  });
  return { parts, cover };
}

/**
 * A flat slab on a plane lifted `lift` screen px over the ground, as cover (FS-9PN7X §E.1): the
 * screen span of its world `rect` raised so, and the depth `part` sorts at. A placeholder roof
 * or cap covers the player as the baked pieces do.
 */
export function slabCover(part: BuildingPart, rect: Rect, lift: number): Cover {
  const { x, y, width, height } = rect;
  return { bounds: spanOf(raise(projectRect(x, y, width, height), lift)), depth: part.depth, part };
}

/** A sprite as cover: its drawn bounds, taken once (building parts never move), and its depth. */
export const coverOf = (sprite: Phaser.GameObjects.Sprite): Cover => {
  const b = sprite.getBounds();
  return {
    bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
    depth: sprite.depth,
    part: sprite,
  };
};

/** A wall piece as its baked sprite, trimmed and sorted as `addWalls` draws it. */
function pieceSprite(
  scene: Phaser.Scene,
  art: ArtLibrary,
  p: WallPiece,
): Phaser.GameObjects.Sprite {
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
  return sprite;
}

/**
 * Every building the walls describe, drawn in both looks (FS-9PN7X §B), showing its exterior: the
 * player starts outside every building. Walls with no house are not drawn here (`addWalls`).
 *
 * Never null: without a manifest or a sheet, a wall falls back to a placeholder block as tall as
 * the pieces it stands beside, the cap to a flat slab at the wall top, the dark opening to a flat
 * `inkDeep` quad, so a building always closes (§B.7). No part joins `Occluders` (§E.4): buildings
 * take the silhouette, not the fade.
 */
export function addBuildings(
  scene: Phaser.Scene,
  art: ArtLibrary,
  walls: readonly WallState[],
  seed: number,
  options: BuildingOptions = {},
): BuiltBuilding[] {
  const sheets = options.sheets ?? TIMBER_WALLS;
  const style = options.style ?? PLACEHOLDER_STONE;
  const logger = options.logger ?? console;
  const byId = new Map(walls.map((w) => [w.entity_id, w]));
  const gaps = options.openings?.(walls) ?? [];

  return planBuildings(walls, seed, sheets).map((plan) => {
    const built: BuiltBuilding = {
      house: plan.house,
      shared: [],
      interior: [],
      exterior: [],
      cover: [],
      lights: [],
    };
    const draw = (look: WallLook, full: boolean, lit: boolean): BuiltParts => {
      const out: BuiltParts = { parts: [], cover: [] };
      const byWall = new Map<string, WallPiece[]>();
      for (const p of look.pieces) byWall.set(p.wallId, [...(byWall.get(p.wallId) ?? []), p]);
      for (const [wallId, pieces] of byWall) {
        const missing = pieces.filter((p) => !art.has(p.sheet)).map((p) => p.sheet);
        if (missing.length > 0) {
          // one block for the whole wall: a side is never half baked, half placeholder
          for (const sheet of new Set(missing)) reportMissing(art, sheet, logger);
          const w = byId.get(wallId)!;
          const block = placeholderBlock(
            scene,
            { x: w.position.x, y: w.position.y, width: w.width, height: w.height },
            style,
            placeholderHeight(art, sheets, full),
          );
          out.parts.push(...block.parts);
          out.cover.push(...block.cover);
          continue;
        }
        for (const p of pieces) {
          const sprite = pieceSprite(scene, art, p);
          out.parts.push(sprite);
          out.cover.push(coverOf(sprite));
          const anchor = worldToScreen(p.at.x, p.at.y);
          const light =
            lit && lightOf(art, p.sheet, anchor, tileHash(Math.round(p.at.x), Math.round(p.at.y), seed));
          if (light)
            built.lights.push({ source: light, wallId, underRoof: p.height === "back" });
        }
      }
      // a missing post is left out: the placeholder blocks overlap at the corners anyway
      for (const post of look.posts) {
        if (!art.has(post.sheet)) {
          reportMissing(art, post.sheet, logger);
          continue;
        }
        const s = worldToScreen(post.at.x, post.at.y);
        const sprite = artSprite(scene, art, s.x, s.y, post.sheet);
        sprite.setDepth(worldDepth(post.at.x, post.at.y, 1));
        out.parts.push(sprite);
        out.cover.push(coverOf(sprite));
      }
      return out;
    };

    const shared = draw(plan.shared, true, true);
    const interior = draw(plan.interior, false, true);
    const exterior = draw(plan.exterior, true, false);
    if (sheets.cap) {
      const cap = addCap(scene, art, plan.house, sheets, seed, logger);
      exterior.parts.push(...cap.parts);
      exterior.cover.push(...cap.cover);
    }
    for (const gap of gaps.filter((g) => g.houseId === plan.house.id)) {
      const opening = addDarkOpening(scene, art, darkOpening(gap, sheets), sheets, logger);
      exterior.parts.push(...opening.parts);
      exterior.cover.push(...opening.cover);
    }

    built.shared = shared.parts;
    built.interior = interior.parts;
    built.exterior = exterior.parts;
    built.cover = [...shared.cover, ...exterior.cover];
    showLook(built, "exterior");
    return built;
  });
}

/** Shows one of a building's looks and hides the other; the shared walls stand in both. */
export function showLook(building: BuiltBuilding, look: "exterior" | "interior"): void {
  for (const part of building.shared) part.setVisible(true);
  for (const part of building.exterior) part.setVisible(look === "exterior");
  for (const part of building.interior) part.setVisible(look === "interior");
}

/**
 * A masonry building's stone cap (FS-9PN7X §B.3): baked slabs sorted by their footprints like
 * roof pieces, or one flat placeholder slab at the wall top over the room (like the scenes'
 * `placeholderRoof`).
 */
function addCap(
  scene: Phaser.Scene,
  art: ArtLibrary,
  house: House,
  sheets: WallSheets,
  seed: number,
  logger: ArtLogger,
): BuiltParts {
  const pieces = planCap(house, sheets, seed);
  const out: BuiltParts = { parts: [], cover: [] };
  if (pieces.length === 0) return out;
  if (art.has(pieces[0].sheet)) {
    for (const p of pieces) {
      const s = worldToScreen(p.at.x, p.at.y);
      const sprite = artSprite(scene, art, s.x, s.y - p.lift, p.sheet, {
        animation: "variants",
        index: p.index,
      });
      sprite.setDepth(worldDepth(p.at.x, p.at.y, 2));
      out.parts.push(sprite);
      out.cover.push(coverOf(sprite));
    }
    return out;
  }
  reportMissing(art, pieces[0].sheet, logger);
  const lift = placeholderHeight(art, sheets, true);
  const plane = addWorldPlane(scene, lift);
  const { x, y, width, height } = house;
  plane.root.setDepth(worldDepth(x + width / 2, y + height / 2, 2));
  const slab = scene.add.graphics();
  slab.fillStyle(palette.wallShade, 1);
  slab.fillRect(x, y, width, height);
  slab.lineStyle(2, palette.wall, 1);
  slab.strokeRect(x, y, width, height);
  plane.surface.add(slab);
  out.parts.push(plane.root);
  out.cover.push(slabCover(plane.root, house, lift));
  return out;
}

/**
 * An entrance seen from outside (FS-9PN7X §B.5): the type's dark opening, sorted like the door it
 * stands for, or without its sheet a flat `inkDeep` quad over the opening, as tall as the type's
 * walls stand (§B.7). A scene shows it in a town door gap (through `addBuildings`) or in place of
 * an open run door's frame.
 */
export function addDarkOpening(
  scene: Phaser.Scene,
  art: ArtLibrary,
  opening: DarkOpening,
  sheets: WallSheets,
  logger: ArtLogger = console,
): BuiltParts {
  if (art.has(opening.sheet)) {
    const s = worldToScreen(opening.at.x, opening.at.y);
    const sprite = artSprite(scene, art, s.x, s.y, opening.sheet);
    sprite.setDepth(worldDepth(opening.depthAt.x, opening.depthAt.y, 1));
    return { parts: [sprite], cover: [coverOf(sprite)] };
  }
  reportMissing(art, opening.sheet, logger);
  const full = placeholderHeight(art, sheets, true);
  return placeholderBlock(scene, opening.rect, PLACEHOLDER_DARK, full);
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
 * Trees, tall props, back walls and roofs that fade while they stand over the player (§C.5).
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

  /** Eases each occluder toward faded or restored; `subject` is the player, or null if gone. */
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
