import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE, worldToScreen } from "@/render/iso";
import { BAKE } from "./bake";
import { housesFrom, type House } from "./houses";
import {
  CHIMNEY_POT,
  GABLE_FOOT,
  ROOF_EAVE,
  planChimney,
  planGables,
  planRoof,
} from "./roofs";
import { planCap } from "./buildingLooks";
import { MASONRY_WALLS, cutExterior, cutWall } from "./walls";

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

describe("planGables (FS-9PN7X, ADR-0036: a closed block shows no inside)", () => {
  // the server's walls are 20 world px thick, hub and run alike (hub_map.go, session.go)
  const THICK = 20;
  /** The four walls of a house as the server lays them, door gaps left out. */
  const wallsOf = (id: string, x: number, y: number, w: number, h: number) =>
    [
      [x, y, w, THICK],
      [x, y + h - THICK, w, THICK],
      [x, y, THICK, h],
      [x + w - THICK, y, THICK, h],
    ].map(([wx, wy, ww, wh], k) => ({
      entity_id: `${id}w${k}`,
      house_id: id,
      position: { x: wx, y: wy },
      width: ww,
      height: wh,
    }));
  // a run's small building along x, a hub house deeper than it is wide, the run's large
  // building (the deepest roof any server lays today) and one whose depth is not whole tiles
  const CASES: [string, number, number, number, number][] = [
    ["small", 100, 60, 300, 200],
    ["deep", 1560, 420, 240, 300],
    ["large", 0, 0, 500, 400],
    ["odd", 240, 460, 260, 220],
  ];
  const houseOf = ([id, x, y, w, h]: (typeof CASES)[number]): House => ({
    id,
    x,
    y,
    width: w,
    height: h,
  });
  /** Where a piece runs along the ridge and across it, whichever way the ridge runs. */
  const frame = (h: House) => {
    const alongX = h.width >= h.height;
    return {
      alongX,
      along: (p: { x: number; y: number }) => (alongX ? p.x : p.y),
      across: (p: { x: number; y: number }) => (alongX ? p.y : p.x),
      mid: alongX ? h.y + h.height / 2 : h.x + h.width / 2,
      ends: alongX
        ? [h.x + THICK / 2, h.x + h.width - THICK / 2]
        : [h.y + THICK / 2, h.y + h.height - THICK / 2],
      reach: (alongX ? h.height : h.width) / 2 - THICK / 2,
    };
  };

  it.each(CASES)(
    "should close both ends of the ridge of %s, on the end walls' centrelines, in the ridge's sheet",
    (...c) => {
      const h = houseOf(c);
      const f = frame(h);
      const gables = planGables(h, THICK);
      expect(gables.length).toBeGreaterThan(0);
      expect(new Set(gables.map((g) => f.along(g.at)))).toEqual(
        new Set(f.ends),
      );
      for (const g of gables)
        expect(g.sheet).toBe(f.alongX ? "roof_gable_x" : "roof_gable_y");
      // and the roof reaches past both end walls' outer faces, eave and all, over every gable
      const along = planRoof(h).map((p) => f.along(p.at));
      const [lo, hi] = f.alongX ? [h.x, h.x + h.width] : [h.y, h.y + h.height];
      expect(Math.min(...along) - T / 2).toBeLessThanOrEqual(
        lo - ROOF_EAVE + 1e-9,
      );
      expect(Math.max(...along) + T / 2).toBeGreaterThanOrEqual(
        hi + ROOF_EAVE - 1e-9,
      );
    },
  );

  it.each(CASES)(
    "should close each half of %s from the ridge to the side wall's centreline, sloping down as the roof over it does",
    (...c) => {
      const h = houseOf(c);
      const f = frame(h);
      const [far, near] = f.alongX ? ["s", "n"] : ["e", "w"];
      for (const end of f.ends)
        for (const [half, sign] of [
          [far, 1],
          [near, -1],
        ] as const) {
          const spans = planGables(h, THICK)
            .filter((g) => f.along(g.at) === end && g.animation === half)
            .map((g) => sign * (f.across(g.at) - f.mid))
            .map((d) => [d - T / 2, d + T / 2])
            .sort((a, b) => a[0] - b[0]);
          expect(spans.length, `${h.id} ${end} ${half}`).toBeGreaterThan(0);
          // from the ridge, gap-free, to exactly the side wall's centreline and no further
          expect(spans[0][0]).toBeCloseTo(0);
          for (let k = 1; k < spans.length; k++)
            expect(spans[k][0]).toBeLessThanOrEqual(spans[k - 1][1] + 1e-9);
          expect(spans[spans.length - 1][1]).toBeCloseTo(f.reach);
        }
    },
  );

  it.each(CASES)(
    "should seat each piece's top edge on %s's roof line, so planRoof's slope covers it",
    (...c) => {
      const h = houseOf(c);
      const f = frame(h);
      const slopes = planRoof(h).filter((p) => p.sheet === "roof_slope");
      // the roof line from planRoof itself: the eave row's low edge sits on the walls' tops
      const eave =
        Math.max(...slopes.map((p) => Math.abs(f.across(p.at) - f.mid))) +
        T / 2;
      expect(Math.min(...slopes.map((p) => p.lift))).toBeCloseTo(WALL_TOP);
      const roofAt = (d: number) => WALL_TOP + ((eave - d) / T) * RISE;
      for (const g of planGables(h, THICK)) {
        // a piece's top edge starts GABLE_FOOT over its lift, at the eave side of its tile
        const outer = Math.abs(f.across(g.at) - f.mid) + T / 2;
        expect(g.lift + GABLE_FOOT).toBeCloseTo(roofAt(outer));
      }
      // a piece in step with a roof row has that row's lift exactly
      for (const g of planGables(h, THICK)) {
        const row = slopes.find(
          (p) =>
            p.animation === g.animation &&
            Math.abs(f.across(p.at) - f.across(g.at)) < 1e-9,
        );
        if (row) expect(g.lift + GABLE_FOOT).toBeCloseTo(row.lift);
      }
    },
  );

  it.each(CASES)(
    "should reach down behind %s's end walls' tops with its foot and never below the ground",
    (...c) => {
      for (const g of planGables(houseOf(c), THICK)) {
        expect(g.lift).toBeLessThanOrEqual(WALL_TOP + 1e-9);
        expect(g.lift).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it.each(CASES)(
    "should sort each piece of %s behind the end wall pieces it rises from and every roof piece over it",
    (...c) => {
      const h = houseOf(c);
      const f = frame(h);
      const walls = wallsOf(...c);
      // the end walls in both looks: the far end stands full height, the near end is exterior
      const endPieces = walls
        .filter((w) => (f.alongX ? w.height > w.width : w.width > w.height))
        .flatMap((w) => [...cutWall(w, "back", 7), ...cutExterior(w, 7)]);
      const roof = planRoof(h);
      const key = (p: { x: number; y: number }) => p.x + p.y;
      for (const g of planGables(h, THICK)) {
        const lo = f.across(g.at) - T / 2;
        const hi = f.across(g.at) + T / 2;
        const wallsUnder = endPieces.filter((w) => {
          if (Math.abs(f.along(w.at) - f.along(g.at)) > 1e-9) return false;
          const start = f.across(w.depthAt);
          return start < hi && start + w.keep * T > lo;
        });
        expect(wallsUnder.length, h.id).toBeGreaterThan(0);
        for (const w of wallsUnder)
          expect(key(g.depthAt)).toBeLessThan(key(w.depthAt));
        const roofOver = roof.filter(
          (p) =>
            Math.abs(f.along(p.at) - f.along(g.at)) < T / 2 &&
            Math.abs(f.across(p.at) - f.across(g.at)) < T,
        );
        expect(roofOver.length, h.id).toBeGreaterThan(0);
        for (const p of roofOver)
          expect(key(g.depthAt)).toBeLessThan(key(p.at));
      }
    },
  );

  it("should give the same pieces for the same house, on every client", () => {
    const h = houseOf(CASES[3]);
    expect(planGables({ ...h }, THICK)).toEqual(planGables(h, THICK));
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

// Flagged from I-9PN7X-6's shots: a ghoul just behind a closed room seemed to stand on its cap. A
// zoom of that shot shows the cap's edge cutting the ghoul at the waist, so the order was right;
// this pins why. Every lifted piece of a closed building (the stone cap, roof slopes and ridges,
// the gables' part over the walls) is lifted a full wall height, so a body standing behind the
// building whose drawn part reaches it stands well back of the piece's own footprint and sorts
// behind it. Nothing behind a closed building is drawn over its top.
describe("a closed building's lifted pieces cover whatever stands behind it", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
  ) as { sheets: Record<string, { frameWidth: number; frameHeight: number; anchor: { x: number; y: number } }> };
  /** A sheet's drawn box, its anchor at (x, y). */
  const drawn = (sheet: string, x: number, y: number) => {
    const s = manifest.sheets[sheet];
    return {
      l: x - s.anchor.x * s.frameWidth,
      r: x + (1 - s.anchor.x) * s.frameWidth,
      t: y - s.anchor.y * s.frameHeight,
      b: y + (1 - s.anchor.y) * s.frameHeight,
    };
  };
  /**
   * The knight's, archer's and mercenary's opaque pixels around their feet, over every idle, walk
   * and attack frame and facing (measured from the baked atlases): sword or bow raised included.
   */
  const BODY = { up: 105, left: 65, right: 89 };
  const key = (p: { x: number; y: number }) => p.x + p.y;

  it.each([
    ["a hub house", { id: "inn", x: 470, y: 110, width: 400, height: 300 }],
    ["a Spire room", { id: "c", x: 820, y: 700, width: 280, height: 240 }],
  ])("should sort every lifted piece of %s over a body behind it that reaches it", (_what, house) => {
    const lifted = [
      ...planRoof(house).map((p) => ({ sheet: p.sheet as string, at: p.at, lift: p.lift, sort: p.at })),
      ...planCap(house, MASONRY_WALLS, 1).map((p) => ({ sheet: p.sheet, at: p.at, lift: p.lift, sort: p.at })),
      ...planGables(house, 20).map((p) => ({ sheet: p.sheet as string, at: p.at, lift: p.lift, sort: p.depthAt })),
    ];
    const wrong: string[] = [];
    // behind: clear of the west or north wall by a body's footprint, within reach of the top
    for (let x = house.x - 320; x < house.x + house.width + 60; x += 5)
      for (let y = house.y - 320; y < house.y + house.height + 60; y += 5) {
        if (x > house.x - 12 && y > house.y - 12) continue;
        const feet = worldToScreen(x, y);
        const body = { l: feet.x - BODY.left, r: feet.x + BODY.right, t: feet.y - BODY.up, b: feet.y };
        for (const p of lifted) {
          const a = worldToScreen(p.at.x, p.at.y);
          const box = drawn(p.sheet, a.x, a.y - p.lift);
          // a gable's foot hangs behind its end wall: only its part over the walls' top shows
          if (p.sheet.startsWith("roof_gable")) box.b = Math.min(box.b, a.y - WALL_TOP);
          const overlaps = body.l < box.r && box.l < body.r && body.t < box.b && box.t < body.b;
          if (overlaps && key({ x, y }) > key(p.sort)) wrong.push(`${p.sheet} @${x},${y}`);
        }
      }
    expect(wrong).toEqual([]);
  });
});
