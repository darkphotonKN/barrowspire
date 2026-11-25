// The chapel's bell tower (FS-R4MYX §Change: The chapel moves to the far left and gains a bell
// tower, T24): built exactly as the catalogue builds it and measured in model space (one unit is
// one tile edge, 40 world px; +x is world +x, +z is world +y, +y is up; the origin is the
// footprint's centre, on the ground).
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
    // a textured material keeps its map: the dressed stone is re-cut from it at each face's scale
    textured: (map) => new THREE.MeshBasicMaterial({ map }),
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
const { chapelTower, BELL_TOWER_FOOT, BELL_TOWER_SHAFT } = await import("./chapelTower.js");
const { WALL_BACK, ROOF_RISE } = await import("./architecture.js");
const { VIEW_DIR } = await import("../projection.js");

/** World px to model units. */
const u = (px) => px / 40;
const HAIR = 0.02;

/** The chapel's ridge: six slope rows a side over its back wall (T3's arithmetic), 7.8. */
const RIDGE = WALL_BACK + 6 * ROOF_RISE;
/** The stonework's top (T24 as amended, A4): raised so the whole belfry stage clears the chapel's roof. */
const MASONRY_TOP = 11;
/** The belfry stage's foot under its sill: the string course (its top 0.38 under the sill, 0.18 deep). */
const COURSE_UNDER_SILL = 0.56;
/** The east gable's cross tops out here (T24). */
const GABLE_CROSS = 9.7;

const tower = chapelTower();
tower.updateMatrixWorld(true);

/** A named part's box in model space. */
function boxOf(name) {
  const part = tower.getObjectByName(name);
  expect(part, name).toBeDefined();
  const b = new THREE.Box3().setFromObject(part, true);
  return { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z };
}

const masonry = boxOf("masonry");
/** The seen faces: the south (+z) and the east (+x), each by its outward normal and the axis along it. */
const FACES = {
  south: { out: new THREE.Vector3(0, 0, 1), along: new THREE.Vector3(1, 0, 0), face: BELL_TOWER_SHAFT / 2 },
  east: { out: new THREE.Vector3(1, 0, 0), along: new THREE.Vector3(0, 0, 1), face: BELL_TOWER_SHAFT / 2 },
};

/**
 * How deep a level ray shot at a face from outside goes into the masonry before it stops, `at`
 * along the face from its middle and `y` up: a hair on solid wall, the wall's thickness and more
 * through an opening.
 */
function depthAt(side, at, y) {
  const { out, along } = FACES[side];
  const from = out.clone().multiplyScalar(6).addScaledVector(along, at).setY(y);
  const hits = new THREE.Raycaster(from, out.clone().negate()).intersectObject(tower.getObjectByName("masonry"), true);
  return hits.length ? 6 - hits[0].distance : -Infinity;
}

/** Whether the face is open there: the ray goes in past the stonework's dressings. */
const open = (side, at, y) => FACES[side].face - depthAt(side, at, y) > 0.1;

/** The heights at which the face's middle is open, from `y0` to `y1`: [lowest, highest], or null. */
function opening(side, y0, y1) {
  const ys = [];
  for (let y = y0; y <= y1; y += 0.02) if (open(side, 0, y)) ys.push(y);
  return ys.length ? [ys[0], ys[ys.length - 1]] : null;
}

describe("the chapel's bell tower (FS-R4MYX §Change: the bell tower, T24)", () => {
  it("stands on its 140 × 140 footprint, the origin on its centre, covering the wall a player collides with (T6)", () => {
    expect(BELL_TOWER_FOOT).toBe(u(140));
    const all = new THREE.Box3().setFromObject(tower, true);
    for (const v of [all.min.x, all.min.z]) expect(v).toBeGreaterThanOrEqual(-u(140) / 2 - HAIR);
    for (const v of [all.max.x, all.max.z]) expect(v).toBeLessThanOrEqual(u(140) / 2 + HAIR);
    expect(all.min.y).toBeGreaterThanOrEqual(-HAIR);
    expect(masonry.x1 - masonry.x0).toBeGreaterThanOrEqual(u(140) * 0.9);
    expect(masonry.z1 - masonry.z0).toBeGreaterThanOrEqual(u(140) * 0.9);
    expect((masonry.x0 + masonry.x1) / 2).toBeCloseTo(0, 2);
    expect((masonry.z0 + masonry.z1) / 2).toBeCloseTo(0, 2);
  });

  it("raises its stonework to 11 edges (about 3 wall heights), give or take half an edge, the spire above it", () => {
    expect(masonry.y1).toBeGreaterThanOrEqual(MASONRY_TOP - 0.5);
    expect(masonry.y1).toBeLessThanOrEqual(MASONRY_TOP + 0.5);
    expect(masonry.y1 / WALL_BACK).toBeCloseTo(3, 0);
    const spire = boxOf("spire");
    expect(spire.y0).toBeGreaterThanOrEqual(masonry.y1 - 0.2);
    expect(spire.y1).toBeGreaterThan(masonry.y1 + 2);
  });

  it.each(["south", "east"])("opens the belfry on the %s face wholly above the chapel's ridge, its string course clear of it too", (side) => {
    const span = opening(side, 5, masonry.y1);
    expect(span, `${side} belfry opening`).not.toBeNull();
    const [sill, apex] = span;
    expect(sill - COURSE_UNDER_SILL).toBeGreaterThanOrEqual(RIDGE + 0.3);
    // a pointed head: narrower near its apex than at its sill
    const widthAt = (y) => {
      let w = 0;
      for (let at = -1.5; at <= 1.5; at += 0.02) if (open(side, at, y)) w += 0.02;
      return w;
    };
    expect(widthAt(sill + 0.2)).toBeGreaterThan(0.6);
    expect(widthAt(apex - 0.15)).toBeLessThan(widthAt(sill + 0.2) * 0.6);
    // stonework over its head, under the spire's eave
    expect(apex).toBeLessThan(masonry.y1 - 0.1);
  });

  it.each(["south", "east"])("keeps the lower stage solid on the %s face: no opening under the belfry's", (side) => {
    const [sill] = opening(side, 5, masonry.y1);
    for (let y = 0.1; y < sill - 0.1; y += 0.1) for (let at = -1.5; at <= 1.5; at += 0.1) expect(open(side, at, y), `${side} ${at.toFixed(1)}, ${y.toFixed(1)}`).toBe(false);
  });

  it("cuts one slit lancet, on the south face's lower stage, and none on the east", () => {
    const slits = [];
    tower.traverse((o) => o.name === "slit" && slits.push(o));
    expect(slits).toHaveLength(1);
    const b = new THREE.Box3().setFromObject(slits[0], true);
    // on the south face, about its middle, tall and narrow, under the belfry
    expect(b.max.z).toBeGreaterThanOrEqual(BELL_TOWER_SHAFT / 2);
    expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(0.05);
    expect(b.max.y - b.min.y).toBeGreaterThan(3 * (b.max.x - b.min.x));
    expect(b.max.y).toBeLessThan(opening("south", 5, masonry.y1)[0]);
  });

  it.each(["south", "east"])("hangs a bell seen through the %s opening, the whole bell above the chapel's ridge", (side) => {
    const { out, along, face } = FACES[side];
    const b = boxOf(`bell_${side}`);
    expect(b.y0).toBeGreaterThanOrEqual(RIDGE + 0.3);
    expect(b.y1).toBeLessThan(masonry.y1);
    // where the camera sees the bell's middle on the face's plane: carried along the view
    // direction from the bell out to the face
    const centre = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    const view = new THREE.Vector3(...VIEW_DIR);
    const t = (face - centre.dot(out)) / view.dot(out);
    expect(t).toBeGreaterThan(0);
    const seen = centre.clone().addScaledVector(view, t);
    expect(open(side, seen.dot(along), seen.y), `the bell's middle seen at ${seen.dot(along).toFixed(2)}, ${seen.y.toFixed(2)}`).toBe(true);
    // and its lip and crown both show inside the opening's height
    const [sill, apex] = opening(side, 5, masonry.y1);
    const rise = t * view.y;
    expect(b.y0 + rise).toBeGreaterThan(sill);
    expect(b.y1 + rise).toBeLessThan(apex);
  });

  it("tops the spire with a cross at least 2.5 edges over the east gable's cross, a little off true", () => {
    const cross = boxOf("cross");
    const spire = boxOf("spire");
    expect(cross.y1).toBeGreaterThanOrEqual(GABLE_CROSS + 2.5);
    expect(cross.y1).toBeGreaterThan(spire.y1);
    const lean = tower.getObjectByName("cross").rotation;
    const off = Math.abs(lean.x) + Math.abs(lean.z);
    expect(off).toBeGreaterThan(0.02);
    expect(off).toBeLessThan(0.3);
  });
});
