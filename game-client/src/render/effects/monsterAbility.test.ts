import { describe, expect, it } from "vitest";
import { worldToScreen, type Point } from "@/render/iso/projection";
import type { MonsterAbility, MonsterState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import {
  IMPACT_MS,
  TELEGRAPH_DEPTH,
  AbilityTelegraphs,
  abilityShape,
  shapeOutline,
  type GroundBrush,
} from "./monsterAbility";

/** A brush that records what it was last painted with. */
function fakeBrush() {
  const brush = {
    fills: [] as { color: number; alpha?: number; points: Point[] }[],
    strokes: [] as { color: number; alpha?: number; points: Point[] }[],
    depth: 0,
    destroyed: false,
    fill: { color: 0, alpha: 1 as number | undefined },
    line: { color: 0, alpha: 1 as number | undefined },
    clear() {
      brush.fills = [];
      brush.strokes = [];
    },
    fillStyle(color: number, alpha?: number) {
      brush.fill = { color, alpha };
    },
    lineStyle(_width: number, color: number, alpha?: number) {
      brush.line = { color, alpha };
    },
    fillPoints(points: Point[]) {
      brush.fills.push({ ...brush.fill, points });
    },
    strokePoints(points: Point[]) {
      brush.strokes.push({ ...brush.line, points });
    },
    setDepth(depth: number) {
      brush.depth = depth;
    },
    destroy() {
      brush.destroyed = true;
    },
  } satisfies GroundBrush & Record<string, unknown>;
  return brush;
}

function telegraphs() {
  const brushes: ReturnType<typeof fakeBrush>[] = [];
  const set = new AbilityTelegraphs(() => {
    const b = fakeBrush();
    brushes.push(b);
    return b;
  });
  return { set, brushes, live: () => brushes.filter((b) => !b.destroyed) };
}

const slam: MonsterAbility = { kind: "ground_slam", x: 400, y: 300, radius: 130, arc: 0, remaining: 0.9 };

const monster = (fields: Partial<MonsterState> = {}): Pick<MonsterState, "entity_id" | "facing" | "ability"> => ({
  entity_id: "m1",
  facing: { x: 1, y: 0 },
  ability: slam,
  ...fields,
});

/** A world point's distance from (x, y), read back off its screen projection. */
const worldFrom = (centre: Point) => (p: Point) => {
  // worldToScreen is linear: invert it from two basis vectors
  const ex = worldToScreen(1, 0);
  const ey = worldToScreen(0, 1);
  const det = ex.x * ey.y - ey.x * ex.y;
  const wx = (p.x * ey.y - ey.x * p.y) / det;
  const wy = (ex.x * p.y - p.x * ex.y) / det;
  return Math.hypot(wx - centre.x, wy - centre.y);
};

describe("an ability's shape (FS-C8VM7 §F R36)", () => {
  it.each(["pounce", "ground_slam", "burst", "wail"] as const)("should draw a %s as a circle at its centre", (kind) => {
    expect(abilityShape({ ...slam, kind }, { x: 1, y: 0 })).toEqual({ kind: "circle", centre: { x: 400, y: 300 }, radius: 130 });
  });

  it("should draw a cleave as a cone of its arc along the facing", () => {
    const shape = abilityShape({ ...slam, kind: "cleave", radius: 120, arc: 120 }, { x: 0, y: 1 });
    expect(shape).toEqual({ kind: "cone", centre: { x: 400, y: 300 }, radius: 120, facing: Math.PI / 2, arc: (2 * Math.PI) / 3 });
  });

  it.each(["volley", "dagger", "rock"] as const)("should draw nothing for a %s, a shot with no area", (kind) => {
    expect(abilityShape({ ...slam, kind, radius: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it("should outline a circle at its radius, and a share of it", () => {
    const circle = abilityShape(slam, { x: 1, y: 0 })!;
    for (const p of shapeOutline(circle)) expect(Math.hypot(p.x - 400, p.y - 300)).toBeCloseTo(130);
    for (const p of shapeOutline(circle, 0.5)) expect(Math.hypot(p.x - 400, p.y - 300)).toBeCloseTo(65);
  });

  it("should outline a cone from its centre out to its reach, within half its arc of the facing", () => {
    const cone = abilityShape({ ...slam, kind: "cleave", radius: 120, arc: 120 }, { x: 1, y: 0 })!;
    const [apex, ...rim] = shapeOutline(cone);
    expect(apex).toEqual({ x: 400, y: 300 });
    for (const p of rim) {
      expect(Math.hypot(p.x - 400, p.y - 300)).toBeCloseTo(120);
      expect(Math.abs(Math.atan2(p.y - 300, p.x - 400))).toBeLessThanOrEqual(Math.PI / 3 + 1e-9);
    }
  });
});

describe("ability telegraphs (FS-C8VM7 §F R36)", () => {
  it("should draw a ground slam's 130 px circle at its centre, in the hostile channel, above the light-map", () => {
    const { set, live } = telegraphs();
    set.sync([monster()]);
    const [brush] = live();
    expect(brush.depth).toBe(TELEGRAPH_DEPTH);
    // LightMap.ts's LIGHTMAP_DEPTH 135 and HALO_DEPTH 136 (it loads Phaser, so read, not imported)
    expect(TELEGRAPH_DEPTH).toBeGreaterThan(136);
    expect(TELEGRAPH_DEPTH).toBeLessThan(140);
    const edge = brush.strokes[0];
    expect(edge.color).toBe(palette.abilityTelegraph);
    for (const p of edge.points) expect(worldFrom({ x: 400, y: 300 })(p)).toBeCloseTo(130);
  });

  it("should fill toward its edge as it nears landing", () => {
    const { set, live } = telegraphs();
    set.sync([monster()]);
    const filled = () => Math.max(...live()[0].fills.at(-1)!.points.map(worldFrom({ x: 400, y: 300 })));
    const start = filled();
    set.update(450);
    expect(filled()).toBeCloseTo(65, 0);
    set.update(450);
    expect(filled()).toBeCloseTo(130, 0);
    expect(start).toBeLessThan(5);
    expect(live()[0].fills.at(-1)!.color).toBe(palette.abilityTelegraphFill);
  });

  it("should follow the server's remaining time on each tick", () => {
    const { set, live } = telegraphs();
    set.sync([monster()]);
    set.sync([monster({ ability: { ...slam, remaining: 0.3 } })]);
    const reach = Math.max(...live()[0].fills.at(-1)!.points.map(worldFrom({ x: 400, y: 300 })));
    expect(reach).toBeCloseTo((130 * 2) / 3, 0);
  });

  it("should keep the same telegraph when a late tick has a little more time left than eased", () => {
    const { set, brushes } = telegraphs();
    set.sync([monster()]);
    set.update(100);
    set.sync([monster({ ability: { ...slam, remaining: 0.83 } })]);
    expect(brushes).toHaveLength(1);
    expect(brushes[0].destroyed).toBe(false);
  });

  it("should draw a cleave's cone along the monster's facing", () => {
    const { set, live } = telegraphs();
    set.sync([monster({ facing: { x: 0, y: 1 }, ability: { ...slam, kind: "cleave", radius: 120, arc: 120 } })]);
    const [apex, ...rim] = live()[0].strokes[0].points;
    expect(apex).toEqual(worldToScreen(400, 300));
    for (const p of rim) expect(worldFrom({ x: 400, y: 300 })(p)).toBeCloseTo(120);
  });

  it("should play a short impact of the same shape when the field goes, then take it down", () => {
    const { set, live, brushes } = telegraphs();
    set.sync([monster({ ability: { ...slam, remaining: 0.05 } })]);
    set.update(50);
    set.sync([monster({ ability: undefined })]);
    expect(brushes[0].destroyed).toBe(true);
    const [impact] = live();
    expect(impact.fills[0].color).toBe(palette.abilityImpact);
    for (const p of impact.fills[0].points) expect(worldFrom({ x: 400, y: 300 })(p)).toBeCloseTo(130);
    set.update(IMPACT_MS / 2);
    expect(live()).toHaveLength(1);
    set.update(IMPACT_MS / 2);
    expect(live()).toHaveLength(0);
  });

  it("should draw a burst on a corpse, and its impact when it lands", () => {
    const { set, live } = telegraphs();
    const corpse = monster({ ability: { ...slam, kind: "burst", radius: 110, remaining: 0.8 } });
    set.sync([corpse]);
    expect(live()).toHaveLength(1);
    set.update(800);
    set.sync([{ ...corpse, ability: undefined }]);
    expect(live()).toHaveLength(1);
    expect(live()[0].fills[0].color).toBe(palette.abilityImpact);
  });

  it("should draw nothing for a shot ability, its radius 0", () => {
    const { set, brushes } = telegraphs();
    set.sync([monster({ ability: { ...slam, kind: "dagger", radius: 0, remaining: 0.4 } })]);
    expect(brushes).toHaveLength(0);
  });

  it("should take a telegraph down with no impact when its monster leaves state long before it lands", () => {
    const { set, brushes } = telegraphs();
    set.sync([monster()]);
    set.sync([]);
    expect(brushes).toHaveLength(1);
    expect(brushes[0].destroyed).toBe(true);
  });

  it("should draw a fresh telegraph for the next ability, not carry on the last one's fill", () => {
    const { set, live } = telegraphs();
    set.sync([monster({ ability: { ...slam, remaining: 0.05 } })]);
    set.sync([monster({ ability: { ...slam, remaining: 0.9 } })]);
    const reach = Math.max(...live().at(-1)!.fills.at(-1)!.points.map(worldFrom({ x: 400, y: 300 })));
    expect(reach).toBeLessThan(5);
  });

  it("should take everything down on clear, impacts included", () => {
    const { set, live } = telegraphs();
    set.sync([monster({ entity_id: "a" }), monster({ entity_id: "b", ability: { ...slam, remaining: 0 } })]);
    set.sync([monster({ entity_id: "a" }), monster({ entity_id: "b", ability: undefined })]);
    expect(live()).toHaveLength(2);
    set.clear();
    expect(live()).toHaveLength(0);
  });
});
