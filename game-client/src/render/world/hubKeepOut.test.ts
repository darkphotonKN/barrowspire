import { describe, expect, it } from "vitest";
import { projectedBounds, worldToScreen } from "@/render/iso/projection";
import type { WallState } from "@/types/gameState";
import {
  HUB_APPROACHES,
  HUB_APRONS,
  HUB_BEYOND_EDGE,
  HUB_BEYOND_EDGE_FENCES,
  HUB_CAMERA_MARGIN,
  HUB_CARTS,
  HUB_CRATES,
  HUB_DRESSING,
  HUB_FENCES,
  HUB_GATE_DRESSING,
  HUB_KEEP_OUT,
  HUB_PATHS,
  HUB_SIZE,
  HUB_SPIRE_FACADE,
  HUB_STALLS,
  HUB_WASHING_LINE,
  HUB_WELL,
  fenceFootprint,
  fenceSegments,
  keepOutBreaches,
  spotFootprint,
  type FenceRun,
  type Footprint,
  type PropSpot,
} from "./hubKeepOut";
import { ROOF_EAVE } from "./roofs";

/**
 * The town's buildings, copied from game-server/game-service/internal/game/hub_map.go
 * (hubBuildings): the Inn, the Quartermaster's store and the smithy (FS-B0H2D R1–R3), walled
 * 20 thick as addHubBuilding does, the south wall cut in two around a centred door gap a run
 * door wide (R9). Furnishings are not copied here: they stand indoors, and this checks the
 * outdoor dressing. The scene takes its walls from the server; this copy exists so the keep-out
 * rule can be checked at review.
 */
const HUB_BUILDINGS: [number, number, number, number][] = [
  [470, 110, 400, 300],
  [1130, 150, 300, 240],
  [110, 50, 300, 240],
];
const THICK = 20;
const DOOR = 50;
/** Each building's door gap, as the span along its south wall's line: [x0, x1, y of the sill]. */
const DOOR_GAPS = HUB_BUILDINGS.map(([x, y, w, h]) => {
  const side = (w - DOOR) / 2;
  return { x0: x + side, x1: x + side + DOOR, sill: y + h };
});
const HUB_WALLS: WallState[] = HUB_BUILDINGS.flatMap(([x, y, w, h], i) => {
  const side = (w - DOOR) / 2;
  return [
    [x, y, w, THICK],
    [x, y, THICK, h],
    [x + w - THICK, y, THICK, h],
    [x, y + h - THICK, side, THICK],
    [x + side + DOOR, y + h - THICK, side, THICK],
  ].map(([wx, wy, ww, wh], k) => ({
    entity_id: `b${i}w${k}`,
    house_id: `b${i}`,
    position: { x: wx, y: wy },
    width: ww,
    height: wh,
  }));
});
/**
 * blocked() clears what a building looks like, eave included: HubScene's ROOF_EAVE, the same
 * overhang the roofs are laid with.
 */
const EAVE = ROOF_EAVE;

const breaches = (fp: Footprint) => keepOutBreaches(fp, HUB_WALLS, EAVE);

/** A footprint's square, as [x, y, w, h]. */
function squareOf(fp: Footprint): Rect4 {
  const x = Math.min(fp.from.x, fp.to.x) - fp.r;
  const y = Math.min(fp.from.y, fp.to.y) - fp.r;
  return [x, y, Math.abs(fp.to.x - fp.from.x) + 2 * fp.r, Math.abs(fp.to.y - fp.from.y) + 2 * fp.r];
}

/** Rects that meet, edges included. */
const touches = (a: Rect4, b: Rect4) =>
  a[0] <= b[0] + b[2] && b[0] <= a[0] + a[2] && a[1] <= b[1] + b[3] && b[1] <= a[1] + a[3];

/** Interiors overlap: rects that only share an edge do not. */
const crosses = (a: Rect4, b: Rect4) =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/**
 * Indoors, or under a roof's eave: K1 tests the walls, and a town building can now be walked
 * into, so a spot clear of every wall can still stand on a room's floor (FS-B0H2D R24).
 */
const indoors = (fp: Footprint) =>
  HUB_BUILDINGS.some(([x, y, w, h]) => crosses(squareOf(fp), [x - EAVE, y - EAVE, w + 2 * EAVE, h + 2 * EAVE]));

/** The ground in front of a door gap a player walks out onto: the gap's width, 80 deep (R5). */
const THRESHOLD = 80;
const thresholds: Rect4[] = DOOR_GAPS.map((g) => [g.x0, g.sill, g.x1 - g.x0, THRESHOLD]);

const label = (s: PropSpot) => `${s.sheet} at (${s.at.x}, ${s.at.y})`;

type Rect4 = readonly [number, number, number, number];

/** A footprint whose whole square lies outside the map: dressing drawn beyond the edge. */
function beyondTheEdge(fp: Footprint): boolean {
  const x0 = Math.min(fp.from.x, fp.to.x) - fp.r;
  const x1 = Math.max(fp.from.x, fp.to.x) + fp.r;
  const y0 = Math.min(fp.from.y, fp.to.y) - fp.r;
  const y1 = Math.max(fp.from.y, fp.to.y) + fp.r;
  return x1 < 0 || y1 < 0 || x0 > HUB_SIZE.width || y0 > HUB_SIZE.height;
}

describe("the hub keep-out constants (FS-KYPQ9 §A.3)", () => {
  it("holds K3–K6 as the server places them", () => {
    expect(HUB_KEEP_OUT.spawn).toEqual({ at: { x: 1000, y: 800 }, clearance: 60 });
    // the Spirewarden by the spawn, the Quartermaster in his store (FS-B0H2D R8)
    expect(HUB_KEEP_OUT.npcs.at).toEqual([
      { x: 1140, y: 680 },
      { x: 1280, y: 270 },
    ]);
    expect(HUB_KEEP_OUT.npcs.clearance).toBe(80);
    expect(HUB_KEEP_OUT.hearth).toEqual({ at: { x: 1000, y: 640 }, clearance: 80 });
    expect(HUB_KEEP_OUT.wander).toEqual([
      { name: "Cottar", x: 560, y: 560, width: 180, height: 200 },
      { name: "Herbwife", x: 1260, y: 540, width: 240, height: 220 },
      { name: "Woodcutter", x: 700, y: 820, width: 300, height: 140 },
      { name: "Bellringer", x: 1180, y: 820, width: 280, height: 140 },
    ]);
  });

  it("holds K8's gates as the server places them, with GateRange (FS-0XMCP R2, R4)", () => {
    expect(HUB_KEEP_OUT.gates.at).toEqual([
      { destination: "spire", x: 1000, y: 50 },
      { destination: "forest", x: 40, y: 400 },
      { destination: "meadows", x: 1960, y: 360 },
    ]);
    expect(HUB_KEEP_OUT.gates.range).toBe(80);
  });
});

describe("residents keep clear of function NPCs (FS-MRZH7 §Requirements 9)", () => {
  // a function NPC's talk range plus a margin, so nobody wanders onto who a player came to see
  const CLEARANCE = HUB_KEEP_OUT.npcs.clearance + 40;

  it.each(HUB_KEEP_OUT.wander.map((q) => [q.name, q] as const))(
    "should keep the %s's quarter out of every function NPC's talk range",
    (_, q) => {
      for (const at of HUB_KEEP_OUT.npcs.at) {
        const dx = Math.max(q.x - at.x, 0, at.x - (q.x + q.width));
        const dy = Math.max(q.y - at.y, 0, at.y - (q.y + q.height));
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(CLEARANCE);
      }
    },
  );
});

describe("every hub prop clears K1–K8 (FS-KYPQ9 §A.4, §A.5; FS-0XMCP R20)", () => {
  const spots: PropSpot[] = [
    HUB_WELL,
    ...HUB_STALLS,
    ...HUB_CARTS,
    ...HUB_CRATES,
    ...HUB_DRESSING,
    ...HUB_WASHING_LINE.posts,
    ...HUB_GATE_DRESSING,
  ];

  it.each(spots.map((s) => [label(s), s] as const))("%s", (_, spot) => {
    expect(breaches(spotFootprint(spot))).toEqual([]);
  });

  it.each(HUB_FENCES.map((f) => [`fence run from (${f.at.x}, ${f.at.y})`, f] as const))(
    "%s clears along every segment",
    (_, run) => {
      expect(breaches(fenceFootprint(run))).toEqual([]);
    },
  );

  const outdoor: [string, Footprint][] = [
    ...spots.map((s) => [label(s), spotFootprint(s)] as [string, Footprint]),
    ...HUB_FENCES.map((f) => [`fence run from (${f.at.x}, ${f.at.y})`, fenceFootprint(f)] as [string, Footprint]),
  ];

  it.each(outdoor)("%s stands outdoors, off every room's floor (FS-B0H2D R24)", (_, fp) => {
    expect(indoors(fp)).toBe(false);
  });

  it.each(outdoor)("%s keeps every door gap's threshold clear (FS-B0H2D R5, R24)", (_, fp) => {
    for (const t of thresholds) expect(crosses(squareOf(fp), t)).toBe(false);
  });

  it("places the §A.4 props at the table's coordinates, re-fitted round the town (FS-B0H2D R24)", () => {
    // moved off the Inn's road, from (820, 460)
    expect(HUB_WELL).toMatchObject({ sheet: "well", at: { x: 850, y: 580 }, r: 22 });
    expect(HUB_STALLS.map((s) => [s.at.x, s.at.y, s.r])).toEqual([
      // off the store's threshold, from (1220, 460)
      [1190, 500, 40],
      // off the Inn's road, from (700, 500)
      [470, 550, 40],
      [630, 950, 40],
    ]);
    expect(HUB_CARTS.map((s) => [s.sheet, s.at.x, s.at.y, s.r])).toEqual([
      // out from under the Inn's eave to the smithy's front, from (540, 430)
      ["cart", 350, 330, 26],
      ["hay_cart", 400, 880, 26],
    ]);
    expect(HUB_CRATES.map((s) => [s.sheet, s.at.x, s.at.y, s.r])).toEqual([
      // off the store's threshold, from (1300, 470)
      ["crate", 1320, 470, 14],
      // nudged off the east road's drop (FS-0XMCP R19, K8), from (1330, 500)
      ["crate", 1320, 505, 14],
      ["crate", 530, 730, 14],
      ["crate", 1050, 910, 14],
      ["crate_stack", 1110, 935, 14],
    ]);
    expect(HUB_FENCES).toEqual([
      { at: { x: 300, y: 760 }, length: 220, axis: "x", r: 20 },
      // shortened from 180 to clear the Meadows gate's range (FS-0XMCP K8): the fence end
      // beside the east road
      { at: { x: 1740, y: 300 }, length: 130, axis: "x", r: 20 },
      { at: { x: 240, y: 950 }, length: 240, axis: "x", r: 20 },
    ]);
  });

  it("places every §A.5 row, with its radius, height and light", () => {
    const rows = HUB_DRESSING.map((s) => [s.sheet, s.at.x, s.at.y, s.r, !!s.tall]);
    expect(rows).toEqual([
      ["lamp_post", 925, 760, 12, true],
      ["lamp_post", 1085, 760, 12, true],
      // moved off the north lane and the west trail's drop (FS-0XMCP R19, K8), from
      // (1000, 430) and (515, 600)
      ["brazier", 1080, 440, 16, true],
      ["brazier", 530, 600, 16, true],
      // beside the well, off the Inn's road (FS-B0H2D R24), from (750, 450)
      ["water_trough", 790, 580, 20, false],
      ["water_trough", 310, 840, 20, false],
      ["woodpile", 660, 880, 24, false],
      // off the Inn's road and out of the market stall's way, from (620, 490) and (1150, 460)
      ["sacks", 535, 540, 12, false],
      ["sacks", 1125, 455, 12, false],
      ["sacks", 600, 840, 12, false],
      ["signpost", 1085, 520, 10, true],
      ["signpost", 1050, 880, 10, true],
      // the old houses' faces are gone: the Inn's front either side of its door, the store's
      // front west of its door, the store's east side
      ["flower_box", 560, 432, 10, false],
      ["flower_box", 790, 432, 10, false],
      ["flower_box", 1190, 412, 10, false],
      ["flower_box", 1452, 270, 10, false],
      // by the cart before the smithy, from (575, 475) under the Inn's eave
      ["barrel", 400, 345, 12, false],
      ["barrel", 610, 810, 12, false],
      ["barrel", 340, 800, 12, false],
    ]);
    // flower boxes lie along the wall they stand against: three south faces, one east face
    expect(HUB_DRESSING.filter((s) => s.sheet === "flower_box").map((s) => s.animation)).toEqual(["x", "x", "x", "y"]);
    // the sacks' variants: grain, grain, market goods
    expect(HUB_DRESSING.filter((s) => s.sheet === "sacks").map((s) => s.index)).toEqual([0, 0, 1]);
    // the washing line's old house is gone; it hangs south of the Forest trail, from x 640–720
    expect(HUB_WASHING_LINE.posts.map((p) => [p.sheet, p.at.x, p.at.y, p.r, p.tall])).toEqual([
      ["washing_post", 200, 600, 8, true],
      ["washing_post", 280, 600, 8, true],
    ]);
    // the line and its cloth sort by the span's midpoint
    expect(HUB_WASHING_LINE.line).toMatchObject({ sheet: "washing_line", at: { x: 240, y: 600 } });
  });
});

describe("the keep-out check catches a bad placement", () => {
  it("flags a prop standing on a trodden path (K2)", () => {
    const [px, py, pw] = HUB_PATHS[0];
    const onPath: PropSpot = { sheet: "crate", at: { x: px + pw / 2, y: py + 40 }, r: 14 };
    expect(breaches(spotFootprint(onPath))).toContain("K2");
  });

  it("flags a fence run whose start clears but whose span crosses a path (K2)", () => {
    // starts west of the main path's west edge (x 940), runs east across it
    const run: FenceRun = { at: { x: 880, y: 560 }, length: 120, axis: "x", r: 20 };
    expect(breaches(spotFootprint({ sheet: "fence_post", at: run.at, r: run.r }))).toEqual([]);
    expect(breaches(fenceFootprint(run))).toContain("K2");
  });

  it.each([
    ["K1 inside a building's eave", { x: 700, y: 395 }, 10, "K1"],
    ["K3 by the spawn", { x: 1000, y: 860 }, 10, "K3"],
    ["K4 in the Spirewarden's talk range", { x: 1140, y: 760 }, 10, "K4"],
    ["K4 in the Quartermaster's talk range", { x: 1280, y: 340 }, 10, "K4"],
    ["K5 by the hearth", { x: 1080, y: 600 }, 10, "K5"],
    ["K6 in the Woodcutter's quarter", { x: 850, y: 900 }, 10, "K6"],
    ["K7 off the map", { x: 1990, y: 500 }, 20, "K7"],
    ["K8 in the Spire gate's range", { x: 1060, y: 110 }, 10, "K8"],
    ["K8 in the Forest gate's range", { x: 80, y: 470 }, 10, "K8"],
    ["K8 in the Meadows gate's range", { x: 1900, y: 300 }, 10, "K8"],
    ["K8 on the north lane", { x: 1000, y: 300 }, 10, "K8"],
    ["K8 on the west trail", { x: 300, y: 415 }, 10, "K8"],
    ["K8 on the east road", { x: 1600, y: 365 }, 10, "K8"],
  ] as const)("flags %s", (_, at, r, rule) => {
    expect(breaches(spotFootprint({ sheet: "crate", at, r }))).toContain(rule);
  });

  it("measures K3–K5 from the nearest point of a fence run, not its start", () => {
    const run: FenceRun = { at: { x: 800, y: 760 }, length: 400, axis: "x", r: 10 };
    expect(breaches(fenceFootprint(run))).toContain("K3");
  });
});

describe("the gates' approaches and dressing (FS-0XMCP R18–R20)", () => {
  const holds = (r: Rect4, p: { x: number; y: number }) =>
    p.x >= r[0] && p.x <= r[0] + r[2] && p.y >= r[1] && p.y <= r[1] + r[3];
  /** The hearth's paths from before the gates: the spawn's lane and its two arms. */
  const HEARTH_PATHS = HUB_PATHS.slice(0, 3);
  /** Where each gate's trodden ground leaves the map: the edge it stands on. */
  const EXIT = {
    spire: { x: 1000, y: 0 },
    forest: { x: 0, y: 400 },
    meadows: { x: HUB_SIZE.width, y: 360 },
  } as const;

  it("lays every approach as trodden ground in HUB_PATHS", () => {
    for (const rects of Object.values(HUB_APPROACHES))
      for (const r of rects) expect(HUB_PATHS).toContainEqual(r);
  });

  it.each(HUB_KEEP_OUT.gates.at.map((g) => [g.destination, g] as const))(
    "joins the %s gate, at the map's edge, to the hearth's paths",
    (destination, gate) => {
      const rects = HUB_APPROACHES[destination];
      // the first rect carries the trodden ground through the gate to the edge
      expect(holds(rects[0], gate)).toBe(true);
      expect(holds(rects[0], EXIT[destination])).toBe(true);
      // each rect touches the one before, and the last meets a hearth path
      rects.slice(1).forEach((r, i) => expect(touches(r, rects[i])).toBe(true));
      expect(HEARTH_PATHS.some((p) => touches(p, rects[rects.length - 1]))).toBe(true);
    },
  );

  it("stands a signpost beside each field gate, outside its range", () => {
    const signposts = HUB_GATE_DRESSING.filter((s) => s.sheet === "signpost");
    for (const destination of ["forest", "meadows"] as const) {
      const gate = HUB_KEEP_OUT.gates.at.find((g) => g.destination === destination)!;
      const near = signposts.filter(
        (s) => Math.hypot(s.at.x - gate.x, s.at.y - gate.y) <= 2 * HUB_KEEP_OUT.gates.range,
      );
      expect(near, destination).toHaveLength(1);
    }
  });

  it("flanks the trail mouth with pines and oaks, thickening beyond the west edge", () => {
    const trees = (spots: readonly PropSpot[]) =>
      spots.filter((s) => /^tree_(pine|oak)$/.test(s.sheet));
    const inside = trees(HUB_GATE_DRESSING).filter((s) => s.at.x < 300);
    const beyond = trees(HUB_BEYOND_EDGE).filter((s) => s.at.x < 0);
    expect(inside.length).toBeGreaterThanOrEqual(2);
    expect(beyond.length).toBeGreaterThan(inside.length);
  });

  it.each(HUB_BEYOND_EDGE.map((s) => [label(s), s] as const))(
    "%s stands wholly beyond the map's edge and clears K8",
    (_, spot) => {
      expect(beyondTheEdge(spotFootprint(spot))).toBe(true);
      expect(breaches(spotFootprint(spot))).toEqual(["K7"]);
    },
  );

  it.each(
    HUB_BEYOND_EDGE_FENCES.map((f) => [`fence run from (${f.at.x}, ${f.at.y})`, f] as const),
  )("%s beside the east road stands wholly beyond the edge and clears K8", (_, run) => {
    expect(beyondTheEdge(fenceFootprint(run))).toBe(true);
    expect(breaches(fenceFootprint(run))).toEqual(["K7"]);
  });

  it("lays ground past the edge only outside the map, running on from each gate", () => {
    const reach = projectedBounds(HUB_SIZE.width, HUB_SIZE.height, HUB_CAMERA_MARGIN);
    expect(HUB_APRONS).toHaveLength(HUB_KEEP_OUT.gates.at.length);
    for (const a of HUB_APRONS) {
      const fp: Footprint = {
        from: { x: a.x + 1, y: a.y + 1 },
        to: { x: a.x + a.width - 1, y: a.y + a.height - 1 },
        r: 0,
      };
      expect(beyondTheEdge(fp)).toBe(true);
      // it fades out from a point on the map's edge, inside a gate's range
      const { x, y } = a.from;
      expect(x === 0 || y === 0 || x === HUB_SIZE.width || y === HUB_SIZE.height).toBe(true);
      expect(
        HUB_KEEP_OUT.gates.at.some((g) => Math.hypot(g.x - x, g.y - y) <= HUB_KEEP_OUT.gates.range),
      ).toBe(true);
      // and that point is where the camera can see it
      const s = worldToScreen(x, y);
      expect(s.x).toBeGreaterThan(reach.x);
      expect(s.x).toBeLessThan(reach.x + reach.width);
      expect(s.y).toBeGreaterThan(reach.y);
    }
  });

  it("draws the Spire's facade beyond the north edge, its door on the Spire gate", () => {
    const spire = HUB_KEEP_OUT.gates.at.find((g) => g.destination === "spire")!;
    expect(HUB_SPIRE_FACADE.sheet).toBe("spire_facade");
    expect(HUB_SPIRE_FACADE.at.x).toBe(spire.x);
    expect(HUB_SPIRE_FACADE.at.y).toBeLessThan(0);
  });
});

describe("the town buildings' doors and the trodden ground (FS-B0H2D R24)", () => {
  /** The rect of trodden ground that starts at a door gap and spans it. */
  const spurOf = (g: (typeof DOOR_GAPS)[number]) =>
    HUB_PATHS.find(([x, y, w]) => y === g.sill && x <= g.x0 && x + w >= g.x1);

  it.each(DOOR_GAPS.map((g, i) => [`building ${i}'s door at x ${g.x0}–${g.x1}`, g] as const))(
    "lays a short spur from %s to another path or approach",
    (_, gap) => {
      const spur = spurOf(gap);
      expect(spur).toBeDefined();
      expect(spur![3]).toBeLessThanOrEqual(120);
      expect(HUB_PATHS.some((p) => p !== spur && touches(p, spur!))).toBe(true);
    },
  );

  it.each(HUB_PATHS.map((p) => [`[${p.join(", ")}]`, p] as const))(
    "lays the trodden ground %s outdoors, never across a room's floor",
    (_, path) => {
      for (const [x, y, w, h] of HUB_BUILDINGS) expect(crosses(path, [x, y, w, h])).toBe(false);
    },
  );

  it("runs the Forest trail straight in to the spawn's lane, no longer south round a house", () => {
    // never below the spawn's lane's top: the old trail dropped to y 710 round the west house
    for (const [, y, , h] of HUB_APPROACHES.forest) expect(y + h).toBeLessThanOrEqual(500);
  });
});

describe("fenceSegments", () => {
  it("cuts a run into one-tile segments, trimming the last, with a post at each end", () => {
    const { segments, posts } = fenceSegments({ at: { x: 300, y: 760 }, length: 100, axis: "x", r: 20 });
    expect(segments).toEqual([
      { sheet: "fence_x", axis: "x", at: { x: 320, y: 760 }, keep: 1, depthAt: { x: 300, y: 760 } },
      { sheet: "fence_x", axis: "x", at: { x: 360, y: 760 }, keep: 1, depthAt: { x: 340, y: 760 } },
      { sheet: "fence_x", axis: "x", at: { x: 400, y: 760 }, keep: 0.5, depthAt: { x: 380, y: 760 } },
    ]);
    expect(posts).toEqual([
      { x: 300, y: 760 },
      { x: 400, y: 760 },
    ]);
  });

  it("lays a run along world y with fence_y", () => {
    const { segments, posts } = fenceSegments({ at: { x: 100, y: 200 }, length: 80, axis: "y", r: 20 });
    expect(segments.map((s) => [s.sheet, s.at.x, s.at.y, s.keep])).toEqual([
      ["fence_y", 100, 220, 1],
      ["fence_y", 100, 260, 1],
    ]);
    expect(posts).toEqual([
      { x: 100, y: 200 },
      { x: 100, y: 280 },
    ]);
  });
});
