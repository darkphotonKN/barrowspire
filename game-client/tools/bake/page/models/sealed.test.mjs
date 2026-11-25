// The sealed floor's cell pieces (FS-5FZ4J §K R57) fit the cells the client lays them on: each
// model, built exactly as the catalogue builds it, measured in model space (one unit is one tile
// edge, 40 world px, so a floor cell of 80 px is 2; +x is world +x, +z is world +y; the origin is
// the cell's centre, the point the scene places it on).
//
// The bake page paints its materials on canvases; here every material is a plain one, since the
// measures read geometry only.

import { describe, it, expect, vi } from "vitest";

vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  const make = () => new THREE.MeshBasicMaterial();
  return { materials: () => any, pixelTexture: () => null, canvasTexture: () => null, mkCanvas: () => null, plain: make, textured: make };
});
// the theme (BARROW) is served to the bake page only
vi.mock("../palette.js", () => ({ color: () => null, cssRgb: () => "", mix: () => [0, 0, 0], shade: () => [0, 0, 0], grey: () => [0, 0, 0] }));
vi.mock("./tower.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  return { roughBox: (w, h, d) => new THREE.BoxGeometry(w, h, d), towerMaterials: () => any };
});

const THREE = await import("three");
const { CELL, bridgeCell, gate, pitCell, stoneBlock } = await import("./sealed.js");

/** The world-space box of `obj`, and of each of its meshes. */
function measure(obj) {
  obj.updateMatrixWorld(true);
  const meshes = [];
  obj.traverse((o) => o.isMesh && meshes.push(new THREE.Box3().setFromObject(o)));
  return { all: new THREE.Box3().setFromObject(obj), meshes };
}

const HALF = CELL / 2;
const near = (v, to) => expect(v).toBeCloseTo(to, 3);

describe("the sealed floor's cell pieces (FS-5FZ4J §K R57)", () => {
  it("makes a gate piece exactly one cell along its axis and thin across it, so a gate is one piece per cell", () => {
    for (const state of ["shut", "open"]) {
      const x = measure(gate(state, "x")).all;
      near(x.min.x, -HALF);
      near(x.max.x, HALF);
      expect(x.max.z - x.min.z).toBeLessThan(0.5);
      const y = measure(gate(state, "y")).all;
      near(y.min.z, -HALF);
      near(y.max.z, HALF);
      expect(y.max.x - y.min.x).toBeLessThan(0.5);
    }
  });

  it("winds an open gate's portcullis up clear of a delver's head (about 1.6 tile edges)", () => {
    // everything reaching above the sill and the shut spikes in its slot: the beam and the
    // portcullis's bars, straps and (open) its spiked foot
    const lowest = (state) => Math.min(...measure(gate(state, "x")).meshes.filter((b) => b.max.y > 0.2).map((b) => b.min.y));
    expect(lowest("shut")).toBeLessThan(0.3);
    expect(lowest("open")).toBeGreaterThan(1.6);
  });

  it("lays a pit cell and a bridge cell flat on their cell, reaching only a hair past it so neighbours meet", () => {
    const pieces = [...["open", "n", "w", "nw"].map((s) => pitCell(s)), bridgeCell("x"), bridgeCell("y")];
    for (const piece of pieces) {
      const b = measure(piece).all;
      for (const v of [b.min.x, b.min.z]) expect(v).toBeGreaterThanOrEqual(-HALF - 0.05);
      for (const v of [b.max.x, b.max.z]) expect(v).toBeLessThanOrEqual(HALF + 0.05);
      for (const v of [b.min.x, b.min.z]) expect(v).toBeLessThan(-HALF + 0.001);
      expect(b.max.y).toBeLessThan(0.15);
    }
  });

  it("fills a stone block a little short of its cell, so it reads apart from a wall it is pushed against", () => {
    const b = measure(stoneBlock()).all;
    for (const v of [b.min.x, b.min.z]) expect(v).toBeGreaterThan(-HALF);
    for (const v of [b.max.x, b.max.z]) expect(v).toBeLessThan(HALF);
    expect(b.max.x - b.min.x).toBeGreaterThan(0.75 * CELL);
  });
});
