import { describe, expect, it } from "vitest";
import {
  PLANE_TRANSFORM,
  TILE_HEIGHT,
  TILE_WIDTH,
  WORLD_PX_PER_TILE,
  depthKey,
  projectedBounds,
  screenToWorld,
  worldToScreen,
} from "./projection";

const grid: { x: number; y: number }[] = [];
for (let x = -200; x <= 2400; x += 173) {
  for (let y = -150; y <= 1300; y += 131) {
    grid.push({ x, y });
  }
}

describe("worldToScreen / screenToWorld", () => {
  it("should map the world origin to the diamond's top vertex", () => {
    expect(worldToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("should project one tile of world along x onto half a diamond right and down", () => {
    const p = worldToScreen(WORLD_PX_PER_TILE, 0);
    expect(p.x).toBeCloseTo(TILE_WIDTH / 2);
    expect(p.y).toBeCloseTo(TILE_HEIGHT / 2);
  });

  it("should project one tile of world along y onto half a diamond left and down", () => {
    const p = worldToScreen(0, WORLD_PX_PER_TILE);
    expect(p.x).toBeCloseTo(-TILE_WIDTH / 2);
    expect(p.y).toBeCloseTo(TILE_HEIGHT / 2);
  });

  it("should round-trip world -> screen -> world for a grid of points", () => {
    for (const p of grid) {
      const s = worldToScreen(p.x, p.y);
      const back = screenToWorld(s.x, s.y);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it("should round-trip screen -> world -> screen for a grid of points", () => {
    for (const p of grid) {
      const w = screenToWorld(p.x, p.y);
      const back = worldToScreen(w.x, w.y);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
});

describe("PLANE_TRANSFORM", () => {
  it("should equal worldToScreen when applied as rotate-then-scale", () => {
    const { rotation, scaleX, scaleY } = PLANE_TRANSFORM;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    for (const p of grid) {
      const rx = p.x * cos - p.y * sin;
      const ry = p.x * sin + p.y * cos;
      const s = worldToScreen(p.x, p.y);
      expect(rx * scaleX).toBeCloseTo(s.x, 9);
      expect(ry * scaleY).toBeCloseTo(s.y, 9);
    }
  });
});

describe("depthKey", () => {
  it("should order (1,1) after (0,1)", () => {
    expect(depthKey(1, 1)).toBeGreaterThan(depthKey(0, 1));
  });

  it("should draw the nearer of two footprints later, wherever they are", () => {
    // nearer the viewer = larger x + y
    expect(depthKey(100, 300)).toBeGreaterThan(depthKey(250, 100));
    expect(depthKey(10, 10)).toBeLessThan(depthKey(11, 10));
  });

  it("should tie footprints on the same screen row", () => {
    expect(depthKey(30, 70)).toBe(depthKey(70, 30));
  });
});

describe("projectedBounds", () => {
  it("should bound the projected corners of the world rect exactly with no margin", () => {
    const w = 1440;
    const h = 960;
    const b = projectedBounds(w, h);
    const corners = [
      worldToScreen(0, 0),
      worldToScreen(w, 0),
      worldToScreen(w, h),
      worldToScreen(0, h),
    ];

    expect(b.x).toBeCloseTo(Math.min(...corners.map((c) => c.x)));
    expect(b.y).toBeCloseTo(Math.min(...corners.map((c) => c.y)));
    expect(b.x + b.width).toBeCloseTo(Math.max(...corners.map((c) => c.x)));
    expect(b.y + b.height).toBeCloseTo(Math.max(...corners.map((c) => c.y)));
  });

  it("should put the top vertex at the world origin and the bottom at the far corner", () => {
    const b = projectedBounds(2000, 1000);
    expect(b.y).toBe(0);
    expect(b.y + b.height).toBeCloseTo(worldToScreen(2000, 1000).y);
    // the left extreme is the (0, h) corner, the right extreme the (w, 0) corner
    expect(b.x).toBeCloseTo(worldToScreen(0, 1000).x);
    expect(b.x + b.width).toBeCloseTo(worldToScreen(2000, 0).x);
  });

  it("should grow by the margin on every side", () => {
    const tight = projectedBounds(1440, 960);
    const loose = projectedBounds(1440, 960, 50);
    expect(loose.x).toBeCloseTo(tight.x - 50);
    expect(loose.y).toBeCloseTo(tight.y - 50);
    expect(loose.width).toBeCloseTo(tight.width + 100);
    expect(loose.height).toBeCloseTo(tight.height + 100);
  });
});
