// The chapel's and the graveyard's props (FS-R4MYX §H R36) stand on the footprints the FS gives
// them: each model, built exactly as the catalogue builds it, measured in model space (one unit is
// one tile edge, 40 world px; +x is world +x, +z is world +y; the origin is the footprint's
// centre, the point the scene places it on).
//
// The bake page paints its materials on canvases; here every material is a plain one, since the
// measures read geometry only.

import { describe, it, expect, vi } from "vitest";

vi.mock("../materials.js", async () => {
  const THREE = await import("three");
  const any = new Proxy({}, { get: (t, k) => (t[k] ??= new THREE.MeshBasicMaterial()) });
  const make = () => new THREE.MeshBasicMaterial();
  return { materials: () => any, pixelTexture: () => null, plain: make, textured: make, glow: make, TONE: new Proxy({}, { get: () => [0, 0, 0] }) };
});
// the theme (BARROW) is served to the bake page only
vi.mock("../palette.js", () => ({ mix: () => [0, 0, 0], shade: () => [0, 0, 0], grey: () => [0, 0, 0] }));

const THREE = await import("three");
const {
  pew,
  chapelAltar,
  lectern,
  dais,
  belfry,
  headstone,
  graveFlowers,
  graveMound,
  stoneCross,
  graveyardWall,
  waysideCross,
  chapelCrucifix,
  chapelMural,
  HEADSTONES,
  MURALS,
  WALL_STATES,
} = await import("./chapel.js");
const { painting, HUNG } = await import("./hall.js");
const { WALL_BACK } = await import("./architecture.js");

/** World px to model units. */
const u = (px) => px / 40;

/** The model's box in model space, from its vertices. */
function boxOf(obj) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj, true);
  return { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z };
}

const HAIR = 0.02;

/** Every frame the catalogue bakes, by sheet: its builders. */
const FRAMES = {
  pew: [pew],
  chapel_altar: [chapelAltar],
  lectern: [lectern],
  dais: [dais],
  belfry: [belfry],
  headstone: Object.entries(HEADSTONES).flatMap(([state, list]) => list.map((_, i) => () => headstone(state, i))),
  grave_flowers: [() => graveFlowers("fresh"), () => graveFlowers("withered")],
  grave_mound: [graveMound],
  stone_cross: [stoneCross],
  graveyard_wall: ["x", "y"].flatMap((axis) => WALL_STATES.map((state) => () => graveyardWall(axis, state))),
  wayside_cross: [waysideCross],
};

/**
 * The footprint each sheet's every frame stays within, [x, z] world px about the origin (R12, R14,
 * R28–R30, the issue's sizes), and the most it may stand.
 */
const FOOTPRINT = {
  pew: { size: [20, 100], tallest: u(80) },
  chapel_altar: { size: [30, 80], tallest: u(80) },
  lectern: { size: [20, 20], tallest: u(90) },
  dais: { size: [130, 200], tallest: u(4) },
  // r 20 (R30): its silhouette within a tile about its spot
  belfry: { size: [40, 40], tallest: u(240) },
  headstone: { size: [26, 30], tallest: u(48) },
  grave_flowers: { size: [16, 16], tallest: u(8) },
  grave_mound: { size: [50, 28], tallest: u(14) },
  stone_cross: { size: [36, 36], tallest: u(120) },
  // one tile along its run (a hair of overlap, as a fence's rails), thin across it
  graveyard_wall: { size: [42, 42], tallest: u(30) },
  // r 20 (R41): a tall calvary on its steps, within a tile about its spot
  wayside_cross: { size: [40, 40], tallest: u(160) },
};

describe("the chapel's and the graveyard's props stand on their footprints (FS-R4MYX §H R36)", () => {
  it.each(Object.keys(FRAMES))("%s keeps every frame inside its footprint, on the ground, under its height", (sheet) => {
    const { size, tallest } = FOOTPRINT[sheet];
    FRAMES[sheet].forEach((build, i) => {
      const b = boxOf(build());
      const at = `${sheet} frame ${i}`;
      expect(b.x0, at).toBeGreaterThanOrEqual(-u(size[0]) / 2 - HAIR);
      expect(b.x1, at).toBeLessThanOrEqual(u(size[0]) / 2 + HAIR);
      expect(b.z0, at).toBeGreaterThanOrEqual(-u(size[1]) / 2 - HAIR);
      expect(b.z1, at).toBeLessThanOrEqual(u(size[1]) / 2 + HAIR);
      // nothing sinks far into the ground (a leaning or broken stone sits a hair into it)
      expect(b.y0, at).toBeGreaterThanOrEqual(-0.06);
      expect(b.y1, at).toBeLessThanOrEqual(tallest);
    });
  });

  it.each([
    ["pew", pew, [20, 100]],
    ["chapel_altar", chapelAltar, [30, 80]],
  ])("%s covers its server rect, so the drawn furnishing is what a player collides with (R12, R24)", (_sheet, build, [w, d]) => {
    const b = boxOf(build());
    expect(b.x1 - b.x0).toBeGreaterThanOrEqual(u(w) * 0.9);
    expect(b.z1 - b.z0).toBeGreaterThanOrEqual(u(d) * 0.9);
  });

  it("turns the pew's back to the east, its seat facing the altar in the west (R12)", () => {
    // the back is the tallest part: it rises from the pew's east half
    const g = pew();
    g.updateMatrixWorld(true);
    let backX = 0;
    let top = -Infinity;
    g.traverse((o) => {
      if (!o.isMesh) return;
      const b = new THREE.Box3().setFromObject(o, true);
      if (b.max.y > top) {
        top = b.max.y;
        backX = (b.min.x + b.max.x) / 2;
      }
    });
    expect(backX).toBeGreaterThan(0);
  });

  it("lays the dais flat: a low platform the altar stands on, drawn on the floor (R14)", () => {
    const b = boxOf(dais());
    expect(b.x1 - b.x0).toBeGreaterThanOrEqual(u(130) * 0.95);
    expect(b.z1 - b.z0).toBeGreaterThanOrEqual(u(200) * 0.95);
  });

  it("stands the belfry and the stone cross tall over every headstone, the belfry tallest (R30, R36)", () => {
    const top = (build) => boxOf(build()).y1;
    const stones = FRAMES.headstone.map(top);
    expect(top(stoneCross)).toBeGreaterThan(Math.max(...stones) * 1.5);
    expect(top(belfry)).toBeGreaterThan(top(stoneCross));
    // over a body's height and more: an occluder, as the town's tall dressing is
    expect(top(belfry)).toBeGreaterThan(4);
  });

  it("stands the wayside cross taller than the graveyard's stone cross, its arms along y so it faces east (R41)", () => {
    const b = boxOf(waysideCross());
    expect(b.y1).toBeGreaterThan(boxOf(stoneCross()).y1);
    expect(b.y1).toBeGreaterThan(3);
    // the cross-head: the widest part above the steps runs along y
    const g = waysideCross();
    g.updateMatrixWorld(true);
    let arms = null;
    g.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Box3().setFromObject(o, true);
      if (m.min.y > 2 && (!arms || m.max.z - m.min.z > arms.max.z - arms.min.z)) arms = m;
    });
    expect(arms.max.z - arms.min.z).toBeGreaterThan(3 * (arms.max.x - arms.min.x));
  });

  it("bakes headstones intact (two shapes), weathered (cracked, leaning, chipped) and broken (R36)", () => {
    expect(HEADSTONES.intact.length).toBeGreaterThanOrEqual(2);
    expect(HEADSTONES.weathered).toEqual(["cracked", "leaning", "chipped"]);
    expect(HEADSTONES.broken.length).toBeGreaterThanOrEqual(1);
  });

  it("faces every standing headstone east: its slab thin along x, broad along y (R28)", () => {
    for (const state of ["intact", "weathered"])
      HEADSTONES[state].forEach((name, i) => {
        // the slab alone: the tallest mesh
        const g = headstone(state, i);
        g.updateMatrixWorld(true);
        let slab = null;
        g.traverse((o) => {
          if (!o.isMesh) return;
          const b = new THREE.Box3().setFromObject(o, true);
          if (!slab || b.max.y > slab.max.y) slab = b;
        });
        expect(slab.max.x - slab.min.x, `${state} ${name}`).toBeLessThan(slab.max.z - slab.min.z);
      });
  });

  it("cuts a broken stump lower than any whole stone", () => {
    const top = (state, i) => boxOf(headstone(state, i)).y1;
    const whole = HEADSTONES.intact.map((_, i) => top("intact", i));
    for (let i = 0; i < HEADSTONES.broken.length; i++) expect(top("broken", i)).toBeLessThan(Math.min(...whole) * 0.7);
  });

  it("runs a wall tile along its axis, and stands a crumbled tile lower than a whole one (R29)", () => {
    expect(WALL_STATES).toEqual(["whole", "crumbled"]);
    for (const axis of ["x", "y"]) {
      const whole = boxOf(graveyardWall(axis, "whole"));
      const crumbled = boxOf(graveyardWall(axis, "crumbled"));
      const along = (b) => (axis === "x" ? b.x1 - b.x0 : b.z1 - b.z0);
      const across = (b) => (axis === "x" ? b.z1 - b.z0 : b.x1 - b.x0);
      expect(along(whole), axis).toBeGreaterThanOrEqual(0.98);
      expect(across(whole), axis).toBeLessThan(0.5);
      expect(crumbled.y1, axis).toBeLessThan(whole.y1);
    }
  });

  it("raises a fresh mound long along x, the grave running east from its head (R28)", () => {
    const b = boxOf(graveMound());
    expect(b.x1 - b.x0).toBeGreaterThan(b.z1 - b.z0);
  });
});

// The west wall's hung dressing behind the Confessor (FS-R4MYX §Change: The chapel's windows match
// inside and out, W9, W10): a crucifix and two frescoes, hung as the Inn's paintings are on a west
// wall (facing e, the back on the wall's face, the origin a hair in front of it), at their height.
describe("the crucifix and the murals hang on the west wall as the paintings do (FS-R4MYX W9, W10)", () => {
  /** The box of what a model draws, its frame guides left out. */
  function drawnBox(obj) {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3();
    obj.traverse((o) => {
      if (o.isMesh && o.visible) b.union(new THREE.Box3().setFromObject(o, true));
    });
    return { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z };
  }
  const centreY = (b) => (b.y0 + b.y1) / 2;
  const HUNG_PIECES = [
    ["chapel_crucifix", () => chapelCrucifix(), { across: 1.0, tall: 1.7 }],
    ["chapel_mural 0 (the saint)", () => chapelMural(0), { across: 1.6, tall: 1.3 }],
    ["chapel_mural 1 (the dead rising)", () => chapelMural(1), { across: 1.6, tall: 1.3 }],
  ];

  it.each(HUNG_PIECES)("%s hangs centred at the paintings' height, its top under the back wall's", (_name, build) => {
    const paintingE = drawnBox(painting("e", "portrait"));
    const b = drawnBox(build());
    expect(centreY(b)).toBeCloseTo(HUNG.y, 1);
    expect(centreY(b)).toBeCloseTo(centreY(paintingE), 1);
    expect(b.y1).toBeLessThan(WALL_BACK - 0.1);
  });

  it.each(HUNG_PIECES)("%s faces east: its back on the west wall's face, broad along y, about its indicative size", (_name, build, { across, tall }) => {
    const b = drawnBox(build());
    // the back against the wall's face, behind the origin as a painting's is
    expect(b.x0).toBeCloseTo(HUNG.back, 2);
    expect(b.x1 - b.x0).toBeLessThan(0.3);
    // broad along y (world), centred on the origin along the wall
    expect(b.z1 - b.z0).toBeGreaterThan(across * 0.9);
    expect(b.z1 - b.z0).toBeLessThan(across * 1.1);
    expect((b.z0 + b.z1) / 2).toBeCloseTo(0, 1);
    expect(b.y1 - b.y0).toBeGreaterThan(tall * 0.9);
    expect(b.y1 - b.y0).toBeLessThan(tall * 1.1);
  });

  it.each(HUNG_PIECES)("%s holds the anchor at its floor origin, as a painting does, so the scene stands it on the wall's foot", (_name, build) => {
    const g = build();
    g.updateMatrixWorld(true);
    const all = new THREE.Box3().setFromObject(g, true);
    expect(all.min.y).toBeLessThanOrEqual(0);
  });

  it("reads as a cross: a tall upright and a crossbar spanning its arms along the wall, a figure proud of it", () => {
    const g = chapelCrucifix();
    g.updateMatrixWorld(true);
    const meshes = [];
    g.traverse((o) => {
      if (o.isMesh && o.visible) meshes.push(new THREE.Box3().setFromObject(o, true));
    });
    const tallest = meshes.reduce((a, m) => (m.max.y - m.min.y > a.max.y - a.min.y ? m : a));
    const widest = meshes.reduce((a, m) => (m.max.z - m.min.z > a.max.z - a.min.z ? m : a));
    // the upright: much taller than it is broad
    expect(tallest.max.y - tallest.min.y).toBeGreaterThan(5 * (tallest.max.z - tallest.min.z));
    // the crossbar: in the upper part, much broader than tall
    expect(widest.max.z - widest.min.z).toBeGreaterThan(5 * (widest.max.y - widest.min.y));
    expect((widest.min.y + widest.max.y) / 2).toBeGreaterThan(centreY(drawnBox(g)));
    // the carved figure stands out from the cross's face, toward the room
    const face = tallest.max.x;
    expect(meshes.some((m) => m.max.x > face + 0.02)).toBe(true);
  });

  // that the two frames paint different scenes is held on the baked pixels (manifest.test.ts)
  it("names the murals' two scenes in frame order, on panels of one height, and refuses a third", () => {
    expect(MURALS).toEqual(["saint", "rising"]);
    const a = drawnBox(chapelMural(0));
    const b = drawnBox(chapelMural(1));
    expect(a.y1 - a.y0).toBeCloseTo(b.y1 - b.y0, 1);
    expect(() => chapelMural(2)).toThrow(/mural/);
  });
});
