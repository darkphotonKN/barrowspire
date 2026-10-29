import { describe, expect, it } from "vitest";
import type { ArtRgb } from "@/render/art/manifest";
import {
  AMBIENT,
  FOREST_AMBIENT,
  groundMean,
  litEdgeGround,
  relativeLuminance,
  tinted,
} from "@/render/lighting/lighting";
import { OUTDOOR_GROUND, planGroundLayer } from "./ground";
import { FIELD_LOOKS, FOREST_LOOK, MEADOWS_LOOK, fieldLook, landBeyond } from "./fieldLook";

const channels = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
/** The baked grass's measured mean (public/art/manifest.json, ground_grass). */
const GRASS: ArtRgb = { r: 81, g: 83, b: 53 };
/** The baked barrow dirt's measured mean (ground_dirt). */
const DIRT: ArtRgb = { r: 77, g: 64, b: 49 };
const lit = (mean: ArtRgb, look: { tint?: number; lift?: number }, ambient: number) =>
  litEdgeGround(groundMean(mean, look), ambient, 0);

describe("fieldLook (FS-X2F2H §Requirements 54)", () => {
  it("should draw Gentle Meadows with the Meadows look", () => {
    expect(fieldLook("gentle_meadows")).toBe(MEADOWS_LOOK);
    expect(FIELD_LOOKS.gentle_meadows).toBe(MEADOWS_LOOK);
  });

  it("should draw the Forlorn Forest with the forest look, and no other field with it (FS-3QHQZ §Requirements 22)", () => {
    expect(fieldLook("forlorn_forest")).toBe(FOREST_LOOK);
    const others = Object.entries(FIELD_LOOKS).filter(([id]) => id !== "forlorn_forest");
    for (const [, look] of others) expect(look).not.toBe(FOREST_LOOK);
    expect(fieldLook("somewhere_new")).not.toBe(FOREST_LOOK);
  });

  it("should fall back to the Meadows look for a field it has no look for, without crashing", () => {
    expect(fieldLook("somewhere_new")).toBe(MEADOWS_LOOK);
    expect(fieldLook(undefined)).toBe(MEADOWS_LOOK);
    // a name the table's object already answers to is still not a field
    expect(fieldLook("constructor")).toBe(MEADOWS_LOOK);
  });
});

describe("the Meadows look", () => {
  it("should lay the exterior theme's ground family, recoloured and lifted", () => {
    const { tint, lift, ...family } = MEADOWS_LOOK.ground;
    expect(family).toEqual(OUTDOOR_GROUND);
    expect(tint).toBeDefined();
    expect(lift).toBeGreaterThan(0);
  });

  it("should recolour it toward green: green over red over blue", () => {
    const [r, g, b] = channels(MEADOWS_LOOK.ground.tint!);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
  });

  it("should be lit by a warm daylight, brighter than the hub's dusk and the old field default", () => {
    const [r, g, b] = channels(MEADOWS_LOOK.ambient);
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThan(b);
    expect(relativeLuminance(MEADOWS_LOOK.ambient)).toBeGreaterThan(
      relativeLuminance(AMBIENT.field),
    );
  });

  it("should light the grass a clearly daylit green: green-led, and well above the hub's dusk", () => {
    const lit = (mean: ArtRgb, look: { tint?: number; lift?: number }, ambient: number) =>
      litEdgeGround(groundMean(mean, look), ambient, 0);
    const meadow = lit(GRASS, MEADOWS_LOOK.ground, MEADOWS_LOOK.ambient);
    const hub = lit(GRASS, {}, AMBIENT.hub);
    const [r, g, b] = channels(meadow);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
    expect(relativeLuminance(meadow)).toBeGreaterThan(3 * relativeLuminance(hub));
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

  it("should paint the land beyond the edges in the field's own ground colour, as the grass is painted", () => {
    const { r, g, b } = groundMean(GRASS, MEADOWS_LOOK.ground);
    expect(landBeyond(MEADOWS_LOOK, GRASS)).toBe((r << 16) | (g << 8) | b);
  });

  it("should paint the land in the look's own colour when the ground has no measured mean", () => {
    expect(landBeyond(MEADOWS_LOOK, undefined)).toBe(MEADOWS_LOOK.horizon.land);
  });

  it("should dress keep-outs with sparse baked trees and rocks", () => {
    expect(MEADOWS_LOOK.dressing.trees.length).toBeGreaterThan(0);
    expect(MEADOWS_LOOK.dressing.rocks.length).toBeGreaterThan(0);
  });
});

describe("the Forest look (FS-3QHQZ §C)", () => {
  it("should lay the exterior theme's ground family: trodden dirt, recoloured and lifted", () => {
    const { tint, lift, trodden, litterShade, ...family } = FOREST_LOOK.ground;
    expect(family).toEqual(OUTDOOR_GROUND);
    expect(trodden).toBe(true);
    expect(litterShade).toBeDefined();
    expect(tint).toBeDefined();
    expect(lift).toBeGreaterThan(0);
  });

  it("should draw every wall as a tree stand of live and dead trees, not as groves", () => {
    expect(FOREST_LOOK.stands.live).toEqual(
      expect.arrayContaining(["tree_oak_gloom", "tree_pine_gloom"]),
    );
    expect(FOREST_LOOK.stands.dead).toEqual(["tree_dead", "tree_dead_snag"]);
    expect("dressing" in FOREST_LOOK).toBe(false);
  });

  it("should be lit by the forest ambient", () => {
    expect(FOREST_LOOK.ambient).toBe(FOREST_AMBIENT);
  });

  it("should light its trail dim, not dark: below the Meadows' daylight, above the hub's dusk", () => {
    const trail = relativeLuminance(lit(DIRT, FOREST_LOOK.ground, FOREST_LOOK.ambient));
    expect(trail).toBeLessThan(relativeLuminance(lit(GRASS, MEADOWS_LOOK.ground, MEADOWS_LOOK.ambient)));
    expect(trail).toBeGreaterThan(relativeLuminance(lit(GRASS, {}, AMBIENT.hub)));
    expect(trail).toBeGreaterThan(relativeLuminance(lit(DIRT, {}, AMBIENT.run)));
  });

  it("should lay leaf litter under the stands darker than the trail beside it", () => {
    const shaded = tinted(GRASS, FOREST_LOOK.ground.litterShade);
    const litter = lit(shaded, FOREST_LOOK.ground, FOREST_LOOK.ambient);
    const trail = lit(DIRT, FOREST_LOOK.ground, FOREST_LOOK.ambient);
    expect(relativeLuminance(litter)).toBeLessThan(relativeLuminance(trail));
  });

  it("should strew ferns, toadstools, stumps, logs and bones on the verges, and drift a light mist", () => {
    expect(FOREST_LOOK.verges.weights.map(([, sheet]) => sheet)).toEqual([
      "fern",
      "toadstools",
      "stump",
      "fallen_log",
      "bone_pile",
    ]);
    expect(FOREST_LOOK.mist.alpha).toBeGreaterThan(0);
    expect(FOREST_LOOK.mist.alpha).toBeLessThanOrEqual(0.5);
  });

  it("should paint the land beyond its edges as the litter under its stands, the forest running on", () => {
    const litter = groundMean(tinted(GRASS, FOREST_LOOK.ground.litterShade), FOREST_LOOK.ground);
    expect(landBeyond(FOREST_LOOK, GRASS)).toBe((litter.r << 16) | (litter.g << 8) | litter.b);
  });

  it("should lay out the same ground on every client", () => {
    const plan = () =>
      planGroundLayer({ width: 2080, height: 1360, kind: "field", houses: [], look: FOREST_LOOK.ground });
    expect(plan()).toEqual(plan());
  });
});
