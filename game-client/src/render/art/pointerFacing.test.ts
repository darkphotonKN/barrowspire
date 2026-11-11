import { describe, expect, it } from "vitest";
import { PointerFacing } from "./pointerFacing";

const at = { x: 100, y: 100 };

describe("PointerFacing (FS-JS7C8 §D)", () => {
  it("should give no facing before the pointer first moves in this world: the spawn facing stands (R26)", () => {
    expect(new PointerFacing().follow(at, { x: 100, y: 0 })).toBeUndefined();
  });

  it.each([
    ["n", { x: 100, y: 0 }],
    ["e", { x: 300, y: 100 }],
    ["s", { x: 100, y: 300 }],
    ["w", { x: 0, y: 100 }],
    ["ne", { x: 200, y: 0 }],
    ["sw", { x: 0, y: 200 }],
  ])("should face %s: the nearest of 8 world facings from the character toward the pointer (R22, R23)", (want, pointer) => {
    const facing = new PointerFacing();
    facing.moved();
    expect(facing.follow(at, pointer)).toBe(want);
  });

  it("should snap a direction between two facings to the nearer", () => {
    const facing = new PointerFacing();
    facing.moved();
    // 20° north of east: nearer e than ne
    expect(facing.follow({ x: 0, y: 0 }, { x: 100, y: -36 })).toBe("e");
  });

  it("should follow the character's own position, the pointer standing still", () => {
    const facing = new PointerFacing();
    facing.moved();
    expect(facing.follow({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe("e");
    expect(facing.follow({ x: 200, y: 0 }, { x: 100, y: 0 })).toBe("w");
  });

  it("should keep the last facing while the pointer is off the canvas (R26)", () => {
    const facing = new PointerFacing();
    facing.moved();
    expect(facing.follow(at, { x: 100, y: 0 })).toBe("n");
    expect(facing.follow({ x: 0, y: 900 }, undefined)).toBe("n");
  });

  it("should keep the last facing with the pointer on the character's own footprint", () => {
    const facing = new PointerFacing();
    facing.moved();
    facing.follow(at, { x: 0, y: 100 });
    expect(facing.follow(at, { ...at })).toBe("w");
  });

  it("should give none with the pointer on the footprint before any facing was taken", () => {
    const facing = new PointerFacing();
    facing.moved();
    expect(facing.follow(at, { ...at })).toBeUndefined();
  });
});
