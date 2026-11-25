/**
 * Exploration of a dungeon floor (FS-SRA9J §B, ADR-0063; CONTEXT.md "Fog of war", "Region"): each
 * region's state, unexplored, explored or visible, from the party's living positions and the
 * regions within two walkable steps of them (FS-SRA9J §Change: Lighter fog and lit regions, F3–F6;
 * ADR-0090 Decision 1). Shared by the party because every client reads every member's position
 * from the same snapshot; nothing is sent or stored for it, so a new floor map or a fresh scene
 * starts over.
 *
 * Pure: no Phaser. The fog layer, the fixed objects and the lights read it.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point } from "@/render/iso/projection";
import type { RegionGrid } from "./dungeon";

/** How much of a region the party is shown (§B.2). */
export type ExplorationState = "unexplored" | "explored" | "visible";

/** A cell of the floor's grid, by column and row. */
type Cell = { cx: number; cy: number };

/**
 * The cell a world point is taken to lie in (§B.7): its own when walkable, or for a point on no
 * walkable cell (a body pressed against a wall's edge, a light hung on a wall) the walkable cell
 * nearest it among the eight around its cell, the shell being one cell deep. None for a point far
 * from all.
 */
function cellAt(grid: RegionGrid, p: Point): Cell | undefined {
  const { cx, cy } = grid.cellOf(p);
  if (grid.region(cx, cy)) return { cx, cy };
  const c = grid.cell;
  let best: Cell | undefined;
  let nearest = Infinity;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!grid.region(cx + dx, cy + dy)) continue;
      // from the point to the cell's square, 0 inside it
      const x0 = (cx + dx) * c;
      const y0 = (cy + dy) * c;
      const d = Math.hypot(Math.max(x0 - p.x, 0, p.x - x0 - c), Math.max(y0 - p.y, 0, p.y - y0 - c));
      if (d < nearest) {
        nearest = d;
        best = { cx: cx + dx, cy: cy + dy };
      }
    }
  return best;
}

/**
 * The region a world point lies in (§B.7): that of its cell, or for a point on no walkable cell (a
 * body pressed against a wall's edge, a light hung on a wall) that of the walkable cell nearest it
 * among the eight around its cell, the shell being one cell deep. 0 for a point far from all.
 */
export function regionAt(grid: RegionGrid, p: Point): number {
  const at = cellAt(grid, p);
  return at ? grid.region(at.cx, at.cy) : 0;
}

/**
 * How many steps from a member's cell a region is reached and so visible (FS-SRA9J §Change: Lighter
 * fog and lit regions, F3; ADR-0090 Decision 1): a step goes north, south, west or east onto a
 * walkable cell, so never through a wall and a diagonal cell only through a walkable cell beside
 * both. Two steps is 160 px on floor 1.
 */
const REACH_STEPS = 2;

/** The four steps from a cell (F3): diagonals are not steps. */
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * The most cells a corridor segment may have and still be seen with a neighbour rather than on its
 * own. The cut leaves a corridor's last cells as a segment of their own (FS-KE075 §A); a member
 * crossing one of 1–3 cells would light it alone for a moment, a blink of fog either side.
 */
export const TINY_SEGMENT = 3;

/**
 * Which regions are seen together (derived here, FS-SRA9J §B): each region by itself, except a tiny
 * corridor segment, seen with the neighbour it shares the most cell sides with: a corridor
 * segment before a room, then the larger, then the lower id. By region id, the id of its group's
 * root; ids not in the map are their own.
 */
function seenTogether(grid: RegionGrid): Map<number, number> {
  const size = new Map<number, number>();
  const kind = new Map<number, string>();
  for (const r of grid.regions) {
    kind.set(r.id, r.kind);
    size.set(r.id, r.cells.reduce((n, c) => n + c.w * c.h, 0));
  }
  // side contacts between regions, by pair
  const contacts = new Map<number, Map<number, number>>();
  const touch = (a: number, b: number) => {
    const of = contacts.get(a) ?? new Map<number, number>();
    contacts.set(a, of);
    of.set(b, (of.get(b) ?? 0) + 1);
  };
  for (let cy = 0; cy < grid.rows; cy++)
    for (let cx = 0; cx < grid.cols; cx++) {
      const a = grid.region(cx, cy);
      if (!a) continue;
      for (const b of [grid.region(cx + 1, cy), grid.region(cx, cy + 1)])
        if (b && b !== a) {
          touch(a, b);
          touch(b, a);
        }
    }
  const root = new Map<number, number>();
  const find = (id: number): number => {
    const up = root.get(id);
    if (up === undefined || up === id) return id;
    const top = find(up);
    root.set(id, top);
    return top;
  };
  for (const r of grid.regions) {
    if (r.kind !== "corridor" || (size.get(r.id) ?? 0) > TINY_SEGMENT) continue;
    const ranked = [...(contacts.get(r.id) ?? new Map<number, number>())].sort(
      ([a, na], [b, nb]) =>
        Number(kind.get(b) === "corridor") - Number(kind.get(a) === "corridor") ||
        nb - na ||
        (size.get(b) ?? 0) - (size.get(a) ?? 0) ||
        a - b,
    );
    if (ranked.length === 0) continue;
    const [to, from] = [find(ranked[0][0]), find(r.id)];
    if (to !== from) root.set(from, to);
  }
  const out = new Map<number, number>();
  for (const r of grid.regions) out.set(r.id, find(r.id));
  return out;
}

/**
 * A lit point (FS-X2CMM R48): a light the fog treats as seen around, as if a delver stood there, out to
 * `cells` cells: the regions within that many walkable steps of its cell are visible while it burns, and a
 * monster or drop pile within that many cells' px of it is shown. A witchlight is one.
 */
export interface LitPoint {
  at: Point;
  cells: number;
}

/** A party member as the snapshot sends one: where they stand, their health, whether they escaped. */
interface Member {
  position: Point;
  current_health?: number;
  escape?: boolean;
}

/**
 * Where the party's living, in-play members stand (§B.3, §B.5): the local player while alive and
 * not escaped, and every other delver likewise, since in a run every other delver is a party
 * member. The dead and the escaped count for nothing.
 */
export function partyPositions(state: {
  current_player?: Member | null;
  other_players?: readonly Member[] | null;
}): Point[] {
  const inPlay = (m: Member) => m.escape !== true && !(m.current_health !== undefined && m.current_health <= 0);
  return [state.current_player, ...(state.other_players ?? [])]
    .filter((m): m is Member => !!m && inPlay(m))
    .map((m) => ({ x: m.position.x, y: m.position.y }));
}

/**
 * How near a living, in-play member a monster or drop pile is shown, in world px, whatever its
 * region's state (FS-SRA9J §D.15, §D.16, B3).
 */
export const SHOWN_WITHIN = 400;

/**
 * Every region of one floor, by its exploration state (§B.2–§B.6), and which monsters and drop
 * piles the party is shown (§D). A region is visible while a living, in-play member's cell reaches
 * one of its cells within {@link REACH_STEPS} walkable steps (FS-SRA9J §Change: Lighter fog and lit
 * regions, F3–F6; ADR-0090 Decision 1, amending ADR-0063 Decision 2's "visible"); the region a
 * member stands in counts as before.
 */
export class Exploration {
  /** By group root (a region, or a tiny segment's group): ever visible. */
  private readonly explored = new Set<number>();
  /** By group root: a living member stands in it now. */
  private visible = new Set<number>();
  /** The party's living, in-play positions as last seen. */
  private party: readonly Point[] = [];
  /** The lit points as last seen (FS-X2CMM R48). */
  private lit: readonly LitPoint[] = [];
  private readonly group: Map<number, number>;
  /**
   * By reach in steps, then cell index (cy × cols + cx): the group roots within that many steps of
   * that walkable cell (F6). They depend on the floor's cells alone, so each cell is walked the first
   * time a member (or a lit point, FS-X2CMM R48) stands on it and only looked up after.
   */
  private readonly reach = new Map<number, Map<number, readonly number[]>>();

  constructor(private readonly grid: RegionGrid) {
    this.group = seenTogether(grid);
  }

  /**
   * The party's exploration of a floor carried onto its floor map re-sent (FS-5FZ4J §J R56): every
   * region `before` had explored stays explored and every one visible stays visible, by region id,
   * until the next {@link see} reads the party on the new cells; a region new to the map (an opened
   * hidden room) starts unexplored. Region ids are kept across a re-send.
   */
  static carried(grid: RegionGrid, before: Exploration): Exploration {
    const after = new Exploration(grid);
    for (const { id } of before.grid.regions) {
      const state = before.state(id);
      if (state === "unexplored") continue;
      after.explored.add(after.root(id));
      if (state === "visible") after.visible.add(after.root(id));
    }
    after.party = before.party;
    return after;
  }

  /**
   * The party's living, in-play positions now (§B.3, §B.5): the regions they stand in, and those
   * their cells reach within two walkable steps (FS-SRA9J §Change: Lighter fog and lit regions, F3,
   * F4; ADR-0090), are visible, and so are those within each lit point's cells of it (FS-X2CMM R48);
   * every region ever visible stays explored (§B.4). True when any region changed state, so the fog
   * and lights redraw only then (F6, §C.13).
   */
  see(positions: readonly Point[], lit: readonly LitPoint[] = []): boolean {
    const now = new Set<number>();
    const reach = (p: Point, steps: number) => {
      const at = cellAt(this.grid, p);
      if (at) for (const id of this.reached(at.cx, at.cy, steps)) now.add(id);
    };
    for (const p of positions) reach(p, REACH_STEPS);
    for (const l of lit) reach(l.at, l.cells);
    const changed = now.size !== this.visible.size || [...now].some((id) => !this.visible.has(id));
    for (const id of now) this.explored.add(id);
    this.visible = now;
    this.party = positions.map((p) => ({ x: p.x, y: p.y }));
    this.lit = lit.map((l) => ({ at: { x: l.at.x, y: l.at.y }, cells: l.cells }));
    return changed;
  }

  /**
   * Whether a monster or drop pile at world point `at` is shown (§D.15, §D.16): it stands in a
   * visible region, or within {@link SHOWN_WITHIN} px of a position the latest {@link see} was
   * given, or within a lit point's cells of it (FS-X2CMM R48), whatever its region's state. Nothing
   * is shown before the party is first seen.
   */
  shows(at: Point): boolean {
    const id = regionAt(this.grid, at);
    if (id && this.visible.has(this.root(id))) return true;
    const near = (p: Point, within: number) => Math.hypot(p.x - at.x, p.y - at.y) <= within;
    return this.party.some((p) => near(p, SHOWN_WITHIN)) || this.lit.some((l) => near(l.at, l.cells * this.grid.cell));
  }

  /** A region's state; unexplored for one never seen. */
  state(region: number): ExplorationState {
    const root = this.root(region);
    if (this.visible.has(root)) return "visible";
    return this.explored.has(root) ? "explored" : "unexplored";
  }

  /** The group roots within `steps` of walkable cell (cx, cy), walked once per cell and reach (F3, F6). */
  private reached(cx: number, cy: number, steps: number): readonly number[] {
    const at = (x: number, y: number) => y * this.grid.cols + x;
    const here = at(cx, cy);
    let byCell = this.reach.get(steps);
    if (!byCell) this.reach.set(steps, (byCell = new Map()));
    const known = byCell.get(here);
    if (known) return known;
    const roots = new Set([this.root(this.grid.region(cx, cy))]);
    const walked = new Set([here]);
    let frontier: Cell[] = [{ cx, cy }];
    for (let step = 0; step < steps; step++) {
      const next: Cell[] = [];
      for (const c of frontier)
        for (const [dx, dy] of STEPS) {
          const [nx, ny] = [c.cx + dx, c.cy + dy];
          if (!this.grid.walkable(nx, ny) || walked.has(at(nx, ny))) continue;
          walked.add(at(nx, ny));
          roots.add(this.root(this.grid.region(nx, ny)));
          next.push({ cx: nx, cy: ny });
        }
      frontier = next;
    }
    const out = [...roots];
    byCell.set(here, out);
    return out;
  }

  private root(region: number): number {
    return this.group.get(region) ?? region;
  }
}
