import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import { ArtLibrary } from "@/render/art/library";
import { MANIFEST_VERSION, type ArtManifest, type ArtSheet } from "@/render/art/manifest";
import type { WallState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import { BAKE } from "./bake";
import { doorGaps, planBuildings } from "./buildingLooks";
import { screenToWorld, worldDepth, worldToScreen, type Point } from "@/render/iso";
import { planGables } from "./roofs";
import {
  GroundLayer,
  Occluders,
  PLACEHOLDER_STONE,
  addBuildings,
  addGables,
  addWallPieces,
  addWalls,
  showLook,
  type GroundWorld,
} from "./scene";
import { projectedBounds } from "@/render/iso";
import { ChunkGrid } from "./chunks";
import { TOWER_GROUND } from "./ground";
import {
  INTERIOR_PARTITION,
  MASONRY_WALLS,
  TIMBER_WALLS,
  planEdgeWalls,
  planWalls,
  thicknessPx,
  type EdgeLine,
} from "./walls";

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
/** The animation a stub sprite was made showing: a door's state frame. */
const frameOf = (o: unknown) => (recOf(o).args[3] as string | undefined)?.split("/")[1];

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
        : name.includes("post") || name.includes("head")
          ? { default: frames(1) }
          : name.startsWith("door_")
            ? { locked: frames(1), unlocked: frames(1), open: frames(1), shut: frames(1) }
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
const TIMBER_ART = [...SHIPPED, ...EXTERIOR_TIMBER, "door_x", "door_y", "door_head_x", "door_head_y"];

const wall = (x: number, y: number, width: number, height: number, house_id?: string): WallState => ({
  entity_id: `${house_id}:${x},${y},${width},${height}`,
  house_id,
  position: { x, y },
  width,
  height,
});
/** A 300 × 200 building, walls 20 thick, a centred 80 door gap in the south wall. */
const HOUSE = [
  wall(100, 60, 300, 20, "h"),
  wall(100, 60, 20, 200, "h"),
  wall(380, 60, 20, 200, "h"),
  wall(100, 240, 110, 20, "h"),
  wall(290, 240, 110, 20, "h"),
];

describe("addBuildings (FS-9PN7X §B)", () => {
  it("should draw both looks of each building from the art, showing its exterior", () => {
    const { scene } = stubScene();
    const { art, logger } = library(TIMBER_ART);
    const [b, ...rest] = addBuildings(scene, art, [...HOUSE, wall(0, 0, 80, 20)], 1, {
      doors: doorGaps,
      logger,
    });
    expect(rest).toEqual([]);
    expect(b.house).toMatchObject({ id: "h", x: 100, y: 60, width: 300, height: 200 });
    const sheets = (parts: unknown[]) => parts.map(sheetOf);
    expect(sheets(b.exterior).filter((s) => s?.startsWith("wall_"))).not.toHaveLength(0);
    expect(
      sheets(b.exterior).every((s) => /^(wall_exterior_|post_back$|door_x$|door_head_x$)/.test(s!)),
    ).toBe(true);
    expect(sheets(b.interior).every((s) => /^(wall_front_|post_front$|door_x$)/.test(s!))).toBe(true);
    expect(sheets(b.shared).every((s) => /^(wall_back_|post_back$)/.test(s!))).toBe(true);
    // the player starts outside every building
    expect(b.exterior.every((p) => recOf(p).visible)).toBe(true);
    expect(b.interior.every((p) => !recOf(p).visible)).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should carry its walls' thickness, which the blackout's floor stops inside (§D)", () => {
    const { scene } = stubScene();
    const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1);
    expect(b.wall).toBe(20);
    const thick = HOUSE.map((w) => ({ ...w, width: w.width === 20 ? 24 : w.width, height: w.height === 20 ? 24 : w.height }));
    expect(addBuildings(scene, library(TIMBER_ART).art, thick, 1)[0].wall).toBe(24);
  });

  it("should hang a door in each door gap: shut in the exterior, open in the interior look (§B.5, amended 2026-11-03)", () => {
    const { scene } = stubScene();
    const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1, { doors: doorGaps });
    const doorsIn = (parts: unknown[]) => parts.filter((p) => sheetOf(p) === "door_x");
    // shut with no lock: it can't be acted on, so nothing amber on it
    expect(doorsIn(b.exterior).map(frameOf)).toEqual(["shut"]);
    expect(doorsIn(b.interior).map(frameOf)).toEqual(["open"]);
    expect(doorsIn(b.shared)).toEqual([]);
    // both stand in the gap and sort like a door: by the back corner of the gap's footprint
    const at = worldToScreen(250, 250);
    for (const door of [...doorsIn(b.exterior), ...doorsIn(b.interior)]) {
      expect(recOf(door).args.slice(0, 2)).toEqual([at.x, at.y]);
      expect(recOf(door).depth).toBe(worldDepth(210, 240, 1));
    }
    // the shut door is seen from outside, so it covers the player; the open one never does
    expect(b.cover.map((c) => c.part)).toContain(doorsIn(b.exterior)[0]);
    expect(b.cover.map((c) => c.part)).not.toContain(doorsIn(b.interior)[0]);
    // and no dark opening anywhere
    expect([...b.shared, ...b.interior, ...b.exterior].map(sheetOf).some((s) => /dark/.test(s ?? ""))).toBe(false);
  });

  it("should hang no door where none is asked for (a run's rooms: their gaps hold server doors)", () => {
    const { scene } = stubScene();
    const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1);
    expect([...b.exterior, ...b.interior].map(sheetOf)).not.toContain("door_x");
  });

  it("should close every door gap over the lintel from outside, with or without a drawn door (§B.5, amended 2026-11-03)", () => {
    for (const options of [{ doors: doorGaps }, {}]) {
      const { scene } = stubScene();
      const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1, options);
      const heads = b.exterior.filter((p) => sheetOf(p) === "door_head_x");
      expect(heads).toHaveLength(1);
      // standing in the gap and sorted like the door below it
      const at = worldToScreen(250, 250);
      expect(recOf(heads[0]).args.slice(0, 2)).toEqual([at.x, at.y]);
      expect(recOf(heads[0]).depth).toBe(worldDepth(210, 240, 1));
      // seen from outside only: it covers the player, and the interior look has none
      expect(b.cover.map((c) => c.part)).toContain(heads[0]);
      expect([...b.shared, ...b.interior].map(sheetOf)).not.toContain("door_head_x");
    }
  });

  it("should give a building with no door gap no head", () => {
    const { scene } = stubScene();
    const gapless = [...HOUSE.slice(0, 3), wall(100, 240, 300, 20, "h")];
    const [b] = addBuildings(scene, library(TIMBER_ART).art, gapless, 1, { doors: doorGaps });
    expect(b.exterior.map(sheetOf)).not.toContain("door_head_x");
  });

  it("should swap a building's looks on command, the shared walls standing in both", () => {
    const { scene } = stubScene();
    const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1, { doors: doorGaps });
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
    const [b] = addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1, { doors: doorGaps });
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
      doors: doorGaps,
      sheets: MASONRY_WALLS,
    });
    expect(b.cover.map((c) => c.part)).toEqual([...b.shared, ...b.exterior]);
  });

  it("should register no building part as an occluder (FS-9PN7X §E.4)", () => {
    const { scene } = stubScene();
    const occluders = new Occluders();
    const add = vi.spyOn(occluders, "add");
    addBuildings(scene, library(TIMBER_ART).art, HOUSE, 1, { doors: doorGaps });
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
    const [b] = addBuildings(scene, art, HOUSE, 1, { doors: doorGaps });
    const pieces = (parts: unknown[]) => parts.filter((p) => sheetOf(p)?.startsWith("wall_"));
    expect(b.lights).toHaveLength(pieces(b.shared).length + pieces(b.interior).length);
    expect(b.lights.filter((l) => l.underRoof)).toHaveLength(pieces(b.shared).length);
  });

  it("should hand back what it drew each building's walls from, for their shadows to be cast from (FS-V8FT3 §F)", () => {
    for (const sheets of [TIMBER_WALLS, MASONRY_WALLS]) {
      const { scene } = stubScene();
      const masonry = ["plain", "pillar", "sconce", "banner", "cobweb"].flatMap((k) =>
        ["back", "front", "exterior"].flatMap((h) => ["x", "y"].map((a) => `tower_wall_${h}_${k}_${a}`)),
      );
      const { art } = library([...TIMBER_ART, ...masonry, "tower_post_back", "tower_post_front", "tower_cap"]);
      const [b] = addBuildings(scene, art, HOUSE, 1, { sheets, doors: doorGaps });
      // the plan its sprites stand by: each look's pieces and posts are the sprites of that look
      const [plan] = planBuildings(HOUSE, 1, sheets);
      expect(b.plan).toEqual(plan);
      const walls = (parts: unknown[]) => parts.map(sheetOf).filter((s) => /wall_|post_/.test(s ?? ""));
      for (const look of ["shared", "interior", "exterior"] as const)
        expect(walls(b[look])).toEqual([...b.plan[look].pieces, ...b.plan[look].posts].map((p) => p.sheet));
      // the gaps its heads close, and its material's thickness, not the server rects' (`wall`)
      expect(b.gaps).toEqual(doorGaps(HOUSE));
      expect(b.thickness).toBe(thicknessPx(sheets));
      expect(b.thickness).not.toBe(b.wall);
    }
  });
});

describe("addBuildings without art (FS-9PN7X §B.7)", () => {
  it("should close a building with full-height placeholder sides, a slab cap and a placeholder door, with no manifest", () => {
    const { scene, made } = stubScene();
    const logger = { warn: vi.fn() };
    const [b] = addBuildings(scene, ArtLibrary.empty(logger), HOUSE, 1, {
      sheets: MASONRY_WALLS,
      doors: doorGaps,
      logger,
    });
    expect(made.some((m) => m.kind === "sprite")).toBe(false);
    expect(b.exterior.length).toBeGreaterThan(0);
    expect(b.interior.length).toBeGreaterThan(0);
    // the slab: a world plane lifted to the wall top
    expect(made.some((m) => m.kind === "container")).toBe(true);
    // the door: a door-coloured leaf on its own lifted plane, shut outside and open inside, like
    // the run's placeholder door; never a flat inkDeep quad
    const leaves = made.filter(
      (m) => m.kind === "graphics" && (m.calls.fillStyle ?? []).some(([c]) => c === palette.wallLight),
    );
    expect(leaves).toHaveLength(2);
    const planes = made.filter((m) => m.kind === "container" && m.args.length === 3);
    const roots = (parts: unknown[]) => planes.filter((pl) => parts.some((p) => recOf(p) === pl));
    // the cap's slab, the shut door and the head's slab outside; the open door inside
    expect(roots(b.exterior)).toHaveLength(3);
    expect(roots(b.interior)).toHaveLength(1);
    // the head: a slab over the gap at the wall top, in the walls' placeholder colour
    const heads = made.filter(
      (m) =>
        m.kind === "graphics" &&
        (m.calls.fillRect ?? []).some(([x, y, w, h]) => x === 210 && y === 240 && w === 80 && h === 20) &&
        (m.calls.fillStyle ?? []).every(([c]) => c === PLACEHOLDER_STONE.top),
    );
    expect(heads).toHaveLength(1);
    expect(made.some((m) => (m.calls.fillStyle ?? []).some(([c]) => c === palette.inkDeep))).toBe(false);
    expect(b.cover.length).toBe(b.shared.length + b.exterior.length);
    // no manifest is already reported once by the loader: no warning per sheet
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should stand a missing exterior side full height beside the baked back walls, warning once per sheet", () => {
    const { scene, made } = stubScene();
    const { art, logger } = library(SHIPPED);
    addBuildings(scene, art, HOUSE, 1, { doors: doorGaps, logger });
    addBuildings(scene, art, HOUSE, 1, { doors: doorGaps, logger });
    const warned = logger.warn.mock.calls.map(([m]) => m as string);
    expect(warned.some((m) => m.includes("wall_exterior_"))).toBe(true);
    expect(warned.some((m) => m.includes("door_x"))).toBe(true);
    expect(warned.some((m) => m.includes("door_head_x"))).toBe(true);
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
    const heads = ["tower_door_head_x", "tower_door_head_y"];
    const { art, logger } = library([...masonry, "tower_post_back", "tower_post_front", ...heads]);
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

// ── Chunked ground (FS-KE075 §H.44) ───────────────────────────────────────

/** A render texture as the ground paints it: where it stands, its size, and every stamp. */
interface RecordedRT {
  at: [number, number, number, number];
  stamps: { key: unknown; x: number; y: number; config?: Record<string, unknown> }[];
  visible: boolean;
  destroyed: boolean;
  /** How many times it was cleared. */
  cleared: number;
}

/** A graphics made off the display list: its fills, and whether it went. */
interface RecordedGraphics {
  fills: { color: number; alpha: number }[];
  polygons: Point[][];
  destroyed: boolean;
  /** Whether it was made onto the scene's display list. */
  added: boolean;
}

/** A scratch texture: what was drawn and erased into it, at which offset, and whether it went. */
interface RecordedScratch {
  key: string;
  size: [number, number];
  drawn: { what: RecordedGraphics; x: number; y: number }[];
  erased: { what: RecordedGraphics; x: number; y: number }[];
  destroyed: boolean;
}

/**
 * The slice of a Phaser scene a GroundLayer paints with, recording each render texture, each
 * scratch texture and graphics, and the order things happen in (`log`).
 */
function groundStage() {
  const rts: RecordedRT[] = [];
  const graphics: RecordedGraphics[] = [];
  const scratches: RecordedScratch[] = [];
  const log: string[] = [];
  const recOfGraphics = new Map<unknown, RecordedGraphics>();
  const renderTexture = (x: number, y: number, w: number, h: number) => {
    const rec: RecordedRT = { at: [x, y, w, h], stamps: [], visible: true, destroyed: false, cleared: 0 };
    rts.push(rec);
    const id = `rt${rts.length}`;
    const rt: Record<string, unknown> = { texture: { key: id } };
    for (const m of ["setOrigin", "setDepth", "setTint", "clearTint", "erase"]) rt[m] = () => rt;
    rt.clear = () => (rec.cleared++, rt);
    rt.render = () => (log.push(`render ${id}`), rt);
    rt.stamp = (key: unknown, _f: unknown, sx: number, sy: number, config?: Record<string, unknown>) => {
      log.push(`stamp ${id} ${String(key)}`);
      rec.stamps.push({ key, x: sx, y: sy, config });
      return rt;
    };
    rt.setVisible = (v: boolean) => ((rec.visible = v), rt);
    rt.destroy = () => (rec.destroyed = true);
    return rt;
  };
  const makeGraphics = (added: boolean) => {
    const rec: RecordedGraphics = { fills: [], polygons: [], destroyed: false, added };
    graphics.push(rec);
    let fill = { color: -1, alpha: -1 };
    const g: Record<string, unknown> = {
      fillStyle: (color: number, alpha = 1) => ((fill = { color, alpha }), g),
      fillPoints: (points: Point[]) => (rec.fills.push(fill), rec.polygons.push(points.map((p) => ({ x: p.x, y: p.y }))), g),
      fillRect: (x: number, y: number, w: number, h: number) => (
        rec.fills.push(fill),
        rec.polygons.push([
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ]),
        g
      ),
      destroy: () => (rec.destroyed = true),
    };
    recOfGraphics.set(g, rec);
    return g;
  };
  const textures = {
    addDynamicTexture: (key: string, w: number, h: number) => {
      const rec: RecordedScratch = { key, size: [w, h], drawn: [], erased: [], destroyed: false };
      scratches.push(rec);
      log.push(`scratch ${key}`);
      const dt: Record<string, unknown> = { key };
      dt.draw = (what: unknown, x: number, y: number) => (log.push(`draw ${key}`), rec.drawn.push({ what: recOfGraphics.get(what)!, x, y }), dt);
      dt.erase = (what: unknown, x: number, y: number) => (log.push(`erase ${key}`), rec.erased.push({ what: recOfGraphics.get(what)!, x, y }), dt);
      dt.render = () => (log.push(`render ${key}`), dt);
      dt.destroy = () => (log.push(`destroy ${key}`), (rec.destroyed = true));
      return dt;
    },
  };
  const scene = {
    add: { renderTexture, graphics: () => makeGraphics(true) },
    make: { graphics: (_config: unknown, add = true) => makeGraphics(add) },
    textures,
  } as unknown as Phaser.Scene;
  return { scene, rts, graphics, scratches, log };
}

describe("GroundLayer in chunks (FS-KE075 §H.44)", () => {
  const { art } = library(["ground_flags"]);
  const world = { width: 1440, height: 960, kind: "run" as const, look: TOWER_GROUND };
  const bounds = projectedBounds(1440, 960, 48);
  /** Every stamp on the screen, wherever its chunk stands. */
  const onScreen = (rts: RecordedRT[]) =>
    rts.flatMap((rt) => rt.stamps.map((s) => `${s.x + rt.at[0]},${s.y + rt.at[1]}`));

  it("should paint one render texture over the whole ground when asked for no chunks, as it always has", () => {
    const { scene, rts } = groundStage();
    new GroundLayer(scene, art, world);
    expect(rts.map((r) => r.at)).toEqual([[bounds.x, bounds.y, Math.ceil(bounds.width), Math.ceil(bounds.height)]]);
  });

  it("should paint the ground in render textures no larger than its chunks, one per chunk", () => {
    const { scene, rts } = groundStage();
    new GroundLayer(scene, art, { ...world, chunk: 512 });
    const grid = new ChunkGrid(bounds, 512);
    expect(rts.map((r) => r.at)).toEqual(grid.rects.map((r) => [r.x, r.y, r.width, r.height]));
    for (const r of rts) expect(Math.max(r.at[2], r.at[3])).toBeLessThanOrEqual(512);
  });

  it("should stamp each tile into every chunk it overlaps, landing on the same screen px as one texture", () => {
    const whole = groundStage();
    new GroundLayer(whole.scene, art, world);
    const chunked = groundStage();
    new GroundLayer(chunked.scene, art, { ...world, chunk: 512 });
    expect(new Set(onScreen(chunked.rts))).toEqual(new Set(onScreen(whole.rts)));
    // a tile across a chunk edge is in both
    expect(onScreen(chunked.rts).length).toBeGreaterThan(onScreen(whole.rts).length);
  });

  it("should lay ground only where the world has it", () => {
    const { scene, rts } = groundStage();
    new GroundLayer(scene, art, { ...world, chunk: 512, where: (p) => p.x < 400 });
    const all = groundStage();
    new GroundLayer(all.scene, art, { ...world, chunk: 512 });
    expect(onScreen(rts).length).toBeGreaterThan(0);
    expect(onScreen(rts).length).toBeLessThan(onScreen(all.rts).length);
  });

  it("should show and hide each chunk on its own, and destroy them all", () => {
    const { scene, rts } = groundStage();
    const ground = new GroundLayer(scene, art, { ...world, chunk: 512 });
    expect(ground.chunks.map((c) => c.rect)).toEqual(new ChunkGrid(bounds, 512).rects);
    ground.chunks[1].setVisible(false);
    expect(rts.map((r) => r.visible)).toEqual(rts.map((_, i) => i !== 1));
    ground.destroy();
    expect(rts.every((r) => r.destroyed)).toBe(true);
  });
});

// ── Wall shadows painted into the ground (FS-V8FT3 §E) ───────────────────

describe("GroundLayer's wall shadows (FS-V8FT3 §E R19–R23)", () => {
  const { art } = library(["ground_flags"]);
  const world = { width: 1440, height: 960, kind: "run" as const, look: TOWER_GROUND, chunk: 512 };
  const bounds = projectedBounds(1440, 960, 48);
  const grid = new ChunkGrid(bounds, 512);
  /** A world square, `side` px, centred on a point, as a closed polygon. */
  const square = (c: Point, side: number): Point[] => [
    { x: c.x - side / 2, y: c.y - side / 2 },
    { x: c.x + side / 2, y: c.y - side / 2 },
    { x: c.x + side / 2, y: c.y + side / 2 },
    { x: c.x - side / 2, y: c.y + side / 2 },
  ];
  /** The world point under the middle of a chunk. */
  const middleOf = (i: number) => {
    const r = grid.rects[i];
    return screenToWorld(r.x + r.width / 2, r.y + r.height / 2);
  };
  /** A chunk well inside the ground, whose middle is on the map. */
  const inner = grid.rects.findIndex((_, i) => {
    const m = middleOf(i);
    return m.x > 200 && m.x < 1240 && m.y > 200 && m.y < 760;
  });
  /** The render texture of a chunk, by its rect. */
  const rtOf = (rts: RecordedRT[], i: number) => {
    const r = grid.rects[i];
    return rts.find((rt) => rt.at[0] === r.x && rt.at[1] === r.y)!;
  };

  it("should draw every shape of a chunk opaque into one scratch, and lay that scratch on the chunk once at the catcher's opacity", () => {
    const { scene, rts, scratches } = groundStage();
    const ground = new GroundLayer(scene, art, world);
    const before = rts.map((rt) => rt.stamps.length);
    // two shadows crossing, in the middle of one chunk
    const m = middleOf(inner);
    ground.shade({ shapes: [square(m, 30), square({ x: m.x + 10, y: m.y + 10 }, 30)], cuts: [] });
    expect(scratches).toHaveLength(1);
    const [scratch] = scratches;
    // no larger than the chunk it serves
    expect(scratch.size).toEqual([grid.rects[inner].width, grid.rects[inner].height]);
    expect(scratch.drawn).toHaveLength(1);
    const shapes = scratch.drawn[0].what;
    expect(shapes.polygons).toHaveLength(2);
    // black, opaque: the overlap is no darker than either
    expect(shapes.fills).toEqual([
      { color: BAKE.SHADOW_COLOR, alpha: 1 },
      { color: BAKE.SHADOW_COLOR, alpha: 1 },
    ]);
    // the one stamp onto the ground below an alpha of 1: the whole scratch, at the catcher's opacity
    const rt = rtOf(rts, inner);
    const added = rt.stamps.slice(before[rts.indexOf(rt)]);
    expect(added).toEqual([{ key: scratch.key, x: 0, y: 0, config: { alpha: BAKE.SHADOW_OPACITY, originX: 0, originY: 0 } }]);
    rts.forEach((other, i) => {
      if (other !== rt) expect(other.stamps.length).toBe(before[i]);
    });
  });

  it("should free every scratch and graphics once the ground has rendered, and add nothing to the scene", () => {
    const { scene, scratches, graphics, log } = groundStage();
    const ground = new GroundLayer(scene, art, world);
    const before = graphics.length;
    log.length = 0;
    ground.shade({ shapes: [square(middleOf(inner), 30)], cuts: [{ x: 0, y: 0, width: 80, height: 80 }] });
    const [scratch] = scratches;
    const rt = `rt${grid.rects.indexOf(grid.rects[inner]) + 1}`;
    expect(log).toEqual([
      `scratch ${scratch.key}`,
      `draw ${scratch.key}`,
      `erase ${scratch.key}`,
      `render ${scratch.key}`,
      `stamp ${rt} ${scratch.key}`,
      `render ${rt}`,
      `destroy ${scratch.key}`,
    ]);
    expect(scratches.every((s) => s.destroyed)).toBe(true);
    const made = graphics.slice(before);
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((g) => g.destroyed && !g.added)).toBe(true);
  });

  it("should draw a shape lying across two chunks into both, from the same screen px", () => {
    const { scene, scratches } = groundStage();
    const ground = new GroundLayer(scene, art, world);
    // a shadow over the corner the inner chunk shares with the next one east
    const r = grid.rects[inner];
    const corner = screenToWorld(r.x + r.width, r.y + r.height / 2);
    const shape = square(corner, 40);
    ground.shade({ shapes: [shape], cuts: [] });
    expect(scratches.length).toBeGreaterThanOrEqual(2);
    const want = shape.map((p) => worldToScreen(p.x, p.y)).map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`);
    const rects = new Set<string>();
    for (const s of scratches) {
      const [{ what, x, y }] = s.drawn;
      rects.add(`${x},${y}`);
      // the offset a scratch is drawn at is the ground's corner from its chunk's, so a scratch px
      // plus that chunk's corner is a screen px
      const placed = grid.rects.find((c) => Math.abs(bounds.x - c.x - x) < 1e-9 && Math.abs(bounds.y - c.y - y) < 1e-9)!;
      expect(placed).toBeDefined();
      expect(what.polygons[0].map((p) => `${(p.x + x + placed.x).toFixed(6)},${(p.y + y + placed.y).toFixed(6)}`)).toEqual(want);
    }
    expect(rects.size).toBe(scratches.length);
  });

  it("should erase every cut from the scratch, as the diamond it is on the screen, before the scratch is laid", () => {
    const { scene, scratches } = groundStage();
    const ground = new GroundLayer(scene, art, world);
    const m = middleOf(inner);
    const cut = { x: Math.floor(m.x / 80) * 80, y: Math.floor(m.y / 80) * 80, width: 80, height: 80 };
    ground.shade({ shapes: [square(m, 30)], cuts: [cut] });
    const [scratch] = scratches;
    expect(scratch.erased).toHaveLength(1);
    const { what, x, y } = scratch.erased[0];
    // the same offset as the shapes: one frame for both
    expect([x, y]).toEqual([scratch.drawn[0].x, scratch.drawn[0].y]);
    const corners = [
      worldToScreen(cut.x, cut.y),
      worldToScreen(cut.x + 80, cut.y),
      worldToScreen(cut.x + 80, cut.y + 80),
      worldToScreen(cut.x, cut.y + 80),
    ].map((p) => `${(p.x - bounds.x).toFixed(6)},${(p.y - bounds.y).toFixed(6)}`);
    expect(what.polygons.map((poly) => poly.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`))).toEqual([corners]);
    expect(what.fills.every((f) => f.alpha === 1)).toBe(true);
  });

  it("should paint over the ground as painted, never twice for the same shadows, and again after a repaint", () => {
    const { scene, rts, scratches } = groundStage();
    const ground = new GroundLayer(scene, art, world);
    const tiles = rts.map((rt) => rt.stamps.filter((s) => s.config?.alpha !== BAKE.SHADOW_OPACITY).length);
    const cleared = rts.map((rt) => rt.cleared);
    const shadows = { shapes: [square(middleOf(inner), 30)], cuts: [] };
    ground.shade(shadows);
    // no tile stamped and no texture cleared: the shadow lies over the ground already there
    expect(rts.map((rt) => rt.stamps.filter((s) => s.config?.alpha !== BAKE.SHADOW_OPACITY).length)).toEqual(tiles);
    expect(rts.map((rt) => rt.cleared)).toEqual(cleared);
    expect(scratches).toHaveLength(1);
    // the same shadows asked again: nothing
    ground.shade(shadows);
    expect(scratches).toHaveLength(1);
    // the same ground asked again: still nothing
    ground.paint([]);
    expect(scratches).toHaveLength(1);
    // the ground repainted (another seed): its tiles again, and the shadows once more over them
    ground.paint([], { look: TOWER_GROUND, seed: 9 });
    expect(rtOf(rts, inner).cleared).toBe(cleared[rts.indexOf(rtOf(rts, inner))] + 1);
    expect(scratches).toHaveLength(2);
    const laid = rtOf(rts, inner).stamps.filter((s) => s.config?.alpha === BAKE.SHADOW_OPACITY);
    expect(laid.map((s) => s.key)).toEqual(scratches.map((s) => s.key));
  });

  it("should repaint the ground before laying other shadows over shadows already laid", () => {
    const { scene, rts, scratches } = groundStage();
    const ground = new GroundLayer(scene, art, world);
    ground.shade({ shapes: [square(middleOf(inner), 30)], cuts: [] });
    const cleared = rtOf(rts, inner).cleared;
    ground.shade({ shapes: [square(middleOf(inner), 50)], cuts: [] });
    expect(rtOf(rts, inner).cleared).toBe(cleared + 1);
    expect(scratches).toHaveLength(2);
  });

  it("should never make a chunk's texture, nor a scratch where no shape falls", () => {
    const { scene, rts, scratches } = groundStage();
    // ground only in the map's west: the chunks of its east have no texture
    const ground = new GroundLayer(scene, art, { ...world, where: (p) => p.x < 400 });
    const made = rts.length;
    expect(made).toBeLessThan(grid.rects.length);
    // a shadow in the east, where no chunk has ground
    ground.shade({ shapes: [square({ x: 1300, y: 100 }, 30)], cuts: [] });
    expect(rts).toHaveLength(made);
    expect(scratches).toHaveLength(0);
    ground.shade({ shapes: [], cuts: [] });
    expect(scratches).toHaveLength(0);
  });
});

// ── Walls by a piece rule (FS-KE075 §H.46) ────────────────────────────────

describe("addWalls by a piece rule (a dungeon floor)", () => {
  const TOWER_ART = ["plain", "pillar", "sconce", "cobweb", "banner"].flatMap((k) =>
    ["back", "front"].flatMap((h) => ["x", "y"].map((a) => `tower_wall_${h}_${k}_${a}`)),
  );
  const rule = {
    height: (p: { x: number }) => (p.x < 200 ? ("front" as const) : ("back" as const)),
    lit: () => true,
  };

  it("should draw each piece at the rule's height, and say where every piece and post stands", () => {
    const { scene } = stubScene();
    const { art } = library([...TOWER_ART, "tower_post_back", "tower_post_front"]);
    const built = addWalls(scene, art, [wall(0, 0, 400, 80)], 7, MASONRY_WALLS, rule)!;
    const sheets = built.standing.map(({ sprite }) => sheetOf(sprite));
    // pieces and posts: west of x 200 low, the rest full height
    built.standing.forEach(({ at }, i) =>
      expect(sheets[i]!.includes(at.x < 200 ? "front" : "back")).toBe(true),
    );
    expect(built.standing).toHaveLength(built.byWall.get(wall(0, 0, 400, 80).entity_id)!.length);
    // the tall ones are the full-height ones
    expect(built.tall.every((s) => sheetOf(s)!.includes("back"))).toBe(true);
  });
});

// ── Walls on their edges (FS-XK2B6 §A–§D) ─────────────────────────────────

describe("addWallPieces: planned pieces and posts as sprites (a dungeon floor's walls on their edges)", () => {
  const TOWER_ART = ["plain", "pillar", "sconce", "cobweb", "banner"].flatMap((k) =>
    ["back", "front"].flatMap((h) => ["x", "y"].map((a) => `tower_wall_${h}_${k}_${a}`)),
  );
  const THICK = thicknessPx(MASONRY_WALLS);
  // a room 3 × 3 cells at (80, 80): its back north wall and its front south wall
  const north: EdgeLine = { wallId: "n", axis: "x", from: { x: 80, y: 80 }, to: { x: 320, y: 80 }, wallSide: "north", height: "back", thickness: THICK };
  const south: EdgeLine = { ...north, wallId: "s", from: { x: 80, y: 320 }, to: { x: 320, y: 320 }, wallSide: "south", height: "front" };
  const planned = planEdgeWalls(
    {
      runs: [north, south],
      posts: [
        { wallId: "n", at: { x: 80 - THICK / 2, y: 80 - THICK / 2 }, height: "back" },
        { wallId: "s", at: { x: 320 + THICK / 2, y: 320 + THICK / 2 }, height: "front" },
      ],
    },
    7,
    MASONRY_WALLS,
    () => false,
  );

  it("should stand a sprite for every piece and post where the plan puts it, the back ones tall", () => {
    const { scene } = stubScene();
    const { art } = library([...TOWER_ART, "tower_post_back", "tower_post_front"]);
    const built = addWallPieces(scene, art, planned, 7, MASONRY_WALLS)!;
    const all = [...planned.pieces, ...planned.posts];
    expect(built.standing.map(({ at }) => at)).toEqual(all.map((p) => p.at));
    expect(built.standing.map(({ sprite }) => sheetOf(sprite))).toEqual(all.map((p) => p.sheet));
    built.standing.forEach(({ sprite }, i) => {
      const s = worldToScreen(all[i].at.x, all[i].at.y);
      expect(recOf(sprite).args.slice(0, 2)).toEqual([s.x, s.y]);
    });
    expect(built.tall.map((s) => sheetOf(s))).toEqual(all.filter((p) => p.height === "back").map((p) => p.sheet));
    expect(built.byWall.get("n")).toHaveLength(7);
    expect(built.byWall.get("s")).toHaveLength(7);
  });

  it("should sort each piece by the point its plan names, and a post by its own place a layer over (ADR-0074)", () => {
    const { scene } = stubScene();
    const { art } = library([...TOWER_ART, "tower_post_back", "tower_post_front"]);
    const built = addWallPieces(scene, art, planned, 7, MASONRY_WALLS)!;
    planned.pieces.forEach((p, i) => expect(recOf(built.standing[i].sprite).depth).toBe(worldDepth(p.depthAt.x, p.depthAt.y)));
    planned.posts.forEach((p, i) =>
      expect(recOf(built.standing[planned.pieces.length + i].sprite).depth).toBe(worldDepth(p.at.x, p.at.y, 1)),
    );
    // a body against the south wall is behind it, one against the north wall in front of it
    const [n, s] = [built.byWall.get("n")![0], built.byWall.get("s")![0]];
    expect(worldDepth(110, 320 - 20)).toBeLessThan(recOf(s).depth);
    expect(worldDepth(90, 80 + 20)).toBeGreaterThan(recOf(n).depth);
  });

  it("should be null without the material's wall art: the scene draws its placeholder blocks", () => {
    const { scene } = stubScene();
    expect(addWallPieces(scene, library([]).art, planned, 7, MASONRY_WALLS)).toBeNull();
  });

  it("should hand back the plan it drew and its material's thickness, for the walls' shadows (FS-V8FT3 §D)", () => {
    const { scene } = stubScene();
    const { art } = library([...TOWER_ART, "tower_post_back", "tower_post_front"]);
    const built = addWallPieces(scene, art, planned, 7, MASONRY_WALLS)!;
    expect(built.plan).toEqual(planned);
    expect(built.thickness).toBe(THICK);
  });

  it("should hand back from addWalls the plan its sheets and rule cut, not another", () => {
    const { scene } = stubScene();
    const { art } = library([...TOWER_ART, "tower_post_back", "tower_post_front"]);
    const walls = [wall(0, 0, 400, 20)];
    const built = addWalls(scene, art, walls, 7, MASONRY_WALLS, INTERIOR_PARTITION)!;
    expect(built.plan).toEqual(planWalls(walls, 7, MASONRY_WALLS, INTERIOR_PARTITION));
    expect(built.plan.pieces.every((p) => p.height === "front")).toBe(true);
    expect(built.thickness).toBe(THICK);
  });
});
