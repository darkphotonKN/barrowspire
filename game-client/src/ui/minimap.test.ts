import { describe, expect, it } from "vitest";
import { RegionGrid, type DungeonMap } from "@/render/world/dungeon";
import fixture from "@/render/world/dungeon.fixture.json";
import { Exploration, regionAt, type ExplorationState } from "@/render/world/exploration";
import { palette } from "@/utils/canvasPalette";
import {
  MINIMAP,
  Minimap,
  minimapContent,
  minimapProjection,
  minimapRect,
  type MinimapFixture,
  type MinimapStage,
} from "./minimap";

// FS-SRA9J §E.19–25 (I-SRA9J-3): the top-right iso minimap of a dungeon floor.

const grid = new RegionGrid(fixture as DungeonMap);
const at = (x: number, y: number) => ({ x, y });
/** A cell's middle, in world px. */
const cellAt = (cx: number, cy: number) => at((cx + 0.5) * grid.cell, (cy + 0.5) * grid.cell);
/** Room 1 of the fixture (cells 28–35 × 35–41). */
const ROOM = 1;
const IN_ROOM = at(2560, 3080);
/** The fixture's switch, escape door and stairs, none of them in room 1. */
const FIXTURES: MinimapFixture[] = [
  { kind: "switch", at: at(3000, 900) },
  { kind: "escape-door", at: at(4000, 1200) },
  { kind: "stairs", at: at(1000, 1200) },
];

/** A stand-in for `this.add.graphics()`: records each call, in order, as it was made. */
function fakeGraphics() {
  const calls: { name: string; args: unknown[] }[] = [];
  const g = {
    calls,
    visible: true,
    depth: 0,
    scrollFactor: 1,
    position: at(0, 0),
    destroyed: false,
    /** The calls made since the last clear. */
    drawn: () => calls.slice(calls.map((c) => c.name).lastIndexOf("clear") + 1),
  };
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return g;
    };
  return Object.assign(g, {
    clear: record("clear"),
    fillStyle: record("fillStyle"),
    fillRect: record("fillRect"),
    fillPoints: record("fillPoints"),
    fillCircle: record("fillCircle"),
    lineStyle: record("lineStyle"),
    strokeRect: record("strokeRect"),
    setPosition: (x: number, y: number) => ((g.position = at(x, y)), g),
    setDepth: (d: number) => ((g.depth = d), g),
    setScrollFactor: (f: number) => ((g.scrollFactor = f), g),
    setVisible: (v: boolean) => ((g.visible = v), g),
    destroy: () => {
      g.destroyed = true;
    },
  });
}

function fakeStage() {
  const made: ReturnType<typeof fakeGraphics>[] = [];
  const stage: MinimapStage = {
    graphics: () => {
      const g = fakeGraphics();
      made.push(g);
      return g;
    },
  };
  return { stage, made };
}

/** A minimap over the fixture floor, with the party's exploration of it. */
function mapped() {
  const { stage, made } = fakeStage();
  const map = new Minimap(stage, grid);
  const seen = new Exploration(grid);
  const show = (positions: { x: number; y: number }[], fixtures = FIXTURES) => {
    seen.see(positions);
    map.show((id) => seen.state(id), fixtures);
  };
  const [panel, dots] = made;
  return { map, seen, show, panel, dots, made };
}

describe("minimapRect (§E.20, §E.21)", () => {
  it("should hang 216 × 108 from 6 px under the floor indicator, its right edge on the column's", () => {
    expect(minimapRect(1070, 98)).toEqual({ x: 854, y: 104, width: 216, height: 108 });
    expect(MINIMAP).toMatchObject({ width: 216, height: 108, gap: 6 });
  });

  it("should land on whole logical px, so its rim is crisp at any render scale", () => {
    const r = minimapRect(1069.6, 97.4);
    for (const v of [r.x, r.y]) expect(Number.isInteger(v)).toBe(true);
  });
});

describe("minimapProjection (§E.21)", () => {
  const project = minimapProjection(grid);
  const corners = [at(0, 0), at(5760, 0), at(0, 3840), at(5760, 3840)].map(project);

  it("should fit the whole floor's iso diamond inside the panel's inset, centred", () => {
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(MINIMAP.inset - 1e-9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(MINIMAP.width - MINIMAP.inset + 1e-9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(MINIMAP.inset - 1e-9);
    expect(Math.max(...ys)).toBeLessThanOrEqual(MINIMAP.height - MINIMAP.inset + 1e-9);
    // centred both ways, and filling one of them
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(MINIMAP.width);
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(MINIMAP.height);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(MINIMAP.height - MINIMAP.inset * 2);
  });

  it("should keep the world's iso directions: the origin at the top, +x down-right, +y down-left", () => {
    const [top, right, left, bottom] = corners;
    expect(top.y).toBeLessThan(right.y);
    expect(right.x).toBeGreaterThan(top.x);
    expect(left.x).toBeLessThan(top.x);
    expect(bottom.y).toBeGreaterThan(Math.max(right.y, left.y));
  });
});

describe("minimapContent (§E.22)", () => {
  const states = (visible: number[], explored: number[] = []) => (id: number): ExplorationState =>
    visible.includes(id) ? "visible" : explored.includes(id) ? "explored" : "unexplored";

  it("should hold nothing for a floor the party has not explored", () => {
    expect(minimapContent(grid, () => "unexplored", FIXTURES)).toEqual({ regions: [], fixtures: [] });
  });

  it("should hold the explored and visible regions' cells, each with its state, and no unexplored one", () => {
    const content = minimapContent(grid, states([ROOM], [2, 3]), []);
    expect(content.regions.map((r) => [r.id, r.state])).toEqual([
      [1, "visible"],
      [2, "explored"],
      [3, "explored"],
    ]);
    for (const r of content.regions) expect(r.cells).toEqual(grid.regions.find((g) => g.id === r.id)!.cells);
  });

  it("should hold the switch, escape door and stairs only once their region is explored", () => {
    const [lever, door, stairs] = FIXTURES.map((f) => regionAt(grid, f.at));
    expect(minimapContent(grid, states([ROOM]), FIXTURES).fixtures).toEqual([]);
    expect(minimapContent(grid, states([ROOM], [door]), FIXTURES).fixtures).toEqual([FIXTURES[1]]);
    expect(minimapContent(grid, states([stairs], [lever, door]), FIXTURES).fixtures).toEqual(FIXTURES);
  });

  it("should hold no fixture standing in no region", () => {
    const off = { kind: "stairs" as const, at: at(-500, -500) };
    expect(regionAt(grid, off.at)).toBe(0);
    expect(minimapContent(grid, () => "visible", [off]).fixtures).toEqual([]);
  });
});

describe("Minimap (§E.19–25)", () => {
  it("should be HUD: camera-fixed at the HUD's depth, a map layer and a separate dot layer", () => {
    const { made } = mapped();
    expect(made).toHaveLength(2);
    for (const g of made) expect([g.scrollFactor, g.depth]).toEqual([0, MINIMAP.depth]);
    expect(MINIMAP.depth).toBe(1000);
  });

  it("should stand both layers where it is placed, and move them without a redraw", () => {
    const { map, made, show } = mapped();
    map.place(minimapRect(1070, 98));
    show([IN_ROOM]);
    const redraws = map.redraws;
    expect(made.map((g) => g.position)).toEqual([at(854, 104), at(854, 104)]);
    map.place(minimapRect(1270, 98));
    expect(made.map((g) => g.position)).toEqual([at(1054, 104), at(1054, 104)]);
    expect(map.redraws).toBe(redraws);
  });

  it("should draw the HUD's panel: a hudPanel backing with a 1 px frame rim, 216 × 108", () => {
    const { panel, show } = mapped();
    show([IN_ROOM]);
    const drawn = panel.drawn();
    expect(drawn.slice(0, 4)).toEqual([
      { name: "fillStyle", args: [palette.hudPanel, 0.85] },
      { name: "fillRect", args: [0, 0, MINIMAP.width, MINIMAP.height] },
      { name: "lineStyle", args: [1, palette.frame, 0.6] },
      { name: "strokeRect", args: [0, 0, MINIMAP.width, MINIMAP.height] },
    ]);
  });

  it("should fill each explored and visible region's cells in its own token, visible brighter, and nothing more for unexplored ones", () => {
    const { map, panel, show } = mapped();
    // in room 1, then out to a cell of region 2: room 1 explored, region 2 visible
    const r2 = grid.regions.find((r) => r.id === 2)!.cells[0];
    show([IN_ROOM]);
    show([cellAt(r2.x, r2.y)]);
    const fills = panel.drawn().filter((c) => c.name === "fillPoints");
    const visible = map.content.regions.filter((r) => r.state === "visible");
    const explored = map.content.regions.filter((r) => r.state === "explored");
    expect(explored.map((r) => r.id)).toContain(ROOM);
    expect(visible.length).toBeGreaterThan(0);
    const cells = (rs: typeof visible) => rs.reduce((n, r) => n + r.cells.length, 0);
    expect(fills).toHaveLength(cells(visible) + cells(explored));
    // one fill style per state, the brighter for visible
    const styles = panel.drawn().filter((c) => c.name === "fillStyle").map((c) => c.args[0]);
    expect(styles).toContain(palette.minimapExplored);
    expect(styles).toContain(palette.minimapVisible);
    expect(palette.minimapVisible).not.toBe(palette.minimapExplored);
    // every corner within the panel
    for (const { args } of fills)
      for (const p of args[0] as { x: number; y: number }[]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(MINIMAP.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(MINIMAP.height);
      }
  });

  it("should mark the switch, escape door and stairs in the amber interactable channel once found", () => {
    const { map, panel, show } = mapped();
    show([IN_ROOM]);
    expect(map.content.fixtures).toEqual([]);
    expect(panel.drawn().some((c) => c.name === "fillStyle" && c.args[0] === palette.interactable)).toBe(false);
    show([IN_ROOM, ...FIXTURES.map((f) => f.at)]);
    expect(map.content.fixtures).toEqual(FIXTURES);
    expect(panel.drawn().filter((c) => c.name === "fillStyle" && c.args[0] === palette.interactable)).toHaveLength(3);
  });

  it("should redraw the map only when a region's state or a found fixture changes (§E.23)", () => {
    const { map, show } = mapped();
    show([IN_ROOM]);
    const once = map.redraws;
    expect(once).toBe(1);
    // the player walks about room 1: nothing changes state
    for (const dx of [0, 40, 80, 120]) show([at(IN_ROOM.x + dx, IN_ROOM.y)]);
    expect(map.redraws).toBe(once);
    // out of the room: it is left explored, another visible
    const r2 = grid.regions.find((r) => r.id === 2)!.cells[0];
    show([cellAt(r2.x, r2.y)]);
    expect(map.redraws).toBe(once + 1);
    // a fixture leaves the snapshot
    show([cellAt(r2.x, r2.y)], FIXTURES.slice(1));
    expect(map.redraws).toBe(once + 1);
    show([cellAt(r2.x, r2.y), FIXTURES[1].at], FIXTURES.slice(1));
    expect(map.redraws).toBe(once + 2);
    show([cellAt(r2.x, r2.y), FIXTURES[1].at], FIXTURES.slice(2));
    expect(map.redraws).toBe(once + 3);
  });

  it("should draw a dot per living member on its own layer, the local player distinct, and redraw it only when a dot moves a px", () => {
    const { map, dots, panel } = mapped();
    map.party({ self: IN_ROOM, allies: [at(3000, 900), at(1000, 1200)] });
    const fills = dots.drawn().filter((c) => c.name === "fillStyle").map((c) => c.args[0]);
    expect(fills.filter((c) => c === palette.markerAlly)).toHaveLength(2);
    expect(fills.filter((c) => c === palette.markerSelf)).toHaveLength(1);
    // the self dot is drawn last, over the rest, and larger
    expect(fills.at(-1)).toBe(palette.markerSelf);
    const circles = dots.drawn().filter((c) => c.name === "fillCircle");
    expect(circles.at(-1)!.args[2] as number).toBeGreaterThan(circles[1].args[2] as number);
    expect(map.dotRedraws).toBe(1);
    // the dots on whole logical px
    for (const c of circles) for (const v of c.args.slice(0, 2)) expect(Number.isInteger(v)).toBe(true);
    // a step too small to move a dot a px redraws nothing; one that does, only the dots
    map.party({ self: at(IN_ROOM.x + 1, IN_ROOM.y), allies: [at(3000, 900), at(1000, 1200)] });
    expect(map.dotRedraws).toBe(1);
    const mapCalls = panel.calls.length;
    map.party({ self: at(IN_ROOM.x + 400, IN_ROOM.y), allies: [at(3000, 900), at(1000, 1200)] });
    expect(map.dotRedraws).toBe(2);
    expect(panel.calls.length).toBe(mapCalls);
  });

  it("should draw no self dot for a local player out of play, the allies' still", () => {
    const { map, dots } = mapped();
    map.party({ allies: [at(3000, 900)] });
    const fills = dots.drawn().filter((c) => c.name === "fillStyle").map((c) => c.args[0]);
    expect(fills).not.toContain(palette.markerSelf);
    expect(fills).toContain(palette.markerAlly);
    map.party({ allies: [] });
    expect(dots.drawn().filter((c) => c.name === "fillCircle")).toEqual([]);
  });

  it("should hide and show both layers together, and go with destroy", () => {
    const { map, made } = mapped();
    map.setShown(false);
    expect(made.map((g) => g.visible)).toEqual([false, false]);
    expect(map.shown).toBe(false);
    map.setShown(true);
    expect(made.map((g) => g.visible)).toEqual([true, true]);
    map.destroy();
    expect(made.every((g) => g.destroyed)).toBe(true);
  });
});
