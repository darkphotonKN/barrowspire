import { describe, expect, it } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import {
  BASE_AMBIENT,
  ambientFor,
  contrastRatio,
  cullInto,
  edgeContrast,
  edgeReadable,
  flickerAt,
  liftAmbient,
  sourceFromManifest,
  type LightSource,
} from "./lighting";
import { edgeVignetteAlpha } from "./vignette";

const source = (x: number, y: number, radius = 100): LightSource => ({
  x,
  y,
  radius,
  color: BARROW_HEX.amber,
  intensity: 1,
  flicker: 0.5,
  seed: 1,
});

describe("cullInto", () => {
  const view = { x: 0, y: 0, width: 1080, height: 720 };

  it("should keep sources whose pool reaches the view and drop the rest", () => {
    const inside = source(500, 300);
    const reaching = source(-80, 300, 100); // centre off-screen, pool spills in
    const beyond = source(-150, 300, 100);
    const below = source(500, 900, 100);
    const out: LightSource[] = [];
    expect(cullInto([inside, reaching, beyond, below], view, out)).toEqual([
      inside,
      reaching,
    ]);
  });

  it("should reuse the array it is given rather than allocate each frame", () => {
    const out: LightSource[] = [source(1, 1)];
    const got = cullInto([source(500, 300)], view, out);
    expect(got).toBe(out);
    expect(got).toHaveLength(1);
  });
});

describe("flickerAt", () => {
  it("should hold a steady light still", () => {
    for (const t of [0, 400, 90_000]) expect(flickerAt(t, 3, 0)).toBe(1);
  });

  it("should waver with time, within a bound set by the amount", () => {
    const seen = [...Array(200).keys()].map((i) => flickerAt(i * 37, 5, 0.7));
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(1 - 0.7 * 0.35);
    expect(new Set(seen.map((v) => v.toFixed(3))).size).toBeGreaterThan(20);
  });

  it("should give each source its own clock", () => {
    expect(flickerAt(1000, 1, 0.6)).not.toBe(flickerAt(1000, 2, 0.6));
    expect(flickerAt(1000, 1, 0.6)).toBe(flickerAt(1000, 1, 0.6));
  });
});

describe("sourceFromManifest", () => {
  it("should put the light at the anchor plus its screen offset, coloured by its token", () => {
    const s = sourceFromManifest(
      { offset: { x: -10, y: -95 }, radius: 220, color: "amber", flicker: 0.6 },
      { x: 400, y: 300 },
      9,
    );
    expect(s).toMatchObject({
      x: 390,
      y: 205,
      radius: 220,
      color: BARROW_HEX.amber,
      flicker: 0.6,
      seed: 9,
    });
  });
});

describe("contrastRatio", () => {
  it("should follow WCAG: 1 for equal colours, symmetric, higher for further apart", () => {
    expect(contrastRatio(BARROW_HEX.slate, BARROW_HEX.slate)).toBeCloseTo(1);
    expect(contrastRatio(BARROW_HEX.vellum, BARROW_HEX.pitch)).toBeCloseTo(
      contrastRatio(BARROW_HEX.pitch, BARROW_HEX.vellum),
    );
    expect(contrastRatio(BARROW_HEX.vellum, BARROW_HEX.pitch)).toBeGreaterThan(
      contrastRatio(BARROW_HEX.slate, BARROW_HEX.pitch),
    );
  });
});

describe("ambient per world (FS-2325V §C.8, §C.9)", () => {
  const canvas = { width: 1080, height: 720 };

  it("should light the hub warmer than a run", () => {
    const hub = ambientFor("hub", canvas);
    const run = ambientFor("run", canvas);
    expect(hub).not.toBe(run);
    const warmth = (c: number) => ((c >> 16) & 0xff) - (c & 0xff);
    expect(warmth(hub)).toBeGreaterThan(warmth(run));
  });

  it("should keep an edge-of-canvas hostile readable in the run's darkest ambient", () => {
    const vignette = edgeVignetteAlpha(canvas.width, canvas.height);
    expect(edgeReadable(ambientFor("run", canvas), vignette)).toBe(true);
    expect(edgeReadable(ambientFor("hub", canvas), vignette)).toBe(true);
  });

  it("should lift an ambient too dark to read by, and no further than it must", () => {
    const vignette = edgeVignetteAlpha(canvas.width, canvas.height);
    const dark = BARROW_HEX.pitch;
    expect(edgeReadable(dark, vignette)).toBe(false);
    const lifted = liftAmbient(dark, (a) => edgeReadable(a, vignette));
    expect(edgeReadable(lifted, vignette)).toBe(true);
    expect(edgeContrast(lifted, vignette)).toBeLessThan(
      edgeContrast(0xffffff, vignette),
    );
  });

  it("should not touch an ambient that already reads", () => {
    const vignette = edgeVignetteAlpha(canvas.width, canvas.height);
    expect(liftAmbient(0xffffff, (a) => edgeReadable(a, vignette))).toBe(
      0xffffff,
    );
  });

  it("should never light the run brighter than its base unless the floor forces it", () => {
    const run = ambientFor("run", canvas);
    const lum = (c: number) =>
      ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    expect(lum(run)).toBeGreaterThanOrEqual(lum(BASE_AMBIENT.run));
  });
});
