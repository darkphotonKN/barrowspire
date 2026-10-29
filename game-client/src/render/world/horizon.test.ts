import { describe, expect, it } from "vitest";
import { projectedBounds } from "@/render/iso";
import { MEADOWS_LOOK } from "./fieldLook";
import { HORIZON_FOOT, planHorizon } from "./horizon";

/** The Meadows' camera reach, as the field scene sets it. */
const BOUNDS = projectedBounds(2000, 1000, 120);
const VIEWS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 3440, height: 1440 },
];

describe("planHorizon (FS-X2F2H §Requirements 54)", () => {
  const view = VIEWS[1];
  const horizon = planHorizon(MEADOWS_LOOK.horizon, { bounds: BOUNDS, view });

  it("should move with the camera at a slower rate: parallax", () => {
    expect(horizon.factor).toBeGreaterThan(0);
    expect(horizon.factor).toBeLessThan(1);
  });

  it.each(VIEWS)("should fill a $width×$height view wherever the camera scrolls", (v) => {
    const plan = planHorizon(MEADOWS_LOOK.horizon, { bounds: BOUNDS, view: v });
    const { span, factor } = plan;
    const scrolls = [BOUNDS.x, BOUNDS.x + Math.max(0, BOUNDS.width - v.width)];
    const rows = [BOUNDS.y, BOUNDS.y + Math.max(0, BOUNDS.height - v.height)];
    for (const sx of scrolls)
      for (const sy of rows) {
        // a scroll-factored object at (x, y) shows at (x - sx·f, y - sy·f)
        expect(span.x - sx * factor).toBeLessThanOrEqual(0);
        expect(span.x + span.width - sx * factor).toBeGreaterThanOrEqual(v.width);
        expect(span.y - sy * factor).toBeLessThanOrEqual(0);
        expect(span.y + span.height - sy * factor).toBeGreaterThanOrEqual(v.height);
      }
  });

  it("should rise the hills behind the map's far edge when the camera is at its top", () => {
    // at the top of its reach, the far range's peaks show above the map's top vertex, on screen
    const onScreen = (y: number) => y - BOUNDS.y * horizon.factor;
    const peak = Math.min(...horizon.hills[0].points.map((p) => p.y));
    const topVertex = 0 - BOUNDS.y;
    expect(onScreen(peak)).toBeLessThan(topVertex);
    expect(onScreen(peak)).toBeGreaterThan(0);
  });

  it("should lay sky above the foot, land below, and hills rising from the foot", () => {
    for (const band of horizon.sky) expect(band.y + band.height).toBeLessThanOrEqual(HORIZON_FOOT + 1e-6);
    for (const band of horizon.land) expect(band.y).toBeGreaterThanOrEqual(HORIZON_FOOT - 1e-6);
    expect(horizon.hills.length).toBeGreaterThanOrEqual(2);
    for (const hill of horizon.hills) {
      const tops = hill.points.filter((p) => p.y < HORIZON_FOOT);
      expect(tops.length).toBeGreaterThan(0);
      expect(Math.min(...hill.points.map((p) => p.x))).toBeLessThanOrEqual(horizon.span.x);
      expect(Math.max(...hill.points.map((p) => p.x))).toBeGreaterThanOrEqual(
        horizon.span.x + horizon.span.width,
      );
    }
  });

  it("should cover the sky and the land without a gap", () => {
    const bands = [...horizon.sky, ...horizon.land].sort((a, b) => a.y - b.y);
    expect(bands[0].y).toBeLessThanOrEqual(horizon.span.y);
    for (let i = 1; i < bands.length; i++)
      expect(bands[i].y).toBeLessThanOrEqual(bands[i - 1].y + bands[i - 1].height + 1e-6);
    const last = bands[bands.length - 1];
    expect(last.y + last.height).toBeGreaterThanOrEqual(horizon.span.y + horizon.span.height);
  });

  it("should draw the same horizon every time: no randomness", () => {
    expect(planHorizon(MEADOWS_LOOK.horizon, { bounds: BOUNDS, view })).toEqual(horizon);
  });

  it("should draw the far hills higher than the near ones", () => {
    const [far, near] = horizon.hills;
    const peak = (h: typeof far) => Math.min(...h.points.map((p) => p.y));
    expect(peak(far)).toBeLessThan(peak(near));
  });
});
