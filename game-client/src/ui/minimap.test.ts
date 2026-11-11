import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/render/lighting/lighting";
import { RegionGrid, type DungeonMap } from "@/render/world/dungeon";
import fixture from "@/render/world/dungeon.fixture.json";
import { Exploration, regionAt, type ExplorationState } from "@/render/world/exploration";
import { worldToScreen } from "@/render/iso/projection";
import { palette, rgba } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import {
  MINIMAP,
  MINIMAP_EDGE,
  MINIMAP_ENLARGED,
  MINIMAP_GLYPH,
  MINIMAP_OVERLAY,
  MINIMAP_VIGNETTE,
  Minimap,
  minimapContent,
  minimapPanel,
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
  /** Who hears the camera's frames, and a frame set up at a scroll: what the game's camera does. */
  const hearing = new Set<(scroll: { x: number; y: number }) => void>();
  const frame = (scroll: { x: number; y: number }) => {
    for (const listener of [...hearing]) listener(scroll);
  };
  const stage: MinimapStage = {
    frames: (listener) => {
      hearing.add(listener);
      return () => hearing.delete(listener);
    },
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
  return { stage, made, images, painted, order, frame, hearing };
}

/** A minimap over `on` (the fixture floor by default), with the party's exploration of it; at `renderScale` if given. */
function mapped(on: RegionGrid = grid, renderScale?: number) {
  const { stage, made, images, painted, order, frame, hearing } = fakeStage();
  const map = renderScale === undefined ? new Minimap(stage, on) : new Minimap(stage, on, () => renderScale);
  const seen = new Exploration(on);
  const show = (positions: { x: number; y: number }[], fixtures = FIXTURES) => {
    seen.see(positions);
    map.show((id) => seen.state(id), fixtures);
  };
  const [panel, marks, dots] = made;
  return { map, seen, show, panel, marks, dots, made, images, painted, order, frame, hearing };
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
    // a vignette per panel size, normal and enlarged (FS-1SEF0 §B.9)
    expect(images).toHaveLength(2);
    for (const g of [...made, ...images]) expect([g.scrollFactor, g.depth]).toEqual([0, MINIMAP.depth]);
    expect(MINIMAP.depth).toBe(1000);
  });

  it("should stand every layer where it is placed, and move them without a redraw", () => {
    const { map, made, images, show } = mapped();
    // at the column's top (FS-56CKV §B.9)
    map.place(minimapRect(1070, 44));
    show([IN_ROOM]);
    const redraws = map.redraws;
    expect([...made, ...images].map((g) => g.position)).toEqual(Array(5).fill(at(854, 44)));
    map.place(minimapRect(1270, 44));
    expect([...made, ...images].map((g) => g.position)).toEqual(Array(5).fill(at(1054, 44)));
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

  it("should fill every explored and visible region's cells in the one fill, the two drawn the same, and nothing more for unexplored ones (FS-56CKV §A.4)", () => {
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
    // every region's cells in the one fill, explored and visible alike: the fill style in force at each fill
    let style: unknown[] = [];
    const filledIn = panel.drawn().flatMap((c) => {
      if (c.name === "fillStyle") style = c.args;
      return c.name === "fillPoints" ? [style] : [];
    });
    expect(filledIn).toEqual(Array(fills.length).fill([palette.minimapExplored, 1]));
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

  it("should not redraw the map when a seen region only turns visible or explored, since both are drawn the same (FS-56CKV §A.8)", () => {
    const { map, show } = mapped();
    show([IN_ROOM]);
    show([ELSEWHERE]);
    const shown = (s: "visible" | "explored") => map.content.regions.filter((r) => r.state === s).map((r) => r.id);
    expect(shown("explored")).toContain(ROOM);
    const once = map.redraws;
    // back into room 1: it turns visible and the region left explored, every one already seen
    show([IN_ROOM]);
    expect(shown("visible")).toContain(ROOM);
    expect(map.redraws).toBe(once);
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

  it("should start normal, hold a panel in the corner in normal and enlarged and none in the overlay, and go with destroy (FS-1SEF0 §A.1, §C.20)", () => {
    const { map, made, images } = mapped();
    const layers = [...made, ...images];
    expect(map.mode).toBe("normal");
    expect(map.panel).toEqual({ width: 216, height: 108 });
    map.setMode("overlay");
    expect(map.mode).toBe("overlay");
    expect(map.panel).toBeNull();
    map.setMode("normal");
    expect(map.panel).toEqual({ width: 216, height: 108 });
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
      // one per panel size, normal and enlarged (FS-1SEF0 §B.9), only the normal one shown
      expect(on.images).toHaveLength(2);
      expect([on.images[0].width, on.images[0].height]).toEqual([MINIMAP.width, MINIMAP.height]);
      expect(on.images.map((i) => i.visible)).toEqual([true, false]);
      expect(on.painted).toHaveLength(2);
      on.show([ELSEWHERE]);
      expect(on.map.redraws).toBeGreaterThan(1);
      expect(on.images).toHaveLength(2);
      expect(on.painted).toHaveLength(2);
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
      // the vignette is one image per panel size, the enlarged one hidden until it is asked for (FS-1SEF0 §B.9)
      expect(order).toEqual(["graphics0", "image", "image", "graphics1", "graphics2"]);
      const names = panel.drawn().map((c) => c.name);
      const lastFill = names.lastIndexOf("fillPoints");
      const firstEdge = names.indexOf("moveTo");
      expect(names.indexOf("strokeRect")).toBeLessThan(names.indexOf("fillPoints"));
      expect(lastFill).toBeLessThan(firstEdge);
      expect(names.at(-1)).toBe("strokePath");
    });
  });

  describe("the region fills (§A.4)", () => {
    it("should be one dark stone over the backing, by WCAG ratio, with no separate visible fill", () => {
      expect(palette.minimapExplored).toBe(BARROW_HEX.slate);
      expect(contrastRatio(palette.minimapExplored, palette.hudPanel)).toBeGreaterThanOrEqual(1.3);
      expect("minimapVisible" in palette).toBe(false);
      // stone: never the interactable amber or the ally green the glyphs and dots carry
      expect([palette.interactable, palette.markerAlly, palette.markerSelf]).not.toContain(palette.minimapExplored);
    });
  });

  describe("the walls' outline: walls are lines, openings are gaps (§A.5)", () => {
    /** Corridor 36: two cell rects (9 × 2 and 4 × 1 under it), and room 20, which it opens on. */
    const CORRIDOR = 36;
    const NEXT_DOOR = 20;
    type Outline = ReturnType<typeof regionOutline>;
    const regionOf = (id: number, on: RegionGrid = grid) => on.regions.find((r) => r.id === id)!;
    /** A run's sides: a closed loop's last point back to its first, an open run's not. */
    const sides = (runs: Outline) =>
      runs.flatMap(({ points, closed }) =>
        (closed ? points : points.slice(0, -1)).map((from, i) => ({ from, to: points[(i + 1) % points.length] })),
      );
    /** Every unit cell side the runs cover, as a key ("h" a side along x at its left end, "v" along y at its top end); one covered twice counts twice. */
    const unitEdges = (runs: Outline) => {
      const units: string[] = [];
      for (const { from, to } of sides(runs)) {
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
    /** Each side of a cell of the regions `ids` that faces a cell that is not walkable (shell, void or off the grid): the walls to line. */
    const walls = (ids: number[], on: RegionGrid = grid) => {
      const units = new Set<string>();
      for (const id of ids)
        for (const { x, y, w, h } of regionOf(id, on).cells)
          for (let cx = x; cx < x + w; cx++)
            for (let cy = y; cy < y + h; cy++) {
              if (on.region(cx, cy) !== id) continue;
              if (!on.walkable(cx, cy - 1)) units.add(`h${cx},${cy}`);
              if (!on.walkable(cx, cy + 1)) units.add(`h${cx},${cy + 1}`);
              if (!on.walkable(cx - 1, cy)) units.add(`v${cx},${cy}`);
              if (!on.walkable(cx + 1, cy)) units.add(`v${cx + 1},${cy}`);
            }
      return units;
    };
    /** Every side between two walkable cells of the floor, whatever their regions: where no line may lie. */
    const openings = (on: RegionGrid = grid) => {
      const units = new Set<string>();
      for (let cx = 0; cx < on.cols; cx++)
        for (let cy = 0; cy < on.rows; cy++) {
          if (!on.walkable(cx, cy)) continue;
          if (on.walkable(cx + 1, cy)) units.add(`v${cx + 1},${cy}`);
          if (on.walkable(cx, cy + 1)) units.add(`h${cx},${cy + 1}`);
        }
      return units;
    };
    /** The sides between a cell of region `a` and a cell of region `b`: where they meet. */
    const between = (a: number, b: number, on: RegionGrid = grid) => {
      const units: string[] = [];
      for (const { x, y, w, h } of regionOf(a, on).cells)
        for (let cx = x; cx < x + w; cx++)
          for (let cy = y; cy < y + h; cy++) {
            if (on.region(cx, cy) !== a) continue;
            if (on.region(cx, cy - 1) === b) units.push(`h${cx},${cy}`);
            if (on.region(cx, cy + 1) === b) units.push(`h${cx},${cy + 1}`);
            if (on.region(cx - 1, cy) === b) units.push(`v${cx},${cy}`);
            if (on.region(cx + 1, cy) === b) units.push(`v${cx + 1},${cy}`);
          }
      return units;
    };
    /** The corner points a unit side runs between. */
    const ends = (u: string) => {
      const [x, y] = u.slice(1).split(",").map(Number);
      return u[0] === "h" ? [`${x},${y}`, `${x + 1},${y}`] : [`${x},${y}`, `${x},${y + 1}`];
    };
    /** The line runs on unbroken: a turn at every point it passes, and no run ending where another starts. */
    const unbroken = (runs: Outline) => {
      for (const { points, closed } of runs) {
        expect(points.length).toBeGreaterThanOrEqual(closed ? 4 : 2);
        const n = points.length;
        for (let i = 0; i < (closed ? n : n - 1); i++) {
          const [a, b] = [points[i], points[(i + 1) % n]];
          expect(a.x === b.x || a.y === b.y).toBe(true);
          expect(a.x === b.x && a.y === b.y).toBe(false);
          if (!closed && i === n - 2) continue;
          const c = points[(i + 2) % n];
          expect(a.x === b.x && b.x === c.x).toBe(false);
          expect(a.y === b.y && b.y === c.y).toBe(false);
        }
      }
      const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
      const open = runs.filter((r) => !r.closed);
      const starts = new Set(open.map((r) => key(r.points[0])));
      for (const r of open) expect(starts.has(key(r.points.at(-1)!))).toBe(false);
    };
    /** The outline of the regions `ids` seen, checked: exactly their walls, each once, none on an opening, unbroken; its runs and its unit sides. */
    const outlined = (ids: number[], on: RegionGrid = grid) => {
      const runs = regionOutline(on, ids.map((id) => regionOf(id, on)));
      unbroken(runs);
      const units = unitEdges(runs);
      expect(units).toHaveLength(new Set(units).size);
      expect(new Set(units)).toEqual(walls(ids, on));
      const open = openings(on);
      for (const u of units) expect(open.has(u)).toBe(false);
      return { runs, units };
    };

    it("should line a corridor's walls, seen alone, as a room's are, and leave a gap at each mouth onto an unexplored room", () => {
      expect(regionOf(CORRIDOR).kind).toBe("corridor");
      expect(regionOf(CORRIDOR).cells.length).toBeGreaterThan(1);
      const { runs, units } = outlined([CORRIDOR]);
      expect(units.length).toBeGreaterThan(0);
      // its mouths onto rooms 20, 21 and 22, none of them seen: gaps, so the line is open runs
      const mouths = grid.regions.filter((r) => r.kind === "room").flatMap((r) => between(CORRIDOR, r.id));
      expect(mouths.length).toBeGreaterThan(0);
      for (const u of mouths) expect(units).not.toContain(u);
      expect(runs.every((r) => !r.closed)).toBe(true);
      // every corridor of the floor seen at once: each lined along its walls
      const corridors = grid.regions.filter((r) => r.kind === "corridor").map((r) => r.id);
      expect(corridors.length).toBeGreaterThan(1);
      expect(outlined(corridors).units.length).toBe(walls(corridors).size);
    });

    it("should line a room's walls and leave a gap at its doorway onto an unexplored corridor", () => {
      expect(regionOf(NEXT_DOOR).kind).toBe("room");
      const doorway = between(NEXT_DOOR, CORRIDOR);
      expect(doorway.length).toBeGreaterThan(0);
      // the room seen alone: the corridor beyond is unexplored, and the doorway still opens
      const { runs, units } = outlined([NEXT_DOOR]);
      for (const u of doorway) expect(units).not.toContain(u);
      expect(runs.length).toBeGreaterThan(0);
      for (const r of runs) expect(r.closed).toBe(false);
    });

    it("should draw no line across a doorway onto a seen corridor, the room's wall running on into the corridor's", () => {
      const doorway = between(NEXT_DOOR, CORRIDOR);
      const { runs, units } = outlined([NEXT_DOOR, CORRIDOR]);
      for (const u of doorway) expect(units).not.toContain(u);
      // the corridor's walls are lined beside the room's
      for (const u of walls([CORRIDOR])) expect(units).toContain(u);
      // no run ends at the doorway's sides: the line turns there from the room's wall into the corridor's
      const atDoorway = new Set(doorway.flatMap(ends));
      for (const r of runs.filter((r) => !r.closed))
        for (const p of [r.points[0], r.points.at(-1)!]) expect(atDoorway.has(`${p.x},${p.y}`)).toBe(false);
    });

    it("should draw no line where a corridor meets another corridor or a room another room, seen or not", () => {
      // a room with a corridor out of it that meets a second corridor, and a second room under it
      const small = new RegionGrid({
        width: 120,
        height: 90,
        cell_size: 10,
        regions: [
          { id: 1, kind: "room", cells: [{ x: 1, y: 1, w: 4, h: 4 }] },
          { id: 2, kind: "corridor", cells: [{ x: 5, y: 2, w: 3, h: 1 }] },
          { id: 3, kind: "corridor", cells: [{ x: 8, y: 2, w: 1, h: 5 }] },
          { id: 4, kind: "room", cells: [{ x: 1, y: 5, w: 4, h: 2 }] },
        ],
      } as DungeonMap);
      const corridorToCorridor = between(2, 3, small);
      const roomToRoom = between(1, 4, small);
      expect(corridorToCorridor).toEqual(["v8,2"]);
      expect(roomToRoom).toHaveLength(4);
      // every region seen: the walls of the whole, closed, no line where two meet
      const all = outlined([1, 2, 3, 4], small);
      for (const u of [...corridorToCorridor, ...roomToRoom, ...between(1, 2, small)]) expect(all.units).not.toContain(u);
      expect(all.runs.every((r) => r.closed)).toBe(true);
      // the first corridor seen alone: a gap onto the room and onto the corridor beyond, both unexplored
      const alone = outlined([2], small);
      expect(alone.units.sort()).toEqual(["h5,2", "h5,3", "h6,2", "h6,3", "h7,2", "h7,3"]);
      // the second corridor seen alone: a gap where the first meets it
      expect(outlined([3], small).units).not.toContain("v8,2");
      // the top room seen alone: a gap onto the room under it and onto its corridor
      const room = outlined([1], small).units;
      for (const u of [...roomToRoom, ...between(1, 2, small)]) expect(room).not.toContain(u);
    });

    it("should line every shown cell side facing a cell that is not walkable on the whole fixture floor, none missing, and none between two walkable cells", () => {
      const all = grid.regions.map((r) => r.id);
      const want = walls(all);
      // the fixture floor's walls, counted apart from the minimap: 766 unit sides
      expect(want.size).toBe(766);
      const { runs, units } = outlined(all);
      // covered: every wall side once, none missing, none extra
      expect(units).toHaveLength(766);
      expect([...want].filter((u) => !units.includes(u))).toEqual([]);
      // no run on any of the floor's openings
      const open = openings();
      expect(open.size).toBeGreaterThan(0);
      expect(units.filter((u) => open.has(u))).toEqual([]);
      // every opening joins two shown regions, so the walls of the whole floor close
      expect(runs.length).toBeGreaterThan(0);
      expect(runs.every((r) => r.closed)).toBe(true);
    });

    it("should line only the shown regions' walls with a few shown, open where they meet the unexplored", () => {
      // room 20 and the corridor it opens on, the room beyond that corridor, and a corridor apart from them
      const apart = grid.regions.find(
        (r) => r.kind === "corridor" && r.id !== CORRIDOR && between(r.id, NEXT_DOOR).length === 0 && between(r.id, 21).length === 0,
      )!;
      const few = [NEXT_DOOR, CORRIDOR, 21, apart.id];
      const { runs, units } = outlined(few);
      expect(units.length).toBe(walls(few).size);
      expect(runs.some((r) => !r.closed)).toBe(true);
    });

    it("should draw nothing for no seen region", () => {
      expect(regionOutline(grid, [])).toEqual([]);
    });

    it("should stroke the outline in one 1 px stroke of the edge token, each point projected, a closed loop closed and an open run not", () => {
      const { map, panel, show } = mapped();
      // room 20 walked through, then the corridor it opens on: the room explored, the corridor visible
      show([cellAt(4, 21)]);
      show([cellAt(6, 17)]);
      expect(map.content.regions.map((r) => `${r.id}${r.state[0]}`).sort()).toEqual([`${NEXT_DOOR}e`, `${CORRIDOR}v`].sort());
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
      const runs = regionOutline(grid, map.content.regions);
      // the corridor opens on rooms not yet seen: its walls stop at their doorways
      expect(runs.some((r) => !r.closed)).toBe(true);
      const want = runs.flatMap(({ points, closed }) => [
        { name: "moveTo", args: p(points[0]) },
        ...points.slice(1).map((q) => ({ name: "lineTo", args: p(q) })),
        ...(closed ? [{ name: "closePath", args: [] }] : []),
      ]);
      expect(want.length).toBeGreaterThan(0);
      expect(path).toEqual(want);
      expect(new Set(unitEdges(runs))).toEqual(walls(map.content.regions.map((r) => r.id)));
    });

    it("should keep the edge line 1.3:1 against the one fill it bounds", () => {
      expect(contrastRatio(palette.minimapEdge, palette.minimapExplored)).toBeGreaterThanOrEqual(1.3);
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

// FS-1SEF0 §B (I-1SEF0-2): the enlarged minimap, 1.5 × in the same corner, drawn at its size so
// nothing blurs: grid lengths rounded to whole px, lines and round shapes scaled exactly.
describe("the enlarged minimap (FS-1SEF0 §B)", () => {
  /** The same floor and party as the look's tests, in `mode`. */
  const litIn = (mode: "normal" | "enlarged") => {
    const on = mapped();
    on.show([IN_ROOM, ...FIXTURES.map((f) => f.at)]);
    on.show([FIXTURES[0].at]);
    on.map.party({ self: FIXTURES[0].at, allies: [IN_ROOM] });
    on.map.setMode(mode);
    return on;
  };

  it("should hold its look as named values: 1.5 ×, 324 × 162, inset 6, rim 2, the walls' line 1.5 (§B.8, §B.9)", () => {
    expect(MINIMAP_ENLARGED.scale).toBe(1.5);
    expect(minimapPanel("normal")).toEqual({ width: 216, height: 108, inset: 4, rim: 1, edge: 1, marks: 1 });
    expect(minimapPanel("enlarged")).toEqual({ width: 324, height: 162, inset: 6, rim: 2, edge: 1.5, marks: 1.5 });
    expect(minimapRect(1070, 44, minimapPanel("enlarged"))).toEqual({ x: 746, y: 44, width: 324, height: 162 });
  });

  it("should hold a 324 × 162 panel in the corner and draw its backing and a 2 px rim in today's tokens and alphas", () => {
    const { map, panel } = litIn("enlarged");
    expect(map.mode).toBe("enlarged");
    expect(map.panel).toEqual({ width: 324, height: 162 });
    expect(panel.drawn().slice(0, 4)).toEqual([
      { name: "fillStyle", args: [palette.hudPanel, 0.85] },
      { name: "fillRect", args: [0, 0, 324, 162] },
      { name: "lineStyle", args: [2, palette.frame, 0.6] },
      { name: "strokeRect", args: [0, 0, 324, 162] },
    ]);
    expect(panel.drawn().find((c) => c.name === "lineStyle" && c.args[1] === palette.minimapEdge)?.args).toEqual([1.5, palette.minimapEdge, 1]);
  });

  it("should fit the floor 1.5 × as large: every fill and outline point 1.5 × the normal map's", () => {
    const points = (mode: "normal" | "enlarged") =>
      litIn(mode)
        .panel.drawn()
        .flatMap((c) => (c.name === "fillPoints" ? (c.args[0] as { x: number; y: number }[]) : c.name === "moveTo" || c.name === "lineTo" ? [at(c.args[0] as number, c.args[1] as number)] : []));
    const [normal, enlarged] = [points("normal"), points("enlarged")];
    expect(enlarged).toHaveLength(normal.length);
    expect(normal.length).toBeGreaterThan(0);
    for (const [i, p] of normal.entries()) {
      expect(enlarged[i].x).toBeCloseTo(p.x * 1.5, 9);
      expect(enlarged[i].y).toBeCloseTo(p.y * 1.5, 9);
    }
  });

  it("should draw each glyph 14 × 14 on whole px, the 1 × glyph scaled nearest-neighbour, inside the rim", () => {
    for (const f of FIXTURES) {
      const one = (mode: "normal" | "enlarged") => {
        const { marks, show, map } = mapped();
        show([f.at], [f]);
        map.setMode(mode);
        const drawn = marks.drawn();
        for (const c of drawn.filter((c) => c.name === "fillRect")) for (const v of c.args) expect(Number.isInteger(v)).toBe(true);
        const by = rectsByColour(drawn);
        return { ink: pixels(by.get(palette.interactable) ?? []), ring: pixels(by.get(palette.markerStroke) ?? []) };
      };
      const small = one("normal");
      const big = one("enlarged");
      const box = bounds(new Set([...big.ink, ...big.ring]));
      expect([box.right - box.x, box.bottom - box.y]).toEqual([14, 14]);
      expect(box.x).toBeGreaterThanOrEqual(1);
      expect(box.right).toBeLessThanOrEqual(323);
      // nearest-neighbour: each big px is ink exactly where the small px it falls in is
      const sb = bounds(new Set([...small.ink, ...small.ring]));
      const span = (i: number) => Math.round(1.5 * i);
      for (let i = 0; i < 9; i++)
        for (let j = 0; j < 9; j++) {
          const inked = small.ink.has(`${sb.x + i},${sb.y + j}`);
          for (let x = span(i); x < span(i + 1); x++)
            for (let y = span(j); y < span(j + 1); y++) expect(big.ink.has(`${box.x + x},${box.y + y}`)).toBe(inked);
        }
    }
  });

  it("should draw the dots 1.5 ×: the ally r 3 and the player's own r 4.5, each in a 1.5 px ring, on whole px even held in at the rim", () => {
    const { map, dots } = mapped();
    map.setMode("enlarged");
    map.party({ self: IN_ROOM, allies: [at(3000, 900)] });
    expect(dots.drawn().filter((c) => c.name === "fillCircle").map((c) => c.args[2])).toEqual([4.5, 3, 6, 4.5]);
    // past the floor's top corner, where a dot is held inside the rim by its reach
    map.party({ self: at(-400, -400), allies: [at(-400, -400)] });
    for (const c of dots.drawn().filter((c) => c.name === "fillCircle")) {
      const [x, y, r] = c.args as number[];
      expect([Number.isInteger(x), Number.isInteger(y)]).toEqual([true, true]);
      expect(x - r >= 1 && y - r >= 1 && x + r <= 323 && y + r <= 161).toBe(true);
    }
  });

  it("should show the enlarged vignette in its place, painted at 324 × 162, reach 27, inside the rim", () => {
    const { images, painted, map } = litIn("enlarged");
    expect(images.map((i) => [i.width, i.height, i.visible])).toEqual([
      [216, 108, false],
      [324, 162, true],
    ]);
    const { gradients, rects } = painted[1];
    expect(gradients).toHaveLength(4);
    for (const g of gradients) {
      expect(Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y)).toBe(27);
      expect(g.stops[0]).toEqual([0, rgba(palette.inkDeep, MINIMAP_VIGNETTE.edgeAlpha)]);
    }
    for (const r of rects) expect(r.x >= 1 && r.y >= 1 && r.x + r.w <= 323 && r.y + r.h <= 161).toBe(true);
    map.setMode("normal");
    expect(images.map((i) => i.visible)).toEqual([true, false]);
  });

  it("should redraw each layer once on a switch of size, and not when the mode is set again unchanged (§B.10)", () => {
    const { map } = litIn("normal");
    const before = [map.redraws, map.dotRedraws];
    map.setMode("enlarged");
    expect([map.redraws, map.dotRedraws]).toEqual([before[0] + 1, before[1] + 1]);
    map.setMode("enlarged");
    expect([map.redraws, map.dotRedraws]).toEqual([before[0] + 1, before[1] + 1]);
    map.setMode("normal");
    expect([map.redraws, map.dotRedraws]).toEqual([before[0] + 2, before[1] + 2]);
  });
});

// FS-1SEF0 §C (I-1SEF0-3): the map overlay, the floor over the whole view as in Path of Exile 2:
// world-space, 1/8 of the world's projection about the followed figure, see-through, moved each
// frame and never repainted for it.
describe("the map overlay (FS-1SEF0 §C)", () => {
  const overlaid = (renderScale?: number) => {
    const on = mapped(grid, renderScale);
    on.show([IN_ROOM, ...FIXTURES.map((f) => f.at)]);
    on.map.party({ self: IN_ROOM, allies: [FIXTURES[0].at] });
    on.map.setMode("overlay");
    return on;
  };

  it("should hold its look as named values: 1/8 of the world's projection, 40%, a 2 px line, depth 920, a hold of 2 backing px (§C.15–§C.17, §C.19)", () => {
    expect(MINIMAP_OVERLAY).toEqual({ scale: 0.125, alpha: 0.4, edge: 2, depth: 920, hold: 2 });
    // over the dust and vignette (905), under the aim line (940), the floor veil (950) and the HUD
    expect(MINIMAP_OVERLAY.depth).toBeGreaterThan(905);
    expect(MINIMAP_OVERLAY.depth).toBeLessThan(940);
  });

  it("should hold no panel in the corner and draw no backing, rim or vignette (§C.13, §C.20)", () => {
    const { map, panel, images } = overlaid();
    expect(map.panel).toBeNull();
    const names = panel.drawn().map((c) => c.name);
    expect(names).not.toContain("fillRect");
    expect(names).not.toContain("strokeRect");
    expect(panel.drawn().some((c) => c.name === "fillStyle" && c.args[0] === palette.hudPanel)).toBe(false);
    expect(images.map((i) => i.visible)).toEqual([false, false]);
  });

  it("should draw the seen regions and their walls at 40%, the line 2 px, in the minimap's tokens (§C.16)", () => {
    const { panel } = overlaid();
    const styles = panel.drawn().filter((c) => c.name === "fillStyle" || c.name === "lineStyle").map((c) => [c.name, ...c.args]);
    expect(styles).toEqual([
      ["fillStyle", palette.minimapExplored, 0.4],
      ["lineStyle", 2, palette.minimapEdge, 0.4],
    ]);
  });

  it("should project the floor at 1/8 of the world's own projection, about the world's origin (§C.14, §C.15)", () => {
    const { panel } = overlaid();
    const fills = panel.drawn().filter((c) => c.name === "fillPoints");
    expect(fills.length).toBeGreaterThan(0);
    // floor 1's whole diamond is 960 × 480 at this scale
    const corner = (x: number, y: number) => {
      const s = worldToScreen(x, y);
      return at(s.x * 0.125, s.y * 0.125);
    };
    const pts = fills.flatMap((c) => c.args[0] as { x: number; y: number }[]);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(corner(0, 3840).x - 1e-9);
      expect(p.x).toBeLessThanOrEqual(corner(5760, 0).x + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(corner(5760, 3840).y + 1e-9);
    }
    expect(corner(5760, 0).x - corner(0, 3840).x).toBe(960);
    expect(corner(5760, 3840).y).toBe(480);
    // room 1's first cell, exactly where the world puts it, scaled
    const c = grid.cell;
    const room = grid.regions.find((r) => r.id === ROOM)!.cells[0];
    expect(pts).toContainEqual(corner(room.x * c, room.y * c));
  });

  it("should draw the glyphs and dots as the enlarged map does, at full opacity (§C.16)", () => {
    const { marks, dots } = overlaid();
    for (const c of marks.drawn().filter((c) => c.name === "fillStyle")) expect(c.args[1]).toBe(1);
    for (const c of marks.drawn().filter((c) => c.name === "fillRect")) for (const v of c.args) expect(Number.isInteger(v)).toBe(true);
    const ink = pixels(rectsByColour(marks.drawn()).get(palette.interactable) ?? []);
    expect(ink.size).toBeGreaterThan(0);
    expect(dots.drawn().filter((c) => c.name === "fillCircle").map((c) => c.args[2])).toEqual([4.5, 3, 6, 4.5]);
    for (const c of dots.drawn().filter((c) => c.name === "fillStyle")) expect(c.args[1]).toBe(1);
  });

  it("should be in the world, not the HUD: scroll factor 1 at depth 920, back to the HUD in a panel mode", () => {
    const { map, made } = overlaid();
    for (const g of made) expect([g.scrollFactor, g.depth, g.visible]).toEqual([1, 920, true]);
    map.setMode("normal");
    for (const g of made) expect([g.scrollFactor, g.depth]).toEqual([0, MINIMAP.depth]);
  });

  it("should stand so the followed figure's point on it lies on the figure, on whole px, and move without a redraw (§C.14, §C.19)", () => {
    const { map, made } = overlaid();
    const [redraws, dotRedraws] = [map.redraws, map.dotRedraws];
    for (const f of [IN_ROOM, at(IN_ROOM.x + 13, IN_ROOM.y - 7), at(4000, 1200)]) {
      map.follow(f);
      const iso = worldToScreen(f.x, f.y);
      for (const g of made) {
        // the figure's whole px less its point's whole px on the overlay, each rounded once
        expect(g.position).toEqual(at(Math.round(iso.x) - Math.round(iso.x * 0.125), Math.round(iso.y) - Math.round(iso.y * 0.125)));
        // where the figure's own point lands, in the world, against where the figure stands: within
        // the 1 px of the whole-px placement (the acceptance criterion's bound)
        expect(Math.abs(g.position.x + iso.x * 0.125 - iso.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(g.position.y + iso.y * 0.125 - iso.y)).toBeLessThanOrEqual(1);
      }
    }
    expect([map.redraws, map.dotRedraws]).toEqual([redraws, dotRedraws]);
    // a placing in the corner does not move it while it is the overlay
    map.place({ x: 746, y: 44 });
    for (const g of made) expect(g.position).not.toEqual(at(746, 44));
  });

  // the owner, 2026-11-12: "全畫面地圖人物的座標會一直抖動". A figure eased across sub-px points:
  // its whole px on screen and the overlay's place come from the one drawn position, rounded once
  // each, so the map never steps back under it and its dot never leaves it.
  it("should slide the map one way under a walking figure and keep its dot on the figure's whole px, from the drawn positions given with the focus (§C.14, §C.19)", () => {
    const { map, made, dots } = overlaid();
    const [layer] = made;
    const selfDot = () => dots.drawn().filter((c) => c.name === "fillCircle").at(-1)!.args as number[];
    let prev: { x: number; y: number } | undefined;
    let broadcast = IN_ROOM;
    for (let i = 0; i < 200; i++) {
      // eased steps of every size under a whole px and over it, walking +x (right and down)
      const f = at(IN_ROOM.x + i * 0.37 + (i % 3) * 0.11, IN_ROOM.y + i * 0.05);
      // the broadcast leads the drawn figure; the overlay must not take its dot from there
      broadcast = at(f.x + 15, f.y);
      map.party({ self: broadcast, allies: [FIXTURES[0].at] });
      map.follow(f, { self: f, allies: [FIXTURES[0].at] });
      const iso = worldToScreen(f.x, f.y);
      const figure = at(Math.round(iso.x), Math.round(iso.y));
      const off = at(layer.position.x - figure.x, layer.position.y - figure.y);
      if (prev) {
        expect(off.x).toBeLessThanOrEqual(prev.x);
        expect(off.y).toBeLessThanOrEqual(prev.y);
      }
      prev = off;
      const [sx, sy] = selfDot();
      expect(at(layer.position.x + sx, layer.position.y + sy)).toEqual(figure);
    }
    // back in a panel: the broadcast's places, as ever
    map.setMode("normal");
    const p = minimapProjection(grid)(broadcast);
    expect(selfDot().slice(0, 2)).toEqual([Math.round(p.x), Math.round(p.y)]);
  });

  // the owner, 2026-11-12, again: "還是有抖動感 可以加一些平滑效果嗎". At render scale 1.5 or 2 the
  // figure stands on whole backing px, finer than the logical px the overlay stood on, so the map
  // stepped back and forth under it by a backing px or more (measured in headless Chrome: 46 of
  // 141 walking frames at 2, 70 at 1.5). Stood on whole backing px, as every object rounds
  // (ADR-0057), the map slides one way under the figure in backing-px steps and the dot stays on it.
  it.each([
    [1, "world +x (right and down)", at(1, 0)],
    [1.5, "world +x (right and down)", at(1, 0)],
    [1.5, "screen right", at(Math.SQRT1_2, -Math.SQRT1_2)],
    [2, "world +x (right and down)", at(1, 0)],
    [2, "screen right", at(Math.SQRT1_2, -Math.SQRT1_2)],
  ])(
    "should stand on whole backing px at render scale %s, walking %s, so the map never steps back under the figure and the self's dot lies on the figure's backing px (§C.14, §C.19)",
    (rs, _, way) => {
      const { map, made, dots } = overlaid(rs);
      const selfDot = () => dots.drawn().filter((c) => c.name === "fillCircle").at(-1)!.args as number[];
      const backing = (v: number) => Math.round(v * rs) / rs;
      const [dx, dy] = [Math.sign(way.x - way.y), Math.sign(way.x + way.y)];
      let prev: { x: number; y: number } | undefined;
      for (let i = 0; i < 300; i++) {
        // eased steps of every size, under a backing px and over it
        const d = i * 0.83 + (i % 3) * 0.29;
        const f = at(IN_ROOM.x + way.x * d, IN_ROOM.y + way.y * d);
        map.follow(f, { self: f, allies: [FIXTURES[0].at] });
        const iso = worldToScreen(f.x, f.y);
        // the figure as drawn: its point on whole backing px (fullAuto, scroll on the 1/rs grid)
        const figure = at(backing(iso.x), backing(iso.y));
        for (const g of made) {
          expect(Math.abs(g.position.x * rs - Math.round(g.position.x * rs))).toBeLessThan(1e-9);
          expect(Math.abs(g.position.y * rs - Math.round(g.position.y * rs))).toBeLessThan(1e-9);
        }
        const [layer] = made;
        const off = at(layer.position.x - figure.x, layer.position.y - figure.y);
        if (prev) {
          // the map slides against the walk, at 1/8 of it, and never back
          expect((off.x - prev.x) * dx).toBeLessThanOrEqual(1e-9);
          expect((off.y - prev.y) * dy).toBeLessThanOrEqual(1e-9);
        }
        prev = off;
        const [sx, sy] = selfDot();
        expect(layer.position.x + sx).toBeCloseTo(figure.x, 9);
        expect(layer.position.y + sy).toBeCloseTo(figure.y, 9);
      }
    },
  );

  // the owner, 2026-11-12, a third time: "最大的全螢幕還是會有震動感", then "人在左右移動時地圖點位不是直線
  // 會鋸齒狀上下移動". On whole backing px about the figure the map is as steady as the figure is on
  // screen, and the figure is not: its drawn point, eased toward 30 Hz broadcasts, against the
  // camera's lerp and its scroll floored onto the backing grid, dances a backing px or two each
  // way, so the map, sliding only 1/8 of the walk, stepped back and forth against the screen
  // (measured in headless Chrome at real fullscreens: 10 to 30 back-steps a second, each 1.4 to 3.1
  // screen px once the capped canvas is stretched to the screen). Walked here as the game walks,
  // frame by frame, at fractional and capped render scales, at 60 and 120 frames a second.
  describe("held against the screen (§C.19)", () => {
    const LOGICAL = at(1080, 720);
    /**
     * The game's walk, frame by frame: broadcasts at 30 Hz walking 200 world px a second along
     * `way` from 0.5 s, the drawn position eased 0.3 a frame toward the last, the camera following
     * the figure's point with lerp 0.1 (Phaser's follow, centred, ADR-0056) and its scroll floored
     * onto whole backing px (keepOnPixelGrid), each broadcast arriving up to `jitter` ms off its
     * beat. Each frame: the drawn position, then the scroll the frame is drawn at.
     */
    function walk(rs: number, fps: number, way: { x: number; y: number }, seconds: number, stopAt = Infinity, jitter = 0) {
      const frames: { t: number; pos: { x: number; y: number }; scroll: { x: number; y: number } }[] = [];
      // each broadcast n arrives ± `jitter` ms off its 30 Hz beat, the same pseudo-random spread
      // as the headless-Chrome measurement; the client takes the latest arrived, never an older one
      const rnd = (n: number) => {
        const x = Math.sin(n * 12.9898) * 43758.5453;
        return 2 * (x - Math.floor(x)) - 1;
      };
      let last = 0;
      const grid = (v: number) => Math.floor(v * rs + 1e-6) / rs;
      let pos = { ...IN_ROOM };
      const start = worldToScreen(pos.x, pos.y);
      let scroll = at(grid(start.x - LOGICAL.x / 2), grid(start.y - LOGICAL.y / 2));
      for (let i = 1; i <= seconds * fps; i++) {
        const t = i / fps;
        for (let n = last + 1; n <= Math.floor(t * 30) + 1; n++) if (n / 30 + (jitter / 1000) * rnd(n) <= t) last = n;
        const sent = last / 30;
        const d = 200 * Math.min(Math.max(sent - 0.5, 0), stopAt - 0.5);
        const server = at(IN_ROOM.x + way.x * d, IN_ROOM.y + way.y * d);
        pos = at(pos.x + (server.x - pos.x) * 0.3, pos.y + (server.y - pos.y) * 0.3);
        const f = worldToScreen(pos.x, pos.y);
        const lerp = (s: number, target: number) => grid(s + (target - s) * 0.1);
        scroll = at(lerp(scroll.x, f.x - LOGICAL.x / 2), lerp(scroll.y, f.y - LOGICAL.y / 2));
        frames.push({ t, pos, scroll });
      }
      return frames;
    }

    /** Where a layer is shown on screen, in backing px. */
    const onScreen = (layer: { position: { x: number; y: number } }, scroll: { x: number; y: number }, rs: number) =>
      at((layer.position.x - scroll.x) * rs, (layer.position.y - scroll.y) * rs);

    const WAYS = {
      "world +x (A or D: right and down)": at(1, 0),
      "world +y (W or S: left and down)": at(0, 1),
      "screen right": at(Math.SQRT1_2, -Math.SQRT1_2),
    };
    const cases = [1, 1.06, 1.39, 1.5, 1.94, 2].flatMap((rs) =>
      [60, 120].flatMap((fps) => Object.entries(WAYS).map(([name, way]) => [rs, fps, name, way] as const)),
    );

    it.each(cases)(
      "at render scale %s and %s fps, walking %s, should slide the map and its marks one way on screen, never back, an axis the walk does not move held still, within the hold of the figure's point, the dots on the figures",
      (rs, fps, _, way) => {
        const { map, made, dots, frame } = overlaid(rs);
        const [layer, marks] = made;
        const shown: { x: number; y: number }[] = [];
        const stood: { x: number; y: number }[] = [];
        for (const { t, pos, scroll } of walk(rs, fps, way, 3.5)) {
          map.follow(pos, { self: pos, allies: [FIXTURES[0].at] });
          frame(scroll);
          // the camera settled into the walk
          if (t < 1.5) continue;
          shown.push(onScreen(layer, scroll, rs));
          // the dots stand on the figures' backing px, unheld: the stand, as follow puts it
          stood.push(onScreen(dots, scroll, rs));
          expect(marks.position).toEqual(layer.position);
          // on whole backing px on screen, so every line edge stays on the grid
          const s = shown.at(-1)!;
          expect(Math.abs(s.x - Math.round(s.x)) + Math.abs(s.y - Math.round(s.y))).toBeLessThan(1e-6);
        }
        for (const axis of ["x", "y"] as const) {
          const way = Math.sign(Math.round(shown.at(-1)![axis] - shown[0][axis]));
          for (let i = 1; i < shown.length; i++) {
            const step = shown[i][axis] - shown[i - 1][axis];
            if (way === 0) expect(Math.abs(step)).toBeLessThan(1e-6);
            else expect(step * way).toBeGreaterThan(-1e-6);
            // the figure's own point on the overlay is the dots layer's: within the hold of it
            expect(Math.abs(shown[i][axis] - stood[i][axis])).toBeLessThanOrEqual(MINIMAP_OVERLAY.hold + 1e-6);
          }
        }
      },
    );

    // the owner, 2026-11-12, "好" to a hold of two backing px: held within one, ±8 ms of broadcast
    // jitter still left up to 1.7 back-steps a second of one backing px at render scale 2
    it.each([60, 120].flatMap((fps) => Object.entries(WAYS).map(([name, way]) => [fps, name, way] as const)))(
      "at render scale 2 and %s fps with ±8 ms of broadcast jitter, walking %s, should never step the map back on screen and keep it within the hold of the figure's point",
      (fps, _, way) => {
        const rs = 2;
        const { map, made, dots, frame } = overlaid(rs);
        const [layer] = made;
        const shown: { x: number; y: number }[] = [];
        const stood: { x: number; y: number }[] = [];
        for (const { t, pos, scroll } of walk(rs, fps, way, 3.5, Infinity, 8)) {
          map.follow(pos, { self: pos, allies: [] });
          frame(scroll);
          if (t < 1.5) continue;
          shown.push(onScreen(layer, scroll, rs));
          stood.push(onScreen(dots, scroll, rs));
        }
        for (const axis of ["x", "y"] as const) {
          const way = Math.sign(Math.round(shown.at(-1)![axis] - shown[0][axis]));
          const back = shown.slice(1).filter((s, i) => (way === 0 ? Math.abs(s[axis] - shown[i][axis]) > 1e-6 : (s[axis] - shown[i][axis]) * way < -1e-6));
          expect(back).toEqual([]);
          for (let i = 0; i < shown.length; i++) expect(Math.abs(shown[i][axis] - stood[i][axis])).toBeLessThanOrEqual(MINIMAP_OVERLAY.hold + 1e-6);
        }
      },
    );

    it("should come to rest within the hold of the figure's point once the walk stops, and then not move", () => {
      const rs = 2;
      const { map, made, dots, frame } = overlaid(rs);
      const [layer] = made;
      const frames = walk(rs, 120, WAYS["world +x (A or D: right and down)"], 4, 1.5);
      for (const { pos, scroll } of frames) {
        map.follow(pos, { self: pos, allies: [] });
        frame(scroll);
      }
      const { scroll } = frames.at(-1)!;
      const rest = onScreen(layer, scroll, rs);
      const point = onScreen(dots, scroll, rs);
      expect(Math.abs(rest.x - point.x)).toBeLessThanOrEqual(MINIMAP_OVERLAY.hold);
      expect(Math.abs(rest.y - point.y)).toBeLessThanOrEqual(MINIMAP_OVERLAY.hold);
      for (let i = 0; i < 30; i++) {
        map.follow(frames.at(-1)!.pos, { self: frames.at(-1)!.pos, allies: [] });
        frame(scroll);
        expect(onScreen(layer, scroll, rs)).toEqual(rest);
      }
    });

    it("should go with the figure at once on a jump, within the hold, and start afresh on entering the overlay", () => {
      const rs = 1.5;
      const { map, made, frame } = overlaid(rs);
      const [layer] = made;
      const stand = (f: { x: number; y: number }) => {
        const iso = worldToScreen(f.x, f.y);
        const r = (v: number) => (Math.round(v * rs) - Math.round(v * 0.125 * rs)) / rs;
        return at(r(iso.x), r(iso.y));
      };
      const scroll = at(1200, 900);
      map.follow(IN_ROOM);
      frame(scroll);
      // a stairway, a teammate watched: far off, and the map is there in the same frame
      const far = at(4000, 1200);
      map.follow(far);
      frame(scroll);
      expect(Math.abs(layer.position.x - stand(far).x) * rs).toBeLessThanOrEqual(MINIMAP_OVERLAY.hold);
      expect(Math.abs(layer.position.y - stand(far).y) * rs).toBeLessThanOrEqual(MINIMAP_OVERLAY.hold);
      // back to a panel and to the overlay again: on the stand itself, nothing held from before
      map.setMode("normal");
      map.place({ x: 746, y: 44 });
      frame(scroll);
      expect(layer.position).toEqual(at(746, 44));
      map.follow(IN_ROOM);
      map.setMode("overlay");
      frame(scroll);
      expect(layer.position).toEqual(stand(IN_ROOM));
    });

    it("should leave a panel where it is placed, and stop hearing frames once destroyed", () => {
      const { map, made, frame, hearing } = mapped();
      map.place({ x: 746, y: 44 });
      map.follow(IN_ROOM);
      frame(at(300, 200));
      for (const g of made) expect(g.position).toEqual(at(746, 44));
      expect(hearing.size).toBe(1);
      map.destroy();
      expect(hearing.size).toBe(0);
    });
  });

  it("should stand where the figure was last followed as soon as it becomes the overlay", () => {
    const on = mapped();
    on.map.follow(IN_ROOM);
    for (const g of on.made) expect(g.position).toEqual(at(0, 0));
    on.map.setMode("overlay");
    const iso = worldToScreen(IN_ROOM.x, IN_ROOM.y);
    for (const g of on.made) expect(g.position).toEqual(at(Math.round(iso.x) - Math.round(iso.x * 0.125), Math.round(iso.y) - Math.round(iso.y * 0.125)));
  });

  it("should redraw the map only when a region is first seen or a fixture found, and the dots only when one moves a whole px at its scale (§C.19)", () => {
    const { map, show } = overlaid();
    const once = map.redraws;
    show([IN_ROOM]);
    expect(map.redraws).toBe(once);
    show([ELSEWHERE]);
    expect(map.redraws).toBe(once + 1);
    const dots = map.dotRedraws;
    // 2 world px is under an overlay px; 40 is more
    map.party({ self: at(IN_ROOM.x + 2, IN_ROOM.y), allies: [FIXTURES[0].at] });
    expect(map.dotRedraws).toBe(dots);
    map.party({ self: at(IN_ROOM.x + 40, IN_ROOM.y), allies: [FIXTURES[0].at] });
    expect(map.dotRedraws).toBe(dots + 1);
  });
});
