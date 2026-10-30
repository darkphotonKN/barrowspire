import { describe, expect, it } from "vitest";
import type { Rect } from "@/render/iso/projection";
import { FOREST_SIZE, FOREST_WALLS } from "./forest.fixture";
import {
  STAND_CELL,
  TREE_CAP,
  planTreeStands,
  standSheet,
  type TreeStandLook,
} from "./treeStands";

const LOOK: TreeStandLook = {
  live: ["tree_oak_gloom", "tree_pine_gloom"],
  dead: ["tree_dead", "tree_dead_snag"],
};
const SEED = 0x4649_4531;

const inside = (p: { x: number; y: number }, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** ≤ 120 rects tiling the whole 3 120 × 2 000 map: 12 × 10 stands, no open ground at all. */
const FILLED: Rect[] = [...Array(120).keys()].map((i) => {
  const w = FOREST_SIZE.width / 12;
  const h = FOREST_SIZE.height / 10;
  return { x: (i % 12) * w, y: Math.floor(i / 12) * h, width: w, height: h };
});

describe("planTreeStands (FS-3QHQZ §Requirements 23–24)", () => {
  const trees = planTreeStands(FOREST_WALLS, FOREST_SIZE, LOOK, SEED);

  it("should plant every wall rect with a stand, every tree standing on its own rect", () => {
    for (const [i, wall] of FOREST_WALLS.entries()) {
      const own = trees.filter((t) => t.wall === i);
      expect(own.length, `wall ${i}`).toBeGreaterThan(0);
      for (const t of own) expect(inside(t.at, wall), `wall ${i}`).toBe(true);
    }
  });

  it("should plant about one tree per 80 px cell on a stand's edge, its interior thinner", () => {
    // a small forest under the cap: two 10 × 3-cell stands either side of a 4-cell trail
    const size = { width: 800, height: 800 };
    const walls: Rect[] = [
      { x: 0, y: 0, width: 800, height: 240 },
      { x: 0, y: 560, width: 800, height: 240 },
    ];
    const cells = 2 * 10 * 3;
    const planted = planTreeStands(walls, size, LOOK, SEED);
    const edge = planted.filter((t) => t.edge).length;
    const interior = planted.length - edge;
    // every trail-facing cell
    expect(edge).toBe(2 * 10);
    expect(planted.length).toBeLessThan(cells);
    expect(planted.length).toBeGreaterThan(cells / 2);
    // every other interior cell
    expect(interior).toBeGreaterThan(0);
    expect(interior).toBeLessThanOrEqual(
      Math.ceil((cells - edge) / 2) + walls.length,
    );
  });

  it("should keep the 3 120 x 2 000 Forest, past the cap, under 400 trees, its edges before its interiors (FS-KSD6K §Requirements 17)", () => {
    const cells = FOREST_WALLS.reduce(
      (n, w) =>
        n +
        Math.round(w.width / STAND_CELL) * Math.round(w.height / STAND_CELL),
      0,
    );
    expect(cells).toBeGreaterThan(TREE_CAP);
    expect(trees.length).toBeLessThanOrEqual(TREE_CAP);
    // most of the cap is used: only the shares' rounding, and a small stand's thinned interior, are lost
    expect(trees.length).toBeGreaterThan(TREE_CAP * 0.85);
    const edge = trees.filter((t) => t.edge).length;
    expect(edge).toBeGreaterThan(trees.length - edge);
  });

  it("should stand only bare trees in front of the trail, their crowns over it on screen", () => {
    const bare = (ts: typeof trees) =>
      ts.filter((t) => LOOK.dead.includes(t.sheet)).length / ts.length;
    // open ground a cell to a tree's world north or west lies up the screen, under its crown
    const open = (p: { x: number; y: number }) =>
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < FOREST_SIZE.width &&
      p.y < FOREST_SIZE.height &&
      !FOREST_WALLS.some(
        (w) => inside(p, w) && p.x < w.x + w.width && p.y < w.y + w.height,
      );
    const inFront = trees.filter(
      (t) =>
        t.edge &&
        (open({ x: t.at.x - STAND_CELL / 2, y: t.at.y }) ||
          open({ x: t.at.x, y: t.at.y - STAND_CELL / 2 })),
    );
    const behind = trees.filter((t) => !t.edge);
    expect(inFront.length).toBeGreaterThan(20);
    expect(bare(inFront)).toBe(1);
    expect(bare(behind)).toBeLessThan(0.2);
  });

  it("should give two clients given the same walls and seed the same stands", () => {
    expect(planTreeStands(FOREST_WALLS, FOREST_SIZE, LOOK, SEED)).toEqual(
      trees,
    );
    expect(
      planTreeStands(FOREST_WALLS, FOREST_SIZE, LOOK, SEED + 1),
    ).not.toEqual(trees);
  });

  it("should mix live and dead trees about two to one", () => {
    const dead = trees.filter((t) => LOOK.dead.includes(t.sheet)).length;
    const share = dead / trees.length;
    expect(share).toBeGreaterThan(0.24);
    expect(share).toBeLessThan(0.42);
    expect(new Set(trees.map((t) => t.sheet))).toEqual(
      new Set([...LOOK.live, ...LOOK.dead]),
    );
  });

  it("should stand a trail-facing tree at its stand's edge, so what blocks is what is drawn", () => {
    // the great stand west of the main trail's northern run faces open ground on its east side
    const wall = FOREST_WALLS[9]; // x 0, y 480, 1 760 × 400
    const edge = trees.filter((t) => t.wall === 9 && t.edge);
    expect(edge.length).toBeGreaterThan(0);
    for (const t of edge) {
      const fromSide = Math.min(
        t.at.x - wall.x,
        wall.x + wall.width - t.at.x,
        t.at.y - wall.y,
        wall.y + wall.height - t.at.y,
      );
      expect(fromSide).toBeLessThanOrEqual(STAND_CELL / 4);
    }
  });

  it("should never plant past 400 trees for a ≤ 120-rect forest filling the map", () => {
    expect(FILLED.length).toBeLessThanOrEqual(120);
    const filled = planTreeStands(FILLED, FOREST_SIZE, LOOK, SEED);
    expect(filled.length).toBeLessThanOrEqual(TREE_CAP);
    // no open ground at all: every stand is interior, a tree on every other cell
    expect(filled.length).toBeGreaterThan(TREE_CAP / 2);
    for (const t of filled) expect(inside(t.at, FILLED[t.wall])).toBe(true);
  });

  it("should thin a huge stand's interior first, keeping its trail-facing edge whole", () => {
    // the whole map two stands of 39 × 12 cells but for a one-cell trail across its middle: 936
    // cells, past the cap
    const huge: Rect[] = [
      { x: 0, y: 0, width: 3120, height: 960 },
      { x: 0, y: 1040, width: 3120, height: 960 },
    ];
    const planted = planTreeStands(huge, FOREST_SIZE, LOOK, SEED);
    expect(planted.length).toBeLessThanOrEqual(TREE_CAP);
    // 39 cells along each side of the trail, all kept
    const edge = planted.filter((t) => t.edge);
    expect(edge.filter((t) => t.wall === 0)).toHaveLength(39);
    expect(edge.filter((t) => t.wall === 1)).toHaveLength(39);
    // the interior thinned, never the edge
    const interior = planted.filter((t) => !t.edge);
    expect(interior.length).toBeGreaterThan(0);
    expect(interior.length).toBeLessThan(2 * 39 * 11);
  });
});

describe("standSheet (FS-3QHQZ Edge States: client before the tree art)", () => {
  it("should draw a forest tree from its own sheet when the art has it", () => {
    expect(standSheet("tree_dead", () => true)).toBe("tree_dead");
  });

  it.each([
    ["tree_oak_gloom", "tree_oak"],
    ["tree_dead", "tree_oak"],
    ["tree_pine_gloom", "tree_pine"],
    ["tree_dead_snag", "tree_pine"],
  ])(
    "should fall back from a missing %s to the baked %s",
    (sheet, fallback) => {
      expect(
        standSheet(sheet, (s) => s === "tree_oak" || s === "tree_pine"),
      ).toBe(fallback);
    },
  );
});
