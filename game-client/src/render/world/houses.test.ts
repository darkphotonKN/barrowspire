import { describe, expect, it } from "vitest";
import type { WallState } from "@/types/gameState";
import { housesFrom, insideHouse, axisOf, onOutline } from "./houses";

const wall = (
  x: number,
  y: number,
  width: number,
  height: number,
  house_id?: string,
): WallState => ({
  entity_id: `${x},${y},${width},${height}`,
  house_id,
  position: { x, y },
  width,
  height,
});

/** A run building (AddBuilding): 300×200, walls 20 thick, an 80-wide door gap in the south. */
function runHouse(bx: number, by: number, id: string): WallState[] {
  return [
    wall(bx, by, 300, 20, id),
    wall(bx, by, 20, 200, id),
    wall(bx + 280, by, 20, 200, id),
    wall(bx, by + 180, 110, 20, id),
    wall(bx + 190, by + 180, 110, 20, id),
  ];
}

describe("housesFrom", () => {
  it("should bound each house by the walls that share its house_id", () => {
    const houses = housesFrom([
      ...runHouse(100, 60, "a"),
      ...runHouse(600, 400, "b"),
    ]);
    expect(houses).toEqual([
      { id: "a", x: 100, y: 60, width: 300, height: 200 },
      { id: "b", x: 600, y: 400, width: 300, height: 200 },
    ]);
  });

  it("should leave out walls that belong to no house", () => {
    expect(housesFrom([wall(0, 0, 400, 20)])).toEqual([]);
  });
});

describe("insideHouse", () => {
  const house = { id: "a", x: 100, y: 60, width: 300, height: 200 };

  it("should count the boundary as inside, as the scene always has", () => {
    expect(insideHouse({ x: 100, y: 60 }, house)).toBe(true);
    expect(insideHouse({ x: 400, y: 260 }, house)).toBe(true);
    expect(insideHouse({ x: 250, y: 160 }, house)).toBe(true);
  });

  it("should put anything past an edge outside", () => {
    expect(insideHouse({ x: 99.9, y: 160 }, house)).toBe(false);
    expect(insideHouse({ x: 250, y: 260.1 }, house)).toBe(false);
  });
});

describe("onOutline, the one outline test (doorGaps, isPartition)", () => {
  // a 300 × 240 house, walls 20 thick, a partition across it at x 140
  const house = { id: "h", x: 0, y: 0, width: 300, height: 240 };
  const w = (x: number, y: number, width: number, height: number) => ({
    entity_id: `${x},${y}`,
    house_id: "h",
    position: { x, y },
    width,
    height,
  });

  it.each([
    ["the north wall", w(0, 0, 300, 20)],
    ["the west wall", w(0, 0, 20, 240)],
    ["the east wall", w(280, 0, 20, 240)],
    ["a south segment beside the door gap", w(190, 220, 110, 20)],
  ])("should put %s on the outline", (_name, wall) => {
    expect(onOutline(wall, house)).toBe(true);
  });

  it.each([
    ["a partition segment reaching the north edge end on", w(140, 0, 20, 95)],
    ["a partition segment reaching the south edge end on", w(140, 145, 20, 95)],
    ["a furnishing clear of every edge", w(100, 100, 40, 30)],
  ])("should keep %s off the outline", (_name, wall) => {
    expect(onOutline(wall, house)).toBe(false);
  });

  it("should allow for float noise on the edge", () => {
    expect(onOutline(w(0, 1e-9, 300, 20), house)).toBe(true);
  });

  it("should run a wall along its longer side, a square one along x", () => {
    expect([axisOf({ width: 300, height: 20 }), axisOf({ width: 20, height: 240 }), axisOf({ width: 20, height: 20 })]).toEqual(["x", "y", "x"]);
  });
});
