import { describe, expect, it } from "vitest";
import { AMBIENT, TOWER_AMBIENT } from "@/render/lighting/lighting";
import type { WallState } from "@/types/gameState";
import { OUTDOOR_GROUND, TOWER_GROUND, planGroundLayer, worldSeed } from "./ground";
import { planPerimeter } from "./perimeter";
import { MASONRY_WALLS, TIMBER_WALLS, planWalls } from "./walls";
import { dressingStatics, planDressing } from "./runDressing";
import {
  RUN_WORLD_THEME,
  TOWER_BANDS,
  WORLD_THEMES,
  floorBand,
  floorLook,
} from "./worldTheme";

describe("the world theme (FS-8RBQY §A)", () => {
  it("should draw runs as the tower interior unless the constant is changed", () => {
    expect(RUN_WORLD_THEME).toBe("tower");
    expect(Object.keys(WORLD_THEMES).sort()).toEqual(["exterior", "tower"]);
  });

  it("should keep the exterior as the run look always was (§A.3)", () => {
    expect(WORLD_THEMES.exterior).toEqual({
      ground: OUTDOOR_GROUND,
      walls: TIMBER_WALLS,
      roofs: true,
      indoorMask: true,
      ambient: AMBIENT.run,
      perimeter: false,
      dressing: false,
      interactablePools: false,
    });
  });

  it("should draw the tower interior: flags and planks, masonry, no roofs, darker, walled in (§B)", () => {
    expect(WORLD_THEMES.tower).toEqual({
      ground: TOWER_GROUND,
      walls: MASONRY_WALLS,
      roofs: false,
      indoorMask: false,
      ambient: TOWER_AMBIENT,
      perimeter: true,
      dressing: true,
      interactablePools: true,
      bands: TOWER_BANDS,
    });
  });
});

describe("the tower's fixed lights on the server's largest floor", () => {
  const wall = (
    x: number,
    y: number,
    width: number,
    height: number,
    house_id: string,
  ): WallState => ({
    entity_id: `${house_id}:${x},${y},${width},${height}`,
    house_id,
    position: { x, y },
    width,
    height,
  });
  /** `AddBuilding`'s walls: 20 thick, a 50-wide door gap centred in the south wall. */
  const room = (bx: number, by: number, bw: number, bh: number, id: string) => {
    const gap = (bw - 50) / 2;
    return [
      wall(bx, by, bw, 20, id),
      wall(bx, by, 20, bh, id),
      wall(bx + bw - 20, by, 20, bh, id),
      wall(bx, by + bh - 20, gap, 20, id),
      wall(bx + gap + 50, by + bh - 20, gap, 20, id),
    ];
  };
  /** The three rooms every floor builds (300×200, 400×300, 500×400), laid out several ways. */
  const layouts = [
    [
      room(40, 40, 300, 200, "s"),
      room(420, 60, 400, 300, "m"),
      room(880, 500, 500, 400, "l"),
    ],
    [
      room(900, 40, 300, 200, "s"),
      room(60, 520, 400, 300, "m"),
      room(520, 300, 500, 400, "l"),
    ],
    [
      room(560, 640, 300, 200, "s"),
      room(1000, 80, 400, 300, "m"),
      room(80, 60, 500, 400, "l"),
    ],
    [
      room(73, 517, 300, 200, "s"),
      room(611, 29, 400, 300, "m"),
      room(907, 488, 500, 400, "l"),
    ],
  ].map((rooms) => rooms.flat());

  it("should hold sconces plus arrow slits to 24 or fewer (FS-8RBQY §C.6's budget)", () => {
    const slits = planPerimeter(1440, 960).pieces.filter((p) =>
      p.sheet.includes("_slit_"),
    ).length;
    for (const walls of layouts) {
      const sconces = planWalls(
        walls,
        worldSeed("run"),
        WORLD_THEMES.tower.walls,
      ).pieces.filter((p) => p.sheet.includes("_sconce_")).length;
      expect(sconces).toBeGreaterThan(0);
      expect(sconces + slits).toBeLessThanOrEqual(24);
    }
  });
});

describe("floorBand (FS-8RBQY §C.1)", () => {
  it.each([
    [1, 3, "lower"],
    [2, 3, "middle"],
    [3, 3, "upper"],
    [1, 1, "lower"],
  ] as const)("should put floor %i of %i in the %s band", (floor, count, band) => {
    expect(floorBand(floor, count)).toBe(band);
  });

  it("should ramp a five-floor run from lower to upper, never stepping back", () => {
    const order = ["lower", "middle", "upper"];
    const ranks = [1, 2, 3, 4, 5].map((f) => order.indexOf(floorBand(f, 5)));
    expect(ranks[0]).toBe(0);
    expect(ranks[4]).toBe(2);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
  });
});

describe("floorLook: what one floor of a run is drawn with (FS-8RBQY §C.2–§C.3)", () => {
  const tower = WORLD_THEMES.tower;
  const walls: WallState[] = [
    { entity_id: "n", house_id: "h", position: { x: 200, y: 200 }, width: 400, height: 20 },
    { entity_id: "w", house_id: "h", position: { x: 200, y: 200 }, width: 20, height: 300 },
    { entity_id: "s", house_id: "h", position: { x: 200, y: 480 }, width: 400, height: 20 },
    { entity_id: "e", house_id: "h", position: { x: 580, y: 200 }, width: 20, height: 300 },
    { entity_id: "n2", house_id: "k", position: { x: 800, y: 100 }, width: 500, height: 20 },
    { entity_id: "w2", house_id: "k", position: { x: 800, y: 100 }, width: 20, height: 400 },
    { entity_id: "s2", house_id: "k", position: { x: 800, y: 480 }, width: 500, height: 20 },
    { entity_id: "e2", house_id: "k", position: { x: 1280, y: 100 }, width: 20, height: 400 },
  ];
  const houses = [
    { id: "h", x: 200, y: 200, width: 400, height: 300 },
    { id: "k", x: 800, y: 100, width: 500, height: 400 },
  ];
  const statics = dressingStatics(
    {
      walls,
      doors: [],
      containers: [],
      escape_doors: [],
      switches: [],
      stairs: [{ entity_id: "st", position: { x: 700, y: 700 } }],
    },
    1440,
    960,
  );
  /** Everything a floor plans: ground, wall pieces, dressing. */
  const plans = (floor: number, count = 3) => {
    const look = floorLook(tower, floor, count);
    return {
      ground: planGroundLayer({ width: 1440, height: 960, kind: "run", houses, look: look.ground, seed: look.seed }),
      walls: planWalls(walls, look.seed, look.walls).pieces,
      dressing: look.dressing ? planDressing(look.dressing, look.seed, statics) : [],
    };
  };

  it("should draw the exterior the same on every floor, as it always was, with no dressing (§A.3)", () => {
    for (const floor of [1, 2, 3])
      expect(floorLook(WORLD_THEMES.exterior, floor, 3)).toEqual({
        band: floorBand(floor, 3),
        ground: OUTDOOR_GROUND,
        walls: TIMBER_WALLS,
        dressing: null,
        seed: worldSeed("run"),
      });
  });

  it("should draw a tower's middle floor as the tower look slice 2 settled", () => {
    const middle = floorLook(tower, 2, 3);
    expect(middle.band).toBe("middle");
    expect(middle.ground).toEqual(TOWER_GROUND);
    expect(middle.walls).toEqual(MASONRY_WALLS);
  });

  it("should plan the same floor the same way twice, and floors 1 and 3 differently", () => {
    const one = plans(1);
    expect(plans(1)).toEqual(one);
    const three = plans(3);
    expect(three.ground).not.toEqual(one.ground);
    expect(three.walls).not.toEqual(one.walls);
    expect(three.dressing).not.toEqual(one.dressing);
    expect(one.dressing.length).toBeGreaterThan(0);
    expect(three.dressing.length).toBeGreaterThan(0);
  });

  it("should seed each floor apart, even two floors of one band", () => {
    expect(floorLook(tower, 4, 10).seed).not.toBe(floorLook(tower, 5, 10).seed);
    expect(floorLook(tower, 4, 10).band).toBe(floorLook(tower, 5, 10).band);
  });

  it("should break the lower floor's flags with barrow earth, and dress the upper floor's stone", () => {
    const lower = plans(1).ground.map((p) => p.sheet);
    expect(lower).toContain("ground_dirt");
    expect(lower).toContain("ground_flags_dirt");
    expect(lower).toContain("ground_flags");
    const upper = new Set(plans(3).ground.map((p) => p.sheet));
    expect(upper).toEqual(new Set(["ground_dressed", "ground_planks"]));
  });

  it("should plank every room in every band", () => {
    for (const band of ["lower", "middle", "upper"] as const)
      expect(TOWER_BANDS[band].ground.floor).toBe("ground_planks");
  });

  it("should hang no banner on a lower floor, and no cobweb on an upper floor", () => {
    const kinds = (floor: number) => new Set(plans(floor).walls.map((p) => p.sheet.split("_")[3]));
    expect(kinds(1).has("banner")).toBe(false);
    expect(kinds(1).has("cobweb")).toBe(true);
    expect(kinds(3).has("cobweb")).toBe(false);
    expect(kinds(3).has("banner")).toBe(true);
    for (const band of ["lower", "middle", "upper"] as const)
      expect(TOWER_BANDS[band].walls.front).toEqual(MASONRY_WALLS.front);
  });

  it("should strew no roots or bone piles on an upper floor, and lean each band its own way", () => {
    const sheets = (floor: number) => new Set(plans(floor).dressing.map((p) => p.sheet));
    for (const s of ["roots", "bone_pile"]) expect(sheets(3).has(s as never)).toBe(false);
    expect(TOWER_BANDS.upper.dressing.weights.map(([, s]) => s)).not.toContain("roots");
    expect(TOWER_BANDS.upper.dressing.weights.map(([, s]) => s)).not.toContain("bone_pile");
    expect(TOWER_BANDS.lower.dressing.weights.map(([, s]) => s)).not.toContain("brazier");
    expect(TOWER_BANDS.upper.dressing.weights.map(([, s]) => s)).toContain("brazier");
  });

  it("should keep every band's dressing within the 16-piece cap", () => {
    for (const band of ["lower", "middle", "upper"] as const)
      expect(TOWER_BANDS[band].dressing.count).toBeLessThanOrEqual(16);
  });
});
