import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE, worldToScreen, type Point } from "@/render/iso/projection";
import { decodePng } from "../../../tools/bake/lib/png.mjs";
import type { WallState } from "@/types/gameState";
import {
  GRAVEYARD_ENCLOSURE,
  HUB_BELFRY,
  HUB_GRAVEYARD,
  HUB_GRAVEYARD_WALL,
  HUB_GRAVEYARD_WALL_RUNS,
  HUB_WAYSIDE_CROSS,
  graveyardWallPieces,
  type GraveyardWallPiece,
} from "./hubGraveyard";
import {
  HUB_DOOR_SPURS,
  HUB_PATHS,
  fenceFootprint,
  keepOutBreaches,
  spotFootprint,
  type Footprint,
  type PropSpot,
} from "./hubKeepOut";
import { townDoorGap, townDoorStrip, townOutline } from "./hubTown.fixture";
import { HUB_TOWN_GOLDEN } from "./hubTownGolden";
import { BAKE } from "./bake";
import { gapDoor } from "./buildingLooks";
import { bulkOf, hiddenBehind } from "./hubCover";
import { townHouseLook } from "./hubInteriors";
import { ROOF_EAVE } from "./roofs";

type Rect4 = readonly [number, number, number, number];

const ART = join(process.cwd(), "public/art");
const manifest = JSON.parse(readFileSync(join(ART, "manifest.json"), "utf8")) as {
  atlases: Record<string, { image: string }>;
  sheets: Record<
    string,
    { atlas: string; frameWidth: number; frameHeight: number; anchor: { x: number; y: number }; animations: Record<string, { frames: Point[][] }> }
  >;
};
/**
 * The screen pixels a sheet's first frame draws standing at the world point `at`, as "x,y", those
 * more opaque than `alpha` (0..255).
 */
function drawnPixels(sheet: string, animation: string, at: Point, alpha = 0): string[] {
  const s = manifest.sheets[sheet];
  const atlas = decodePng(readFileSync(join(ART, manifest.atlases[s.atlas].image)));
  const f = s.animations[animation].frames[0][0];
  const o = worldToScreen(at.x, at.y);
  const [left, top] = [o.x - s.anchor.x * s.frameWidth, o.y - s.anchor.y * s.frameHeight];
  const out: string[] = [];
  for (let y = 0; y < s.frameHeight; y++)
    for (let x = 0; x < s.frameWidth; x++)
      if (atlas.rgba[((f.y + y) * atlas.width + f.x + x) * 4 + 3] > alpha) out.push(`${Math.round(left + x)},${Math.round(top + y)}`);
  return out;
}

/** The town's walls as the golden lays them out, the chapel's included (as hubKeepOut.test.ts). */
const TOWN_WALLS: WallState[] = HUB_TOWN_GOLDEN.buildings.flatMap((b, i) =>
  townOutline(b).map(([x, y, width, height], k) => ({
    entity_id: `b${i}w${k}`,
    house_id: `b${i}`,
    position: { x, y },
    width,
    height,
  })),
);
const breaches = (fp: Footprint) => keepOutBreaches(fp, TOWN_WALLS, ROOF_EAVE);

/**
 * The dev test room's gate (FS-BDRTJ R4): its range about (120, 900), and the arrival beside it,
 * kept clear as K3 keeps the spawn.
 */
const DEV_GATE = { at: { x: 120, y: 900 }, range: 80 };
const DEV_ARRIVAL = { at: { x: 260, y: 900 }, clearance: 60 };

/** Distance from `p` to the footprint's centre line. */
function distanceTo(p: Point, fp: Footprint): number {
  const dx = fp.to.x - fp.from.x;
  const dy = fp.to.y - fp.from.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - fp.from.x) * dx + (p.y - fp.from.y) * dy) / len2));
  return Math.hypot(p.x - (fp.from.x + t * dx), p.y - (fp.from.y + t * dy));
}

/** The dev test room's gate and arrival the footprint stands on, empty when it clears. */
const onTheDevGate = (fp: Footprint) => [
  ...(distanceTo(DEV_GATE.at, fp) <= DEV_GATE.range + fp.r ? ["gate"] : []),
  ...(distanceTo(DEV_ARRIVAL.at, fp) <= DEV_ARRIVAL.clearance + fp.r ? ["arrival"] : []),
];

/** A footprint's square, as [x, y, w, h]. */
function squareOf(fp: Footprint): Rect4 {
  const x = Math.min(fp.from.x, fp.to.x) - fp.r;
  const y = Math.min(fp.from.y, fp.to.y) - fp.r;
  return [x, y, Math.abs(fp.to.x - fp.from.x) + 2 * fp.r, Math.abs(fp.to.y - fp.from.y) + 2 * fp.r];
}

/** Interiors overlap: rects that only share an edge do not. */
const crosses = (a: Rect4, b: Rect4) =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** How near a footprint's square comes to a point: 0 when the point is on it. */
function gapTo(p: Point, fp: Footprint): number {
  const [x, y, w, h] = squareOf(fp);
  return Math.hypot(Math.max(x - p.x, 0, p.x - (x + w)), Math.max(y - p.y, 0, p.y - (y + h)));
}

/** One wall piece as it stands: its tile from the back corner, as far as it keeps. */
function pieceFootprint(p: GraveyardWallPiece): Footprint {
  const reach = p.keep * WORLD_PX_PER_TILE;
  const to = p.animation === "x" ? { x: p.depthAt.x + reach, y: p.depthAt.y } : { x: p.depthAt.x, y: p.depthAt.y + reach };
  return { from: p.depthAt, to, r: p.r };
}

/** The mourners (FS-R4MYX R17), the graveyard's only fixed residents, where the golden stands them. */
const MOURNERS = HUB_TOWN_GOLDEN.fixedResidents.filter((r) => ["Keener", "Widower", "Veteran"].includes(r.name));

/** Within 12 px of a mourner (R27): somewhere a mourner could not stand clear of. */
const MOURNER_CLEARANCE = 12;
const nearAMourner = (fp: Footprint) => MOURNERS.filter((m) => gapTo(m, fp) <= MOURNER_CLEARANCE).map((m) => m.name);

const label = (s: PropSpot) => `${s.sheet}${s.animation ? `/${s.animation}` : ""} at (${s.at.x}, ${s.at.y})`;

const of = (sheet: string, animation?: string) =>
  HUB_GRAVEYARD.filter((s) => s.sheet === sheet && (animation === undefined || s.animation === animation));

const ENCLOSURE: Rect4 = [GRAVEYARD_ENCLOSURE.x, GRAVEYARD_ENCLOSURE.y, GRAVEYARD_ENCLOSURE.width, GRAVEYARD_ENCLOSURE.height];
const insideEnclosure = (fp: Footprint) => {
  const [x, y, w, h] = squareOf(fp);
  const [ex, ey, ew, eh] = ENCLOSURE;
  return x >= ex && y >= ey && x + w <= ex + ew && y + h <= ey + eh;
};

/** Every piece's footprint: the graveyard's, each wall piece's, the belfry's and the wayside cross's. */
const EVERY_PIECE: [string, Footprint][] = [
  ...HUB_GRAVEYARD.map((s) => [label(s), spotFootprint(s)] as [string, Footprint]),
  ...HUB_GRAVEYARD_WALL.map((p) => [`${label(p)}, keeping ${p.keep}`, pieceFootprint(p)] as [string, Footprint]),
  [label(HUB_BELFRY), spotFootprint(HUB_BELFRY)],
  [label(HUB_WAYSIDE_CROSS), spotFootprint(HUB_WAYSIDE_CROSS)],
];

describe("the graveyard's layout (FS-R4MYX R28)", () => {
  it("counts 24 headstones: 10 intact in both shapes, 9 weathered, 5 broken", () => {
    expect(of("headstone")).toHaveLength(24);
    expect(of("headstone", "intact")).toHaveLength(10);
    expect(new Set(of("headstone", "intact").map((s) => s.index))).toEqual(new Set([0, 1]));
    expect(of("headstone", "weathered")).toHaveLength(9);
    expect(of("headstone", "broken")).toHaveLength(5);
  });

  it("keeps the broken stumps in the two old rows and the fresh mounds in the two new ones", () => {
    for (const s of of("headstone", "broken")) expect([140, 240], label(s)).toContain(s.at.x);
    for (const m of of("grave_mound")) expect([340, 440], label(m)).toContain(m.at.x - 25);
  });

  it("counts 3 fresh mounds and flowers at 6 graves, 4 fresh and 2 withered", () => {
    expect(of("grave_mound")).toHaveLength(3);
    expect(of("grave_flowers")).toHaveLength(6);
    expect(of("grave_flowers", "fresh")).toHaveLength(4);
    expect(of("grave_flowers", "withered")).toHaveLength(2);
  });

  it("stands the two tall stone crosses and the three dead trees where the table puts them", () => {
    const tall = (sheet: string) => of(sheet).map((s) => [s.at.x, s.at.y, !!s.tall]);
    expect(tall("stone_cross")).toEqual([
      [85, 1170, true],
      [85, 1380, true],
    ]);
    expect(tall("tree_dead")).toEqual([
      [80, 1060, true],
      [290, 1050, true],
    ]);
    expect(tall("tree_dead_snag")).toEqual([[80, 1480, true]]);
  });

  it("lays the graves in four rows of seven slots, oldest west, one slot empty, as the table reads", () => {
    const at = (x: number, y: number) =>
      HUB_GRAVEYARD.filter((s) => s.at.x === x && s.at.y === y && s.sheet === "headstone").map((s) => s.animation)[0] ??
      (of("grave_mound").some((m) => m.at.x === x + 25 && m.at.y === y) ? "mound" : "-");
    const rows = [140, 240, 340, 440].map((x) => [1080, 1140, 1200, 1260, 1320, 1380, 1440].map((y) => at(x, y)));
    expect(rows).toEqual([
      ["broken", "weathered", "intact", "broken", "weathered", "intact", "weathered"],
      ["intact", "broken", "weathered", "intact", "broken", "weathered", "broken"],
      ["intact", "weathered", "intact", "mound", "weathered", "intact", "-"],
      ["intact", "weathered", "intact", "mound", "mound", "intact", "weathered"],
    ]);
  });

  it("is about twice the first graveyard's ground (390 × 350), screen-left of the chapel (FS-R4MYX R27, R28)", () => {
    const [, , w, h] = ENCLOSURE;
    expect(w * h).toBeGreaterThanOrEqual(1.9 * 390 * 350);
    const chapel = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Chapel")!;
    // screen x runs with x − y: the enclosure's middle lies left of the chapel's leftmost corner,
    // and every piece left of the chapel's middle (the belfry and the wayside cross stand by its door)
    const [ex, ey] = ENCLOSURE;
    expect(ex + w / 2 - (ey + h / 2)).toBeLessThan(chapel.x - (chapel.y + chapel.h));
    for (const [what, fp] of EVERY_PIECE.filter(([w]) => !/^(belfry|wayside_cross) /.test(w)))
      expect(fp.to.x - fp.to.y, what).toBeLessThan(chapel.x + chapel.w / 2 - (chapel.y + chapel.h / 2));
  });

  it("lays each grave's flowers 18 px east of its stone, or of its mound's head", () => {
    const heads = [
      ...of("headstone").map((s) => s.at),
      ...of("grave_mound").map((m) => ({ x: m.at.x - 25, y: m.at.y })),
    ];
    for (const f of of("grave_flowers"))
      expect(heads, label(f)).toContainEqual({ x: f.at.x - 18, y: f.at.y });
  });

  it("draws the flowers on a mound over its earth, not under it", () => {
    for (const mound of of("grave_mound")) {
      const onIt = of("grave_flowers").filter((f) => f.at.y === mound.at.y && Math.abs(f.at.x - mound.at.x) <= 25);
      for (const f of onIt) {
        const sort = f.depthAt ?? f.at;
        expect(sort.x + sort.y + (f.layer ?? 0) / 10).toBeGreaterThan(mound.at.x + mound.at.y);
      }
    }
  });
});

describe("the low broken wall (FS-R4MYX R29)", () => {
  it("lays the six runs of the table", () => {
    expect(HUB_GRAVEYARD_WALL_RUNS.map((r) => [r.at.x, r.at.y, r.axis, r.length])).toEqual([
      [40, 1020, "x", 240],
      [330, 1020, "x", 250],
      [40, 1020, "y", 230],
      [40, 1300, "y", 220],
      [40, 1520, "x", 450],
      [580, 1020, "y", 500],
    ]);
  });

  it("bounds the enclosure with its runs", () => {
    const xs = HUB_GRAVEYARD_WALL_RUNS.flatMap((r) => [r.at.x, r.axis === "x" ? r.at.x + r.length : r.at.x]);
    const ys = HUB_GRAVEYARD_WALL_RUNS.flatMap((r) => [r.at.y, r.axis === "y" ? r.at.y + r.length : r.at.y]);
    expect([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]).toEqual(
      ENCLOSURE,
    );
  });

  it("cuts a run into one-tile pieces along its axis, the last trimmed, as a fence is cut", () => {
    const pieces = graveyardWallPieces({ at: { x: 220, y: 1270 }, length: 140, axis: "y", r: 8 });
    expect(pieces.map((p) => [p.sheet, p.animation, p.at.x, p.at.y, p.keep, p.depthAt.y])).toEqual([
      ["graveyard_wall", "y", 220, 1290, 1, 1270],
      ["graveyard_wall", "y", 220, 1330, 1, 1310],
      ["graveyard_wall", "y", 220, 1370, 1, 1350],
      ["graveyard_wall", "y", 220, 1410, 0.5, 1390],
    ]);
    expect(graveyardWallPieces({ at: { x: 420, y: 1060 }, length: 80, axis: "x", r: 8 }).map((p) => p.animation)).toEqual([
      "x",
      "x",
    ]);
  });

  it("crumbles a piece by a hash of its tile, so every client sees the same wall", () => {
    const run = HUB_GRAVEYARD_WALL_RUNS[4];
    expect(graveyardWallPieces(run)).toEqual(graveyardWallPieces({ ...run }));
    // a tile's look is its own: the same tile cut from a longer run crumbles the same
    const longer = graveyardWallPieces({ ...run, length: run.length + 200 });
    graveyardWallPieces(run)
      .filter((p) => p.keep === 1)
      .forEach((p, i) => expect(longer[i].index).toBe(p.index));
    // whole (0) and crumbled (1) only, the crumbled among the whole
    const states = HUB_GRAVEYARD_WALL.map((p) => p.index);
    expect(new Set(states)).toEqual(new Set([0, 1]));
    expect(states.filter((s) => s === 1).length).toBeLessThan(states.filter((s) => s === 0).length);
  });

  it("is HUB_GRAVEYARD_WALL: every run cut into pieces", () => {
    expect(HUB_GRAVEYARD_WALL).toEqual(HUB_GRAVEYARD_WALL_RUNS.flatMap(graveyardWallPieces));
    expect(HUB_GRAVEYARD_WALL.length).toBe(6 + 7 + 6 + 6 + 12 + 13);
  });

  it("leaves the south-east corner open, the gap path running into it from the graveyard spur", () => {
    const [ex, ey, ew, eh] = ENCLOSURE;
    const south = ey + eh;
    const GAP: Rect4 = [490, south - 20, ex + ew - 490, 40];
    // the wall's line stops at the gap's west side: no piece runs on along it
    for (const p of HUB_GRAVEYARD_WALL.filter((p) => p.animation === "x"))
      expect(crosses(squareOf({ ...pieceFootprint(p), r: 0 }), GAP), label(p)).toBe(false);
    const gapPath: Rect4 = [500, 1520, 70, 35];
    expect(HUB_PATHS).toContainEqual(gapPath);
    // the path lies within the gap's span and reaches the enclosure's south edge
    expect(gapPath[0]).toBeGreaterThanOrEqual(490);
    expect(gapPath[0] + gapPath[2]).toBeLessThanOrEqual(ex + ew);
    expect(gapPath[1]).toBeLessThanOrEqual(south);
  });
});

describe("the belfry (FS-R4MYX R30)", () => {
  it("stands tall by the chapel's door, north of its spur", () => {
    expect(HUB_BELFRY).toEqual({ sheet: "belfry", at: { x: 1635, y: 1220 }, r: 20, tall: true });
    const chapel = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Chapel")!;
    const threshold = townDoorStrip(townDoorGap(chapel), 80, "outside");
    expect(crosses(squareOf(spotFootprint(HUB_BELFRY)), threshold)).toBe(false);
  });
});

describe("the wayside cross (FS-R4MYX R41)", () => {
  const chapel = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Chapel")!;
  const square = squareOf(spotFootprint(HUB_WAYSIDE_CROSS));

  it("stands tall, a stone calvary on its own sheet, by the chapel's door", () => {
    expect(HUB_WAYSIDE_CROSS).toEqual({ sheet: "wayside_cross", at: { x: 1635, y: 1480 }, r: 20, tall: true });
  });

  it("stands clear of the chapel's doorway on screen: its door, its head and its jambs", () => {
    const { x, y, w, h } = chapel.doorGap;
    const door = gapDoor({ houseId: "", position: { x, y }, width: w, height: h }, false).at;
    // the door and its head stand on the gap's centre, the jambs' posts half a wall past its ends
    const doorway = new Set([
      ...drawnPixels("door_y", "shut", door),
      ...drawnPixels("chapel_door_head_y", "default", door),
      ...drawnPixels("chapel_post_back", "default", { x: door.x, y: y - w / 2 }),
      ...drawnPixels("chapel_post_back", "default", { x: door.x, y: y + h + w / 2 }),
    ]);
    // the cross's stone, not its baked ground shadow (the bake's catcher at half opacity)
    const stone = drawnPixels(HUB_WAYSIDE_CROSS.sheet, "default", HUB_WAYSIDE_CROSS.at, 255 * BAKE.SHADOW_OPACITY);
    expect(stone.length).toBeGreaterThan(0);
    expect(stone.filter((p) => doorway.has(p))).toEqual([]);
  });

  it("stands south of the door spur, between the east wall's eave and the chapel lane", () => {
    // the chapel's door spur leaves its east wall's sill
    const spur = HUB_DOOR_SPURS.find(([x]) => x === chapel.x + chapel.w)!;
    expect(spur).toBeDefined();
    expect(square[1]).toBeGreaterThanOrEqual(spur[1] + spur[3]);
    expect(square[0]).toBeGreaterThanOrEqual(chapel.x + chapel.w + ROOF_EAVE);
    const lane = HUB_PATHS.find(([x, , w, h]) => w === 70 && h > 400 && x > chapel.x + chapel.w)!;
    expect(square[0] + square[2]).toBeLessThanOrEqual(lane[0]);
  });

  it("stands on no path and no door threshold", () => {
    for (const path of HUB_PATHS) expect(crosses(square, path), path.join(",")).toBe(false);
    const threshold = townDoorStrip(townDoorGap(chapel), 80, "outside");
    expect(crosses(square, threshold)).toBe(false);
  });

  it("is drawn behind no town building: east of the chapel's eave, in front of it (R39)", () => {
    const { at, r } = HUB_WAYSIDE_CROSS;
    const corners = [at, ...[-r, r].flatMap((dx) => [-r, r].map((dy) => ({ x: at.x + dx, y: at.y + dy })))];
    for (const b of HUB_TOWN_GOLDEN.buildings) {
      const foot = { x: b.x, y: b.y, width: b.w, height: b.h };
      const bulk = bulkOf(foot, townHouseLook({ id: "", ...foot }).roof);
      for (const p of corners) expect(hiddenBehind(p, bulk), `${b.name} over (${p.x}, ${p.y})`).toBe(false);
    }
  });
});

describe("every graveyard piece keeps its place (FS-R4MYX R27)", () => {
  it.each(EVERY_PIECE)("%s clears K1–K8", (_, fp) => {
    expect(breaches(fp)).toEqual([]);
  });

  it.each(EVERY_PIECE)("%s clears the dev test room's gate and arrival", (_, fp) => {
    expect(onTheDevGate(fp)).toEqual([]);
  });

  it.each(EVERY_PIECE)("%s keeps 12 px from every mourner", (_, fp) => {
    expect(nearAMourner(fp)).toEqual([]);
  });

  it.each(HUB_GRAVEYARD.map((s) => [label(s), s] as const))("%s lies inside the enclosure", (_, spot) => {
    expect(insideEnclosure(spotFootprint(spot))).toBe(true);
  });

  it("checks the wall's runs whole too, not only piece by piece", () => {
    for (const run of HUB_GRAVEYARD_WALL_RUNS) expect(breaches(fenceFootprint(run))).toEqual([]);
  });
});

describe("the mourners at their graves (FS-R4MYX R17, R27)", () => {
  /** A grave's head: its stone, or a mound's west end. */
  const heads = [
    ...of("headstone").map((s) => ({ at: s.at, mound: false })),
    ...of("grave_mound").map((m) => ({ at: { x: m.at.x - 25, y: m.at.y }, mound: true })),
  ];
  /** The grave a mourner faces: the nearest head west of them, in their row. */
  const graveOf = (m: Point) =>
    heads
      .filter((h) => h.at.y === m.y && h.at.x < m.x)
      .sort((a, b) => b.at.x - a.at.x)[0];
  const flowersAt = (head: Point) => of("grave_flowers").find((f) => f.at.x === head.x + 18 && f.at.y === head.y);

  it("finds all three mourners in the golden", () => {
    expect(MOURNERS.map((m) => m.name).sort()).toEqual(["Keener", "Veteran", "Widower"]);
  });

  it.each(MOURNERS.map((m) => [m.name, m] as const))("stands the %s inside the enclosure, 40–80 px east of their grave's head", (_, m) => {
    expect(insideEnclosure({ from: m, to: m, r: 0 })).toBe(true);
    const grave = graveOf(m);
    expect(grave).toBeDefined();
    expect(m.x - grave.at.x).toBeGreaterThanOrEqual(40);
    expect(m.x - grave.at.x).toBeLessThanOrEqual(80);
  });

  it("stands the Keener at a fresh mound, the Widower at fresh flowers, the Veteran at withered ones", () => {
    const by = (name: string) => graveOf(MOURNERS.find((m) => m.name === name)!);
    expect(by("Keener").mound).toBe(true);
    expect(flowersAt(by("Widower").at)?.animation).toBe("fresh");
    expect(flowersAt(by("Veteran").at)?.animation).toBe("withered");
  });
});

describe("the graveyard's checks catch a bad placement", () => {
  it("flags a stone 5 px from the Widower", () => {
    const widower = MOURNERS.find((m) => m.name === "Widower")!;
    const stone: PropSpot = { sheet: "headstone", at: { x: widower.x - 5 - 13, y: widower.y }, r: 13 };
    expect(nearAMourner(spotFootprint(stone))).toEqual(["Widower"]);
  });

  it("flags a stone on the graveyard spur (K2)", () => {
    const stone: PropSpot = { sheet: "headstone", at: { x: 700, y: 1580 }, r: 13 };
    expect(breaches(spotFootprint(stone))).toContain("K2");
  });

  it("flags a piece in the dev test room's gate range", () => {
    expect(onTheDevGate(spotFootprint({ sheet: "headstone", at: { x: 160, y: 950 }, r: 13 }))).toContain("gate");
  });
});
