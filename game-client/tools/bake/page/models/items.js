// Item icons for the container view (FS-2325V §B.4, §D): each item modelled small, laid on the
// ground plane, and baked centred in a fixed square slot with its own shadow. `generic` is the
// fallback for any item with no mapped icon.
//
// Icon names are categories, not item names: slice 4 maps a server item onto one of these by its
// fields (weapon_type, armor_slot, healing/mana amount), and anything unmapped gets `generic`.
// Gear (weapons, armour, rings) comes from gear.js, in four tiers by item level.

import * as THREE from "three";
import { rng } from "../noise.js";
import { color, mix, shade } from "../palette.js";
import { materials, plain } from "../materials.js";
import { gearIcons } from "./gear.js";
import { part, scaled } from "./util.js";

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
  ...gearIcons(),
  potion_health: () => scaled(bottle(materials(), "oxblood", shade("oxblood", 0.5)), 2.4),
  potion_mana: () => scaled(bottle(materials(), mix("necrotic", "slate", 0.2), shade("necrotic", 0.35)), 2.4),
  vial_tonic: () => scaled(bottle(materials(), "arcane", shade("arcaneDeep", 0.5)), 2.1),
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
