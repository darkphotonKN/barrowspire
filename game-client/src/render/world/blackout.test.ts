import { describe, expect, it } from "vitest";
import { projectRect, raise } from "@/render/iso/shapes";
import type { Point } from "@/render/iso/projection";
import type { House } from "./houses";
import { palette } from "@/utils/canvasPalette";
import { BLACKOUT, Blackout, blackoutHole, blackoutQuads } from "./blackout";

/** Strictly inside a convex polygon, whichever way it winds; points on an edge are not. */
function strictlyInside(p: Point, poly: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Inside or on a convex polygon. */
function covers(p: Point, poly: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-6) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

const centroid = (poly: readonly Point[]): Point => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});

/** `p` moved `by` px toward (negative: away from) `to`. */
function toward(p: Point, to: Point, by: number): Point {
  const len = Math.hypot(to.x - p.x, to.y - p.y);
  return { x: p.x + ((to.x - p.x) / len) * by, y: p.y + ((to.y - p.y) / len) * by };
}

const INN: House = { id: "inn", x: 470, y: 110, width: 400, height: 300 };
/** The baked back wall's top (BAKE.WALL_BACK · BAKE.VPX ≈ 141) and the placeholder's (20). */
const WALL_TOPS = [141, 20];
/** The hub's reach: twice its width plus height, as the scene asks for. */
const REACH = (2000 + 1000) * 2;

describe("blackoutHole (FS-9PN7X §D.2)", () => {
  it("should keep the spike's pad, and only a few px of headroom over the back walls' coping", () => {
    expect(BLACKOUT.pad).toBe(5);
    // the owner's trim (2026-11-01): the baked corner posts in 20 px walls just clear the hole's
    // edge with 2 px, so nothing beyond shows above the walls but a few px (was 24, the spike's)
    expect(BLACKOUT.headroom).toBe(2);
    expect(BLACKOUT.depth).toBe(500);
  });

  it.each(WALL_TOPS)("should hold the floor grown by the pad, wall top %d", (wallTop) => {
    const hole = blackoutHole(INN, wallTop);
    const pad = BLACKOUT.pad;
    const grown = projectRect(INN.x - pad, INN.y - pad, INN.width + pad * 2, INN.height + pad * 2);
    for (const corner of grown) expect(covers(corner, hole), JSON.stringify(corner)).toBe(true);
  });

  it.each(WALL_TOPS)("should hold the walls raised to the top plus the headroom, wall top %d", (wallTop) => {
    const hole = blackoutHole(INN, wallTop);
    const floor = projectRect(INN.x, INN.y, INN.width, INN.height);
    for (const corner of raise(floor, wallTop + BLACKOUT.headroom))
      expect(covers(corner, hole), JSON.stringify(corner)).toBe(true);
  });

  it("should be the hexagon of the grown floor and its raised back corners", () => {
    const wallTop = 141;
    const pad = BLACKOUT.pad;
    const floor = projectRect(INN.x - pad, INN.y - pad, INN.width + pad * 2, INN.height + pad * 2);
    const [, right, bottom, left] = floor;
    const [topUp, rightUp, , leftUp] = raise(floor, wallTop + BLACKOUT.headroom);
    expect(blackoutHole(INN, wallTop)).toEqual([topUp, rightUp, right, bottom, left, leftUp]);
  });
});

describe("blackoutQuads (FS-9PN7X §D.1, §D.2)", () => {
  const wallTop = 141;
  const hole = blackoutHole(INN, wallTop);
  const quads = blackoutQuads(INN, wallTop, REACH);
  const mid = centroid(hole);

  it("should never cover the hole", () => {
    const probes = [mid, ...hole.map((v) => toward(v, mid, 2)), ...hole.map((v) => toward(v, mid, 40))];
    for (const p of probes)
      for (const q of quads) expect(strictlyInside(p, q), `${JSON.stringify(p)} in a quad`).toBe(false);
  });

  it("should cover everything outside the hole out to the reach", () => {
    // every map corner, as the camera may see it, and a ring just off each vertex and edge
    const corners = [
      projectRect(0, 0, 2000, 1000),
      [toward(mid, hole[0], -(REACH / 2)), toward(mid, hole[3], -(REACH / 2))],
    ].flat();
    const ring = hole.flatMap((v, i) => {
      const next = hole[(i + 1) % hole.length];
      const halfway = { x: (v.x + next.x) / 2, y: (v.y + next.y) / 2 };
      return [toward(v, mid, -3), toward(halfway, mid, -3)];
    });
    for (const p of [...corners, ...ring])
      expect(quads.some((q) => covers(p, q)), JSON.stringify(p)).toBe(true);
  });

  it("should make one quad per edge of the hole", () => {
    expect(quads).toHaveLength(hole.length);
  });
});

/** A Graphics as the blackout draws on it: what it was last filled with, and whether it shows. */
interface FakeGraphics {
  depth: number;
  visible: boolean;
  destroyed: boolean;
  fills: { color: number; alpha: number }[];
  quads: Point[][];
  clears: number;
  setDepth(depth: number): FakeGraphics;
  setVisible(visible: boolean): FakeGraphics;
  clear(): FakeGraphics;
  fillStyle(color: number, alpha: number): FakeGraphics;
  fillPoints(points: Point[]): FakeGraphics;
  destroy(): void;
}

function fakeGraphics(): FakeGraphics {
  const g: FakeGraphics = {
    depth: 0,
    visible: true,
    destroyed: false,
    fills: [],
    quads: [],
    clears: 0,
    setDepth: (d) => ((g.depth = d), g),
    setVisible: (v) => ((g.visible = v), g),
    clear: () => {
      g.clears++;
      g.quads = [];
      return g;
    },
    fillStyle: (color, alpha) => (g.fills.push({ color, alpha }), g),
    fillPoints: (points) => (g.quads.push(points), g),
    destroy: () => {
      g.destroyed = true;
    },
  };
  return g;
}

describe("Blackout (FS-9PN7X §D.3–§D.5)", () => {
  const STORE: House = { id: "store", x: 1130, y: 150, width: 300, height: 240 };

  function blackout(wallTop = () => 141) {
    const g = fakeGraphics();
    const stage = { add: { graphics: () => g } } as unknown as ConstructorParameters<typeof Blackout>[0];
    return { g, dark: new Blackout(stage, { wallTop, reach: REACH }) };
  }

  it("should stand at depth 500, hidden until the player is in a building", () => {
    const { g, dark } = blackout();
    expect(g.depth).toBe(BLACKOUT.depth);
    expect(g.visible).toBe(false);
    expect(dark.house).toBeUndefined();
  });

  it("should fill the dark around the building in palette.inkDeep, opaque", () => {
    const { g, dark } = blackout();
    dark.show(INN);
    expect(g.visible).toBe(true);
    expect(g.fills).toEqual([{ color: palette.inkDeep, alpha: 1 }]);
    expect(g.quads).toEqual(blackoutQuads(INN, 141, REACH));
    expect(dark.house).toBe(INN);
  });

  it("should draw only when the building changes", () => {
    const { g, dark } = blackout();
    dark.show(INN);
    dark.show(INN);
    dark.show(INN);
    expect(g.clears).toBe(1);
    dark.show(STORE);
    expect(g.clears).toBe(2);
    expect(g.quads).toEqual(blackoutQuads(STORE, 141, REACH));
  });

  it("should redraw for walls baked after it was made", () => {
    let top = 20;
    const { g, dark } = blackout(() => top);
    dark.show(INN);
    expect(g.quads).toEqual(blackoutQuads(INN, 20, REACH));
    top = 141;
    dark.show(INN);
    expect(g.quads).toEqual(blackoutQuads(INN, 141, REACH));
  });

  it("should go out, drawn empty, the frame the player leaves (§D.4)", () => {
    const { g, dark } = blackout();
    dark.show(INN);
    dark.show(undefined);
    expect(g.visible).toBe(false);
    expect(g.quads).toEqual([]);
    expect(dark.house).toBeUndefined();
  });

  it("should clear for a floor's teardown and draw afresh after", () => {
    const { g, dark } = blackout();
    dark.show(INN);
    dark.clear();
    expect(g.visible).toBe(false);
    dark.show(INN);
    expect(g.visible).toBe(true);
    expect(g.quads).toHaveLength(6);
  });

  it("should destroy its Graphics with the scene", () => {
    const { g, dark } = blackout();
    dark.show(INN);
    dark.destroy();
    expect(g.destroyed).toBe(true);
    expect(dark.house).toBeUndefined();
  });
});
