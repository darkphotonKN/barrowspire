/**
 * Where the chapel's bell tower sorts (FS-R4MYX §Change: The chapel moves to the far left and
 * gains a bell tower, T11): held against the bodies that can stand round it, and against the
 * chapel's own pieces as the scene draws them, pixel by pixel from the baked atlas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { depthKey, worldToScreen, type Point } from "@/render/iso/projection";
import { decodePng } from "../../../tools/bake/lib/png.mjs";
import { planBuildings } from "./buildingLooks";
import { worldSeed } from "./ground";
import { housesFrom } from "./houses";
import { BELL_TOWER_SHEET, HUB_BELL_TOWER, HUB_BELL_TOWER_AT, HUB_BELL_TOWER_SORT, isChapel, splitBellTower, townHouseLook } from "./hubInteriors";
import { townWalls } from "./hubTown.fixture";
import { planGables, planRoof } from "./roofs";
import { trimCrop } from "./walls";

/** game-service `PlayerRadius`: as near a wall's face as a body's point comes. */
const BODY_RADIUS = 20;
/** A body's parts stack up to nine layers over its point (`worldDepth`), a tenth of a key each. */
const BODY_LAYERS = 0.9;
const TOWER_KEY = depthKey(HUB_BELL_TOWER_SORT.x, HUB_BELL_TOWER_SORT.y);
const { x, y, width, height } = HUB_BELL_TOWER;

const ART = join(process.cwd(), "public/art");
interface Sheet {
  atlas: string;
  frameWidth: number;
  frameHeight: number;
  anchor: Point;
  animations: Record<string, { frames: { x: number; y: number }[][] }>;
}
const manifest = JSON.parse(readFileSync(join(ART, "manifest.json"), "utf8")) as {
  atlases: Record<string, { image: string }>;
  sheets: Record<string, Sheet>;
};
const atlases = new Map<string, ReturnType<typeof decodePng>>();
const atlasOf = (name: string) => {
  if (!atlases.has(name)) atlases.set(name, decodePng(readFileSync(join(ART, manifest.atlases[name].image))));
  return atlases.get(name)!;
};

/** One sprite as the scene places it: its sheet's frame on a screen point, and the key it sorts by. */
interface Drawn {
  what: string;
  sheet: string;
  animation: string;
  index: number;
  /** Where its origin is drawn. */
  on: Point;
  /** Its depth key, layers as tenths (`worldDepth`). */
  key: number;
  /** Frame columns kept, for a trimmed wall piece. */
  crop?: { x: number; width: number };
}

/** A screen pixel as one number. */
const pixel = (sx: number, sy: number) => (sy + 4096) * 16384 + (sx + 8192);

/** Calls `each` with every drawn pixel of the sprite: its screen pixel and its alpha. */
function drawnPixels(d: Drawn, each: (at: number, alpha: number) => void): void {
  const s = manifest.sheets[d.sheet];
  const atlas = atlasOf(s.atlas);
  const frames = s.animations[d.animation].frames[0];
  const f = frames[d.index % frames.length];
  const [left, top] = [Math.round(d.on.x - s.anchor.x * s.frameWidth), Math.round(d.on.y - s.anchor.y * s.frameHeight)];
  const [from, to] = d.crop ? [d.crop.x, d.crop.x + d.crop.width] : [0, s.frameWidth];
  for (let py = 0; py < s.frameHeight; py++)
    for (let px = Math.max(0, Math.floor(from)); px < Math.min(s.frameWidth, Math.ceil(to)); px++) {
      const alpha = atlas.rgba[((f.y + py) * atlas.width + f.x + px) * 4 + 3];
      if (alpha > 0) each(pixel(left + px, top + py), alpha);
    }
}

/** The chapel from the street as `HubScene.renderStructures` draws it: walls, posts, roof and gables. */
function chapelFromTheStreet(): Drawn[] {
  const { rest } = splitBellTower(townWalls());
  const house = housesFrom(rest).find(isChapel)!;
  const look = townHouseLook(house);
  const own = rest.filter((w) => w.house_id === house.id);
  const [plan] = planBuildings(own, worldSeed("hub"), look.sheets, () => look.fixed);
  const on = (p: Point, lift = 0) => ({ x: worldToScreen(p.x, p.y).x, y: worldToScreen(p.x, p.y).y - lift });
  const drawn: Drawn[] = [];
  for (const p of [...plan.shared.pieces, ...plan.exterior.pieces]) {
    const s = manifest.sheets[p.sheet];
    drawn.push({
      what: `wall piece at (${p.at.x}, ${p.at.y})`,
      sheet: p.sheet,
      animation: "variants",
      index: p.index,
      on: on(p.at),
      key: depthKey(p.depthAt.x, p.depthAt.y),
      crop: p.keep < 1 ? trimCrop(p.axis, p.keep, { width: s.frameWidth, anchorX: s.anchor.x }) : undefined,
    });
  }
  for (const post of [...plan.shared.posts, ...plan.exterior.posts])
    drawn.push({
      what: `post at (${post.at.x}, ${post.at.y})`,
      sheet: post.sheet,
      animation: Object.keys(manifest.sheets[post.sheet].animations)[0],
      index: 0,
      on: on(post.at),
      key: depthKey(post.at.x, post.at.y) + 0.1,
    });
  for (const p of planRoof(house, look.roof.prefix))
    drawn.push({ what: `roof piece at (${p.at.x}, ${p.at.y})`, sheet: p.sheet, animation: p.animation, index: 0, on: on(p.at, p.lift), key: depthKey(p.at.x, p.at.y) + 0.2 });
  for (const p of planGables(house, 20, look.roof.prefix, look.roof.plainGables))
    drawn.push({
      what: `gable piece at (${p.at.x}, ${p.at.y})`,
      sheet: p.sheet,
      animation: p.animation,
      index: p.index,
      on: on(p.at, p.lift),
      key: depthKey(p.depthAt.x, p.depthAt.y),
    });
  return drawn;
}

describe("the bell tower's place in the draw order (FS-R4MYX T11)", () => {
  it("is drawn on its footprint's centre", () => {
    expect(HUB_BELL_TOWER_AT).toEqual({ x: x + width / 2, y: y + height / 2 });
    expect(manifest.sheets[BELL_TOWER_SHEET]).toBeDefined();
  });

  it("sorts in front of everybody who can stand north or west of it", () => {
    for (let px = x - 200; px <= x + width; px += 10)
      for (let py = y - 400; py <= y + height; py += 10) {
        const north = py <= y - BODY_RADIUS && px >= x;
        const west = px <= x - BODY_RADIUS;
        if (!north && !west) continue;
        expect(depthKey(px, py) + BODY_LAYERS, `a body at (${px}, ${py})`).toBeLessThan(TOWER_KEY);
      }
  });

  it("sorts behind everybody who can stand south of it", () => {
    for (let px = x; px <= x + width + 200; px += 10)
      for (let py = y + height + BODY_RADIUS; py <= y + height + 400; py += 10)
        expect(depthKey(px, py), `a body at (${px}, ${py})`).toBeGreaterThan(TOWER_KEY);
  });

  const tower = new Set<number>();
  drawnPixels({ what: "tower", sheet: BELL_TOWER_SHEET, animation: "default", index: 0, on: worldToScreen(HUB_BELL_TOWER_AT.x, HUB_BELL_TOWER_AT.y), key: TOWER_KEY }, (at) => tower.add(at));
  const chapel = chapelFromTheStreet();
  /** How many of a sprite's drawn pixels fall on the tower's. */
  const over = (d: Drawn) => {
    let n = 0;
    drawnPixels(d, (at) => void (tower.has(at) && n++));
    return n;
  };
  const meeting = chapel.filter((d) => over(d) > 0);
  const [infront, behind] = [meeting.filter((d) => d.key > TOWER_KEY), meeting.filter((d) => d.key <= TOWER_KEY)];

  it("meets the chapel on screen: its west wall, its roof's west end and its west gable", () => {
    expect(tower.size).toBeGreaterThan(10_000);
    for (const kind of ["wall piece", "roof piece", "gable piece"]) expect(meeting.some((d) => d.what.startsWith(kind)), kind).toBe(true);
  });

  it("sorts behind every roof piece it meets: the roof's west verge dies into the tower", () => {
    const roof = meeting.filter((d) => d.what.startsWith("roof piece"));
    expect(roof.length).toBeGreaterThan(10);
    for (const d of roof) expect(d.key, d.what).toBeGreaterThan(TOWER_KEY);
  });

  it("sorts behind every chapel wall, post and gable piece that shows where it meets the tower", () => {
    // what stands in front of the tower, as solid pixels: nothing behind these shows
    const solid = new Set<number>();
    for (const d of infront) drawnPixels(d, (at, alpha) => void (alpha === 255 && tower.has(at) && solid.add(at)));
    // a piece the tower's key cannot pass (a body north of the tower stands in front of it) may sort
    // behind the tower only where the roof hides it from the camera anyway: none of its pixels on
    // the tower shows
    for (const d of behind) {
      const showing: number[] = [];
      drawnPixels(d, (at) => void (tower.has(at) && !solid.has(at) && showing.push(at)));
      expect(showing.length, `${d.what}, ${d.sheet}, key ${d.key}`).toBe(0);
    }
    // and they are few: the west end's pieces north of the ridge, under the far slope
    for (const d of behind) expect(d.what, d.what).toMatch(/^(gable|wall) piece at \(230, 1[34]\d\d\)$/);
    expect(infront.length).toBeGreaterThan(behind.length * 10);
  });
});
