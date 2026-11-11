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
import type { PieceRule, WallAxis, WallHeight } from "./walls";

/** A floor map that carries a cell grid and its regions. */
export type DungeonMap = Pick<FloorMap, "width" | "height"> & {
  cell_size: number;
  regions: readonly FloorRegion[];
};

/** Whether a floor map is a dungeon floor's: built on a cell grid, with its regions (§F.31). */
export function isDungeon<M extends { cell_size?: number; regions?: readonly FloorRegion[] }>(
  map: M,
): map is M & DungeonMap {
  return !!map.cell_size && (map.regions?.length ?? 0) > 0;
}

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
 *
 * A run's pieces stop at its end posts (`betweenPosts`): where an x run and a y run meet they share
 * the corner's cell, and each one's half of that cell past the post would stick out of the corner.
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
  return { height, lit, betweenPosts: true };
}

/**
 * The map's walls as the runs their pieces are cut along (§H.46), from the wall cells and the faces
 * they show, never from how the server merged them. The server merges row by row (levelgen
 * `mergeCells`), so its rects are the floor's rows: a wall along world y comes as rects that stop a
 * cell short of every corner, a cell of it lone between two corners as a 1×1 rect (cut along x),
 * and rows of a thick wall along y as rungs across it. Cut rect by rect, such a wall is a row of
 * slabs standing across it with gaps between (the walls running top right to bottom left on
 * screen).
 *
 * A wall cell faces a region along x when a walkable cell lies directly north or south of it, and
 * along y when one lies directly west or east. A run is a line of cells facing the same way, one
 * after another, reaching on one cell at each end into the wall it meets: so a corner's cell is in
 * both its runs, cut whole along each, as a row's corner always was, and its post stands at that
 * cell's centre. Only runs of two cells or more are kept; a wall cell no run reaches is a one-cell
 * wall of its own. The y runs come first, so where runs cross, the cell's axis is x (`wallLayout`),
 * as the rows made it. A run keeps the entity id of the wall its first facing cell is in.
 */
export function wallRuns(walls: readonly WallState[], grid: RegionGrid): WallState[] {
  const c = grid.cell;
  const at = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows ? cy * grid.cols + cx : -1;
  const owner = new Map<number, string>();
  for (const w of walls)
    for (let cx = Math.round(w.position.x / c); cx < Math.round((w.position.x + w.width) / c); cx++)
      for (let cy = Math.round(w.position.y / c); cy < Math.round((w.position.y + w.height) / c); cy++)
        if (at(cx, cy) >= 0) owner.set(at(cx, cy), w.entity_id);
  const wall = (cx: number, cy: number) => owner.has(at(cx, cy));
  const faces = (axis: WallAxis, cx: number, cy: number) =>
    wall(cx, cy) &&
    (axis === "x"
      ? grid.walkable(cx, cy - 1) || grid.walkable(cx, cy + 1)
      : grid.walkable(cx - 1, cy) || grid.walkable(cx + 1, cy));

  const runs: WallState[] = [];
  const covered = new Set<number>();
  for (const axis of ["y", "x"] as const) {
    // a lane is a column for a run along y, a row for one along x; `cell` maps (lane, step) to (cx, cy)
    const lanes = axis === "x" ? grid.rows : grid.cols;
    const steps = axis === "x" ? grid.cols : grid.rows;
    const cell = (lane: number, step: number): [number, number] => (axis === "x" ? [step, lane] : [lane, step]);
    for (let lane = 0; lane < lanes; lane++)
      for (let step = 0; step < steps; ) {
        if (!faces(axis, ...cell(lane, step))) {
          step++;
          continue;
        }
        const id = owner.get(at(...cell(lane, step)))!;
        let from = step;
        while (step < steps && faces(axis, ...cell(lane, step))) step++;
        let to = step - 1;
        if (wall(...cell(lane, from - 1))) from--;
        if (wall(...cell(lane, to + 1))) to++;
        if (to === from) continue;
        for (let s = from; s <= to; s++) covered.add(at(...cell(lane, s)));
        const [cx, cy] = cell(lane, from);
        const length = (to - from + 1) * c;
        runs.push({
          entity_id: id,
          position: { x: cx * c, y: cy * c },
          width: axis === "x" ? length : c,
          height: axis === "x" ? c : length,
        });
      }
  }
  for (const [i, id] of owner)
    if (!covered.has(i))
      runs.push({
        entity_id: id,
        position: { x: (i % grid.cols) * c, y: Math.floor(i / grid.cols) * c },
        width: c,
        height: c,
      });
  return runs;
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
