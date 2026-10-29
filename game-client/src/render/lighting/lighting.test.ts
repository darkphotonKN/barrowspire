import { describe, expect, it } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import {
  AMBIENT,
  contrastRatio,
  cullInto,
  flickerAt,
  TOWER_AMBIENT,
  litEdgeGround,
  relativeLuminance,
  sourceFromManifest,
  groundMean,
  tinted,
  type LightSource,
} from "./lighting";

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
  const mix = (a: number, b: number, t: number) =>
    [16, 8, 0].reduce((c, shift) => {
      const x = (a >> shift) & 0xff;
      const y = (b >> shift) & 0xff;
      return c | (Math.round(x + (y - x) * t) << shift);
    }, 0);

  it("should light a field in daylight, brighter than the hub's dusk (FS-X2F2H §Requirements 54)", () => {
    expect(relativeLuminance(AMBIENT.field)).toBeGreaterThan(relativeLuminance(AMBIENT.hub));
  });

  it("should light the hub warmer than a run", () => {
    expect(AMBIENT.hub).not.toBe(AMBIENT.run);
    const warmth = (c: number) => ((c >> 16) & 0xff) - (c & 0xff);
    expect(warmth(AMBIENT.hub)).toBeGreaterThan(warmth(AMBIENT.run));
  });

  it("should leave the run at its dark-barrow base: ambient is never lifted for readability", () => {
    // slate cooled toward necrotic; markers carry readability above the light-map instead
    expect(AMBIENT.run).toBe(mix(BARROW_HEX.slate, BARROW_HEX.necrotic, 0.4));
  });

  it("should light the tower interior darker than a run outdoors, by relative luminance (FS-8RBQY §B.6)", () => {
    expect(relativeLuminance(TOWER_AMBIENT)).toBeLessThan(
      relativeLuminance(AMBIENT.run),
    );
  });

  it("should mix the tower ambient from tokens: the run's cold slate sunk toward pitch", () => {
    expect(TOWER_AMBIENT).toBe(
      mix(
        mix(BARROW_HEX.slate, BARROW_HEX.necrotic, 0.3),
        BARROW_HEX.pitch,
        0.33,
      ),
    );
  });

  it("should leave the hub at its warm-dusk base", () => {
    expect(AMBIENT.hub).toBe(
      mix(BARROW_HEX.barrowBrown, BARROW_HEX.amberBright, 0.55),
    );
  });
});

describe("litEdgeGround", () => {
  const dirt = { r: 77, g: 64, b: 49 };
  const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
  const white = (1 << 24) - 1; // the multiply identity

  it("should leave the ground as baked under full light and no vignette", () => {
    expect(rgb(litEdgeGround(dirt, white, 0))).toEqual([77, 64, 49]);
  });

  it("should multiply the ground by the ambient", () => {
    const half = (128 << 16) | (128 << 8) | 128;
    expect(rgb(litEdgeGround(dirt, half, 0))).toEqual([39, 32, 25]);
  });

  it("should give the vignette's dark where the vignette is opaque", () => {
    expect(litEdgeGround(dirt, white, 1)).toBe(BARROW_HEX.pitch);
  });

  it("should only ever darken: a darker ambient or a deeper vignette never lightens the ground", () => {
    const lum = (c: number) => rgb(c).reduce((a, b) => a + b, 0);
    expect(lum(litEdgeGround(dirt, AMBIENT.run, 0.4))).toBeLessThan(
      lum(litEdgeGround(dirt, AMBIENT.hub, 0.4)),
    );
    expect(lum(litEdgeGround(dirt, AMBIENT.run, 0.5))).toBeLessThan(
      lum(litEdgeGround(dirt, AMBIENT.run, 0.2)),
    );
  });
});

describe("tinted", () => {
  const grass = { r: 81, g: 83, b: 53 };
  const white = (1 << 24) - 1;

  it("should leave a mean as baked under a white tint", () => {
    expect(tinted(grass, white)).toEqual(grass);
  });

  it("should multiply a mean by the tint, channel by channel, as the GPU tints a sprite", () => {
    const tint = (128 << 16) | (255 << 8) | 0;
    expect(tinted(grass, tint)).toEqual({ r: 41, g: 83, b: 0 });
  });
});

describe("groundMean", () => {
  const grass = { r: 81, g: 83, b: 53 };
  const tint = (128 << 16) | (255 << 8) | 0;

  it("should leave a ground with no tint and no lift as baked", () => {
    expect(groundMean(grass, {})).toEqual(grass);
  });

  it("should tint it as the GPU does", () => {
    expect(groundMean(grass, { tint })).toEqual(tinted(grass, tint));
  });

  it("should lift it by adding the tinted ground again at the lift's share", () => {
    expect(groundMean(grass, { tint, lift: 0.5 })).toEqual({ r: 62, g: 125, b: 0 });
  });

  it("should clip a lift at full", () => {
    expect(groundMean({ r: 200, g: 10, b: 0 }, { lift: 1 })).toEqual({ r: 255, g: 20, b: 0 });
  });
});
