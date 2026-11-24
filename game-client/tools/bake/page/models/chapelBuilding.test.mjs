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
const chapelBuilding = await import("./chapelBuilding.js");
const { chapelGable, OCULUS, FINIAL } = chapelBuilding;
const { GABLE_TUCK, gableRake } = await import("./building.js");
const { WALL_BACK, WALL_FRONT } = await import("./architecture.js");

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

// The lancet seen from inside (FS-R4MYX §Change: The chapel's windows match inside and out, W8): the
// inner face of a back wall piece, pierced by the same pointed window the outward face carries, so
// the window stands at the same height in both looks; its reveal splays wider into the room.
describe("the chapel's inner lancet (FS-R4MYX W8)", () => {
  const { chapelWall, chapelExterior, LANCET } = chapelBuilding;

  /** The dark glass on a piece: its one flat lancet-shaped pane, by its world box. */
  function glassOf(piece) {
    piece.updateMatrixWorld(true);
    const panes = [];
    piece.traverse((o) => {
      if (o.isMesh && o.visible && o.geometry.type === "ShapeGeometry") panes.push(new THREE.Box3().setFromObject(o, true));
    });
    return panes;
  }
  /** Every mesh's world box, drawn or a frame guide. */
  const whole = (piece) => {
    piece.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(piece, true);
  };
  const EPS = 1e-6;

  it.each(["x", "y"])("along %s, its glass is the outward lancet's own opening: the same sill, springing and half-width", (axis) => {
    const inner = glassOf(chapelWall(WALL_BACK, "lancet", axis, 1));
    const outer = glassOf(chapelExterior("lancet", axis, 2));
    expect(inner).toHaveLength(1);
    expect(outer).toHaveLength(1);
    const [i] = inner;
    const [o] = outer;
    // up the wall: from the sill to the apex over the springing, both looks alike
    expect(i.min.y).toBeCloseTo(LANCET.sill, 6);
    expect(i.min.y).toBeCloseTo(o.min.y, 6);
    expect(i.max.y).toBeCloseTo(o.max.y, 6);
    // along the wall: the half-width either side of the piece's centre
    const along = (b) => (axis === "x" ? [b.min.x, b.max.x] : [b.min.z, b.max.z]);
    expect(along(i)[0]).toBeCloseTo(-LANCET.half, 6);
    expect(along(i)[1]).toBeCloseTo(LANCET.half, 6);
    expect(along(i)).toEqual(along(o).map((v) => expect.closeTo(v, 6)));
  });

  it.each(["x", "y"])("along %s, the glass is set back in the wall, its reveal splaying wider into the room", (axis) => {
    const piece = chapelWall(WALL_BACK, "lancet", axis, 1);
    const [glass] = glassOf(piece);
    // the room side: +z for a wall along x (a north wall's inner face), +x along y (a west wall's)
    const out = (b) => (axis === "x" ? b.max.z : b.max.x);
    const plainFace = out(whole(chapelWall(WALL_BACK, "plain", axis, 1)));
    expect(out(glass)).toBeLessThan(plainFace - 0.08);
    // the reveal: the drawn surface round the opening, from the glass out to the face, wider and
    // lower at the face than the glass
    piece.updateMatrixWorld(true);
    let reveal = null;
    piece.traverse((o) => {
      if (o.isMesh && o.userData.reveal) reveal = new THREE.Box3().setFromObject(o, true);
    });
    expect(reveal).not.toBeNull();
    const along = (b) => (axis === "x" ? b.max.x - b.min.x : b.max.z - b.min.z);
    expect(along(reveal)).toBeGreaterThan(along(glass) + 0.06);
    expect(reveal.min.y).toBeLessThan(glass.min.y - 0.03);
    expect(reveal.max.y).toBeGreaterThan(glass.max.y);
    // no deeper than the wall: the window does not stand out of either face
    expect(out(reveal)).toBeLessThanOrEqual(plainFace + EPS);
  });

  it.each(["x", "y"])("along %s, it stands inside the plain back piece's frame guide, so it frames exactly as chapel_wall_back_plain", (axis) => {
    for (const seed of [1, 6]) {
      const lancet = whole(chapelWall(WALL_BACK, "lancet", axis, seed));
      const plainBox = whole(chapelWall(WALL_BACK, "plain", axis, seed));
      for (const k of ["x", "y", "z"]) {
        expect(lancet.min[k], `${axis} ${seed} min ${k}`).toBeCloseTo(plainBox.min[k], 6);
        expect(lancet.max[k], `${axis} ${seed} max ${k}`).toBeCloseTo(plainBox.max[k], 6);
      }
    }
  });

  it("is a back piece only: a cut-away front wall carries no window (W7)", () => {
    expect(() => chapelWall(WALL_FRONT, "lancet", "x", 3)).toThrow(/front/);
  });
});
