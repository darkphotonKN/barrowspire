import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE } from "@/render/iso";
import {
  OUTDOOR_GROUND,
  TOWER_GROUND,
  planDecals,
  planFloors,
  planGround,
  planGroundLayer,
  tileHash,
  transitionEdge,
  worldSeed,
} from "./ground";

const T = WORLD_PX_PER_TILE;

describe("tileHash", () => {
  it("should give the same value for the same world tile every time", () => {
    for (const [tx, ty] of [
      [0, 0],
      [7, 3],
      [-4, 19],
      [35, 23],
    ])
      expect(tileHash(tx, ty, 11)).toBe(tileHash(tx, ty, 11));
  });

  it("should give neighbouring tiles different values", () => {
    const seen = new Set<number>();
    for (let tx = 0; tx < 10; tx++)
      for (let ty = 0; ty < 10; ty++) seen.add(tileHash(tx, ty, 1) % 4);
    expect(seen.size).toBe(4);
  });

  it("should seed per world, so the hub and a run do not share a pattern", () => {
    expect(worldSeed("hub")).not.toBe(worldSeed("run"));
    const differs = [...Array(20).keys()].some(
      (i) =>
        tileHash(i, i * 3, worldSeed("hub")) !==
        tileHash(i, i * 3, worldSeed("run")),
    );
    expect(differs).toBe(true);
  });
});

describe("planGround", () => {
  it("should cover the map with one tile per world tile, centred on it", () => {
    const tiles = planGround({ width: 4 * T, height: 3 * T, kind: "run" });
    expect(tiles).toHaveLength(12);
    expect(tiles[0].at).toEqual({ x: T / 2, y: T / 2 });
    expect(tiles.at(-1)!.at).toEqual({ x: 3.5 * T, y: 2.5 * T });
  });

  it("should plan the same ground for the same place on every client", () => {
    const a = planGround({ width: 36 * T, height: 24 * T, kind: "run" });
    const b = planGround({ width: 36 * T, height: 24 * T, kind: "run" });
    expect(a).toEqual(b);
  });

  it("should lay barrow dirt in a run and grass in the hub", () => {
    const run = planGround({ width: 3 * T, height: 3 * T, kind: "run" });
    const hub = planGround({ width: 3 * T, height: 3 * T, kind: "hub" });
    expect(new Set(run.map((t) => t.sheet))).toEqual(new Set(["ground_dirt"]));
    expect(new Set(hub.map((t) => t.sheet))).toEqual(new Set(["ground_grass"]));
  });

  it("should lay dirt under a path and blend the grass that borders it", () => {
    // a one-tile path in the middle of a 3×3 patch of grass
    const tiles = planGround({
      width: 3 * T,
      height: 3 * T,
      kind: "hub",
      paths: [{ x: T, y: T, width: T, height: T }],
    });
    const at = (tx: number, ty: number) =>
      tiles.find(
        (t) => t.at.x === (tx + 0.5) * T && t.at.y === (ty + 0.5) * T,
      )!;
    expect(at(1, 1).sheet).toBe("ground_dirt");
    // the tile north of the path has dirt intruding from its south edge
    expect(at(1, 0)).toMatchObject({
      sheet: "ground_grass_dirt",
      animation: "s",
    });
    expect(at(2, 1)).toMatchObject({
      sheet: "ground_grass_dirt",
      animation: "w",
    });
    // only a diagonal neighbour is dirt: a corner
    expect(at(0, 0)).toMatchObject({
      sheet: "ground_grass_dirt",
      animation: "se",
    });
  });
});

describe("transitionEdge", () => {
  const only =
    (...dirs: [number, number][]) =>
    (dx: number, dy: number) =>
      dirs.some(([x, y]) => x === dx && y === dy);

  it.each<[string, [number, number][], string | undefined]>([
    ["nothing", [], undefined],
    ["north", [[0, -1]], "n"],
    ["east", [[1, 0]], "e"],
    [
      "north and east",
      [
        [0, -1],
        [1, 0],
      ],
      "ne",
    ],
    [
      "south and west",
      [
        [0, 1],
        [-1, 0],
      ],
      "sw",
    ],
    ["only the north-west diagonal", [[-1, -1]], "nw"],
  ])("should name the edge for %s", (_, dirs, want) => {
    expect(transitionEdge(only(...dirs))).toBe(want);
  });
});

describe("planFloors", () => {
  it("should flag a house with flagstone, the grid centred on the house", () => {
    // 300×200: 7.5 × 5 tiles, so 8 × 5 tiles overhanging 10px either side along x
    const tiles = planFloors(
      [{ id: "a", x: 100, y: 60, width: 300, height: 200 }],
      worldSeed("run"),
    );
    expect(tiles).toHaveLength(40);
    expect(tiles.every((t) => t.sheet === "ground_flagstone")).toBe(true);
    const xs = tiles.map((t) => t.at.x);
    expect(Math.min(...xs)).toBe(100 - 10 + T / 2);
    expect(Math.max(...xs)).toBe(400 + 10 - T / 2);
    expect(Math.min(...tiles.map((t) => t.at.y))).toBe(60 + T / 2);
  });
});

describe("planDecals", () => {
  const house = { id: "a", x: 4 * T, y: 4 * T, width: 8 * T, height: 6 * T };

  it("should scatter the same decals every time", () => {
    const a = planDecals({
      width: 30 * T,
      height: 20 * T,
      kind: "hub",
      houses: [house],
    });
    const b = planDecals({
      width: 30 * T,
      height: 20 * T,
      kind: "hub",
      houses: [house],
    });
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it("should keep decals out of houses", () => {
    const decals = planDecals({
      width: 30 * T,
      height: 20 * T,
      kind: "run",
      houses: [house],
    });
    for (const d of decals) {
      const inside =
        d.at.x >= house.x &&
        d.at.x <= house.x + house.width &&
        d.at.y >= house.y &&
        d.at.y <= house.y + house.height;
      expect(inside).toBe(false);
    }
  });

  it("should only use decal sheets", () => {
    const decals = planDecals({
      width: 30 * T,
      height: 20 * T,
      kind: "hub",
      houses: [],
    });
    expect(decals.every((d) => d.sheet.startsWith("decal_"))).toBe(true);
  });
});

describe("planGroundLayer", () => {
  const houses = [
    { id: "a", x: 100, y: 60, width: 300, height: 200 },
    { id: "b", x: 600, y: 400, width: 400, height: 300 },
  ];
  const world = { width: 36 * T, height: 24 * T, kind: "run" as const, houses };
  const inRoom = (p: { x: number; y: number }) =>
    houses.some(
      (h) =>
        p.x >= h.x - T / 2 &&
        p.x <= h.x + h.width + T / 2 &&
        p.y >= h.y &&
        p.y <= h.y + h.height,
    );

  it("should paint the outdoor ground exactly as before: dirt, then tufts and pebbles, then flagstone", () => {
    const seed = worldSeed("run");
    expect(planGroundLayer({ ...world, look: OUTDOOR_GROUND })).toEqual([
      ...planGround(world),
      ...planDecals(world),
      ...planFloors(houses, seed),
    ]);
  });

  describe("the tower interior (FS-8RBQY §B.1)", () => {
    const tower = planGroundLayer({ ...world, look: TOWER_GROUND });

    it("should lay no grass and no decal of any kind", () => {
      expect(tower.some((p) => p.sheet.includes("grass"))).toBe(false);
      expect(tower.some((p) => p.sheet.startsWith("decal_"))).toBe(false);
    });

    it("should lay the halls in worn flags, one per world tile", () => {
      const halls = tower.filter((p) => p.sheet === "ground_flags");
      expect(halls).toHaveLength(36 * 24);
      expect(new Set(halls.map((p) => p.animation))).toEqual(
        new Set(["variants"]),
      );
      expect(new Set(halls.map((p) => p.index % 4)).size).toBe(4);
    });

    it("should plank every room floor, over the halls, on the same grid the flagstone used", () => {
      const planks = tower.filter((p) => p.sheet === "ground_planks");
      const flagstone = planFloors(houses, worldSeed("run"));
      expect(planks.map((p) => p.at)).toEqual(flagstone.map((p) => p.at));
      expect(planks.every((p) => inRoom(p.at))).toBe(true);
      // drawn after the halls, so a room's planks lie over the flags beneath
      expect(
        tower.findIndex((p) => p.sheet === "ground_planks"),
      ).toBeGreaterThan(tower.findLastIndex((p) => p.sheet === "ground_flags"));
    });

    it("should be the same plan on every call", () => {
      expect(planGroundLayer({ ...world, look: TOWER_GROUND })).toEqual(tower);
    });
  });

  describe("barrow earth breaking through the flags (FS-8RBQY §C.2, the lower band)", () => {
    const look = {
      ...TOWER_GROUND,
      patches: { sheet: "ground_dirt", edge: "ground_flags_dirt", count: 7 },
    };
    const lower = planGroundLayer({ ...world, look, houses: [] });
    const at = (p: { at: { x: number; y: number } }) =>
      `${Math.floor(p.at.x / T)},${Math.floor(p.at.y / T)}`;
    const dirt = new Set(lower.filter((p) => p.sheet === "ground_dirt").map(at));

    it("should lay a few patches of earth among the flags, still one tile per world tile", () => {
      expect(lower).toHaveLength(36 * 24);
      expect(dirt.size).toBeGreaterThan(10);
      expect(dirt.size).toBeLessThan((36 * 24) / 4);
    });

    it("should edge each patch with the flags/dirt transition, facing the earth", () => {
      const edges = lower.filter((p) => p.sheet === "ground_flags_dirt");
      expect(edges.length).toBeGreaterThan(0);
      for (const e of edges) {
        const [tx, ty] = at(e).split(",").map(Number);
        const near = [-1, 0, 1].some((dx) =>
          [-1, 0, 1].some((dy) => dirt.has(`${tx + dx},${ty + dy}`)),
        );
        expect(near).toBe(true);
        expect(["n", "e", "s", "w", "ne", "se", "sw", "nw"]).toContain(e.animation);
      }
    });

    it("should lay the same patches for the same seed, and others for another", () => {
      expect(planGroundLayer({ ...world, look, houses: [] })).toEqual(lower);
      expect(planGroundLayer({ ...world, look, houses: [], seed: 99 })).not.toEqual(lower);
    });
  });

  it("should seed the ground from the floor when one is given, and from the world kind when not", () => {
    const base = planGroundLayer({ ...world, look: TOWER_GROUND });
    expect(planGroundLayer({ ...world, look: TOWER_GROUND, seed: worldSeed("run") })).toEqual(base);
    expect(planGroundLayer({ ...world, look: TOWER_GROUND, seed: 5 })).not.toEqual(base);
  });
});
