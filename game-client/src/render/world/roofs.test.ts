import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE, worldToScreen } from "@/render/iso";
import { BAKE } from "./bake";
import { housesFrom, type House } from "./houses";
import { CHIMNEY_POT, ROOF_EAVE, planChimney, planRoof } from "./roofs";

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

describe("planChimney (FS-KYPQ9 §A.6)", () => {
  // the hub's scenery seed (HubScene SCENERY_SEED)
  const SEED = 1_396_919_857;
  // the hub's five houses as the server lays their walls (hub_map.go): x, y, w, h
  const HUB = [
    [620, 180, 300, 200],
    [1080, 180, 260, 200],
    [240, 460, 220, 260],
    [1560, 420, 240, 300],
    [1500, 800, 300, 140],
  ];
  const walls = HUB.flatMap(([x, y, w, h], i) =>
    [
      [x, y, w, 20],
      [x, y + h - 20, w, 20],
      [x, y, 20, h],
      [x + w - 20, y, 20, h],
    ].map(([wx, wy, ww, wh], k) => ({
      entity_id: `h${i}w${k}`,
      house_id: `h${i}`,
      position: { x: wx, y: wy },
      width: ww,
      height: wh,
    })),
  );
  const houses: House[] = housesFrom(walls);

  it("should give each of the hub's houses one chimney, each on its own roof", () => {
    expect(houses).toHaveLength(5);
    const spots = houses.map((h) => planChimney(h, SEED));
    expect(spots).toHaveLength(5);
    spots.forEach((spot, i) => {
      const h = houses[i];
      expect(spot.at.x).toBeGreaterThan(h.x - ROOF_EAVE);
      expect(spot.at.x).toBeLessThan(h.x + h.width + ROOF_EAVE);
      expect(spot.at.y).toBeGreaterThan(h.y - ROOF_EAVE);
    });
  });

  it("should sit against the ridge, on the slope facing the camera, clear of the gable ends, on the roof's surface", () => {
    for (const h of houses) {
      const spot = planChimney(h, SEED);
      const alongX = h.width >= h.height;
      const roof = planRoof(h);
      const piece = roof.find(
        (p) => p.at.x === spot.at.x && p.at.y === spot.at.y,
      );
      expect(piece, h.id).toBeDefined();
      expect(piece!.sheet).toBe("roof_slope");
      // the camera is in the south-east: an x ridge's south slope faces it, a y ridge's east
      expect(piece!.animation, h.id).toBe(alongX ? "s" : "e");
      // the row against the ridge
      const ridge = roof.find((p) => p.sheet === "roof_ridge")!;
      expect(piece!.lift, h.id).toBeCloseTo(ridge.lift - RISE);
      // the surface at the middle of that slope piece
      expect(spot.lift).toBeCloseTo(piece!.lift + RISE / 2);
      const along = alongX ? spot.at.x : spot.at.y;
      const [lo, hi] = alongX ? [h.x, h.x + h.width] : [h.y, h.y + h.height];
      expect(along - T / 2).toBeGreaterThanOrEqual(lo);
      expect(along + T / 2).toBeLessThanOrEqual(hi);
    }
  });

  it("should show its foot below the ridge line from the south-east camera, on every hub house", () => {
    // the fixed camera all but loses a back slope: a stack there shows only above the ridge and
    // reads as a ground pillar, so its foot must project onto the slope the camera sees
    for (const h of houses) {
      const spot = planChimney(h, SEED);
      const ridge = planRoof(h).find((p) => p.sheet === "roof_ridge")!;
      const foot = worldToScreen(spot.at.x, spot.at.y);
      // the point on the ridge line straight above or below the foot on screen (same x - y)
      const d = spot.at.x - spot.at.y;
      const ridgeLine =
        ridge.animation === "x"
          ? worldToScreen(ridge.at.y + d, ridge.at.y)
          : worldToScreen(ridge.at.x, ridge.at.x - d);
      expect(ridgeLine.x).toBeCloseTo(foot.x);
      expect(foot.y - spot.lift, h.id).toBeGreaterThan(ridgeLine.y - ridge.lift);
    }
  });

  it("should match the bake's chimney: its pot rim CHIMNEY_POT above its foot", () => {
    // tools/bake/page/models/town.js#chimney turns the pot's profile [r, y] on a lathe set at
    // { y: base }; its rim is the profile's top
    const model = readFileSync(
      join(__dirname, "../../../tools/bake/page/models/town.js"),
      "utf8",
    );
    const chimney = /export function chimney\(\) \{([\s\S]*?)\n\}/.exec(model)?.[1] ?? "";
    const profile = /const pot = \[([\s\S]*?)\]\.map/.exec(chimney)?.[1] ?? "";
    const ys = [...profile.matchAll(/\[\s*[\d.]+\s*,\s*([\d.]+)\s*\]/g)].map((m) =>
      Number(m[1]),
    );
    const base = Number(
      /LatheGeometry\(pot[^)]*\),[^{]*\{ y: ([\d.]+) \}/.exec(chimney)?.[1],
    );
    expect(ys.length).toBeGreaterThan(0);
    expect(base + Math.max(...ys)).toBeCloseTo(CHIMNEY_POT);
  });

  it("should put the pot top the chimney's height above where it stands", () => {
    const spot = planChimney(houses[0], SEED);
    expect(spot.top).toBeCloseTo(spot.lift + CHIMNEY_POT * BAKE.VPX);
  });

  it("should give the same spot for the same walls, on every client", () => {
    const again = housesFrom(walls.map((w) => ({ ...w })));
    expect(again.map((h) => planChimney(h, SEED))).toEqual(
      houses.map((h) => planChimney(h, SEED)),
    );
  });
});
