// Furniture and fixtures: lamp post, brazier, table, chairs, barrels. Scales follow the spike:
// a delver stands about 1.6 tiles tall, so furniture is modelled at life size and scaled 1.5.

import * as THREE from "three";
import { rng } from "../noise.js";
import { materials } from "../materials.js";
import { part, rod, scaled, V3 } from "./util.js";

const BRAZIER_SCALE = 1.5;
const LAMP_SCALE = 1.2;

/** Model-space light points, for the manifest's declared light sources. */
export const BRAZIER_FLAME = [0, 0.98 * BRAZIER_SCALE, 0];
export const LAMP_GLASS = [0, 2.62 * LAMP_SCALE, 0];

/**
 * A three-legged iron brazier. The legs SPLAY outward from under the bowl to the ground; an
 * earlier upright-legged version read as a tree trunk from the iso camera.
 */
export function brazier() {
  const M = materials();
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    g.add(rod(V3(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36), V3(Math.cos(a) * 0.12, 0.66, Math.sin(a) * 0.12), 0.022, 0.018, M.iron));
  }
  const bowl = [
    [0.05, 0],
    [0.26, 0.04],
    [0.36, 0.14],
    [0.42, 0.2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(bowl, 20), M.ironDouble, { y: 0.64 }));
  g.add(part(new THREE.TorusGeometry(0.42, 0.018, 6, 28), M.brass, { y: 0.84, rx: Math.PI / 2 }));
  const R = rng(21);
  for (let i = 0; i < 4; i++)
    g.add(part(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 7), M.woodDark, { y: 0.86, rz: 1.2 + R() * 0.4, ry: i * 0.8 }));
  for (let i = 0; i < 16; i++)
    g.add(
      part(new THREE.SphereGeometry(0.045 + R() * 0.03, 6, 5), R() > 0.35 ? M.coal : M.black, {
        x: (R() - 0.5) * 0.5,
        y: 0.8 + R() * 0.06,
        z: (R() - 0.5) * 0.5,
      }),
    );
  for (let i = 0; i < 3; i++)
    g.add(part(new THREE.ConeGeometry(0.06, 0.24, 7), M.flame, { x: (R() - 0.5) * 0.2, y: 0.98, z: (R() - 0.5) * 0.2 }));
  return scaled(g, BRAZIER_SCALE);
}

export function lampPost() {
  const M = materials();
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.045, 0.07, 2.8, 8), M.iron, { y: 1.4 }));
  g.add(part(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 8), M.stone, { y: 0.06 }));
  g.add(part(new THREE.BoxGeometry(0.2, 0.28, 0.2), M.glass, { y: 2.62 }));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.025, 0.3, 0.025), M.iron, { x: sx * 0.1, y: 2.62, z: sz * 0.1 }));
  g.add(part(new THREE.ConeGeometry(0.17, 0.16, 4), M.iron, { y: 2.84, ry: Math.PI / 4 }));
  return scaled(g, LAMP_SCALE);
}

export function table() {
  const M = materials();
  const g = new THREE.Group();
  const w = M.woodDark;
  g.add(part(new THREE.BoxGeometry(1.7, 0.07, 0.85), w, { y: 0.74 }));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.07, 0.72, 0.07), w, { x: sx * 0.75, y: 0.36, z: sz * 0.35 }));
  g.add(part(new THREE.BoxGeometry(1.5, 0.05, 0.05), w, { y: 0.15 }));
  g.add(part(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 10), M.iron, { x: 0.35, y: 0.84, z: 0.1 }));
  g.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), M.vellum, { x: -0.2, y: 0.83 }));
  g.add(part(new THREE.ConeGeometry(0.012, 0.035, 6), M.flame, { x: -0.2, y: 0.9 }));
  g.add(part(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 16), M.iron, { x: 0.55, y: 0.785, z: -0.15 }));
  return scaled(g, 1.5);
}

/** A chair whose back is on the side opposite `facing` (s = sitter faces world +y). */
export function chair(facing) {
  const M = materials();
  const g = new THREE.Group();
  const w = M.wood;
  g.add(part(new THREE.BoxGeometry(0.45, 0.05, 0.45), w, { y: 0.45 }));
  g.add(part(new THREE.BoxGeometry(0.4, 0.05, 0.4), M.cushion, { y: 0.49 }));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.045, 0.45, 0.045), w, { x: sx * 0.19, y: 0.225, z: sz * 0.19 }));
  for (const sx of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.045, 0.55, 0.045), w, { x: sx * 0.19, y: 0.72, z: -0.19 }));
  g.add(part(new THREE.BoxGeometry(0.4, 0.08, 0.035), w, { y: 0.78, z: -0.19 }));
  g.add(part(new THREE.BoxGeometry(0.4, 0.08, 0.035), w, { y: 0.95, z: -0.19 }));
  g.rotation.y = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[facing];
  return scaled(g, 1.5);
}

export function barrel() {
  const M = materials();
  const g = new THREE.Group();
  const prof = [
    [0.26, 0],
    [0.3, 0.2],
    [0.32, 0.42],
    [0.3, 0.64],
    [0.26, 0.84],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(part(new THREE.LatheGeometry(prof, 20), M.staves));
  g.add(part(new THREE.CircleGeometry(0.26, 20), M.wood, { y: 0.84, rx: -Math.PI / 2 }));
  for (const [y, r] of [
    [0.1, 0.285],
    [0.42, 0.325],
    [0.74, 0.285],
  ])
    g.add(part(new THREE.TorusGeometry(r, 0.012, 6, 24), M.iron, { y, rx: Math.PI / 2 }));
  return scaled(g, 1.5);
}
