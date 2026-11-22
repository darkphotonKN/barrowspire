// The Pyromancer's singed hem (FS-1J1CB R4, fabrics.js `emberHem`): ember specks in the fire ramp
// painted into the gown's emissive map, crowded at the hem's edge and gone before the band's top,
// so the black clamped above the band lights nothing of the gown. Painted on a canvas that keeps
// its pixels, over BARROW's own tones (palette.js reads them from a browser-only module).

import { describe, it, expect, vi } from "vitest";
import { BARROW } from "../../../../src/utils/theme";

vi.mock("../palette.js", async () => {
  const THREE = await import("three");
  const { BARROW: B } = await import("../../../../src/utils/theme");
  const rgb = (c) => {
    if (typeof c !== "string") return c;
    const n = parseInt(B[c].slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a, b, t) => rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t);
  const shade = (c, v) => rgb(c).map((x) => x * v);
  const grey = (v) => [v, v, v];
  const color = (c) => new THREE.Color(...rgb(c).map((v) => v / 255));
  return { rgb, mix, shade, grey, color, normalized: (c) => c, cssRgb: () => "" };
});
/** A canvas whose 2D context keeps the pixels put to it. */
const keepingCanvas = (width, height) => {
  let data = new Uint8ClampedArray(width * height * 4);
  const ctx = new Proxy(
    {
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img) => (data = img.data),
      getImageData: () => ({ width, height, data }),
    },
    { get: (t, k) => (k in t ? t[k] : () => {}) },
  );
  return { width, height, getContext: () => ctx, pixels: () => data };
};
vi.mock("../materials.js", () => ({ mkCanvas: keepingCanvas }));

const THREE = await import("three");
const { EMBER_BAND, emberHem } = await import("./fabrics.js");

/** The tile's pixels as rows, row 0 the hem's edge. */
function rows(t) {
  const { width, height } = t.image;
  const px = t.image.pixels();
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => [...px.slice((y * width + x) * 4, (y * width + x) * 4 + 3)]));
}
const lit = (c) => c[0] + c[1] + c[2] > 0;

describe("the Pyromancer's ember hem (FS-1J1CB R4)", () => {
  const t = emberHem();
  const R = rows(t);

  it("repeats round the gown and clamps up it, on a band EMBER_BAND H tall", () => {
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    expect(t.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(t.userData.band).toBe(EMBER_BAND);
    expect(EMBER_BAND).toBeGreaterThan(0.04);
    expect(EMBER_BAND).toBeLessThan(0.1);
  });

  it("crowds the embers at the hem and leaves the band's top quarter black, so nothing above the band glows", () => {
    const count = (ys) => ys.reduce((n, y) => n + R[y].filter(lit).length, 0);
    const h = R.length;
    const quarter = Math.floor(h / 4);
    expect(count([...Array(quarter).keys()])).toBeGreaterThan(count([...Array(quarter).keys()].map((y) => y + quarter)));
    for (let y = h - quarter; y < h; y++) expect(R[y].filter(lit), `row ${y}`).toHaveLength(0);
    // a speckle, not a band of light: well under half the hem's quarter lit
    expect(count([...Array(quarter).keys()]) / (quarter * R[0].length)).toBeLessThan(0.4);
    expect(count([...Array(quarter).keys()])).toBeGreaterThan(0);
  });

  it("lights them in the fire ramp only: red over green over blue, never past fireCore", () => {
    const core = (() => {
      const n = parseInt(BARROW.fireCore.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    })();
    for (const row of R)
      for (const c of row.filter(lit)) {
        expect(c[0]).toBeGreaterThanOrEqual(c[1]);
        expect(c[1]).toBeGreaterThanOrEqual(c[2]);
        c.forEach((v, i) => expect(v).toBeLessThanOrEqual(core[i]));
      }
  });
});
