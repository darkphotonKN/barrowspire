import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TILE_HEIGHT, TILE_WIDTH, WORLD_PX_PER_TILE, worldToScreen, type Point, type Rect } from "@/render/iso/projection";
import { decodePng } from "../../../tools/bake/lib/png.mjs";
import { BAKE } from "./bake";
import {
  CHIMNEY_ALLOWANCE,
  NPC_BODY_HALF,
  RIDGE_ALLOWANCE,
  ROOF_OVERDRAW,
  bodyHiddenBehind,
  bulkOf,
  hiddenBehind,
  ridgeAllowance,
  type Bulk,
} from "./hubCover";
import { HUB_GRAVEYARD, HUB_GRAVEYARD_WALL } from "./hubGraveyard";
import { townHouseLook, type RoofSet } from "./hubInteriors";
import { HUB_KEEP_OUT } from "./hubKeepOut";
import { HUB_TOWN_GOLDEN } from "./hubTownGolden";
import { GABLE_APEX, planChimney, planGables, planRoof } from "./roofs";

const T = WORLD_PX_PER_TILE;
/** The town's walls: 20 world px thick, the gables' `wallThickness`. */
const WALL = 20;
const ART = join(process.cwd(), "public/art");
interface Sheet {
  atlas: string;
  frameWidth: number;
  frameHeight: number;
  anchor: { y: number };
  animations: Record<string, { frames: { x: number; y: number }[][] }>;
}
const manifest = JSON.parse(readFileSync(join(ART, "manifest.json"), "utf8")) as {
  atlases: Record<string, { image: string }>;
  sheets: Record<string, Sheet>;
};
/** How far a sheet's frame reaches above its origin, in screen px. */
const aboveOrigin = (sheet: string) => manifest.sheets[sheet].anchor.y * manifest.sheets[sheet].frameHeight;

const atlases = new Map<string, ReturnType<typeof decodePng>>();
/**
 * How far a frame's drawn pixels reach above its origin, in screen px: its first row with any
 * pixel not wholly clear. A sheet's frames share one height, cut to its tallest (the chapel's
 * gable to its apex's cross), so a plain frame's drawn top can lie well under its frame's.
 */
function drawnAbove(sheet: string, animation: string, index: number): number {
  const s = manifest.sheets[sheet];
  let atlas = atlases.get(s.atlas);
  if (!atlas) {
    atlas = decodePng(readFileSync(join(ART, manifest.atlases[s.atlas].image)));
    atlases.set(s.atlas, atlas);
  }
  const frames = s.animations[animation].frames[0];
  // a sheet with fewer frames wraps the index, as the scene's sprite does (GABLE_APEX on the timber gable)
  const f = frames[index % frames.length];
  for (let y = 0; y < s.frameHeight; y++)
    for (let x = 0; x < s.frameWidth; x++)
      if (atlas.rgba[((f.y + y) * atlas.width + f.x + x) * 4 + 3] > 0) return aboveOrigin(sheet) - y;
  return 0;
}

/**
 * The town's buildings as the golden lays them out (hub_map.go hubBuildings), each with the roof
 * it wears (`townHouseLook`) and its bulk under that roof.
 */
const TOWN: { name: string; foot: Rect; roof: RoofSet; bulk: Bulk }[] = HUB_TOWN_GOLDEN.buildings.map((b) => {
  const foot = { x: b.x, y: b.y, width: b.w, height: b.h };
  const { roof } = townHouseLook({ id: "", ...foot });
  return { name: b.name, foot, roof, bulk: bulkOf(foot, roof) };
});
const CHAPEL = TOWN.find((b) => b.name === "Chapel")!;

const inside = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const outdoors = (p: Point) => TOWN.every((b) => !inside(p, b.foot));
/** The buildings drawn over a body standing at `p`; empty when none is. */
const bodyBehind = (p: Point) => TOWN.filter((b) => bodyHiddenBehind(p, b.bulk)).map((b) => b.name);
/** The buildings drawn over the point `p`; empty when none is. */
const pointBehind = (p: Point) => TOWN.filter((b) => hiddenBehind(p, b.bulk)).map((b) => b.name);

/** A rect's points on a grid no coarser than `step`, its corners and edges included. */
function grid(x: number, y: number, w: number, h: number, step = 20): Point[] {
  const along = (lo: number, len: number) => {
    const n = Math.max(1, Math.ceil(len / step));
    return Array.from({ length: n + 1 }, (_, i) => lo + (len * i) / n);
  };
  return along(x, w).flatMap((px) => along(y, h).map((py) => ({ x: px, y: py })));
}

/** A piece's point and the four corners of its `r` square (a wall tile's from its run's line). */
function footprintPoints(from: Point, to: Point, r: number): Point[] {
  const [x0, x1] = [Math.min(from.x, to.x) - r, Math.max(from.x, to.x) + r];
  const [y0, y1] = [Math.min(from.y, to.y) - r, Math.max(from.y, to.y) + r];
  return [from, to, { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }];
}

describe("a building's bulk (FS-R4MYX R39)", () => {
  const chapel = CHAPEL.foot;
  const roof = planRoof({ id: "", ...chapel });
  /** How far the roof's tiles reach past the walls: the eave, and any part-tile laid onto it. */
  const eaveEast = Math.max(...roof.map((p) => p.at.x + T / 2)) - (chapel.x + chapel.width);
  const eaveSouth = Math.max(...roof.map((p) => p.at.y + T / 2)) - (chapel.y + chapel.height);
  const eave = Math.max(eaveEast, eaveSouth);
  const midX = chapel.x + chapel.width / 2;
  const midY = chapel.y + chapel.height / 2;

  it("hides a point just north of the chapel, in its columns", () => {
    expect(hiddenBehind({ x: midX - 100, y: chapel.y - eave - 20 }, CHAPEL.bulk)).toBe(true);
  });

  it("hides a point just west of the chapel, in its columns", () => {
    expect(hiddenBehind({ x: chapel.x - eave - 20, y: midY - 60 }, CHAPEL.bulk)).toBe(true);
  });

  it("never hides a point just east or just south of its eave", () => {
    for (const y of [chapel.y - 200, chapel.y, midY, chapel.y + chapel.height])
      expect(hiddenBehind({ x: chapel.x + chapel.width + eaveEast + 1, y }, CHAPEL.bulk), `east, y ${y}`).toBe(false);
    for (const x of [chapel.x - 300, chapel.x, midX, chapel.x + chapel.width])
      expect(hiddenBehind({ x, y: chapel.y + chapel.height + eaveSouth + 1 }, CHAPEL.bulk), `south, x ${x}`).toBe(false);
  });

  it("hides what stands under its roof", () => {
    expect(hiddenBehind({ x: midX, y: midY }, CHAPEL.bulk)).toBe(true);
  });

  it("stops hiding a point north of the ridge once the ridge row's top falls below it", () => {
    // the column from (x, y) meets the ridge row t = (ridge row's north edge − y) further on,
    // that far down the screen; the row is drawn up to the ridge's lift plus the allowance
    const ridgeLift = planRoof({ id: "", ...chapel }, CHAPEL.roof.prefix).find((p) => p.sheet === "chapel_roof_ridge")!.lift;
    const reach = (ridgeLift + ridgeAllowance(CHAPEL.roof) + ROOF_OVERDRAW) / (TILE_HEIGHT / T);
    const x = chapel.x;
    const rowNorth = midY - T;
    expect(hiddenBehind({ x, y: rowNorth - reach + 2 }, CHAPEL.bulk)).toBe(true);
    expect(hiddenBehind({ x, y: rowNorth - reach - 2 }, CHAPEL.bulk)).toBe(false);
  });

  it("hides a body when either side of it is covered, not only its point", () => {
    // walk west along a row north of the chapel until the point itself clears: a body there
    // still has its east half behind the chapel
    const y = chapel.y - 150;
    let x = midX;
    while (hiddenBehind({ x, y }, CHAPEL.bulk)) x -= 1;
    expect(hiddenBehind({ x, y }, CHAPEL.bulk)).toBe(false);
    expect(bodyHiddenBehind({ x, y }, CHAPEL.bulk)).toBe(true);
    expect(NPC_BODY_HALF).toBeGreaterThanOrEqual(TILE_WIDTH / 4);
  });
});

describe("the bulk's allowances cover the art drawn there", () => {
  /** The ridge's lift on a house under the roof set `prefix` names. */
  const ridgeLiftOf = (foot: Rect, prefix: string) =>
    planRoof({ id: "", ...foot }, prefix).find((p) => p.sheet === `${prefix}roof_ridge`)!.lift;
  /** The bulk's height at `p`: the highest tile over it. */
  const heightOf = (bulk: Bulk, p: Point) =>
    Math.max(
      ...bulk.tiles
        .filter(({ square: r }) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height)
        .map((tile) => tile.heightAt(p)),
    );
  const SETS = [...new Set(TOWN.map((b) => b.roof.prefix))];

  it("finds the chapel's ridge in its own roof set, chapel_roof_ridge, and raises its row", () => {
    // a bulk that missed the chapel_ ridge would climb its ridge tiles as slopes, one rise at most
    const ridgeLift = ridgeLiftOf(CHAPEL.foot, "chapel_");
    const top = Math.max(...CHAPEL.bulk.tiles.map((tile) => tile.heightAt({ x: tile.square.x, y: tile.square.y })));
    expect(top).toBe(ridgeLift + RIDGE_ALLOWANCE.chapel_);
  });

  it.each(SETS.map((prefix) => [prefix || "town's", prefix] as const))(
    "derives the %s set's allowance from its ridge piece's frame and its gable apex's frame",
    (_, prefix) => {
      const needs = TOWN.filter((b) => b.roof.prefix === prefix).flatMap((b) => {
        const ridgeLift = ridgeLiftOf(b.foot, prefix);
        const apexes = planGables({ id: "", ...b.foot }, WALL, prefix).filter((g) => g.index === GABLE_APEX);
        expect(apexes).not.toEqual([]);
        return [aboveOrigin(`${prefix}roof_ridge`), ...apexes.map((g) => g.lift + aboveOrigin(g.sheet) - ridgeLift)];
      });
      expect(RIDGE_ALLOWANCE[prefix]).toBe(Math.ceil(Math.max(...needs)));
    },
  );

  it("derives the chimney's allowance from its frame's top, on every roof that wears one", () => {
    const withChimney = TOWN.filter((b) => b.roof.chimney);
    expect(withChimney.map((b) => b.name)).toEqual(["Inn", "Quartermaster's store", "Smithy"]);
    const needs = withChimney.map((b) => planChimney({ id: "", ...b.foot }, 0).lift + aboveOrigin("chimney") - ridgeLiftOf(b.foot, b.roof.prefix));
    expect(CHIMNEY_ALLOWANCE).toBe(Math.ceil(Math.max(...needs)));
  });

  it("raises each building's ridge row by its own roof's allowance: no chimney counted on the chapel", () => {
    expect(CHAPEL.roof).toEqual({ prefix: "chapel_", chimney: false });
    expect(ridgeAllowance(CHAPEL.roof)).toBe(RIDGE_ALLOWANCE.chapel_);
    for (const b of TOWN.filter((t) => t !== CHAPEL)) expect(ridgeAllowance(b.roof), b.name).toBe(Math.max(RIDGE_ALLOWANCE[""], CHIMNEY_ALLOWANCE));
  });

  it.each(TOWN.map((b) => [b.name, b] as const))(
    "holds every gable piece of the %s under its bulk: the apex under the raised ridge row, the rest under their slope",
    (_, b) => {
      const alongX = b.foot.width >= b.foot.height;
      const midAcross = alongX ? b.foot.y + b.foot.height / 2 : b.foot.x + b.foot.width / 2;
      const gables = planGables({ id: "", ...b.foot }, WALL, b.roof.prefix);
      expect(gables.every((g) => g.sheet.startsWith(`${b.roof.prefix}roof_gable_`))).toBe(true);
      for (const g of gables) {
        // its top edge is highest at its ridge-side end, half a tile toward the ridge; the bulk
        // there is the raised ridge row for the apex (k = 0), the slope it stands under for the rest
        const toward = (Math.sign(midAcross - (alongX ? g.at.y : g.at.x)) * T) / 2;
        const end = alongX ? { x: g.at.x, y: g.at.y + toward } : { x: g.at.x + toward, y: g.at.y };
        const up = worldToScreen(g.at.x, g.at.y).y - worldToScreen(end.x, end.y).y;
        expect(
          g.lift + drawnAbove(g.sheet, g.animation, g.index),
          `${g.sheet} ${g.animation} frame ${g.index} at (${g.at.x}, ${g.at.y})`,
        ).toBeLessThanOrEqual(up + heightOf(b.bulk, end) + ROOF_OVERDRAW);
      }
    },
  );

  it.each(SETS.map((prefix) => [prefix || "town's", prefix] as const))(
    "reaches the %s set's slope piece's frame above its surface",
    (_, prefix) => {
      const rise = BAKE.ROOF_RISE * BAKE.VPX;
      // the surface's back corner stands half a tile's screen depth and one rise above the origin
      expect(aboveOrigin(`${prefix}roof_slope`) - (TILE_HEIGHT / 2 + rise)).toBeLessThanOrEqual(ROOF_OVERDRAW);
    },
  );
});

describe("nobody outdoors is drawn hidden behind a town building (FS-R4MYX R39)", () => {
  it("finds the outdoor people: the Elder and the three mourners", () => {
    const fnNpcs = HUB_KEEP_OUT.npcs.at.filter(outdoors);
    expect(fnNpcs).toEqual([{ x: 1140, y: 680 }]);
    expect(HUB_TOWN_GOLDEN.fixedResidents.filter(outdoors).map((r) => r.name)).toEqual(["Keener", "Widower", "Veteran"]);
  });

  it.each(HUB_KEEP_OUT.npcs.at.filter(outdoors).map((p) => [`(${p.x}, ${p.y})`, p] as const))(
    "shows the function NPC at %s",
    (_, p) => {
      expect(bodyBehind(p)).toEqual([]);
    },
  );

  it.each(HUB_TOWN_GOLDEN.fixedResidents.filter(outdoors).map((r) => [r.name, r] as const))("shows the %s", (_, r) => {
    expect(bodyBehind(r)).toEqual([]);
  });

  it.each(HUB_KEEP_OUT.wander.map((q) => [q.name, q] as const))("shows the %s anywhere in their quarter", (_, q) => {
    const hidden = grid(q.x, q.y, q.width, q.height).filter((p) => bodyBehind(p).length > 0);
    expect(hidden).toEqual([]);
  });

  it("shows every graveyard piece and wall tile, by its footprint", () => {
    const hidden = [
      ...HUB_GRAVEYARD.flatMap((s) => footprintPoints(s.at, s.at, s.r).map((p) => ({ what: s.sheet, p }))),
      ...HUB_GRAVEYARD_WALL.flatMap((w) => {
        const to = w.animation === "x" ? { x: w.depthAt.x + w.keep * T, y: w.depthAt.y } : { x: w.depthAt.x, y: w.depthAt.y + w.keep * T };
        return footprintPoints(w.depthAt, to, w.r).map((p) => ({ what: `graveyard_wall at (${w.at.x}, ${w.at.y})`, p }));
      }),
    ].filter(({ p }) => pointBehind(p).length > 0);
    expect(hidden).toEqual([]);
  });
});
