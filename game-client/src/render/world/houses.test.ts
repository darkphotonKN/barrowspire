import { describe, expect, it } from "vitest";
import type { WallState } from "@/types/gameState";
import { housesFrom, insideHouse } from "./houses";

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

/** A run building (AddBuilding): 300×200, walls 20 thick, a 50-wide door gap in the south. */
function runHouse(bx: number, by: number, id: string): WallState[] {
  return [
    wall(bx, by, 300, 20, id),
    wall(bx, by, 20, 200, id),
    wall(bx + 280, by, 20, 200, id),
    wall(bx, by + 180, 125, 20, id),
    wall(bx + 175, by + 180, 125, 20, id),
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
