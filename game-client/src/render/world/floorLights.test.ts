import { describe, expect, it } from "vitest";
import { screenToWorld } from "@/render/iso";
import { BARROW_HEX } from "@/utils/theme";
import {
  FIXED_LIGHT_CAP,
  FloorLights,
  budgetLights,
  interactablePool,
  nearLights,
  type FixedLight,
  type FixedLightKind,
} from "./floorLights";

/** `n` lights of one kind, spread along a row so each has its own place. */
const row = (kind: FixedLightKind, n: number, y: number): FixedLight<string>[] =>
  [...Array(n).keys()].map((i) => ({
    kind,
    at: { x: 40 + i * 37, y },
    light: `${kind}${i}`,
  }));

const count = (lights: FixedLight<string>[], kind: FixedLightKind) =>
  lights.filter((l) => l.kind === kind).length;

describe("budgetLights (FS-8RBQY §C.6)", () => {
  it("should cap a floor's fixed lights at 24", () => {
    expect(FIXED_LIGHT_CAP).toBe(24);
  });

  it("should keep every light of a floor under the cap, in the order given", () => {
    const lights = [...row("slit", 10, 0), ...row("sconce", 10, 100), ...row("stairs", 1, 200)];
    expect(budgetLights(lights)).toEqual(lights);
  });

  it("should drop arrow slits first", () => {
    const kept = budgetLights([
      ...row("slit", 10, 0),
      ...row("sconce", 14, 100),
      ...row("brazier", 2, 300),
      ...row("stairs", 1, 200),
    ]);
    expect(kept).toHaveLength(24);
    expect(count(kept, "slit")).toBe(7);
    expect(count(kept, "brazier")).toBe(2);
    expect(count(kept, "sconce")).toBe(14);
  });

  it("should drop braziers once the slits are gone, then sconces", () => {
    const kept = budgetLights([
      ...row("slit", 4, 0),
      ...row("brazier", 3, 300),
      ...row("sconce", 25, 100),
      ...row("stairs", 1, 200),
    ]);
    expect(kept).toHaveLength(24);
    expect(count(kept, "slit")).toBe(0);
    expect(count(kept, "brazier")).toBe(0);
    expect(count(kept, "sconce")).toBe(23);
  });

  it("should drop an interactable's pool only once every slit, brazier and sconce is gone", () => {
    const kept = budgetLights([
      ...row("interactable", 2, 400),
      ...row("sconce", 23, 100),
      ...row("slit", 3, 0),
      ...row("stairs", 1, 200),
    ]);
    expect(kept).toHaveLength(24);
    expect(count(kept, "interactable")).toBe(2);
    expect(count(kept, "sconce")).toBe(21);
    const starved = budgetLights([...row("interactable", 3, 400), ...row("stairs", 1, 200)], 2);
    expect(count(starved, "interactable")).toBe(1);
    expect(count(starved, "stairs")).toBe(1);
  });

  it("should light an interactable with a faint amber pool, dimmer and smaller than a sconce's", () => {
    const pool = interactablePool({ x: 10, y: 20 }, 3);
    expect(pool.color).toBe(BARROW_HEX.amber);
    expect(pool).toMatchObject({ x: 10, y: 20, seed: 3 });
    expect(pool.radius).toBeLessThan(150);
    expect(pool.intensity).toBeLessThan(0.7);
  });

  it("should never drop the stairs pool, however crowded the floor", () => {
    const kept = budgetLights([
      ...row("stairs", 1, 200),
      ...row("sconce", 40, 100),
      ...row("slit", 10, 0),
      ...row("brazier", 4, 300),
    ]);
    expect(kept).toHaveLength(24);
    expect(count(kept, "stairs")).toBe(1);
  });

  it("should drop the same lights for the same floor whatever order they arrive in", () => {
    const lights = [...row("slit", 10, 0), ...row("sconce", 16, 100), ...row("stairs", 1, 200)];
    const names = (l: FixedLight<string>[]) => l.map((x) => x.light).sort();
    expect(names(budgetLights([...lights].reverse()))).toEqual(names(budgetLights(lights)));
  });

  it("should spread the dropped slits along the wall rather than take one end", () => {
    const kept = budgetLights([...row("slit", 10, 0), ...row("sconce", 19, 100)]);
    const dropped = row("slit", 10, 0)
      .map((l, i) => (kept.some((k) => k.light === l.light) ? -1 : i))
      .filter((i) => i >= 0);
    expect(dropped).toHaveLength(5);
    expect(dropped).not.toEqual([5, 6, 7, 8, 9]);
    expect(dropped).not.toEqual([0, 1, 2, 3, 4]);
  });

  it("should fit a smaller cap, as the room left after an earlier stamping", () => {
    const kept = budgetLights([...row("slit", 3, 0), ...row("stairs", 1, 200)], 2);
    expect(kept).toHaveLength(2);
    expect(count(kept, "stairs")).toBe(1);
  });
});

describe("nearLights: a dungeon floor's fixed lights near the camera (FS-KE075 §H.45, FS-8RBQY §C.6)", () => {
  const light = (kind: FixedLightKind, chunk: number, i: number) => ({
    kind,
    at: { x: chunk * 1000 + i * 7, y: i * 13 },
    light: `${kind}${chunk}.${i}`,
    chunk,
  });
  const floor = [
    ...[0, 1, 2, 3].flatMap((chunk) => Array.from({ length: 10 }, (_, i) => light("sconce", chunk, i))),
    light("stairs", 3, 0),
    light("interactable", 1, 0),
  ];
  const near = (chunks: number[]) => (chunk: number) => chunks.includes(chunk);

  it("should stamp only the lights in chunks near the camera", () => {
    const kept = nearLights(floor, near([0]));
    expect(kept.map((l) => l.light)).toEqual(floor.filter((l) => l.chunk === 0).map((l) => l.light));
  });

  it("should never stamp more than the cap at once, dropping by the floor's order", () => {
    const kept = nearLights(floor, near([1, 2, 3]));
    expect(kept).toHaveLength(FIXED_LIGHT_CAP);
    expect(kept.some((l) => l.kind === "stairs")).toBe(true);
    expect(kept.some((l) => l.kind === "interactable")).toBe(true);
    // the whole floor's lights number more than the cap; panning never lights more than it
    expect(floor.length).toBeGreaterThan(FIXED_LIGHT_CAP);
  });
});

describe("nearLights under the fog (FS-SRA9J §C.12)", () => {
  const light = (chunk: number, i: number, region: number) => ({
    kind: "sconce" as const,
    at: { x: chunk * 1000 + i * 7, y: i * 13 },
    light: `sconce${chunk}.${i}`,
    chunk,
    region,
  });
  // thirty lights near the camera: twenty in region 1, ten in region 2
  const floor = [...Array.from({ length: 20 }, (_, i) => light(0, i, 1)), ...Array.from({ length: 10 }, (_, i) => light(0, 20 + i, 2))];
  const everywhere = () => true;

  it("should leave off every light whose region is not visible", () => {
    const kept = nearLights(floor, everywhere, FIXED_LIGHT_CAP, (l) => l.region === 2);
    expect(kept.map((l) => l.light)).toEqual(floor.filter((l) => l.region === 2).map((l) => l.light));
  });

  it("should spend the cap on the lit regions' lights only, so an unlit one never takes a lit one's place", () => {
    const kept = nearLights(floor, everywhere, 10, (l) => l.region === 2);
    expect(kept).toHaveLength(10);
    expect(kept.every((l) => l.region === 2)).toBe(true);
  });
});

// the review's fix round 1: the hallowed altar's candles are their own kind, not a brazier's
describe("budgetLights: the hallowed altar's candles (FS-5FZ4J §J R51, FS-8RBQY §C.6)", () => {
  it("should drop the floor's lights in order: slits, braziers, sconces, the altar's candles, then interactable pools; never the stairs", () => {
    const floor = [
      ...row("interactable", 2, 400),
      ...row("hallowed_altar", 1, 500),
      ...row("sconce", 3, 100),
      ...row("brazier", 3, 300),
      ...row("slit", 3, 0),
      ...row("stairs", 1, 200),
    ];
    const left = (cap: number) => {
      const kept = budgetLights(floor, cap);
      return (["slit", "brazier", "sconce", "hallowed_altar", "interactable", "stairs"] as const).map((k) => count(kept, k));
    };
    expect(left(13)).toEqual([3, 3, 3, 1, 2, 1]);
    expect(left(10)).toEqual([0, 3, 3, 1, 2, 1]);
    expect(left(7)).toEqual([0, 0, 3, 1, 2, 1]);
    expect(left(4)).toEqual([0, 0, 0, 1, 2, 1]);
    expect(left(3)).toEqual([0, 0, 0, 0, 2, 1]);
    expect(left(1)).toEqual([0, 0, 0, 0, 0, 1]);
  });
});

describe("FloorLights: a dungeon floor's fixed lights, by chunk and region, under the cap (FS-KE075 §H.45, FS-SRA9J §C.12)", () => {
  type Src = { x: number; y: number; name: string };
  const src = (name: string, x: number, y = 0): Src => ({ x, y, name });
  /** Chunks 1000 screen px wide; regions by world x, 100 px wide, as the floor's first grid. */
  const chunkAt = (p: { x: number }) => Math.floor(p.x / 1000);
  const regionAt = (p: { x: number }) => Math.floor(p.x / 100);
  const floorLights = () => {
    const onMap: string[] = [];
    const calls: string[] = [];
    const lights = new FloorLights<Src>(chunkAt, regionAt, {
      add: (s) => (onMap.push(s.name), calls.push(`add ${s.name}`)),
      remove: (s) => (onMap.splice(onMap.indexOf(s.name), 1), calls.push(`remove ${s.name}`)),
    });
    return { lights, onMap, calls };
  };
  const everywhere = () => true;

  it("should hold each light with its chunk by its screen point and its region by the world point it stands on", () => {
    const { lights } = floorLights();
    lights.add("sconce", src("a", 1500), { x: 250, y: 40 });
    expect(lights.all).toEqual([{ kind: "sconce", at: { x: 1500, y: 0 }, light: { source: src("a", 1500), at: { x: 250, y: 40 } }, chunk: 1, region: 2 }]);
  });

  it("should take the region under its screen point for a light standing on no world point (a wall's slit)", () => {
    const { lights } = floorLights();
    const s = src("slit", 800, 400);
    lights.add("slit", s);
    const under = Math.floor(screenToWorld(800, 400).x / 100);
    expect(lights.all[0]).toMatchObject({ chunk: 0, region: under });
  });

  it("should hold a source once, however often it is added", () => {
    const { lights } = floorLights();
    const s = src("a", 10);
    lights.add("brazier", s, { x: 10, y: 0 });
    lights.add("brazier", s, { x: 10, y: 0 });
    expect(lights.all).toHaveLength(1);
  });

  it("should light those in shown chunks and visible regions, a light in no region lit wherever it is shown, and put out the rest", () => {
    const { lights, onMap, calls } = floorLights();
    lights.add("sconce", src("near", 100), { x: 150, y: 0 });
    lights.add("sconce", src("dark", 200), { x: 350, y: 0 });
    lights.add("sconce", src("none", 300), { x: 50, y: 0 });
    lights.add("sconce", src("far", 2100), { x: 150, y: 0 });
    lights.light((chunk) => chunk === 0, (region) => region === 1);
    expect(onMap.sort()).toEqual(["near", "none"]);
    expect([...lights.lit].map((s) => s.name).sort()).toEqual(["near", "none"]);
    // the same view again stamps nothing again
    calls.length = 0;
    lights.light((chunk) => chunk === 0, (region) => region === 1);
    expect(calls).toEqual([]);
    lights.light((chunk) => chunk === 2, everywhere);
    expect(onMap).toEqual(["far"]);
  });

  it("should never light more than the cap at once, dropped by the floor's order", () => {
    const { lights } = floorLights();
    for (let i = 0; i < 4; i++) lights.add("slit", src(`slit${i}`, i * 9), { x: 150, y: i });
    for (let i = 0; i < 3; i++) lights.add("sconce", src(`sconce${i}`, 50 + i * 9), { x: 150, y: i });
    lights.light(everywhere, everywhere, 5);
    expect([...lights.lit].map((s) => s.name).filter((n) => n.startsWith("sconce"))).toHaveLength(3);
    expect(lights.lit.size).toBe(5);
  });

  it("should take removed lights off the floor, and off the light-map only those it lit", () => {
    const { lights, calls } = floorLights();
    const lit = src("lit", 100);
    const unlit = src("unlit", 2100);
    lights.add("brazier", lit, { x: 150, y: 0 });
    lights.add("brazier", unlit, { x: 150, y: 0 });
    lights.light((chunk) => chunk === 0, everywhere);
    calls.length = 0;
    lights.remove([lit, unlit]);
    expect(lights.all).toEqual([]);
    expect(lights.lit.size).toBe(0);
    expect(calls).toEqual(["remove lit"]);
  });

  it("should give every light the new grid's region on a re-region, and place the lights added after by it", () => {
    const { lights, onMap } = floorLights();
    lights.add("sconce", src("a", 100), { x: 150, y: 0 });
    lights.light(everywhere, (region) => region === 1);
    expect(onMap).toEqual(["a"]);
    // the new grid: regions 50 px wide
    lights.reRegion((p) => Math.floor(p.x / 50));
    lights.add("sconce", src("b", 200), { x: 160, y: 0 });
    expect(lights.all.map((l) => l.region)).toEqual([3, 3]);
    lights.light(everywhere, (region) => region === 3);
    expect(onMap.sort()).toEqual(["a", "b"]);
  });
});
