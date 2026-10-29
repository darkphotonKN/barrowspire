import { describe, expect, it } from "vitest";
import type { Point, Rect } from "@/render/iso";
import { MEADOWS_LOOK } from "./fieldLook";
import { ROAD_HALF_WIDTH, planKeepOutDressing, planRoadHome } from "./fieldDressing";
import { planGround } from "./ground";

/**
 * The Meadows' keep-outs as the server lays them (game-server/game-service/internal/game/
 * meadows_map.go, meadowsObstacles): a fixture only. The scene reads them from the server's
 * state, never from a table of its own.
 */
const MEADOWS_KEEP_OUTS: Rect[] = [
  { x: 520, y: 140, width: 160, height: 120 },
  { x: 900, y: 640, width: 140, height: 140 },
  { x: 1300, y: 220, width: 180, height: 120 },
  { x: 1650, y: 700, width: 120, height: 100 },
  { x: 760, y: 380, width: 60, height: 50 },
  { x: 1180, y: 860, width: 70, height: 50 },
  { x: 1560, y: 460, width: 60, height: 60 },
];

const inside = (p: Point, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

const SEED = 0x4649_4531;
const plan = () => planKeepOutDressing(MEADOWS_KEEP_OUTS, MEADOWS_LOOK.dressing, SEED);

describe("planKeepOutDressing (FS-X2F2H §Requirements 52, 54)", () => {
  it("should stand a tree cluster or a rock on every keep-out", () => {
    const pieces = plan();
    for (const keepOut of MEADOWS_KEEP_OUTS)
      expect(pieces.some((p) => inside(p.at, keepOut)), JSON.stringify(keepOut)).toBe(true);
  });

  it("should stand nothing on open ground the server lets players walk", () => {
    for (const p of plan())
      expect(MEADOWS_KEEP_OUTS.some((r) => inside(p.at, r)), p.sheet).toBe(true);
  });

  it("should make a big keep-out a cluster of trees, and a small one rocks", () => {
    const pieces = plan();
    const on = (r: Rect) => pieces.filter((p) => inside(p.at, r));
    const trees = new Set(MEADOWS_LOOK.dressing.trees);
    const rocks = new Set(MEADOWS_LOOK.dressing.rocks);

    const grove = on(MEADOWS_KEEP_OUTS[0]);
    expect(grove.filter((p) => trees.has(p.sheet)).length).toBeGreaterThanOrEqual(2);
    expect(grove.filter((p) => trees.has(p.sheet)).every((p) => p.tall)).toBe(true);

    const outcrop = on(MEADOWS_KEEP_OUTS[4]);
    expect(outcrop.length).toBeGreaterThan(0);
    expect(outcrop.every((p) => rocks.has(p.sheet) && !p.tall)).toBe(true);
  });

  it("should stay sparse: a handful of pieces per keep-out", () => {
    const pieces = plan();
    for (const r of MEADOWS_KEEP_OUTS)
      expect(pieces.filter((p) => inside(p.at, r)).length).toBeLessThanOrEqual(5);
  });

  it("should plant the same pieces on every client", () => {
    expect(plan()).toEqual(plan());
  });

  it("should plant a different keep-out differently", () => {
    const [a, b] = [MEADOWS_KEEP_OUTS[0], { ...MEADOWS_KEEP_OUTS[0], x: 1000 }].map((r) =>
      planKeepOutDressing([r], MEADOWS_LOOK.dressing, SEED).map((p) => ({
        x: p.at.x - r.x,
        y: p.at.y,
      })),
    );
    expect(a).not.toEqual(b);
  });

  it("should draw nothing for no keep-outs", () => {
    expect(planKeepOutDressing([], MEADOWS_LOOK.dressing, SEED)).toEqual([]);
  });
});

describe("planRoadHome (FS-X2F2H §Requirements 51, 54)", () => {
  /** The Meadows' entrance gate on its west edge, as the server broadcasts it. */
  const GATE = { x: 40, y: 500 };
  const RANGE = 80;
  const road = planRoadHome(GATE);

  it("should run a road through the gate and off the west edge", () => {
    expect(road.paths.some((p) => inside(GATE, p))).toBe(true);
    expect(Math.min(...road.paths.map((p) => p.x))).toBeLessThan(0);
    for (const p of road.paths) expect(p.height).toBe(2 * ROAD_HALF_WIDTH);
  });

  it("should carry the road alone on past the edge, fading, and no grass beyond it", () => {
    const tiles = planGround({ width: 400, height: 1000, kind: "field", ...road });
    const beyond = tiles.filter((t) => t.at.x < 0);
    expect(beyond.length).toBeGreaterThan(0);
    // the map ends on its own edge: past it, only the road's own row of dirt
    expect(beyond.every((t) => t.sheet === "ground_dirt" && t.at.y === GATE.y)).toBe(true);
    const nearest = beyond.find((t) => t.at.x === -20)!;
    const furthest = beyond.reduce((a, b) => (a.at.x < b.at.x ? a : b));
    expect(nearest.alpha!).toBeGreaterThan(furthest.alpha!);
    expect(Math.min(...road.paths.map((p) => p.x))).toBeLessThanOrEqual(furthest.at.x);
  });

  it("should stand the signpost beside the road, at the gate, inside the map", () => {
    const { signpost } = road;
    expect(Math.hypot(signpost.x - GATE.x, signpost.y - GATE.y)).toBeLessThanOrEqual(RANGE * 1.5);
    expect(signpost.x).toBeGreaterThan(0);
    expect(road.paths.some((p) => inside(signpost, p))).toBe(false);
  });
});

