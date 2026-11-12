import { describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { MINIMAP_WORLD, edgeRuns, footprint, notchDepth, roadGaps } from "./worldMap";

// FS-P0HSP §B.7–§B.9 (I-P0HSP-1): a world's edge as a line with a road gap at every way out, and a
// building as a solid footprint with its doors cut.

const TOWN = { width: 2000, height: 1000 };
const gate = (x: number, y: number, range = 80) => ({ position: { x, y }, range });

/** How far a world depth `d` into a footprint lies on the panel at projection scale `k`, across its edge. */
const panelDepth = (d: number, k: number) => {
  const along = worldToScreen(1, 0);
  const into = worldToScreen(0, d);
  return (Math.abs(along.x * into.y - along.y * into.x) / Math.hypot(along.x, along.y)) * k;
};

describe("roadGaps (FS-P0HSP §B.7)", () => {
  it("should open the edge for the gate's range either side of it, on each edge within its range, and nowhere for a gate beyond it", () => {
    const gaps = roadGaps(TOWN, [gate(1000, 50), gate(40, 580), gate(1960, 360), gate(120, 900)]);
    expect(gaps).toEqual({ north: [[920, 1080]], east: [[280, 440]], south: [], west: [[500, 660]] });
  });

  it("should open a gap on each edge a gate reaches, and keep a gap inside the edge", () => {
    // a corner gate within range of two edges (none today, FS-P0HSP Edge States)
    expect(roadGaps(TOWN, [gate(30, 40)])).toEqual({ north: [[0, 110]], east: [], south: [], west: [[0, 120]] });
  });
});

describe("edgeRuns (FS-P0HSP §B.7)", () => {
  it("should draw the whole edge as one closed loop through its four corners where nothing opens it", () => {
    const runs = edgeRuns(TOWN, roadGaps(TOWN, []));
    expect(runs).toEqual([
      {
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
          { x: 2000, y: 1000 },
          { x: 0, y: 1000 },
        ],
      },
    ]);
  });

  it("should leave the town's three roads open and join every corner (Spire north, Meadows east, Forest west)", () => {
    const runs = edgeRuns(TOWN, roadGaps(TOWN, [gate(1000, 50), gate(40, 580), gate(1960, 360), gate(120, 900)]));
    expect(runs.every((r) => !r.closed)).toBe(true);
    expect(runs).toHaveLength(3);
    expect(runs).toContainEqual({ closed: false, points: [{ x: 1080, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 280 }] });
    expect(runs).toContainEqual({
      closed: false,
      points: [
        { x: 2000, y: 440 },
        { x: 2000, y: 1000 },
        { x: 0, y: 1000 },
        { x: 0, y: 660 },
      ],
    });
    expect(runs).toContainEqual({ closed: false, points: [{ x: 0, y: 500 }, { x: 0, y: 0 }, { x: 920, y: 0 }] });
  });

  it("should draw only along what is shown, open where a gap or the unshown cuts it", () => {
    const runs = edgeRuns(TOWN, roadGaps(TOWN, []), {
      north: [[0, 400]],
      east: [],
      south: [],
      west: [[0, 400]],
    });
    // the north-west corner shown on both its sides: one run round it
    expect(runs).toEqual([{ closed: false, points: [{ x: 0, y: 400 }, { x: 0, y: 0 }, { x: 400, y: 0 }] }]);
  });
});

describe("footprint (FS-P0HSP §B.8, §B.9)", () => {
  const INN = { x: 230, y: 50, width: 640, height: 440 };

  it("should be the building's rect, clockwise, where it has no door", () => {
    expect(footprint(INN, [], 0)).toEqual([
      { x: 230, y: 50 },
      { x: 870, y: 50 },
      { x: 870, y: 490 },
      { x: 230, y: 490 },
    ]);
  });

  it("should cut a south door as a notch the gap's width, reaching in its depth", () => {
    expect(footprint(INN, [{ side: "south", from: 525, to: 605 }], 34)).toEqual([
      { x: 230, y: 50 },
      { x: 870, y: 50 },
      { x: 870, y: 490 },
      { x: 605, y: 490 },
      { x: 605, y: 456 },
      { x: 525, y: 456 },
      { x: 525, y: 490 },
      { x: 230, y: 490 },
    ]);
  });

  it("should cut a door on each side inward", () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const pts = footprint(
      r,
      [
        { side: "north", from: 40, to: 60 },
        { side: "east", from: 40, to: 60 },
        { side: "west", from: 40, to: 60 },
      ],
      10,
    );
    expect(pts).toContainEqual({ x: 40, y: 10 });
    expect(pts).toContainEqual({ x: 90, y: 40 });
    expect(pts).toContainEqual({ x: 10, y: 60 });
    expect(pts).toHaveLength(16);
  });
});

describe("notchDepth (FS-P0HSP §B.9)", () => {
  it.each([
    // the town's normal map, its enlarged and its overlay
    [1 / 12],
    [1.5 / 12],
    [0.125],
  ])("should reach at least MINIMAP_WORLD.doorNotch panel px in, and never less than the wall, at scale %f", (k) => {
    expect(MINIMAP_WORLD.doorNotch).toBe(2);
    const d = notchDepth(20, k);
    expect(d).toBeGreaterThanOrEqual(20);
    expect(panelDepth(d, k)).toBeGreaterThanOrEqual(MINIMAP_WORLD.doorNotch - 1e-9);
  });

  it("should be the wall's thickness where the wall alone reads deeper than the notch", () => {
    expect(notchDepth(20, 1)).toBe(20);
  });
});
