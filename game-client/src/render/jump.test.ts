import { describe, expect, it } from "vitest";
import { JUMP_PX, placeOnJump } from "./jump";

describe("placeOnJump (FS-04EEA R41: a body that jumps is placed, not glided)", () => {
  it("should place the drawn body at once when the reported position moves 61 world px", () => {
    const drawn = { x: 100, y: 100 };
    expect(placeOnJump(drawn, { x: 100, y: 100 }, { x: 161, y: 100 })).toBe(true);
    expect(drawn).toEqual({ x: 161, y: 100 });
  });

  it.each([
    ["40 px, a walk", { x: 140, y: 100 }],
    [`exactly ${JUMP_PX} px`, { x: 100, y: 100 + JUMP_PX }],
  ])("should leave the body to glide for a move of %s", (_, next) => {
    const drawn = { x: 120, y: 100 };
    expect(placeOnJump(drawn, { x: 100, y: 100 }, next)).toBe(false);
    expect(drawn).toEqual({ x: 120, y: 100 });
  });

  it("should measure from the last reported position, never where the body is drawn", () => {
    // drawn 30 px behind the last report, which moved 50: a glide
    const drawn = { x: 70, y: 100 };
    expect(placeOnJump(drawn, { x: 100, y: 100 }, { x: 150, y: 100 })).toBe(false);
  });

  it("should leave a body with no earlier report alone", () => {
    const drawn = { x: 0, y: 0 };
    expect(placeOnJump(drawn, null, { x: 500, y: 500 })).toBe(false);
    expect(drawn).toEqual({ x: 0, y: 0 });
  });
});
