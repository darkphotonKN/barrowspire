import { describe, expect, it } from "vitest";
import { WORLD_DEPTH } from "@/render/iso/shapes";
import { MARKER_DEPTH } from "@/render/markers/markers";
import { BARROW_HEX } from "@/utils/theme";
import {
  MIST_DEPTH,
  MIST_PARALLAX,
  MIST_TILE,
  mistOffset,
  planMist,
  prefersReducedMotion,
  type MistLook,
} from "./mist";

/** The ground layer's depth (`GROUND_DEPTH` in `src/render/world/scene.ts`, a Phaser module). */
const GROUND_DEPTH = -1;

const LOOK: MistLook = {
  color: BARROW_HEX.vellumDark,
  alpha: 0.3,
  drift: { x: 6, y: 2 },
};

describe("mist depth (FS-3QHQZ §Requirements 27)", () => {
  it("should draw above the ground and below everything standing on it, and so below markers", () => {
    expect(MIST_DEPTH).toBeGreaterThan(GROUND_DEPTH);
    expect(MIST_DEPTH).toBeLessThan(WORLD_DEPTH);
    expect(MIST_DEPTH).toBeLessThan(MARKER_DEPTH.name);
  });
});

describe("planMist", () => {
  const puffs = planMist(7);

  it("should lay the same banks on every client", () => {
    expect(planMist(7)).toEqual(puffs);
    expect(planMist(8)).not.toEqual(puffs);
  });

  it("should keep every bank low and wide, centred inside one tile so the tile wraps", () => {
    expect(puffs.length).toBeGreaterThan(0);
    for (const p of puffs) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(MIST_TILE.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(MIST_TILE.height);
      expect(p.rx).toBeGreaterThan(p.ry);
      expect(p.alpha).toBeGreaterThan(0);
      expect(p.alpha).toBeLessThanOrEqual(1);
    }
  });
});

describe("mistOffset", () => {
  it("should drift slowly with time and lag the camera, as a layer near the ground", () => {
    const still = mistOffset(LOOK, { x: 100, y: 50 }, 0, false);
    const later = mistOffset(LOOK, { x: 100, y: 50 }, 10_000, false);
    // a tile scrolled back by the drift: on screen the banks travel along it
    expect(still.x - later.x).toBeCloseTo(LOOK.drift.x * 10, 5);
    expect(still.y - later.y).toBeCloseTo(LOOK.drift.y * 10, 5);
    expect(still).toEqual({ x: 100 * MIST_PARALLAX, y: 50 * MIST_PARALLAX });
  });

  it("should hold still under prefers-reduced-motion: a static haze", () => {
    const a = mistOffset(LOOK, { x: 100, y: 50 }, 0, true);
    const b = mistOffset(LOOK, { x: 100, y: 50 }, 60_000, true);
    expect(b).toEqual(a);
  });
});

describe("prefersReducedMotion", () => {
  it("should read the media query when there is one", () => {
    const query = (matches: boolean) => () => ({ matches }) as MediaQueryList;
    expect(prefersReducedMotion(query(true))).toBe(true);
    expect(prefersReducedMotion(query(false))).toBe(false);
  });

  it("should take motion as allowed where there is no media query", () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
  });
});
