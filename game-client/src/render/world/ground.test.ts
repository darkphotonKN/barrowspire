import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE } from "@/render/iso";
import {
  planDecals,
  planFloors,
  planGround,
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
