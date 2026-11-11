import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "@/render/lighting/lighting";
import { RegionGrid, type DungeonMap } from "@/render/world/dungeon";
import fixture from "@/render/world/dungeon.fixture.json";
import { Exploration, regionAt, type ExplorationState } from "@/render/world/exploration";
import { palette, rgba } from "@/utils/canvasPalette";
import {
  MINIMAP,
  MINIMAP_EDGE,
  MINIMAP_GLYPH,
  MINIMAP_VIGNETTE,
  Minimap,
  minimapContent,
  minimapProjection,
  minimapRect,
  regionOutline,
  type MinimapFixture,
  type MinimapStage,
} from "./minimap";

// FS-SRA9J §E.19–25 (I-SRA9J-3): the top-right iso minimap of a dungeon floor.
// FS-56CKV §A (I-56CKV-1): its look, candle-lit stone in its unchanged frame.

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

/** A region with no fixture in it, apart from room 1 and its group: somewhere to walk to. */
const ELSEWHERE = (() => {
  const taken = new Set([ROOM, ...FIXTURES.map((f) => regionAt(grid, f.at))]);
  const seen = new Exploration(grid);
  seen.see([IN_ROOM]);
  const r = grid.regions.find((g) => !taken.has(g.id) && seen.state(g.id) === "unexplored")!;
  return cellAt(r.cells[0].x, r.cells[0].y);
})();

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
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    closePath: record("closePath"),
    strokePath: record("strokePath"),
    setPosition: (x: number, y: number) => ((g.position = at(x, y)), g),
    setDepth: (d: number) => ((g.depth = d), g),
    setScrollFactor: (f: number) => ((g.scrollFactor = f), g),
    setVisible: (v: boolean) => ((g.visible = v), g),
    destroy: () => {
      g.destroyed = true;
    },
  });
}

/** A 2D canvas context as far as a canvas texture is painted: its gradients and the rects filled. */
function fakeContext() {
  type Gradient = { from: { x: number; y: number }; to: { x: number; y: number }; stops: [number, string][] };
  const gradients: Gradient[] = [];
  const rects: { x: number; y: number; w: number; h: number; fill: unknown }[] = [];
  const calls: string[] = [];
  const ctx = {
    fillStyle: undefined as unknown,
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
      calls.push("createLinearGradient");
      const grad: Gradient & { addColorStop(at: number, colour: string): void } = {
        from: at(x0, y0),
        to: at(x1, y1),
        stops: [],
        addColorStop: (offset, colour) => void grad.stops.push([offset, colour]),
      };
      gradients.push(grad);
      return grad;
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      calls.push("fillRect");
      rects.push({ x, y, w, h, fill: ctx.fillStyle });
    },
  };
  return { ctx, gradients, rects, calls };
}

/** A camera-fixed image of a canvas texture, as the stage makes it. */
function fakeImage(key: string, width: number, height: number) {
  const g = fakeGraphics();
  return Object.assign(g, { key, width, height });
}

function fakeStage() {
  const made: ReturnType<typeof fakeGraphics>[] = [];
  const images: ReturnType<typeof fakeImage>[] = [];
  const painted: ReturnType<typeof fakeContext>[] = [];
  /** What the stage made, in the order it made it: the order Phaser draws a depth's objects in. */
  const order: string[] = [];
  const stage: MinimapStage = {
    graphics: () => {
      const g = fakeGraphics();
      made.push(g);
      order.push(`graphics${made.length - 1}`);
      return g;
    },
    canvasImage: (key, width, height, paint) => {
      const c = fakeContext();
      paint(c.ctx as unknown as CanvasRenderingContext2D, width, height);
      painted.push(c);
      const image = fakeImage(key, width, height);
      images.push(image);
      order.push("image");
      return image;
    },
  };
  return { stage, made, images, painted, order };
}

/** A minimap over `on` (the fixture floor by default), with the party's exploration of it. */
function mapped(on: RegionGrid = grid) {
  const { stage, made, images, painted, order } = fakeStage();
  const map = new Minimap(stage, on);
  const seen = new Exploration(on);
  const show = (positions: { x: number; y: number }[], fixtures = FIXTURES) => {
    seen.see(positions);
    map.show((id) => seen.state(id), fixtures);
  };
  const [panel, marks, dots] = made;
  return { map, seen, show, panel, marks, dots, made, images, painted, order };
}

type Call = { name: string; args: unknown[] };
/** The whole px a run of `fillRect` calls covers, as "x,y" keys. */
function pixels(calls: Call[]): Set<string> {
  const px = new Set<string>();
  for (const { args } of calls) {
    const [x, y, w, h] = args as number[];
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) px.add(`${i},${j}`);
  }
  return px;
}
/** The fillRect calls made in each colour, in a layer's last draw. */
function rectsByColour(drawn: Call[]): Map<number, Call[]> {
  const by = new Map<number, Call[]>();
  let colour = -1;
  for (const c of drawn) {
    if (c.name === "fillStyle") colour = c.args[0] as number;
    if (c.name === "fillRect") by.set(colour, [...(by.get(colour) ?? []), c]);
  }
  return by;
}
const bounds = (px: Set<string>) => {
  const xs = [...px].map((k) => Number(k.split(",")[0]));
  const ys = [...px].map((k) => Number(k.split(",")[1]));
  return { x: Math.min(...xs), y: Math.min(...ys), right: Math.max(...xs) + 1, bottom: Math.max(...ys) + 1 };
};
/** The alpha of an `rgba(…)` stop, if it is the ink's. */
const inkAlpha = (colour: string) => {
  const a = Number(/,\s*([\d.]+)\)$/.exec(colour)?.[1]);
  return colour === rgba(palette.inkDeep, a) ? a : NaN;
};

// FS-56CKV §B.9 supersedes FS-SRA9J §E.20 in part: the minimap is the column's first part, its top
// the column's top; the floor indicator stands `gap` under it
describe("minimapRect (§E.20, §E.21; FS-56CKV §B.9)", () => {
  it("should hang 216 × 108 from the column's top, its right edge on the column's", () => {
    expect(minimapRect(1070, 44)).toEqual({ x: 854, y: 44, width: 216, height: 108 });
    expect(MINIMAP).toMatchObject({ width: 216, height: 108, gap: 6 });
  });

  it("should land on whole logical px, so its rim is crisp at any render scale", () => {
    const r = minimapRect(1069.6, 43.6);
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
  it("should be HUD: camera-fixed at the HUD's depth, the map, the vignette, the marks and a separate dot layer", () => {
    const { made, images } = mapped();
    expect(made).toHaveLength(3);
    expect(images).toHaveLength(1);
    for (const g of [...made, ...images]) expect([g.scrollFactor, g.depth]).toEqual([0, MINIMAP.depth]);
    expect(MINIMAP.depth).toBe(1000);
  });

  it("should stand every layer where it is placed, and move them without a redraw", () => {
    const { map, made, images, show } = mapped();
    // at the column's top (FS-56CKV §B.9)
    map.place(minimapRect(1070, 44));
    show([IN_ROOM]);
    const redraws = map.redraws;
    expect([...made, ...images].map((g) => g.position)).toEqual(Array(4).fill(at(854, 44)));
    map.place(minimapRect(1270, 44));
    expect([...made, ...images].map((g) => g.position)).toEqual(Array(4).fill(at(1054, 44)));
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
    // in room 1, then out to another region: room 1 explored, that one visible
    show([IN_ROOM]);
    show([ELSEWHERE]);
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
    const { map, marks, show } = mapped();
    show([IN_ROOM]);
    expect(map.content.fixtures).toEqual([]);
    expect(marks.drawn().some((c) => c.name === "fillStyle" && c.args[0] === palette.interactable)).toBe(false);
    show([IN_ROOM, ...FIXTURES.map((f) => f.at)]);
    expect(map.content.fixtures).toEqual(FIXTURES);
    expect(marks.drawn().filter((c) => c.name === "fillStyle" && c.args[0] === palette.interactable)).toHaveLength(3);
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
    show([ELSEWHERE]);
    expect(map.redraws).toBe(once + 1);
    // a fixture not yet found leaves the snapshot: nothing shown changes
    show([ELSEWHERE], FIXTURES.slice(1));
    expect(map.redraws).toBe(once + 1);
    // a member finds the escape door, which then leaves the snapshot
    show([ELSEWHERE, FIXTURES[1].at], FIXTURES.slice(1));
    expect(map.redraws).toBe(once + 2);
    show([ELSEWHERE, FIXTURES[1].at], FIXTURES.slice(2));
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

  it("should hide and show every layer together, and go with destroy", () => {
    const { map, made, images } = mapped();
    const layers = [...made, ...images];
    map.setShown(false);
    expect(layers.map((g) => g.visible)).toEqual(Array(4).fill(false));
    expect(map.shown).toBe(false);
    map.setShown(true);
    expect(layers.map((g) => g.visible)).toEqual(Array(4).fill(true));
    map.destroy();
    expect(layers.every((g) => g.destroyed)).toBe(true);
  });
});

describe("the minimap's look (FS-56CKV §A)", () => {
  /** Every fixture found, room 1 left explored, the region around the switch visible, two dots. */
  const lit = (on = mapped()) => {
    on.show([IN_ROOM, ...FIXTURES.map((f) => f.at)]);
    on.show([FIXTURES[0].at]);
    on.map.party({ self: FIXTURES[0].at, allies: [IN_ROOM] });
    return on;
  };
  /** Within the rim's inside edge: clear of the 1 px rim on every side. */
  const insideRim = (x: number, y: number, pad = 0) =>
    x - pad >= 1 && x + pad <= MINIMAP.width - 1 && y - pad >= 1 && y + pad <= MINIMAP.height - 1;

  describe("the frame (§A.1)", () => {
    it("should draw the backing and rim with today's calls and values, first", () => {
      const { panel } = lit();
      expect(panel.drawn().slice(0, 4)).toEqual([
        { name: "fillStyle", args: [palette.hudPanel, 0.85] },
        { name: "fillRect", args: [0, 0, 216, 108] },
        { name: "lineStyle", args: [1, palette.frame, 0.6] },
        { name: "strokeRect", args: [0, 0, 216, 108] },
      ]);
    });

    it("should draw nothing over the rim: every layer keeps inside its inside edge", () => {
      const { panel, marks, dots, painted } = lit();
      // the map layer after its rim: region fills and edges (a 1 px line reaches half a px out)
      for (const c of panel.drawn().slice(4)) {
        if (c.name === "fillPoints") for (const p of c.args[0] as { x: number; y: number }[]) expect(insideRim(p.x, p.y)).toBe(true);
        if (c.name === "moveTo" || c.name === "lineTo") expect(insideRim(c.args[0] as number, c.args[1] as number, 0.5)).toBe(true);
        expect(["fillRect", "strokeRect", "fillCircle"]).not.toContain(c.name);
      }
      for (const c of marks.drawn().filter((c) => c.name === "fillRect")) {
        const [x, y, w, h] = c.args as number[];
        expect(insideRim(x, y) && insideRim(x + w, y + h)).toBe(true);
      }
      for (const c of dots.drawn().filter((c) => c.name === "fillCircle")) {
        const [x, y, r] = c.args as number[];
        expect(insideRim(x, y, r)).toBe(true);
      }
      for (const r of painted[0].rects) expect(insideRim(r.x, r.y) && insideRim(r.x + r.w, r.y + r.h)).toBe(true);
    });

    it("should keep a mark and a dot at the floor's very edge clear of the rim", () => {
      // one region in the corner cell of a 2 × 2 floor: its diamond's top vertex on the inset
      const corner = new RegionGrid({
        width: 160,
        height: 160,
        cell_size: 80,
        regions: [{ id: 1, kind: "room", cells: [{ x: 0, y: 0, w: 1, h: 1 }] }],
        walls: [],
      } as unknown as DungeonMap);
      const on = mapped(corner);
      const edge = at(1, 1);
      on.show([edge], [{ kind: "stairs", at: edge }]);
      on.map.party({ self: edge, allies: [edge] });
      expect(on.map.content.fixtures).toHaveLength(1);
      for (const c of on.marks.drawn().filter((c) => c.name === "fillRect")) {
        const [x, y, w, h] = c.args as number[];
        expect(insideRim(x, y) && insideRim(x + w, y + h)).toBe(true);
      }
      for (const c of on.dots.drawn().filter((c) => c.name === "fillCircle")) {
        const [x, y, r] = c.args as number[];
        expect(insideRim(x, y, r)).toBe(true);
      }
    });
  });

  describe("the vignette (§A.2, §A.8)", () => {
    it("should be one canvas texture's image the size of the panel, made once per minimap and never on a content change", () => {
      const on = lit();
      expect(on.images).toHaveLength(1);
      expect([on.images[0].width, on.images[0].height]).toEqual([MINIMAP.width, MINIMAP.height]);
      expect(on.painted).toHaveLength(1);
      on.show([ELSEWHERE]);
      expect(on.map.redraws).toBeGreaterThan(1);
      expect(on.images).toHaveLength(1);
      expect(on.painted).toHaveLength(1);
    });

    it("should be in inkDeep, strongest at the rim's inside edge and easing to nothing at its reach", () => {
      const { painted } = lit();
      const { gradients, rects } = painted[0];
      // one band in from each side, each a gradient filled over it
      expect(gradients).toHaveLength(4);
      expect(rects).toHaveLength(4);
      for (const [i, g] of gradients.entries()) {
        expect(rects[i].fill).toBe(g);
        const alphas = g.stops.map(([, c]) => inkAlpha(c));
        for (const a of alphas) expect(Number.isNaN(a)).toBe(false);
        expect(g.stops[0]).toEqual([0, rgba(palette.inkDeep, MINIMAP_VIGNETTE.edgeAlpha)]);
        expect(g.stops.at(-1)).toEqual([1, rgba(palette.inkDeep, 0)]);
        for (let s = 1; s < alphas.length; s++) expect(alphas[s]).toBeLessThanOrEqual(alphas[s - 1]);
        // from the rim's inside edge, in by its reach
        const onEdge = g.from.x === 1 || g.from.x === MINIMAP.width - 1 || g.from.y === 1 || g.from.y === MINIMAP.height - 1;
        expect(onEdge).toBe(true);
        expect(Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y)).toBe(MINIMAP_VIGNETTE.reach);
        expect(insideRim(g.to.x, g.to.y)).toBe(true);
      }
      // nothing at the middle: no band reaches the panel's centre
      const mid = at(MINIMAP.width / 2, MINIMAP.height / 2);
      for (const r of rects) expect(mid.x > r.x && mid.x < r.x + r.w && mid.y > r.y && mid.y < r.y + r.h).toBe(false);
      expect(MINIMAP_VIGNETTE.reach * 2).toBeLessThan(MINIMAP.height - 2);
    });

    it("should be smooth: no more than 0.08 alpha a logical px between its stops, and never a WebGL-only gradient fill", () => {
      const { painted, made } = lit();
      const [{ stops }] = painted[0].gradients;
      for (let s = 1; s < stops.length; s++) {
        const px = (stops[s][0] - stops[s - 1][0]) * MINIMAP_VIGNETTE.reach;
        const da = inkAlpha(stops[s - 1][1]) - inkAlpha(stops[s][1]);
        expect(da / px).toBeLessThanOrEqual(0.08);
      }
      for (const g of made) expect(g.calls.some((c) => c.name === "fillGradientStyle")).toBe(false);
    });
  });

  describe("the draw order (§A.3)", () => {
    it("should stand backing, fills, the outer outline, then the vignette, the glyphs, and the dots on top", () => {
      const { order, panel } = lit();
      // made in the order Phaser draws one depth's objects in: map, vignette, marks, dots
      expect(order).toEqual(["graphics0", "image", "graphics1", "graphics2"]);
      const names = panel.drawn().map((c) => c.name);
      const lastFill = names.lastIndexOf("fillPoints");
      const firstEdge = names.indexOf("moveTo");
      expect(names.indexOf("strokeRect")).toBeLessThan(names.indexOf("fillPoints"));
      expect(lastFill).toBeLessThan(firstEdge);
      expect(names.at(-1)).toBe("strokePath");
    });
  });

  describe("the region fills (§A.4)", () => {
    it("should be dark stone over the backing, the visible a step lighter, by WCAG ratio", () => {
      expect(contrastRatio(palette.minimapExplored, palette.hudPanel)).toBeGreaterThanOrEqual(1.3);
      expect(contrastRatio(palette.minimapVisible, palette.minimapExplored)).toBeGreaterThanOrEqual(1.3);
      expect(relativeLuminance(palette.minimapVisible)).toBeGreaterThan(relativeLuminance(palette.minimapExplored));
      // stone: never the interactable amber or the ally green the glyphs and dots carry
      for (const fill of [palette.minimapExplored, palette.minimapVisible])
        expect([palette.interactable, palette.markerAlly, palette.markerSelf]).not.toContain(fill);
    });
  });

  describe("the outer outline (§A.5)", () => {
    /** Corridor 36: two cell rects (9 × 2 and 4 × 1 under it), and room-adjacent region 20. */
    const CORRIDOR = 36;
    const NEXT_DOOR = 20;
    const regionOf = (id: number) => grid.regions.find((r) => r.id === id)!;
    /** A loop's sides, last point back to the first. */
    const sides = (loops: ReturnType<typeof regionOutline>) =>
      loops.flatMap((loop) => loop.map((from, i) => ({ from, to: loop[(i + 1) % loop.length] })));
    /** Every unit cell boundary the loops cover, as a key; a boundary covered twice counts twice. */
    const unitEdges = (loops: ReturnType<typeof regionOutline>) => {
      const units: string[] = [];
      for (const { from, to } of sides(loops)) {
        expect(from.x === to.x || from.y === to.y).toBe(true);
        const n = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
        const dx = Math.sign(to.x - from.x);
        const dy = Math.sign(to.y - from.y);
        for (let i = 0; i < n; i++) {
          const a = at(from.x + dx * i, from.y + dy * i);
          units.push(dx !== 0 ? `h${Math.min(a.x, a.x + dx)},${a.y}` : `v${a.x},${Math.min(a.y, a.y + dy)}`);
        }
      }
      return units;
    };
    /** The outer edge of the regions `ids` taken together: each boundary between one of their cells and a cell of none of them. */
    const expected = (ids: number[]) => {
      const shown = new Set(ids);
      const units = new Set<string>();
      for (const id of ids)
        for (const { x, y, w, h } of regionOf(id).cells)
          for (let cx = x; cx < x + w; cx++)
            for (let cy = y; cy < y + h; cy++) {
              if (grid.region(cx, cy) !== id) continue;
              if (!shown.has(grid.region(cx, cy - 1))) units.add(`h${cx},${cy}`);
              if (!shown.has(grid.region(cx, cy + 1))) units.add(`h${cx},${cy + 1}`);
              if (!shown.has(grid.region(cx - 1, cy))) units.add(`v${cx},${cy}`);
              if (!shown.has(grid.region(cx + 1, cy))) units.add(`v${cx + 1},${cy}`);
            }
      return units;
    };
    /** The boundaries between two regions' cells. */
    const between = (a: number, b: number) => [...expected([a])].filter((u) => expected([b]).has(u));

    it("should follow a region's footprint outline: no line between its own cell rects", () => {
      expect(regionOf(CORRIDOR).cells.length).toBeGreaterThan(1);
      const units = unitEdges(regionOutline(grid, [regionOf(CORRIDOR)]));
      expect(new Set(units)).toEqual(expected([CORRIDOR]));
      // the seam between its two rects (row 19, x 10–13) is inside the footprint: no line on it
      for (let cx = 10; cx < 14; cx++) expect(units).not.toContain(`h${cx},19`);
    });

    it("should draw no line where two shown regions meet, explored or visible, and their outer edge once", () => {
      const shared = between(CORRIDOR, NEXT_DOOR);
      expect(shared.length).toBeGreaterThan(0);
      const units = unitEdges(regionOutline(grid, [regionOf(CORRIDOR), regionOf(NEXT_DOOR)]));
      for (const u of shared) expect(units).not.toContain(u);
      expect(units).toHaveLength(new Set(units).size);
      expect(new Set(units)).toEqual(expected([CORRIDOR, NEXT_DOOR]));
    });

    it("should run the outline of the whole fixture floor as closed loops, each side once and no gap at a corner", () => {
      const all = grid.regions;
      const loops = regionOutline(grid, all);
      expect(loops.length).toBeGreaterThan(0);
      for (const loop of loops) {
        expect(loop.length).toBeGreaterThanOrEqual(4);
        // a turn at every point: each side meets the next at a corner, and the last closes on the first
        for (let i = 0; i < loop.length; i++) {
          const [a, b, c] = [loop[i], loop[(i + 1) % loop.length], loop[(i + 2) % loop.length]];
          expect(a.x === b.x || a.y === b.y).toBe(true);
          expect(a.x === b.x && a.y === b.y).toBe(false);
          expect(a.x === b.x && b.x === c.x).toBe(false);
          expect(a.y === b.y && b.y === c.y).toBe(false);
        }
      }
      const units = unitEdges(loops);
      expect(units).toHaveLength(new Set(units).size);
      expect(new Set(units)).toEqual(expected(all.map((r) => r.id)));
    });

    it("should draw nothing for no seen region", () => {
      expect(regionOutline(grid, [])).toEqual([]);
    });

    it("should stroke the outline as closed paths in one 1 px stroke of the edge token, each point projected", () => {
      const { map, panel, show } = mapped();
      show([IN_ROOM]);
      show([ELSEWHERE]);
      const drawn = panel.drawn();
      expect(drawn.filter((c) => c.name === "lineStyle").at(-1)).toEqual({
        name: "lineStyle",
        args: [MINIMAP_EDGE.width, palette.minimapEdge, 1],
      });
      expect(MINIMAP_EDGE.width).toBe(1);
      expect(drawn.filter((c) => c.name === "strokePath")).toHaveLength(1);
      const project = minimapProjection(grid);
      const c = grid.cell;
      const p = (q: { x: number; y: number }) => Object.values(project({ x: q.x * c, y: q.y * c }));
      const path = drawn.slice(drawn.findIndex((d) => d.name === "beginPath") + 1, -1);
      const want = regionOutline(grid, map.content.regions).flatMap((loop) => [
        { name: "moveTo", args: p(loop[0]) },
        ...loop.slice(1).map((q) => ({ name: "lineTo", args: p(q) })),
        { name: "closePath", args: [] },
      ]);
      expect(want.length).toBeGreaterThan(0);
      expect(path).toEqual(want);
      // the explored room and the visible region it opens on: no line between them
      const units = unitEdges(regionOutline(grid, map.content.regions));
      const shownIds = map.content.regions.map((r) => r.id);
      expect(new Set(units)).toEqual(expected(shownIds));
    });

    it("should keep the edge line 1.3:1 against each fill it bounds", () => {
      expect(contrastRatio(palette.minimapEdge, palette.minimapExplored)).toBeGreaterThanOrEqual(1.3);
      expect(contrastRatio(palette.minimapEdge, palette.minimapVisible)).toBeGreaterThanOrEqual(1.3);
    });
  });

  describe("the fixture glyphs (§A.6)", () => {
    /** The glyph drawn for one fixture alone, found: its ring's px and its ink's px, and where it seats. */
    const glyph = (f: MinimapFixture) => {
      const { marks, show } = mapped();
      show([f.at], [f]);
      const drawn = marks.drawn();
      const by = rectsByColour(drawn);
      const m = minimapProjection(grid)(f.at);
      return {
        drawn,
        ring: pixels(by.get(palette.markerStroke) ?? []),
        ink: pixels(by.get(palette.interactable) ?? []),
        seat: at(Math.round(m.x), Math.round(m.y)),
      };
    };

    it("should draw the switch, escape door and stairs as three distinct glyphs in interactable on a markerStroke ring", () => {
      const drawn = FIXTURES.map(glyph);
      const shapes = drawn.map(({ ink, seat }) =>
        [...ink].map((k) => k.split(",").map(Number)).map(([x, y]) => `${x - seat.x},${y - seat.y}`).sort().join(";"),
      );
      expect(new Set(shapes).size).toBe(3);
      for (const g of drawn) {
        expect(g.ink.size).toBeGreaterThan(0);
        // the ring first, the ink over it
        const styles = g.drawn.filter((c) => c.name === "fillStyle").map((c) => c.args);
        expect(styles).toEqual([
          [palette.markerStroke, 1],
          [palette.interactable, 1],
        ]);
      }
    });

    it("should seat each glyph on whole px, centred where the mark sits, within 9 × 9 and at least 7 px wide", () => {
      for (const f of FIXTURES) {
        const { drawn, ink, ring, seat } = glyph(f);
        for (const c of drawn.filter((c) => c.name === "fillRect"))
          for (const v of c.args) expect(Number.isInteger(v)).toBe(true);
        const all = bounds(new Set([...ink, ...ring]));
        expect(all.right - all.x).toBeLessThanOrEqual(MINIMAP_GLYPH.box);
        expect(all.bottom - all.y).toBeLessThanOrEqual(MINIMAP_GLYPH.box);
        expect(MINIMAP_GLYPH.box).toBe(9);
        const inked = bounds(ink);
        expect(inked.right - inked.x).toBeGreaterThanOrEqual(7);
        // the glyph's middle on the seat's px, where today's 4 px mark was centred
        expect(Math.abs((all.x + all.right) / 2 - (seat.x + 0.5))).toBeLessThanOrEqual(0.5);
        expect(Math.abs((all.y + all.bottom) / 2 - (seat.y + 0.5))).toBeLessThanOrEqual(0.5);
      }
    });

    it("should ring each glyph's shape 1 px round: every px next to the ink is ring, and the ring only that or the shape's own dark", () => {
      for (const f of FIXTURES) {
        const { ink, ring } = glyph(f);
        const near = new Set<string>();
        for (const k of ink) {
          const [x, y] = k.split(",").map(Number);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.add(`${x + dx},${y + dy}`);
        }
        for (const k of near) if (!ink.has(k)) expect(ring.has(k)).toBe(true);
        // past the ring, dark only inside the ink's own box: a doorway, never a wider halo
        const box = bounds(ink);
        for (const k of ring) {
          const [x, y] = k.split(",").map(Number);
          expect(near.has(k) || (x >= box.x && x < box.right && y >= box.y && y < box.bottom)).toBe(true);
        }
      }
    });

    it("should draw the escape door's doorway dark, not the ground showing through the arch", () => {
      const door = FIXTURES[1];
      const { ring, seat } = glyph(door);
      // the doorway's middle column, under the arch's crown
      for (let y = seat.y; y <= seat.y + 3; y++) expect(ring.has(`${seat.x},${y}`)).toBe(true);
    });

    it("should keep the glyph's ink 3:1 against its ring", () => {
      expect(contrastRatio(palette.interactable, palette.markerStroke)).toBeGreaterThanOrEqual(3);
    });
  });

  describe("the party dots (§A.7)", () => {
    it("should ring each dot 1 px in markerStroke, the ally r 2, the player's own r 3 and drawn last", () => {
      const { map, dots } = mapped();
      map.party({ self: IN_ROOM, allies: [at(3000, 900)] });
      const drawn = dots.drawn().filter((c) => c.name === "fillStyle" || c.name === "fillCircle");
      expect(drawn.map((c) => (c.name === "fillStyle" ? c.args : c.args[2]))).toEqual([
        [palette.markerStroke, 1],
        3,
        [palette.markerAlly, 1],
        2,
        [palette.markerStroke, 1],
        4,
        [palette.markerSelf, 1],
        3,
      ]);
    });

    it("should keep each dot's ink 3:1 against its ring", () => {
      expect(contrastRatio(palette.markerAlly, palette.markerStroke)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.markerSelf, palette.markerStroke)).toBeGreaterThanOrEqual(3);
    });
  });
});
