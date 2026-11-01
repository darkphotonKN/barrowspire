import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import { ArtLibrary } from "@/render/art/library";
import { MANIFEST_VERSION, type ArtManifest, type ArtSheet } from "@/render/art/manifest";
import type { DoorState, WallState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import { BAKE } from "./bake";
import { darkOpening, doorGaps } from "./buildingLooks";
import { worldDepth, worldToScreen } from "@/render/iso";
import { planGables } from "./roofs";
import {
  Occluders,
  addBuildings,
  addDarkOpening,
  addGables,
  showLook,
  type GroundWorld,
} from "./scene";
import { MASONRY_WALLS, TIMBER_WALLS } from "./walls";

describe("GroundLayer's world (FS-KSD6K §Requirements 16)", () => {
  // checked by `tsc`: a faded edge erases everything past the map, so nothing may be laid there
  it("should refuse aprons or a margin beside a faded edge", () => {
    const faded: GroundWorld = {
      width: 1,
      height: 1,
      kind: "field",
      fadeEdge: true,
    };
    // @ts-expect-error past a faded edge nothing is drawn: no aprons
    const aproned: GroundWorld = { ...faded, aprons: [] };
    // @ts-expect-error nor a margin of ground past the map
    const margined: GroundWorld = { ...faded, margin: 48 };
    const hub: GroundWorld = {
      width: 1,
      height: 1,
      kind: "hub",
      aprons: [],
      margin: 0,
    };
    expect([aproned, margined, hub]).toHaveLength(3);
  });
});

// ── Building exteriors (FS-9PN7X §B, §E.4) ────────────────────────────────

interface Made {
  kind: "sprite" | "graphics" | "container";
  args: unknown[];
  calls: Record<string, unknown[][]>;
  depth: number;
  visible: boolean;
}

/** The slice of a Phaser scene the building helpers draw with, recording what they make. */
function stubScene() {
  const made: Made[] = [];
  const make = (kind: Made["kind"], args: unknown[]) => {
    const rec: Made = { kind, args, calls: {}, depth: 0, visible: true };
    made.push(rec);
    const o: Record<string, unknown> = {};
    const chain =
      (name: string, then?: (...a: unknown[]) => void) =>
      (...a: unknown[]) => {
        (rec.calls[name] ??= []).push(a);
        then?.(...a);
        return o;
      };
    for (const m of [
      "setOrigin",
      "setCrop",
      "setRotation",
      "setScale",
      "add",
      "fillStyle",
      "fillPoints",
      "fillRect",
      "lineStyle",
      "strokePoints",
      "strokeRect",
    ])
      o[m] = chain(m);
    o.setDepth = chain("setDepth", (d) => (rec.depth = d as number));
    o.setVisible = chain("setVisible", (v) => (rec.visible = v as boolean));
    Object.defineProperty(o, "depth", { get: () => rec.depth });
    Object.defineProperty(o, "visible", { get: () => rec.visible });
    o.active = true;
    o.getBounds = () => ({ x: args[0] as number, y: args[1] as number, width: 10, height: 10 });
    Object.defineProperty(o, "rec", { value: rec });
    return o;
  };
  const scene = {
    add: {
      sprite: (...a: unknown[]) => make("sprite", a),
      graphics: (...a: unknown[]) => make("graphics", a),
      container: (...a: unknown[]) => make("container", a),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, made };
}

const recOf = (o: unknown) => (o as { rec: Made }).rec;
/** The manifest sheet a stub sprite shows: its frame is `{sheet}/{animation}/{direction}/{index}`. */
const sheetOf = (o: unknown) => (recOf(o).args[3] as string | undefined)?.split("/")[0];

const SHEET: Omit<ArtSheet, "animations"> = {
  atlas: "a",
  frameWidth: 136,
  frameHeight: 177,
  anchor: { x: 0.2, y: 0.9 },
  directions: 1,
  source: "stub",
  licence: "stub",
};
const frames = (n: number) => ({
  fps: 1,
  loop: false,
  frames: [Array.from({ length: n }, () => ({ x: 0, y: 0 }))],
});

/** A stub art library holding exactly the named sheets. */
function library(names: readonly string[], logger = { warn: vi.fn() }) {
  const sheets: Record<string, ArtSheet> = {};
  for (const name of names)
    sheets[name] = {
      ...SHEET,
      animations: name.includes("gable")
        ? { s: frames(1), n: frames(1), e: frames(1), w: frames(1) }
        : name.includes("post") || name.includes("dark")
          ? { default: frames(1) }
          : { variants: frames(2) },
    };
  const manifest: ArtManifest = {
    version: MANIFEST_VERSION,
    tile: { width: 64, height: 32 },
    facings: [],
    atlases: { a: { image: "a.png", width: 1, height: 1, sha256: "" } },
    sheets,
  };
  return { art: new ArtLibrary(manifest, logger), logger };
}

const SHIPPED_TIMBER = ["plain", "brace", "window", "torch"].flatMap((k) =>
  ["back", "front"].flatMap((h) => ["x", "y"].map((a) => `wall_${h}_${k}_${a}`)),
);
const SHIPPED = [...SHIPPED_TIMBER, "post_back", "post_front"];
const EXTERIOR_TIMBER = ["plain", "brace", "window"].flatMap((k) =>
  ["x", "y"].map((a) => `wall_exterior_${k}_${a}`),
);
const TIMBER_ART = [...SHIPPED, ...EXTERIOR_TIMBER, "door_dark_x", "door_dark_y"];

const wall = (x: number, y: number, width: number, height: number, house_id?: string): WallState => ({
  entity_id: `${house_id}:${x},${y},${width},${height}`,
  house_id,
  position: { x, y },
  width,
  height,
});
/** A 300 × 200 building, walls 20 thick, a centred 50 door gap in the south wall. */
const HOUSE = [
  wall(100, 60, 300, 20, "h"),
  wall(100, 60, 20, 200, "h"),
  wall(380, 60, 20, 200, "h"),
  wall(100, 240, 125, 20, "h"),
  wall(275, 240, 125, 20, "h"),
];

describe("addBuildings (FS-9PN7X §B)", () => {
  it("should draw both looks of each building from the art, showing its exterior", () => {
    const { scene } = stubScene();
    const { art, logger } = library(TIMBER_ART);
    const [b, ...rest] = addBuildings(scene, art, [...HOUSE, wall(0, 0, 80, 20)], 1, {
      openings: doorGaps,
      logger,
    });
    expect(rest).toEqual([]);
    expect(b.house).toMatchObject({ id: "h", x: 100, y: 60, width: 300, height: 200 });
    const sheets = (parts: unknown[]) => parts.map(sheetOf);
    expect(sheets(b.exterior).filter((s) => s?.startsWith("wall_"))).not.toHaveLength(0);
    expect(
      sheets(b.exterior).every((s) => /^(wall_exterior_|post_back$|door_dark_x$)/.test(s!)),
    ).toBe(true);
    expect(sheets(b.exterior)).toContain("door_dark_x");
    expect(sheets(b.interior).every((s) => /^(wall_front_|post_front$)/.test(s!))).toBe(true);
    expect(sheets(b.shared).every((s) => /^(wall_back_|post_back$)/.test(s!))).toBe(true);
    // the player starts outside every building
    expect(b.exterior.every((p) => recOf(p).visible)).toBe(true);
    expect(b.interior.every((p) => !recOf(p).visible)).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should leave dark openings out where the gaps hold doors (a run's buildings)", () => {
    const { scene } = stubScene();
    const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1);
    expect(b.exterior.map(sheetOf)).not.toContain("door_dark_x");
  });

  it("should swap a building's looks on command, the shared walls standing in both", () => {
    const { scene } = stubScene();
    const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1, { openings: doorGaps });
    showLook(b, "interior");
    expect(b.interior.every((p) => recOf(p).visible)).toBe(true);
    expect(b.exterior.every((p) => !recOf(p).visible)).toBe(true);
    expect(b.shared.every((p) => recOf(p).visible)).toBe(true);
    showLook(b, "exterior");
    expect(b.exterior.every((p) => recOf(p).visible)).toBe(true);
    expect(b.interior.every((p) => !recOf(p).visible)).toBe(true);
  });

  it("should list every piece seen from outside as cover, with its depth, and nothing of the interior", () => {
    const { scene } = stubScene();
    const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1, { openings: doorGaps });
    expect(b.cover).toHaveLength(b.shared.length + b.exterior.length);
    expect(b.cover.map((c) => c.depth)).toEqual(
      [...b.shared, ...b.exterior].map((p) => recOf(p).depth),
    );
    // each with the part it is, so the silhouette can be masked to that part's pixels (§E.3)
    expect(b.cover.map((c) => c.part)).toEqual([...b.shared, ...b.exterior]);
  });

  it("should carry each placeholder part with its cover, without art (§B.7, §E.3)", () => {
    const { scene } = stubScene();
    const [b] = addBuildings(scene, ArtLibrary.empty({ warn: () => {} }), HOUSE, 1, {
      openings: doorGaps,
      sheets: MASONRY_WALLS,
    });
    expect(b.cover.map((c) => c.part)).toEqual([...b.shared, ...b.exterior]);
  });

  it("should register no building part as an occluder (FS-9PN7X §E.4)", () => {
    const { scene } = stubScene();
    const occluders = new Occluders();
    const add = vi.spyOn(occluders, "add");
    addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1, { openings: doorGaps });
    expect(add).not.toHaveBeenCalled();
    expect(occluders.size).toBe(0);
  });

  it("should hand back the lights the interior look's walls declare, never an exterior piece's", () => {
    const { art } = library(TIMBER_ART);
    // every sheet declares a light here: only pieces of the interior look may hand one back
    vi.spyOn(art, "light").mockReturnValue({
      offset: { x: 0, y: 0 },
      radius: 40,
      color: "amber",
      flicker: 0,
    });
    const { scene } = stubScene();
    const [b] = addBuildings(scene, art, HOUSE, 1, { openings: doorGaps });
    const pieces = (parts: unknown[]) => parts.filter((p) => sheetOf(p)?.startsWith("wall_"));
    expect(b.lights).toHaveLength(pieces(b.shared).length + pieces(b.interior).length);
    expect(b.lights.filter((l) => l.underRoof)).toHaveLength(pieces(b.shared).length);
  });
});

describe("addBuildings without art (FS-9PN7X §B.7)", () => {
  it("should close a building with full-height placeholder sides, a slab cap and a dark quad, with no manifest", () => {
    const { scene, made } = stubScene();
    const logger = { warn: vi.fn() };
    const [b] = addBuildings(scene, ArtLibrary.empty(logger), HOUSE, 1, {
      sheets: MASONRY_WALLS,
      openings: doorGaps,
      logger,
    });
    expect(made.some((m) => m.kind === "sprite")).toBe(false);
    expect(b.exterior.length).toBeGreaterThan(0);
    expect(b.interior.length).toBeGreaterThan(0);
    // the slab: a world plane lifted to the wall top
    expect(made.some((m) => m.kind === "container")).toBe(true);
    // the dark opening: a flat inkDeep quad
    const ink = made.filter(
      (m) => m.kind === "graphics" && (m.calls.fillStyle ?? []).every(([c]) => c === palette.inkDeep),
    );
    expect(ink.length).toBeGreaterThan(0);
    expect(b.cover.length).toBe(b.shared.length + b.exterior.length);
    // no manifest is already reported once by the loader: no warning per sheet
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should stand a missing exterior side full height beside the baked back walls, warning once per sheet", () => {
    const { scene, made } = stubScene();
    const { art, logger } = library(SHIPPED);
    addBuildings(scene, art, HOUSE, 1, { openings: doorGaps, logger });
    addBuildings(scene, art, HOUSE, 1, { openings: doorGaps, logger });
    const warned = logger.warn.mock.calls.map(([m]) => m as string);
    expect(warned.some((m) => m.includes("wall_exterior_"))).toBe(true);
    expect(warned.some((m) => m.includes("door_dark_x"))).toBe(true);
    expect(new Set(warned).size).toBe(warned.length);
    // a placeholder side as tall as the baked back wall it stands beside
    const full = BAKE.WALL_BACK * BAKE.VPX;
    const tops = made
      .filter((m) => m.kind === "graphics")
      .flatMap((m) => m.calls.fillPoints ?? [])
      .map(([pts]) => pts as { y: number }[]);
    const heights = tops.map((pts) => Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)));
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(full);
  });

  it("should lay a placeholder slab when the stone cap is missing but the walls are baked", () => {
    const masonry = ["plain", "pillar", "sconce", "banner", "cobweb"].flatMap((k) =>
      ["back", "front", "exterior"].flatMap((h) => ["x", "y"].map((a) => `tower_wall_${h}_${k}_${a}`)),
    );
    const { scene, made } = stubScene();
    const { art, logger } = library([...masonry, "tower_post_back", "tower_post_front"]);
    const [b] = addBuildings(scene, art, HOUSE, 1, {
      sheets: MASONRY_WALLS,
      logger,
    });
    const slabs = made.filter((m) => m.kind === "container" && m.args.length === 3);
    expect(slabs).toHaveLength(1);
    expect(slabs[0].args[1]).toBeCloseTo(-BAKE.WALL_BACK * BAKE.VPX);
    expect(b.exterior.some((p) => recOf(p) === slabs[0])).toBe(true);
    expect(logger.warn.mock.calls.some(([m]) => (m as string).includes("tower_cap"))).toBe(true);
  });

  it("should lay the baked stone cap over a masonry room", () => {
    const { scene } = stubScene();
    const masonry = ["plain", "pillar", "sconce", "banner", "cobweb"].flatMap((k) =>
      ["back", "front", "exterior"].flatMap((h) => ["x", "y"].map((a) => `tower_wall_${h}_${k}_${a}`)),
    );
    const { art } = library([...masonry, "tower_post_back", "tower_post_front", "tower_cap"]);
    const [b] = addBuildings(scene, art, HOUSE, 1, { sheets: MASONRY_WALLS });
    expect(b.exterior.filter((p) => sheetOf(p) === "tower_cap")).toHaveLength(8 * 5);
  });
});

describe("addGables (FS-9PN7X §B.3, ADR-0036)", () => {
  const house = { id: "h", x: 100, y: 60, width: 300, height: 200 };

  it("should stand each planned gable piece on its foot, lifted, sorted behind the end wall it rises from", () => {
    const { scene } = stubScene();
    const { art } = library(["roof_gable_x", "roof_gable_y"]);
    const parts = addGables(scene, art, house, 20);
    const plan = planGables(house, 20);
    expect(parts).toHaveLength(plan.length);
    parts.forEach((part, i) => {
      const p = plan[i];
      const s = worldToScreen(p.at.x, p.at.y);
      expect(recOf(part).args.slice(0, 2)).toEqual([s.x, s.y - p.lift]);
      expect(sheetOf(part)).toBe(p.sheet);
      expect(recOf(part).depth).toBe(worldDepth(p.depthAt.x, p.depthAt.y));
    });
  });

  it("should draw no gables without their sheet or without a manifest", () => {
    const { scene, made } = stubScene();
    expect(addGables(scene, library(["roof_slope"]).art, house, 20)).toEqual([]);
    expect(addGables(scene, ArtLibrary.empty({ warn: () => {} }), house, 20)).toEqual([]);
    expect(made).toHaveLength(0);
  });
});

describe("addDarkOpening (FS-9PN7X §B.5)", () => {
  const door: DoorState = { entity_id: "d", position: { x: 225, y: 240 }, width: 50, height: 20, is_open: true };

  it("should draw an open door's dark opening from the art, sorted like the door", () => {
    const { scene } = stubScene();
    const { art } = library(["tower_door_dark_x"]);
    const built = addDarkOpening(scene, art, darkOpening(door, MASONRY_WALLS), MASONRY_WALLS);
    expect(built.parts.map(sheetOf)).toEqual(["tower_door_dark_x"]);
    expect(built.cover).toHaveLength(1);
  });

  it("should fall back to a flat inkDeep quad without the sheet", () => {
    const { scene, made } = stubScene();
    const { art, logger } = library([]);
    const built = addDarkOpening(scene, art, darkOpening(door, TIMBER_WALLS), TIMBER_WALLS, logger);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(built.parts.length).toBeGreaterThan(0);
    expect(made.every((m) => m.kind === "graphics")).toBe(true);
    for (const m of made)
      expect((m.calls.fillStyle ?? []).every(([c]) => c === palette.inkDeep)).toBe(true);
  });
});
