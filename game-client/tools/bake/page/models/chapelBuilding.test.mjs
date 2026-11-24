// The chapel's gable ends (FS-R4MYX §I R42): the apex piece, the one planGables lays against the
// ridge (frame 1 of each gable animation), carries its half of the rose window and of the cross
// finial; the plain piece (frame 0) carries neither. Built exactly as the catalogue builds them and
// measured in model space (one unit is one tile edge; +y is up; the origin is the piece's foot).
//
// The bake page paints its textures on canvases; here a canvas is a blank stand-in of the right
// size and every shared material a plain one, since the measures read geometry only.

import { describe, it, expect, vi } from "vitest";

vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  // pixel reads and writes are real (blank) buffers; every other drawing call does nothing
  const anything = new Proxy(function () {}, { get: () => anything, apply: () => anything, set: () => true });
  const pixels = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  };
  const ctx = new Proxy(pixels, { get: (t, k) => (k in t ? t[k] : anything), set: () => true });
  const mkCanvas = (width, height) => ({ width, height, getContext: () => ctx });
  const texture = (c) => new THREE.Texture(c);
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  const make = () => new THREE.MeshBasicMaterial();
  return {
    mkCanvas,
    canvasTexture: texture,
    pixelTexture: (w, h) => texture(mkCanvas(w, h)),
    materials: () => any,
    plain: make,
    textured: make,
    glow: make,
    leafTexture: () => null,
    TONE: new Proxy({}, { get: () => [0, 0, 0] }),
  };
});
// the theme (BARROW) is served to the bake page only
vi.mock("../palette.js", () => ({
  mix: () => [0, 0, 0],
  shade: () => [0, 0, 0],
  grey: () => [0, 0, 0],
  cssRgb: () => "rgb(0 0 0)",
  color: () => 0,
  normalized: () => [0, 0, 0],
  rgb: () => [0, 0, 0],
}));

const THREE = await import("three");
const { chapelGable, OCULUS, FINIAL } = await import("./chapelBuilding.js");
const { GABLE_TUCK, gableRake } = await import("./building.js");

/** Every round of glass on a piece: the rose window's discs. */
function roseGlass(piece) {
  const found = [];
  piece.traverse((o) => {
    if (o.isMesh && o.geometry.type === "CircleGeometry" && o.geometry.parameters.radius === OCULUS.r) found.push(o);
  });
  return found;
}

/** The highest point of a piece's drawn meshes over its foot. */
function topOf(piece) {
  piece.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(piece, true).max.y;
}

const HALVES = [
  ["x", "s"],
  ["x", "n"],
  ["y", "e"],
  ["y", "w"],
];

describe("the chapel's gable ends (FS-R4MYX R42)", () => {
  it.each(HALVES)("the %s ridge's %s apex piece carries its half of the rose window; its plain piece none", (axis, half) => {
    const apex = roseGlass(chapelGable(axis, half, true));
    expect(apex).toHaveLength(1);
    // half a disc (and a hair over, so the halves meet), on the outward face
    expect(apex[0].geometry.parameters.thetaLength).toBeGreaterThanOrEqual(Math.PI);
    expect(apex[0].geometry.parameters.thetaLength).toBeLessThan(Math.PI * 1.1);
    expect(roseGlass(chapelGable(axis, half))).toHaveLength(0);
  });

  it.each(HALVES)("the %s ridge's %s rose window lies on the gable's face, under its raking edge", (axis, half) => {
    const { topAt, highAt } = gableRake(axis, half);
    const [glass] = roseGlass(chapelGable(axis, half, true));
    // the moulded ring stands past the glass; the whole of it stays under the raking edge across
    // the half it spans (the window's centre is on the seam, half a tile in on the high side)
    const ring = OCULUS.r + OCULUS.ring;
    const seam = highAt * 0.5;
    const cy = glass.position.y;
    expect(cy).toBeCloseTo(topAt(seam) - OCULUS.below, 6);
    for (let k = 0; k <= 10; k++) {
      const a = (Math.PI * k) / 10;
      const x = seam - highAt * Math.sin(a) * ring;
      expect(cy + Math.cos(a) * ring, `at ${a.toFixed(2)} rad`).toBeLessThan(topAt(x) - GABLE_TUCK);
    }
  });

  it.each(HALVES)("the %s ridge's %s apex piece carries the cross FINIAL.height over its foot on the ridge", (axis, half) => {
    const { height, topAt, highAt } = gableRake(axis, half);
    expect(topOf(chapelGable(axis, half))).toBeCloseTo(height, 6);
    // the finial stands on the seam with the other half's apex piece, on the ridge line less the
    // tuck the gable reaches up into the roof
    const ridge = topAt(highAt * 0.5);
    expect(topOf(chapelGable(axis, half, true))).toBeCloseTo(ridge - GABLE_TUCK + FINIAL.height, 6);
  });
});
