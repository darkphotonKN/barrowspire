import { describe, expect, it } from "vitest";
import { TILE_HEIGHT, TILE_WIDTH } from "@/render/iso";
import * as projection from "../../../tools/bake/page/projection.js";
import * as dimensions from "../../../tools/bake/page/dimensions.js";
import * as shadow from "../../../tools/bake/page/shadow.js";
import { BAKE } from "./bake";

// `BAKE` mirrors the bake's constants because the bake runs outside the Next bundle. The bake
// modules read here are dependency-free, so the mirror is checked against the source.
describe("BAKE mirrors the bake (tools/bake/page/)", () => {
  it("should project with the bake camera's tile and height scale", () => {
    expect(projection.TILE_W).toBe(TILE_WIDTH);
    expect(projection.TILE_H).toBe(TILE_HEIGHT);
    expect(BAKE.VPX).toBe(projection.VPX);
  });

  it("should place walls and roofs at the heights the bake built them", () => {
    expect(BAKE.WALL_BACK).toBe(dimensions.WALL_BACK);
    expect(BAKE.WALL_FRONT).toBe(dimensions.WALL_FRONT);
    expect(BAKE.ROOF_RISE).toBe(dimensions.ROOF_RISE);
  });

  // FS-V8FT3 §C R12–R14: the client paints a wall's ground shadow as the bake would have cast it
  it("should cast a wall's shadow by the bake's key light, in the catcher's colour and opacity", () => {
    expect(BAKE.KEY_LIGHT).toEqual(shadow.KEY_LIGHT);
    expect(BAKE.SHADOW_OPACITY).toBe(shadow.SHADOW_OPACITY);
    expect(BAKE.SHADOW_COLOR).toBe(shadow.SHADOW_COLOR);
  });

  it("should stand a wall's shadow on the foot the bake built for its material", () => {
    expect(BAKE.WALL_FOOT).toEqual(shadow.WALL_FOOT);
    expect(BAKE.POST_FOOT).toBe(shadow.POST_FOOT);
  });
});
