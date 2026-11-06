/**
 * A dungeon floor (FS-KE075 §H, CONTEXT.md "Floor map", "Region", "Void"): a floor whose map
 * carries regions on a grid of cells. Every walkable cell is in one region, a room or a corridor
 * segment; the non-walkable cells 8-adjacent to one are the shell, which the map's walls cover;
 * everything else is void.
 *
 * Pure data and maths, no Phaser: what the scene needs to draw the floor without buildings, from
 * the map alone.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point, Rect } from "@/render/iso/projection";
import type { FloorMap, FloorRegion, WallState } from "@/types/gameState";
import { axisOf, type PieceRule, type WallHeight } from "./walls";

/** A floor map that carries a cell grid and its regions. */
export type DungeonMap = Pick<FloorMap, "width" | "height"> & {
  cell_size: number;
  regions: readonly FloorRegion[];
};

/** The floor's cells, each with the region it lies in (0: none, a shell or void cell). */
export class RegionGrid {
  /** World px per cell side. */
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private readonly ids: Uint16Array;
  private readonly kinds = new Map<number, FloorRegion["kind"]>();
  private readonly listed: readonly FloorRegion[];

  constructor(map: DungeonMap) {
    this.listed = [...map.regions].sort((a, b) => a.id - b.id);
    this.cell = map.cell_size;
    this.cols = Math.ceil(map.width / this.cell);
    this.rows = Math.ceil(map.height / this.cell);
    this.ids = new Uint16Array(this.cols * this.rows);
    for (const region of map.regions) {
      this.kinds.set(region.id, region.kind);
      for (const r of region.cells)
        for (let cx = r.x; cx < r.x + r.w; cx++)
          for (let cy = r.y; cy < r.y + r.h; cy++)
            if (this.inside(cx, cy)) this.ids[cy * this.cols + cx] = region.id;
    }
  }

  /** The id of the region cell (cx, cy) lies in; 0 for a shell or void cell, or off the grid. */
  region(cx: number, cy: number): number {
    return this.inside(cx, cy) ? this.ids[cy * this.cols + cx] : 0;
  }

  /** The kind of region cell (cx, cy) lies in; none for a shell or void cell. */
  kind(cx: number, cy: number): FloorRegion["kind"] | undefined {
    return this.kinds.get(this.region(cx, cy));
  }

  /** Whether cell (cx, cy) is walkable: in a region. */
  walkable(cx: number, cy: number): boolean {
    return this.region(cx, cy) !== 0;
  }

  /**
   * Whether ground is painted at a world point (§H.44): on a walkable cell or the shell around one
   * (8-adjacent). Everything else is void, where nothing is painted.
   */
  hasGround(at: Point): boolean {
    const { cx, cy } = this.cellOf(at);
    if (!this.inside(cx, cy)) return false;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (this.walkable(cx + dx, cy + dy)) return true;
    return false;
  }

  /**
   * Whether cell (cx, cy) is a doorway: a room's cell where another region meets it side on, as
   * the generator places a corridor's mouth (FS-KE075 §A).
   */
  doorway(cx: number, cy: number): boolean {
    const id = this.region(cx, cy);
    if (this.kinds.get(id) !== "room") return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const other = this.region(cx + dx, cy + dy);
      return other !== 0 && other !== id;
    });
  }

  /** Every region, by id, with its cells. */
  get regions(): readonly FloorRegion[] {
    return this.listed;
  }

  /** The cell a world point lies in. */
  cellOf(p: Point): { cx: number; cy: number } {
    return { cx: Math.floor(p.x / this.cell), cy: Math.floor(p.y / this.cell) };
  }

  private inside(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows;
  }
}

/**
 * How a dungeon floor draws each wall piece (FS-KE075 §H.46): **front** (cut away, low) when a
 * walkable cell lies directly north or west of the piece's cell, so it bounds a region on the
 * region's south or east side; otherwise **back** (full height). Front wins where walkable cells
 * lie on both sides, so nothing in play is hidden.
 *
 * A shell cell whose only walkable neighbour is to its north-west is the corner where a region's
 * low south and east sides meet: it is front too, as a house's south-east corner post is (two
 * front walls give a front post, `planWalls`), rather than a full-height stub standing in front of
 * the room.
 *
 * Only a room's back wall carries a light (§H.47): a corridor's walls and every front stay dark.
 */
export function wallRule(grid: RegionGrid): PieceRule {
  const height = (at: Point): WallHeight => {
    const { cx, cy } = grid.cellOf(at);
    const low = grid.walkable(cx, cy - 1) || grid.walkable(cx - 1, cy) || grid.walkable(cx - 1, cy - 1);
    return low ? "front" : "back";
  };
  /** Wall light sources stand on rooms' back walls (§H.47): a room lies south or east of it. */
  const lit = (at: Point): boolean => {
    if (height(at) === "front") return false;
    const { cx, cy } = grid.cellOf(at);
    return grid.kind(cx, cy + 1) === "room" || grid.kind(cx + 1, cy) === "room";
  };
  return { height, lit };
}

/**
 * The map's walls as the pieces are cut from them: a wall one cell thick as it is, a block thicker
 * than a cell as one-cell strips along its run, so each strip is cut along its own centreline and
 * takes its own height (§H.46), rather than one run through the middle of the block. A strip keeps
 * its wall's entity id: it goes with the wall.
 */
export function stripWalls(walls: readonly WallState[], cell: number): WallState[] {
  return walls.flatMap((w) => {
    const across = axisOf(w) === "x" ? w.height : w.width;
    const count = Math.round(across / cell);
    if (count <= 1) return [w];
    return Array.from({ length: count }, (_, k) =>
      axisOf(w) === "x"
        ? { ...w, position: { x: w.position.x, y: w.position.y + k * cell }, height: cell }
        : { ...w, position: { x: w.position.x + k * cell, y: w.position.y }, width: cell },
    );
  });
}

/** A room of a dungeon floor, as its dressing sees it (§H.47). */
export interface DressingRoom {
  id: number;
  /** The room's cells' bounding rect, world px. */
  rect: Rect;
  /**
   * Whether a footprint square (world px) may stand here: every cell it touches is this room's,
   * so never in a corridor or over the shell, and none lies within one cell of a doorway.
   */
  clear(square: Rect): boolean;
}

/** Every room of the floor, by region id: where run dressing may stand (§H.47). */
export function dressingRooms(grid: RegionGrid): DressingRoom[] {
  const c = grid.cell;
  const nearDoorway = (cx: number, cy: number) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (grid.doorway(cx + dx, cy + dy)) return true;
    return false;
  };
  return grid.regions
    .filter((r) => r.kind === "room")
    .map((region) => {
      const x0 = Math.min(...region.cells.map((r) => r.x));
      const y0 = Math.min(...region.cells.map((r) => r.y));
      const x1 = Math.max(...region.cells.map((r) => r.x + r.w));
      const y1 = Math.max(...region.cells.map((r) => r.y + r.h));
      const clear = (sq: Rect): boolean => {
        // the cells the square touches: one ending on a cell edge does not touch the next
        const from = grid.cellOf({ x: sq.x, y: sq.y });
        const to = { cx: Math.ceil((sq.x + sq.width) / c) - 1, cy: Math.ceil((sq.y + sq.height) / c) - 1 };
        for (let cx = from.cx; cx <= to.cx; cx++)
          for (let cy = from.cy; cy <= to.cy; cy++)
            if (grid.region(cx, cy) !== region.id || nearDoorway(cx, cy)) return false;
        return true;
      };
      return {
        id: region.id,
        rect: { x: x0 * c, y: y0 * c, width: (x1 - x0) * c, height: (y1 - y0) * c },
        clear,
      };
    });
}
