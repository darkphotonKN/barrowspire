/**
 * Exploration of a dungeon floor (FS-SRA9J §B, ADR-0063; CONTEXT.md "Fog of war", "Region"): each
 * region's state, unexplored, explored or visible, from the party's living positions. Shared by the
 * party because every client reads every member's position from the same snapshot; nothing is sent
 * or stored for it, so a new floor map or a fresh scene starts over.
 *
 * Pure: no Phaser. The fog layer, the fixed objects and the lights read it.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point } from "@/render/iso/projection";
import type { RegionGrid } from "./dungeon";

/** How much of a region the party is shown (§B.2). */
export type ExplorationState = "unexplored" | "explored" | "visible";

/**
 * The region a world point lies in (§B.7): that of its cell, or for a point on no walkable cell (a
 * body pressed against a wall's edge, a light hung on a wall) that of the walkable cell nearest it
 * among the eight around its cell, the shell being one cell deep. 0 for a point far from all.
 */
export function regionAt(grid: RegionGrid, p: Point): number {
  const { cx, cy } = grid.cellOf(p);
  const own = grid.region(cx, cy);
  if (own) return own;
  const c = grid.cell;
  let best = 0;
  let nearest = Infinity;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const id = grid.region(cx + dx, cy + dy);
      if (!id) continue;
      // from the point to the cell's square, 0 inside it
      const x0 = (cx + dx) * c;
      const y0 = (cy + dy) * c;
      const d = Math.hypot(Math.max(x0 - p.x, 0, p.x - x0 - c), Math.max(y0 - p.y, 0, p.y - y0 - c));
      if (d < nearest) {
        nearest = d;
        best = id;
      }
    }
  return best;
}

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

/** Every region of one floor, by its exploration state (§B.2–§B.6). */
export class Exploration {
  /** By group root (a region, or a tiny segment's group): ever visible. */
  private readonly explored = new Set<number>();
  /** By group root: a living member stands in it now. */
  private visible = new Set<number>();
  private readonly group: Map<number, number>;

  constructor(private readonly grid: RegionGrid) {
    this.group = seenTogether(grid);
  }

  /**
   * The party's living, in-play positions now (§B.3, §B.5): the regions they stand in are visible,
   * every region ever visible stays explored (§B.4). True when any region changed state.
   */
  see(positions: readonly Point[]): boolean {
    const now = new Set<number>();
    for (const p of positions) {
      const id = regionAt(this.grid, p);
      if (id) now.add(this.root(id));
    }
    const changed = now.size !== this.visible.size || [...now].some((id) => !this.visible.has(id));
    for (const id of now) this.explored.add(id);
    this.visible = now;
    return changed;
  }

  /** A region's state; unexplored for one never seen. */
  state(region: number): ExplorationState {
    const root = this.root(region);
    if (this.visible.has(root)) return "visible";
    return this.explored.has(root) ? "explored" : "unexplored";
  }

  private root(region: number): number {
    return this.group.get(region) ?? region;
  }
}
