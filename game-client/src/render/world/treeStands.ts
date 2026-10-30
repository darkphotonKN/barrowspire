/**
 * A forest's tree stands (FS-3QHQZ §Requirements 23–24): every server wall rect drawn as baked
 * trees filling its footprint, so what the player sees blocking the trail is exactly what the
 * server collides against. The forest's edge is its own border of trees: no wall pieces, no
 * perimeter.
 *
 * About one tree per 80 px cell of a stand, jittered within the cell. A cell facing open ground
 * is a stand's **edge**: its tree stands at the stand's very edge, so the trail reads clearly. The
 * interior is thinner, a tree on every other cell, wandering, the litter showing between trunks.
 * Past the forest's cap, each stand keeps its share: edge trees first, then an evenly thinned
 * interior, never more.
 *
 * Live and dead trees run about two to one, but not evenly: a tree on a stand's north or west edge
 * stands in front of the trail on screen, its crown over the ground the player walks, so it is
 * always bare (a dead tree or a snag) and the trail shows through it; the stand's other trees are
 * live but for one in twelve.
 *
 * Every pick is a hash of the cell and the world seed, never `Math.random`: every client plants
 * the same forest. Pure planning, no Phaser; `FieldScene` draws it.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point, Rect } from "@/render/iso/projection";
import { tileHash } from "./ground";

/** World px of stand per tree, each way: the server's own cell. */
export const STAND_CELL = 80;
/** The most trees one forest draws (FS-3QHQZ §Requirements 23). */
export const TREE_CAP = 400;
/** How far inside its stand's edge a trail-facing tree's foot stands, world px. */
const EDGE_INSET = 14;
/** How far an interior tree may wander from its cell's centre, as a share of the cell. */
const JITTER = 0.3;

/** The baked trees a forest's stands are planted with, chosen between by hash. */
export interface TreeStandLook {
  /** Dark, low-saturation oaks and pines; repeat a sheet to weight it. */
  live: readonly string[];
  /** Bare, gnarled trees and broken snags: about one tree in three. */
  dead: readonly string[];
}

/** One tree on its stand. */
export interface StandTree {
  sheet: string;
  /** Variant within the sheet; the art library wraps it, so a raw hash is fine. */
  index: number;
  /** The tree's foot, inside its stand. */
  at: Point;
  /** The wall rect it stands on, by its index in the broadcast. */
  wall: number;
  /** On a side facing open ground, at the stand's very edge. */
  edge: boolean;
}

interface Cell {
  rect: Rect;
  /** The cell's place in its stand's checkerboard, for a thinner interior. */
  even: boolean;
  /**
   * Open ground lies to its world north or west: up the screen, under its tree's crown, so the
   * tree stands in front of the trail as drawn.
   */
  front: boolean;
  /** Which way open ground lies: -1, 0 or 1 on each axis; null when none touches the cell. */
  open: { x: number; y: number } | null;
}

const within = (p: Point, r: Rect) =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

/** `k` of `list`, spread evenly through it. */
function evenly<T>(list: readonly T[], k: number): T[] {
  if (k <= 0) return [];
  if (k >= list.length) return [...list];
  return [...Array(k).keys()].map(
    (i) => list[Math.floor(((i + 0.5) * list.length) / k)],
  );
}

/** A stand's cells, each with the side of it that faces open ground inside the map. */
function cellsOf(
  wall: Rect,
  walls: readonly Rect[],
  size: { width: number; height: number },
): Cell[] {
  const cols = Math.max(1, Math.round(wall.width / STAND_CELL));
  const rows = Math.max(1, Math.round(wall.height / STAND_CELL));
  const w = wall.width / cols;
  const h = wall.height / rows;
  const map = { x: 0, y: 0, ...size };
  const openAt = (p: Point) =>
    within(p, map) && !walls.some((r) => within(p, r));
  const cells: Cell[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const rect = {
        x: wall.x + i * w,
        y: wall.y + j * h,
        width: w,
        height: h,
      };
      const c = { x: rect.x + w / 2, y: rect.y + h / 2 };
      const side = (dx: number, dy: number) =>
        openAt({ x: c.x + dx * w, y: c.y + dy * h });
      const x = (side(1, 0) ? 1 : 0) - (side(-1, 0) ? 1 : 0);
      const y = (side(0, 1) ? 1 : 0) - (side(0, -1) ? 1 : 0);
      const straight = side(1, 0) || side(-1, 0) || side(0, 1) || side(0, -1);
      // a corner of open ground touching only diagonally: lean the tree toward it
      const diagonal = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].find(([dx, dy]) => side(dx, dy));
      cells.push({
        rect,
        even: (i + j) % 2 === 0,
        front: side(-1, 0) || side(0, -1) || side(-1, -1),
        open: straight
          ? { x, y }
          : diagonal
            ? { x: diagonal[0], y: diagonal[1] }
            : null,
      });
    }
  return cells;
}

/** Where a cell's tree stands: at the open side's edge, or wandering about the cell's centre. */
function footOf(cell: Cell, h: number): Point {
  const { rect, open } = cell;
  const wander = (bits: number, span: number) =>
    ((bits & 0xff) / 0xff - 0.5) * 2 * JITTER * span;
  const along = (lo: number, span: number, toward: number, bits: number) =>
    toward > 0
      ? lo + span - EDGE_INSET
      : toward < 0
        ? lo + EDGE_INSET
        : lo + span / 2 + wander(bits, span);
  return {
    x: along(rect.x, rect.width, open?.x ?? 0, h >>> 12),
    y: along(rect.y, rect.height, open?.y ?? 0, h >>> 20),
  };
}

/**
 * Every wall rect's stand, from the broadcast's walls in order. Under the cap, a tree on every
 * edge cell and every other interior cell; past it, each stand keeps one tree, so no wall stands
 * unseen, and its share of the rest of the cap by area, its edge before its interior.
 */
export function planTreeStands(
  walls: readonly Rect[],
  size: { width: number; height: number },
  look: TreeStandLook,
  seed: number,
): StandTree[] {
  const stands = walls.map((wall) => cellsOf(wall, walls, size));
  const total = stands.reduce((n, cells) => n + cells.length, 0);
  // the server's wall budget keeps the rects well under the cap, so one tree each always fits
  const rest = Math.max(0, TREE_CAP - stands.length);
  const trees: StandTree[] = [];
  stands.forEach((cells, wall) => {
    const share =
      total <= TREE_CAP
        ? cells.length
        : 1 +
          Math.floor(
            (rest * (cells.length - 1)) / Math.max(1, total - stands.length),
          );
    const edge = cells.filter((c) => c.open);
    const interior = cells.filter((c) => !c.open && c.even);
    const kept =
      edge.length >= share
        ? evenly(edge, share)
        : [...edge, ...evenly(interior, share - edge.length)];
    for (const cell of kept) {
      const h = tileHash(
        Math.round(cell.rect.x + cell.rect.width / 2),
        Math.round(cell.rect.y + cell.rect.height / 2),
        seed,
      );
      const kind = cell.front || h % 12 === 0 ? look.dead : look.live;
      trees.push({
        sheet: kind[(h >>> 4) % kind.length],
        index: h >>> 8,
        at: footOf(cell, h),
        wall,
        edge: cell.open !== null,
      });
    }
  });
  return trees;
}

/** The existing baked tree each forest tree falls back to, by its silhouette. */
const FALLBACK: Record<string, string> = {
  tree_oak_gloom: "tree_oak",
  tree_dead: "tree_oak",
  tree_pine_gloom: "tree_pine",
  tree_dead_snag: "tree_pine",
};

/**
 * The sheet a stand's tree is drawn from: its own, or before the forest's art exists, the baked
 * oak or pine it most resembles, so collision is still visible (FS-3QHQZ Edge States).
 */
export function standSheet(
  sheet: string,
  has: (sheet: string) => boolean,
): string {
  return has(sheet) ? sheet : (FALLBACK[sheet] ?? "tree_oak");
}
