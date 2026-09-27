import { describe, expect, it } from "vitest";
import { worldToScreen, type Point } from "./projection";
import {
  boxFaces,
  outsideConvex,
  projectRect,
  raise,
  splitAlongLength,
  worldDepth,
  WORLD_DEPTH,
} from "./shapes";

/** Even-odd ray cast; good enough for the convex quads these helpers emit. */
function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      hit = !hit;
    }
  }
  return hit;
}

describe("projectRect", () => {
  it("should project a world rect to its diamond, top vertex first, clockwise on screen", () => {
    const quad = projectRect(100, 40, 80, 20);
    expect(quad).toEqual([
      worldToScreen(100, 40),
      worldToScreen(180, 40),
      worldToScreen(180, 60),
      worldToScreen(100, 60),
    ]);
  });
});

describe("boxFaces", () => {
  it("should raise the top face by the height and leave the footprint on the ground", () => {
    const { top, south, east } = boxFaces(0, 0, 40, 20, 16);
    const ground = projectRect(0, 0, 40, 20);

    expect(top).toEqual(raise(ground, 16));
    // the two faces toward the viewer stand on the footprint's near edges
    expect(south).toContainEqual(ground[2]);
    expect(south).toContainEqual(ground[3]);
    expect(east).toContainEqual(ground[1]);
    expect(east).toContainEqual(ground[2]);
  });
});

describe("outsideConvex", () => {
  const diamond = projectRect(200, 200, 300, 200);

  it("should cover no point inside the polygon", () => {
    const centre = worldToScreen(350, 300);
    for (const quad of outsideConvex(diamond, 5000)) {
      expect(inside(centre, quad)).toBe(false);
    }
  });

  it("should cover every point outside the polygon within reach", () => {
    const outsiders = [
      worldToScreen(100, 300), // beyond the west edge
      worldToScreen(600, 300), // beyond the east edge
      worldToScreen(350, 100), // north
      worldToScreen(350, 500), // south
      worldToScreen(0, 0), // off a vertex
      worldToScreen(700, 700),
    ];
    const quads = outsideConvex(diamond, 5000);
    for (const p of outsiders) {
      expect(quads.some((q) => inside(p, q))).toBe(true);
    }
  });
});

describe("splitAlongLength", () => {
  it("should cut a long horizontal rect into pieces no longer than the step", () => {
    const pieces = splitAlongLength(0, 0, 100, 20, 40);
    expect(pieces).toEqual([
      { x: 0, y: 0, width: 40, height: 20 },
      { x: 40, y: 0, width: 40, height: 20 },
      { x: 80, y: 0, width: 20, height: 20 },
    ]);
  });

  it("should cut a tall rect along y", () => {
    const pieces = splitAlongLength(10, 10, 20, 90, 40);
    expect(pieces.map((p) => p.height)).toEqual([40, 40, 10]);
    expect(pieces.every((p) => p.x === 10 && p.width === 20)).toBe(true);
  });

  it("should leave a rect shorter than the step whole", () => {
    expect(splitAlongLength(5, 5, 20, 30, 40)).toEqual([
      { x: 5, y: 5, width: 20, height: 30 },
    ]);
  });
});

describe("worldDepth", () => {
  it("should keep footprint order and stay inside the world band for any map we have", () => {
    expect(worldDepth(1, 1)).toBeGreaterThan(worldDepth(0, 1));
    expect(worldDepth(0, 0)).toBe(WORLD_DEPTH);
    expect(worldDepth(2000, 1000, 4)).toBeLessThan(WORLD_DEPTH + 1);
  });

  it("should lift a layer above its own footprint but never past the next world pixel", () => {
    expect(worldDepth(100, 100, 1)).toBeGreaterThan(worldDepth(100, 100));
    expect(worldDepth(100, 100, 4)).toBeLessThan(worldDepth(100, 101));
  });
});
