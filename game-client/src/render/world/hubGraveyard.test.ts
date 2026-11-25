import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORLD_PX_PER_TILE, worldToScreen, type Point } from "@/render/iso/projection";
import { decodePng } from "../../../tools/bake/lib/png.mjs";
import type { WallState } from "@/types/gameState";
import * as graveyard from "./hubGraveyard";
import {
  GRAVEYARD_ENCLOSURE,
  GRAVEYARD_GAP,
  GRAVEYARD_LINES,
  GRAVEYARD_SLOTS,
  HUB_GRAVEYARD,
  HUB_GRAVEYARD_WALL,
  HUB_GRAVEYARD_WALL_RUNS,
  HUB_WAYSIDE_CROSS,
  graveyardWallPieces,
  type GraveyardWallPiece,
} from "./hubGraveyard";
import {
  HUB_CHAPEL_LANE,
  HUB_DOOR_SPURS,
  HUB_GRAVEYARD_SPUR,
  HUB_PATHS,
  fenceFootprint,
  keepOutBreaches,
  spotFootprint,
  type Footprint,
  type PropSpot,
} from "./hubKeepOut";
import { townDoorGap, townDoorStrip, townWalls } from "./hubTown.fixture";
import { HUB_TOWN_GOLDEN } from "./hubTownGolden";
import { BAKE } from "./bake";
import { gapDoor } from "./buildingLooks";
import { bulkOf, hiddenBehind, bellTowerBulk } from "./hubCover";
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

/**
 * The town's walls as the golden lays them out, the chapel's and the bell tower's included (as
 * hubKeepOut.test.ts; FS-R4MYX T9).
 */
const TOWN_WALLS: WallState[] = townWalls();
const CHAPEL = HUB_TOWN_GOLDEN.buildings.find((b) => b.name === "Chapel")!;
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

/** The graveyard's own pieces' footprints: its stones, mounds, flowers, crosses and trees, and each wall piece. */
const GRAVEYARD_PIECES: [string, Footprint][] = [
  ...HUB_GRAVEYARD.map((s) => [label(s), spotFootprint(s)] as [string, Footprint]),
  ...HUB_GRAVEYARD_WALL.map((p) => [`${label(p)}, keeping ${p.keep}`, pieceFootprint(p)] as [string, Footprint]),
];
/** Every piece's footprint: the graveyard's, each wall piece's and the wayside cross's. */
const EVERY_PIECE: [string, Footprint][] = [...GRAVEYARD_PIECES, [label(HUB_WAYSIDE_CROSS), spotFootprint(HUB_WAYSIDE_CROSS)]];

describe("the graveyard's layout (FS-R4MYX R28's counts, T19, T20)", () => {
  const [A, B, C, , , F, G] = GRAVEYARD_LINES;

  it("counts 24 headstones: 10 intact in both shapes, 9 weathered, 5 broken", () => {
    expect(of("headstone")).toHaveLength(24);
    expect(of("headstone", "intact")).toHaveLength(10);
    expect(new Set(of("headstone", "intact").map((s) => s.index))).toEqual(new Set([0, 1]));
    expect(of("headstone", "weathered")).toHaveLength(9);
    expect(of("headstone", "broken")).toHaveLength(5);
  });

  it("keeps the broken stumps in the three old lines and the fresh mounds in the two newest", () => {
    for (const s of of("headstone", "broken")) expect([A, B, C], label(s)).toContain(s.at.x);
    for (const m of of("grave_mound")) expect([F, G], label(m)).toContain(m.at.x - 25);
  });

  it("counts 3 fresh mounds and flowers at 6 graves, 4 fresh and 2 withered", () => {
    expect(of("grave_mound")).toHaveLength(3);
    expect(of("grave_flowers")).toHaveLength(6);
    expect(of("grave_flowers", "fresh")).toHaveLength(4);
    expect(of("grave_flowers", "withered")).toHaveLength(2);
  });

  it("stands the two tall stone crosses and the three dead trees where the plan puts them", () => {
    const tall = (sheet: string) => of(sheet).map((s) => [s.at.x, s.at.y, !!s.tall]);
    expect(tall("stone_cross")).toEqual([
      [250, 1880, true],
      [250, 2080, true],
    ]);
    expect(tall("tree_dead")).toEqual([
      [808, 1816, true],
      [515, 1850, true],
    ]);
    expect(tall("tree_dead_snag")).toEqual([[250, 1980, true]]);
  });

  it("lays the graves in seven lines of four slots, oldest west, one slot empty for a dead tree, as the table reads", () => {
    expect(GRAVEYARD_LINES).toEqual([290, 365, 440, 515, 590, 665, 740]);
    expect(GRAVEYARD_SLOTS).toEqual([1850, 1940, 2025, 2115]);
    const at = (x: number, y: number) =>
      HUB_GRAVEYARD.filter((s) => s.at.x === x && s.at.y === y && s.sheet === "headstone").map((s) => s.animation)[0] ??
      (of("grave_mound").some((m) => m.at.x === x + 25 && m.at.y === y) ? "mound" : "-");
    expect(GRAVEYARD_LINES.map((x) => GRAVEYARD_SLOTS.map((y) => at(x, y)))).toEqual([
      ["broken", "weathered", "intact", "broken"],
      ["intact", "broken", "weathered", "weathered"],
      ["broken", "intact", "weathered", "broken"],
      ["-", "intact", "weathered", "weathered"],
      ["intact", "weathered", "intact", "weathered"],
      ["mound", "intact", "mound", "intact"],
      ["intact", "mound", "weathered", "intact"],
    ]);
    // the empty slot holds a dead tree, and every stone and mound's head stands in a slot
    expect(of("tree_dead").map((t) => t.at)).toContainEqual({ x: GRAVEYARD_LINES[3], y: GRAVEYARD_SLOTS[0] });
    const heads = [...of("headstone").map((s) => s.at), ...of("grave_mound").map((m) => ({ x: m.at.x - 25, y: m.at.y }))];
    for (const h of heads) {
      expect(GRAVEYARD_LINES, `(${h.x}, ${h.y})`).toContain(h.x);
      expect(GRAVEYARD_SLOTS, `(${h.x}, ${h.y})`).toContain(h.y);
    }
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
    // one of the three mounds carries flowers: the Keener's
    expect(of("grave_flowers").filter((f) => f.depthAt)).toHaveLength(1);
  });
});

describe("the graveyard lies only along the outside of the chapel's south wall (FS-R4MYX T19)", () => {
  const south = CHAPEL.y + CHAPEL.h;
  const [west, east] = [CHAPEL.x, CHAPEL.x + CHAPEL.w];

  it("spans no more than the south wall's x span, wholly south of the wall", () => {
    const [ex, ey, ew] = ENCLOSURE;
    expect(ex).toBeGreaterThanOrEqual(west);
    expect(ex + ew).toBeLessThanOrEqual(east);
    expect(ey).toBeGreaterThan(south);
  });

  it.each(GRAVEYARD_PIECES)("%s stands south of the south wall, neither west of the west wall nor east of the east wall", (_, fp) => {
    const [x, y, w] = squareOf({ ...fp, r: 0 });
    expect(y).toBeGreaterThan(south);
    expect(x).toBeGreaterThanOrEqual(west);
    expect(x + w).toBeLessThanOrEqual(east);
  });

  it("parts the low wall's north run from the south wall's outer face by a small walkway, 40–80 px", () => {
    const north = HUB_GRAVEYARD_WALL_RUNS.filter((r) => r.axis === "x" && r.at.y === ENCLOSURE[1]);
    expect(north.length).toBeGreaterThan(0);
    for (const run of north) {
      expect(run.at.y - south).toBeGreaterThanOrEqual(40);
      expect(run.at.y - south).toBeLessThanOrEqual(80);
    }
  });

  it("keeps the walkway itself clear: no piece of the graveyard stands on it", () => {
    const walkway: Rect4 = [west, south, CHAPEL.w, ENCLOSURE[1] - south];
    for (const [what, fp] of GRAVEYARD_PIECES) expect(crosses(squareOf({ ...fp, r: 0 }), walkway), what).toBe(false);
  });

  it("is in front of the chapel and its tower on screen, hidden behind neither (T23)", () => {
    const foot = { x: CHAPEL.x, y: CHAPEL.y, width: CHAPEL.w, height: CHAPEL.h };
    const chapel = bulkOf(foot, townHouseLook({ id: "", ...foot }).roof);
    const { x, y, w, h } = HUB_TOWN_GOLDEN.bellTower;
    const tower = bellTowerBulk({ x, y, width: w, height: h });
    for (const [what, fp] of GRAVEYARD_PIECES)
      for (const p of [fp.from, fp.to]) {
        expect(hiddenBehind(p, chapel), what).toBe(false);
        expect(hiddenBehind(p, tower), what).toBe(false);
      }
  });
});

describe("the low broken wall (FS-R4MYX R29, T20)", () => {
  it("lays the seven runs of the table", () => {
    expect(HUB_GRAVEYARD_WALL_RUNS.map((r) => [r.at.x, r.at.y, r.axis, r.length])).toEqual([
      [220, 1790, "x", 240],
      [520, 1790, "x", 320],
      [220, 1790, "y", 170],
      [220, 2000, "y", 170],
      [220, 2170, "x", 620],
      [840, 1790, "y", 50],
      [840, 1920, "y", 250],
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
    expect(HUB_GRAVEYARD_WALL.length).toBe(6 + 8 + 5 + 5 + 16 + 2 + 7);
  });

  /** The stretches of one side of the enclosure no run covers, as [from, to] along it. */
  function openings(axis: "x" | "y", line: number): [number, number][] {
    const [ex, ey, ew, eh] = ENCLOSURE;
    const [lo, hi] = axis === "x" ? [ex, ex + ew] : [ey, ey + eh];
    const spans = HUB_GRAVEYARD_WALL_RUNS.filter((r) => r.axis === axis && (axis === "x" ? r.at.y : r.at.x) === line)
      .map((r): [number, number] => (axis === "x" ? [r.at.x, r.at.x + r.length] : [r.at.y, r.at.y + r.length]))
      .sort((a, b) => a[0] - b[0]);
    const open: [number, number][] = [];
    let at = lo;
    for (const [from, to] of spans) {
      if (from > at) open.push([at, from]);
      at = Math.max(at, to);
    }
    if (at < hi) open.push([at, hi]);
    return open;
  }

  it("has a collapsed stretch on its north side and on its west side, and a whole south side", () => {
    const [ex, ey, , eh] = ENCLOSURE;
    expect(openings("x", ey)).toEqual([[460, 520]]);
    expect(openings("y", ex)).toEqual([[1960, 2000]]);
    expect(openings("x", ey + eh)).toEqual([]);
  });

  it("has one gap, in its east side, facing the path: the graveyard spur runs into it from the lane (T22)", () => {
    const [ex, , ew] = ENCLOSURE;
    expect(GRAVEYARD_GAP.x).toBe(ex + ew);
    expect(openings("y", GRAVEYARD_GAP.x)).toEqual([[GRAVEYARD_GAP.from, GRAVEYARD_GAP.to]]);
    // a gap is a way in a player's body passes and a path leads to; a collapsed stretch is neither
    const [sx, sy, sw, sh] = HUB_GRAVEYARD_SPUR;
    expect(sx).toBe(GRAVEYARD_GAP.x);
    expect(sy).toBeGreaterThanOrEqual(GRAVEYARD_GAP.from);
    expect(sy + sh).toBeLessThanOrEqual(GRAVEYARD_GAP.to);
    expect(sx + sw).toBe(HUB_CHAPEL_LANE[0]);
    expect(HUB_PATHS).toContainEqual(HUB_GRAVEYARD_SPUR);
    // no path leads to either collapsed stretch
    for (const [x, y, w, h] of HUB_PATHS) {
      expect(crosses([x, y, w, h], [460, ENCLOSURE[1] - 8, 60, 16]), `[${x}, ${y}, ${w}, ${h}]`).toBe(false);
      expect(crosses([x, y, w, h], [ex - 8, 1960, 16, 40]), `[${x}, ${y}, ${w}, ${h}]`).toBe(false);
    }
    // no wall piece stands in the gap
    const gap: Rect4 = [GRAVEYARD_GAP.x - 8, GRAVEYARD_GAP.from, 16, GRAVEYARD_GAP.to - GRAVEYARD_GAP.from];
    for (const p of HUB_GRAVEYARD_WALL) expect(crosses(squareOf({ ...pieceFootprint(p), r: 0 }), gap), label(p)).toBe(false);
  });
});

describe("the bell frame by the door is gone: the bell hangs in the tower (FS-R4MYX T17)", () => {
  it("exports no HUB_BELFRY", () => {
    expect(Object.keys(graveyard)).not.toContain("HUB_BELFRY");
  });

  it("lays no belfry sheet among the graveyard's pieces or by the door", () => {
    const sheets = [...HUB_GRAVEYARD, ...HUB_GRAVEYARD_WALL, HUB_WAYSIDE_CROSS].map((s) => s.sheet);
    expect(sheets.filter((sheet) => /belfry/.test(sheet))).toEqual([]);
  });
});

describe("the wayside cross (FS-R4MYX R41, T18)", () => {
  const chapel = CHAPEL;
  const square = squareOf(spotFootprint(HUB_WAYSIDE_CROSS));

  it("stands tall, a stone calvary on its own sheet, by the chapel's door", () => {
    expect(HUB_WAYSIDE_CROSS).toEqual({ sheet: "wayside_cross", at: { x: 895, y: 1680 }, r: 20, tall: true });
  });

  it("keeps its place relative to the door: (675, 380) from the chapel's corner, as built (T18)", () => {
    expect([HUB_WAYSIDE_CROSS.at.x - chapel.x, HUB_WAYSIDE_CROSS.at.y - chapel.y]).toEqual([675, 380]);
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
    expect(HUB_PATHS).toContainEqual(HUB_CHAPEL_LANE);
    expect(square[0] + square[2]).toBeLessThanOrEqual(HUB_CHAPEL_LANE[0]);
  });

  it("stands on no path and no door threshold", () => {
    for (const path of HUB_PATHS) expect(crosses(square, path), path.join(",")).toBe(false);
    const threshold = townDoorStrip(townDoorGap(chapel), 80, "outside");
    expect(crosses(square, threshold)).toBe(false);
  });

  it("is drawn behind no town building nor the bell tower: east of the chapel's eave, in front of it (R39, T23)", () => {
    const { at, r } = HUB_WAYSIDE_CROSS;
    const corners = [at, ...[-r, r].flatMap((dx) => [-r, r].map((dy) => ({ x: at.x + dx, y: at.y + dy })))];
    const { x, y, w, h } = HUB_TOWN_GOLDEN.bellTower;
    for (const p of corners) expect(hiddenBehind(p, bellTowerBulk({ x, y, width: w, height: h })), `the tower over (${p.x}, ${p.y})`).toBe(false);
    for (const b of HUB_TOWN_GOLDEN.buildings) {
      const foot = { x: b.x, y: b.y, width: b.w, height: b.h };
      const bulk = bulkOf(foot, townHouseLook({ id: "", ...foot }).roof);
      for (const p of corners) expect(hiddenBehind(p, bulk), `${b.name} over (${p.x}, ${p.y})`).toBe(false);
    }
  });
});

describe("every graveyard piece keeps its place (FS-R4MYX R27, T19)", () => {
  it("checks K1 against the bell tower's wall too (T9)", () => {
    const { x, y, w, h } = HUB_TOWN_GOLDEN.bellTower;
    expect(TOWN_WALLS).toContainEqual(expect.objectContaining({ position: { x, y }, width: w, height: h }));
    expect(breaches(spotFootprint({ sheet: "headstone", at: { x: x - 15, y: y + h / 2 }, r: 13 }))).toContain("K1");
  });

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
    const [sx, sy, sw, sh] = HUB_GRAVEYARD_SPUR;
    const stone: PropSpot = { sheet: "headstone", at: { x: sx + sw / 2, y: sy + sh / 2 }, r: 13 };
    expect(breaches(spotFootprint(stone))).toContain("K2");
  });

  it("flags a piece in the dev test room's gate range", () => {
    expect(onTheDevGate(spotFootprint({ sheet: "headstone", at: { x: 160, y: 950 }, r: 13 }))).toContain("gate");
  });
});
