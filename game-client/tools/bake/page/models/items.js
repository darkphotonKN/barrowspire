// Item icons for the container view (FS-2325V §B.4, §D): each item modelled small, laid on the
// ground plane, and baked centred in a fixed square slot with its own shadow. `generic` is the
// fallback for any item with no mapped icon.
//
// Icon names are categories, not item names: slice 4 maps a server item onto one of these by its
// fields (weapon_type, armor_slot, healing/mana amount), and anything unmapped gets `generic`.

import * as THREE from "three";
import { rng } from "../noise.js";
import { color, mix, shade } from "../palette.js";
import { materials, plain } from "../materials.js";
import { part, scaled } from "./util.js";

function blade(M, len, width) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, len * 0.85);
  shape.lineTo(0, len);
  shape.lineTo(-width / 2, len * 0.85);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
  g.add(part(geo, M.steel, { z: -0.006 }));
  return g;
}

function sword(M, len = 0.9, width = 0.07) {
  const g = new THREE.Group();
  const b = blade(M, len, width);
  b.position.y = 0.2;
  g.add(b);
  g.add(part(new THREE.BoxGeometry(0.26, 0.035, 0.05), M.brass, { y: 0.2 }));
  g.add(part(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 8), M.leather, { y: 0.1 }));
  g.add(part(new THREE.SphereGeometry(0.035, 10, 8), M.brass, { y: 0.0 }));
  return g;
}

/** Lays a long object flat on the ground at a slight diagonal. */
const laid = (g, yaw = 0, s = 1) => {
  g.rotation.set(-Math.PI / 2, 0, 0);
  g.position.y = 0.04;
  const w = new THREE.Group();
  w.add(g);
  w.rotation.y = yaw;
  return scaled(w, s);
};

function bottle(M, liquid, glowTone) {
  const g = new THREE.Group();
  const prof = [
    [0, 0],
    [0.1, 0],
    [0.12, 0.04],
    [0.12, 0.16],
    [0.05, 0.22],
    [0.035, 0.28],
    [0.04, 0.3],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(
    part(
      new THREE.LatheGeometry(prof, 18),
      new THREE.MeshStandardMaterial({ color: color(liquid), emissive: color(glowTone), roughness: 0.15, metalness: 0.1 }),
    ),
  );
  g.add(part(new THREE.CylinderGeometry(0.03, 0.028, 0.06, 10), M.wood, { y: 0.32 }));
  return g;
}

export const ICONS = {
  sword: () => laid(sword(materials()), -0.25),
  dagger: () => laid(sword(materials(), 0.42, 0.06), -0.25),
  bow: () => {
    const M = materials();
    const g = new THREE.Group();
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0.28, 0, 0), new THREE.Vector3(0, 0.5, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.022, 6), M.wood));
    g.add(part(new THREE.CylinderGeometry(0.004, 0.004, 1.0, 4), M.vellum));
    g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), M.leather, { x: 0.2 }));
    return laid(g, -0.25);
  },
  staff: () => {
    const M = materials();
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.022, 0.028, 1.1, 8), M.woodDark, { y: 0.55 }));
    g.add(part(new THREE.OctahedronGeometry(0.06, 0), M.arcane, { y: 1.15 }));
    return laid(g, -0.25);
  },
  helm: () => {
    const M = materials();
    const g = new THREE.Group();
    g.add(part(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.steel, { y: 0.06, sy: 1.1 }));
    g.add(part(new THREE.CylinderGeometry(0.162, 0.17, 0.08, 16, 1, true), M.steel, { y: 0.05 }));
    g.add(part(new THREE.BoxGeometry(0.03, 0.12, 0.05), M.steel, { y: 0.06, z: 0.16 }));
    g.add(part(new THREE.BoxGeometry(0.14, 0.02, 0.02), M.black, { y: 0.1, z: 0.155 }));
    return scaled(g, 2.2);
  },
  cuirass: () => {
    const M = materials();
    const g = new THREE.Group();
    const prof = [
      [0.13, 0],
      [0.16, 0.08],
      [0.18, 0.2],
      [0.16, 0.3],
      [0.08, 0.34],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    g.add(part(new THREE.LatheGeometry(prof, 16), M.steel, { sz: 0.6 }));
    g.add(part(new THREE.TorusGeometry(0.14, 0.012, 6, 20), M.brass, { y: 0.02, rx: Math.PI / 2, sy: 0.6 }));
    const w = new THREE.Group();
    g.rotation.x = -Math.PI / 2 + 0.1;
    g.position.y = 0.1;
    w.add(g);
    return scaled(w, 2);
  },
  gauntlets: () => {
    const M = materials();
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const h = new THREE.Group();
      h.add(part(new THREE.BoxGeometry(0.09, 0.04, 0.12), M.leather, { y: 0.02 }));
      h.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), M.steel, { y: 0.03, z: -0.1, rx: Math.PI / 2 }));
      for (let f = 0; f < 4; f++) h.add(part(new THREE.BoxGeometry(0.018, 0.02, 0.06), M.steel, { x: -0.03 + f * 0.02, y: 0.03, z: 0.08 }));
      h.position.set(sx * 0.08, 0, 0);
      h.rotation.y = sx * 0.3;
      g.add(h);
    }
    return scaled(g, 2.4);
  },
  greaves: () => {
    const M = materials();
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const l = part(new THREE.CylinderGeometry(0.05, 0.04, 0.4, 10, 1, true), M.steel, { x: sx * 0.07, y: 0.05, rx: Math.PI / 2, rz: sx * 0.08 });
      g.add(l);
      g.add(part(new THREE.SphereGeometry(0.052, 10, 8), M.steel, { x: sx * 0.07, y: 0.05, z: -0.2, sy: 0.8 }));
    }
    return scaled(g, 2.2);
  },
  potion_health: () => scaled(bottle(materials(), "oxblood", shade("oxblood", 0.5)), 2.4),
  potion_mana: () => scaled(bottle(materials(), mix("necrotic", "slate", 0.2), shade("necrotic", 0.35)), 2.4),
  vial_tonic: () => scaled(bottle(materials(), "arcane", shade("arcaneDeep", 0.5)), 2.1),
  ring: () => {
    const M = materials();
    const g = new THREE.Group();
    g.add(part(new THREE.TorusGeometry(0.07, 0.018, 10, 24), M.gold, { y: 0.03, rx: 1.35 }));
    g.add(part(new THREE.SphereGeometry(0.028, 10, 8), M.ember, { y: 0.1, z: -0.02 }));
    return scaled(g, 2.4);
  },
  coins: () => {
    const M = materials();
    const g = new THREE.Group();
    const R = rng(12);
    for (let i = 0; i < 18; i++)
      g.add(
        part(new THREE.CylinderGeometry(0.06, 0.06, 0.014, 16), M.gold, {
          x: (R() - 0.5) * 0.3,
          y: 0.01 + R() * 0.06 * (1 - Math.abs(R() - 0.5)),
          z: (R() - 0.5) * 0.3,
          rx: (R() - 0.5) * 0.7,
          rz: (R() - 0.5) * 0.7,
        }),
      );
    return scaled(g, 2.4);
  },
  gem: () => {
    const g = new THREE.Group();
    g.add(part(new THREE.OctahedronGeometry(0.1, 0), plain(mix("oxblood", "necrotic", 0.35), { rough: 0.12, metal: 0.2, flat: true, emissive: shade("oxblood", 0.35) }), { y: 0.1, sy: 1.4, rz: 1.25, ry: 0.5 }));
    return scaled(g, 2.4);
  },
  scroll: () => {
    const M = materials();
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 14), M.vellum, { y: 0.05, rz: Math.PI / 2 }));
    g.add(part(new THREE.TorusGeometry(0.053, 0.01, 6, 16), M.crimson, { y: 0.05, ry: Math.PI / 2 }));
    g.rotation.y = -0.5;
    return scaled(g, 2.4);
  },
  skull: () => {
    const M = materials();
    const g = new THREE.Group();
    g.add(part(new THREE.SphereGeometry(0.12, 16, 12), M.bone, { y: 0.14, sz: 1.15 }));
    g.add(part(new THREE.BoxGeometry(0.13, 0.07, 0.12), M.bone, { y: 0.05, z: 0.04 }));
    for (const sx of [-1, 1]) g.add(part(new THREE.SphereGeometry(0.03, 8, 6), M.black, { x: sx * 0.045, y: 0.14, z: 0.118, sz: 0.45 }));
    g.rotation.y = 0.4;
    return scaled(g, 1.9);
  },
  /** Fallback: a tied cloth pouch — "something", whatever it is. */
  generic: () => {
    const M = materials();
    const g = new THREE.Group();
    const prof = [
      [0, 0],
      [0.13, 0.02],
      [0.17, 0.09],
      [0.15, 0.17],
      [0.06, 0.23],
      [0.05, 0.26],
      [0.09, 0.31],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    g.add(part(new THREE.LatheGeometry(prof, 16), M.leather));
    g.add(part(new THREE.TorusGeometry(0.055, 0.012, 6, 14), M.crimson, { y: 0.235, rx: Math.PI / 2 }));
    return scaled(g, 2.2);
  },
};
