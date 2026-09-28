import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE } from "@/render/iso";
import { BAKE } from "./bake";
import { planRoof } from "./roofs";

const T = WORLD_PX_PER_TILE;
const WALL_TOP = BAKE.WALL_BACK * BAKE.VPX;
const RISE = BAKE.ROOF_RISE * BAKE.VPX;

describe("planRoof", () => {
  // a run house: 300×200, so the ridge runs along x
  const house = { id: "a", x: 100, y: 60, width: 300, height: 200 };
  const roof = planRoof(house);
  const slopes = roof.filter((p) => p.sheet === "roof_slope");
  const ridge = roof.filter((p) => p.sheet === "roof_ridge");

  it("should run the ridge along the house's longer side, over its middle", () => {
    expect(ridge.length).toBeGreaterThan(0);
    expect(ridge.every((p) => p.animation === "x" && p.at.y === 160)).toBe(
      true,
    );
  });

  it("should slope each half down, away from the ridge", () => {
    expect(
      slopes.filter((p) => p.at.y > 160).every((p) => p.animation === "s"),
    ).toBe(true);
    expect(
      slopes.filter((p) => p.at.y < 160).every((p) => p.animation === "n"),
    ).toBe(true);
  });

  it("should seat the eave row on the back walls' tops and lift each row toward the ridge", () => {
    const south = slopes.filter(
      (p) => p.animation === "s" && p.at.x === slopes[0].at.x,
    );
    const byDistance = [...south].sort((a, b) => b.at.y - a.at.y); // eave first
    byDistance.forEach((p, k) =>
      expect(p.lift).toBeCloseTo(WALL_TOP + k * RISE),
    );
    expect(ridge[0].lift).toBeCloseTo(WALL_TOP + byDistance.length * RISE);
  });

  it("should cover the whole house, eaves overhanging", () => {
    const xs = roof.map((p) => p.at.x);
    const ys = slopes.map((p) => p.at.y);
    expect(Math.min(...xs) - T / 2).toBeLessThan(house.x);
    expect(Math.max(...xs) + T / 2).toBeGreaterThan(house.x + house.width);
    expect(Math.min(...ys) - T / 2).toBeLessThan(house.y);
    expect(Math.max(...ys) + T / 2).toBeGreaterThan(house.y + house.height);
  });

  it("should turn the ridge along y for a house deeper than it is wide", () => {
    const deep = planRoof({ id: "b", x: 0, y: 0, width: 200, height: 300 });
    expect(
      deep
        .filter((p) => p.sheet === "roof_ridge")
        .every((p) => p.animation === "y"),
    ).toBe(true);
    const faces = new Set(
      deep.filter((p) => p.sheet === "roof_slope").map((p) => p.animation),
    );
    expect(faces).toEqual(new Set(["e", "w"]));
  });
});
