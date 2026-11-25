import { describe, expect, it } from "vitest";
import { facingFrom, facingVector, nearestScreenFacing, type Facing8 } from "./facing";

describe("facingFrom", () => {
  it.each<[number, number, Facing8]>([
    [0, -1, "n"],
    [1, -1, "ne"],
    [1, 0, "e"],
    [1, 1, "se"],
    [0, 1, "s"],
    [-1, 1, "sw"],
    [-1, 0, "w"],
    [-1, -1, "nw"],
  ])("should resolve world velocity (%d, %d) to %s", (vx, vy, want) => {
    expect(facingFrom(vx, vy, "s")).toBe(want);
  });

  it("should resolve a velocity to the nearest of eight directions", () => {
    expect(facingFrom(10, -3, "s")).toBe("e"); // ~17° off east
    expect(facingFrom(10, -6, "s")).toBe("ne"); // ~31° off east
    expect(facingFrom(-0.2, 5, "n")).toBe("s");
  });

  it("should keep the current facing when standing still", () => {
    expect(facingFrom(0, 0, "nw")).toBe("nw");
  });
});

describe("nearestScreenFacing", () => {
  it.each<[Facing8, string]>([
    // world diagonals land on screen axes
    ["ne", "right"],
    ["se", "down"],
    ["sw", "left"],
    ["nw", "up"],
    // world axes land on screen diagonals, nearer the horizontal
    ["n", "right"],
    ["e", "right"],
    ["s", "left"],
    ["w", "left"],
  ])("should show %s with the %s texture", (facing, want) => {
    expect(nearestScreenFacing(facing)).toBe(want);
  });
});

// FS-7P736 R13: a roll with no keys held goes the way the delver faces
describe("facingVector", () => {
  it.each<[Facing8, number, number]>([
    ["e", 1, 0],
    ["n", 0, -1],
    ["se", Math.SQRT1_2, Math.SQRT1_2],
    ["nw", -Math.SQRT1_2, -Math.SQRT1_2],
  ])("should point %s along (%f, %f), a unit vector", (facing, x, y) => {
    const v = facingVector(facing);
    expect(v.x).toBeCloseTo(x);
    expect(v.y).toBeCloseTo(y);
  });

  it("should turn back into the facing it came from, every way", () => {
    for (const f of ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as Facing8[]) {
      const v = facingVector(f);
      expect(facingFrom(v.x, v.y, "n")).toBe(f);
    }
  });
});
