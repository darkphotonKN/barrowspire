import { describe, expect, it } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import {
  AMBIENT,
  contrastRatio,
  cullInto,
  flickerAt,
  litEdgeGround,
  sourceFromManifest,
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

  it("should light the hub warmer than a run", () => {
    expect(AMBIENT.hub).not.toBe(AMBIENT.run);
    const warmth = (c: number) => ((c >> 16) & 0xff) - (c & 0xff);
    expect(warmth(AMBIENT.hub)).toBeGreaterThan(warmth(AMBIENT.run));
  });

  it("should leave the run at its dark-barrow base: ambient is never lifted for readability", () => {
    // slate cooled toward necrotic; markers carry readability above the light-map instead
    expect(AMBIENT.run).toBe(mix(BARROW_HEX.slate, BARROW_HEX.necrotic, 0.4));
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
