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

/** ≤ 120 rects tiling the whole 2 080 × 1 360 map: 12 × 10 stands, no open ground at all. */
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
    const cells = FOREST_WALLS.reduce(
      (n, w) =>
        n +
        Math.round(w.width / STAND_CELL) * Math.round(w.height / STAND_CELL),
      0,
    );
    expect(cells).toBeLessThanOrEqual(TREE_CAP);
    const edge = trees.filter((t) => t.edge).length;
    const interior = trees.length - edge;
    expect(trees.length).toBeLessThan(cells);
    expect(trees.length).toBeGreaterThan(cells / 2);
    // every other interior cell
    expect(interior).toBeGreaterThan(0);
    expect(interior).toBeLessThanOrEqual(
      Math.ceil((cells - edge) / 2) + FOREST_WALLS.length,
    );
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
    // the stand south of the trail into the main clearing faces open ground on its north side
    const wall = FOREST_WALLS[19]; // x 960, y 800, 320 × 240
    const edge = trees.filter((t) => t.wall === 19 && t.edge);
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
    // the whole map two stands of 26 × 8 cells but for a one-cell trail across its middle: 416
    // cells, past the cap
    const huge: Rect[] = [
      { x: 0, y: 0, width: 2080, height: 640 },
      { x: 0, y: 720, width: 2080, height: 640 },
    ];
    const planted = planTreeStands(huge, FOREST_SIZE, LOOK, SEED);
    expect(planted.length).toBeLessThanOrEqual(TREE_CAP);
    // 26 cells along each side of the trail, all kept
    const edge = planted.filter((t) => t.edge);
    expect(edge.filter((t) => t.wall === 0)).toHaveLength(26);
    expect(edge.filter((t) => t.wall === 1)).toHaveLength(26);
    // the interior thinned, never the edge
    const interior = planted.filter((t) => !t.edge);
    expect(interior.length).toBeGreaterThan(0);
    expect(interior.length).toBeLessThan(2 * 26 * 7);
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
