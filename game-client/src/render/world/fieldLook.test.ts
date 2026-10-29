import { describe, expect, it } from "vitest";
import { AMBIENT, relativeLuminance, tinted } from "@/render/lighting/lighting";
import { OUTDOOR_GROUND, planGroundLayer } from "./ground";
import { FIELD_LOOKS, MEADOWS_LOOK, fieldLook, landBeyond } from "./fieldLook";

const channels = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

describe("fieldLook (FS-X2F2H §Requirements 54)", () => {
  it("should draw Gentle Meadows with the Meadows look", () => {
    expect(fieldLook("gentle_meadows")).toBe(MEADOWS_LOOK);
    expect(FIELD_LOOKS.gentle_meadows).toBe(MEADOWS_LOOK);
  });

  it("should fall back to the Meadows look for a field it has no look for, without crashing", () => {
    expect(fieldLook("somewhere_new")).toBe(MEADOWS_LOOK);
    expect(fieldLook(undefined)).toBe(MEADOWS_LOOK);
    // a name the table's object already answers to is still not a field
    expect(fieldLook("constructor")).toBe(MEADOWS_LOOK);
  });
});

describe("the Meadows look", () => {
  it("should lay the exterior theme's ground family, recoloured", () => {
    const { tint, ...family } = MEADOWS_LOOK.ground;
    expect(family).toEqual(OUTDOOR_GROUND);
    expect(tint).toBeDefined();
  });

  it("should recolour it toward green: green over red over blue", () => {
    const [r, g, b] = channels(MEADOWS_LOOK.ground.tint!);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
  });

  it("should be lit by daylight, brighter than the hub's dusk", () => {
    expect(MEADOWS_LOOK.ambient).toBe(AMBIENT.field);
    expect(relativeLuminance(MEADOWS_LOOK.ambient)).toBeGreaterThan(
      relativeLuminance(AMBIENT.hub),
    );
  });

  it("should give two clients the same tiles", () => {
    const plan = () =>
      planGroundLayer({
        width: 2000,
        height: 1000,
        kind: "field",
        houses: [],
        look: MEADOWS_LOOK.ground,
      });
    expect(plan()).toEqual(plan());
    const sheets = new Set(plan().map((p) => p.sheet));
    expect([...sheets].sort()).toEqual(["decal_grass_tuft", "decal_pebbles", "ground_grass"]);
  });

  it("should paint the land beyond the edges in the field's own ground colour, as the grass is tinted", () => {
    const grass = { r: 81, g: 83, b: 53 };
    const { r, g, b } = tinted(grass, MEADOWS_LOOK.ground.tint!);
    expect(landBeyond(MEADOWS_LOOK, grass)).toBe((r << 16) | (g << 8) | b);
  });

  it("should paint the land in the look's own colour when the ground has no measured mean", () => {
    expect(landBeyond(MEADOWS_LOOK, undefined)).toBe(MEADOWS_LOOK.horizon.land);
  });

  it("should dress keep-outs with sparse baked trees and rocks", () => {
    expect(MEADOWS_LOOK.dressing.trees.length).toBeGreaterThan(0);
    expect(MEADOWS_LOOK.dressing.rocks.length).toBeGreaterThan(0);
  });
});
