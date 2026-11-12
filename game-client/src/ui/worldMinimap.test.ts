import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { MINIMAP, MINIMAP_EDGE, WorldMinimap, minimapPanel, type MinimapPicture, type MinimapStage } from "./minimap";

// FS-P0HSP §A.4, §B, §E (I-P0HSP-1): the run's minimap drawing a world's plan: one look, one set
// of modes, the plan in place of a dungeon floor's region grid.

type Call = { name: string; args: unknown[] };

/** A stand-in for `this.add.graphics()`: records each call, in order. */
function fakeGraphics() {
  const calls: Call[] = [];
  const g = {
    calls,
    visible: true,
    depth: 0,
    scrollFactor: 1,
    position: { x: 0, y: 0 },
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
    setPosition: (x: number, y: number) => ((g.position = { x, y }), g),
    setDepth: (d: number) => ((g.depth = d), g),
    setScrollFactor: (f: number) => ((g.scrollFactor = f), g),
    setVisible: (v: boolean) => ((g.visible = v), g),
    destroy: () => {
      g.destroyed = true;
    },
  });
}

/** The scene as the minimap asks it: its graphics and vignette images, in the order made. */
function fakeStage() {
  const made: ReturnType<typeof fakeGraphics>[] = [];
  const images: ReturnType<typeof fakeGraphics>[] = [];
  const stage: MinimapStage = {
    graphics: () => {
      const g = fakeGraphics();
      made.push(g);
      return g;
    },
    canvasImage: () => {
      const image = fakeGraphics();
      images.push(image);
      return image;
    },
  };
  return { stage, made, images };
}

const TOWN = { width: 2000, height: 1000 };
const SQUARE = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 1000 },
  { x: 0, y: 1000 },
];
const HOUSE = [
  { x: 1130, y: 150 },
  { x: 1430, y: 150 },
  { x: 1430, y: 390 },
  { x: 1130, y: 390 },
];
const picture = (key = "a"): MinimapPicture => ({
  key,
  ground: [SQUARE],
  solids: () => [HOUSE],
  lines: [{ closed: true, points: SQUARE }],
  marks: [],
});

/** The fills made in each colour, in order, in a layer's last draw. */
function fillsInOrder(drawn: Call[]): { colour: number; name: string }[] {
  let colour = -1;
  const out: { colour: number; name: string }[] = [];
  for (const c of drawn) {
    if (c.name === "fillStyle") colour = c.args[0] as number;
    if (c.name === "fillPoints") out.push({ colour, name: c.name });
  }
  return out;
}

describe("WorldMinimap (FS-P0HSP §A.4, §B)", () => {
  it("should draw the panel, then the ground in the one fill, then the footprints and the edge in the walls' ink (§B.6, §B.8, §B.13)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    const drawn = made[0].drawn();
    // the panel's backing and rim, as the run's
    expect(drawn[0]).toEqual({ name: "fillStyle", args: [palette.hudPanel, 0.85] });
    expect(drawn[1]).toEqual({ name: "fillRect", args: [0, 0, MINIMAP.width, MINIMAP.height] });
    expect(fillsInOrder(drawn).map((f) => f.colour)).toEqual([palette.minimapExplored, palette.minimapEdge]);
    expect(drawn.find((c) => c.name === "lineStyle" && c.args[1] === palette.minimapEdge)?.args).toEqual([
      MINIMAP_EDGE.width,
      palette.minimapEdge,
      1,
    ]);
    expect(drawn.filter((c) => c.name === "closePath")).toHaveLength(1);
  });

  it("should fit the town's diamond to the panel's height at 1/12 of the world's projection (§B.5)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    const ground = made[0].drawn().find((c) => c.name === "fillPoints")!.args[0] as { x: number; y: number }[];
    const ys = ground.map((p) => p.y);
    // the diamond's top at the inset, its bottom at the inset from the panel's foot: 100 px tall
    expect(Math.min(...ys)).toBeCloseTo(MINIMAP.inset, 6);
    expect(Math.max(...ys)).toBeCloseTo(MINIMAP.height - MINIMAP.inset, 6);
  });

  it("should ask the footprints at the scale the map is drawn at, each mode its own", () => {
    const { stage } = fakeStage();
    const asked: number[] = [];
    const map = new WorldMinimap(stage, TOWN);
    map.show({ ...picture(), solids: (k) => (asked.push(k), [HOUSE]) });
    map.setMode("enlarged");
    map.setMode("overlay");
    expect(asked[0]).toBeCloseTo(1 / 12, 6);
    expect(asked[1]).toBeCloseTo(1.5 / 12, 6);
    expect(asked[2]).toBe(0.125);
    expect(minimapPanel("enlarged").width).toBe(324);
  });

  it("should redraw the map only when its key changes, not as the party moves (§A.4; FS-56CKV §A.8)", () => {
    const { stage } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture("a"));
    map.show(picture("a"));
    map.party({ self: { x: 500, y: 500 }, allies: [] });
    map.party({ self: { x: 900, y: 500 }, allies: [] });
    map.show(picture("a"));
    expect(map.redraws).toBe(1);
    map.show(picture("b"));
    expect(map.redraws).toBe(2);
  });

  it("should draw the player's dot r 3 over the allies' r 2, each ringed (§E.29)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    map.party({ self: { x: 1000, y: 500 }, allies: [{ x: 400, y: 300 }] });
    const dots = made[made.length - 1].drawn().filter((c) => c.name === "fillCircle" || c.name === "fillStyle");
    expect(dots.map((c) => (c.name === "fillStyle" ? c.args[0] : c.args[2]))).toEqual([
      palette.markerStroke,
      3,
      palette.markerAlly,
      2,
      palette.markerStroke,
      4,
      palette.markerSelf,
      3,
    ]);
  });

  it("should draw the player's dot alone where no ally is given (§E.30)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    map.party({ self: { x: 1000, y: 500 }, allies: [] });
    expect(made[made.length - 1].drawn().filter((c) => c.name === "fillCircle")).toHaveLength(2);
  });
});
