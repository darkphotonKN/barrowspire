// Interactables, one model per server state (FS-2325V §B.4): door, escape door, switch,
// chest/container. Each state is framed with the others of its sheet, so a state swap changes
// the frame and never moves the sprite.

import * as THREE from "three";
import { rng } from "../noise.js";
import { mix, shade } from "../palette.js";
import { glow, materials, plain } from "../materials.js";
import { joint, part, scaled } from "./util.js";

const DOOR_H = 2.4;
const DOOR_W = 0.84;

function padlock(M, open) {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.12, 0.1, 0.05), M.brass, { y: 0 }));
  const shackle = part(new THREE.TorusGeometry(0.04, 0.012, 6, 14, Math.PI), M.iron, { y: 0.05 });
  if (open) {
    shackle.position.set(0.03, 0.07, 0.02);
    shackle.rotation.set(0, 0.9, 0.3);
  }
  g.add(shackle);
  return g;
}

/** A plank door in an oak frame. state: locked | unlocked | open. axis: x | y. */
export function door(state, axis) {
  const M = materials();
  const g = new THREE.Group();
  for (const sx of [-1, 1])
    g.add(part(new THREE.BoxGeometry(0.1, DOOR_H + 0.1, 0.24), M.beam, { x: sx * (DOOR_W / 2 + 0.05), y: (DOOR_H + 0.1) / 2 }));
  g.add(part(new THREE.BoxGeometry(DOOR_W + 0.3, 0.14, 0.26), M.beam, { y: DOOR_H + 0.12 }));
  g.add(part(new THREE.BoxGeometry(DOOR_W + 0.2, 0.05, 0.3), M.stone, { y: 0.025 }));

  const hinge = joint(g, -DOOR_W / 2, 0, 0);
  const leaf = new THREE.Group();
  hinge.add(leaf);
  const planks = 5;
  const pw = DOOR_W / planks;
  const R = rng(axis === "x" ? 31 : 37);
  for (let i = 0; i < planks; i++)
    leaf.add(
      part(new THREE.BoxGeometry(pw - 0.008, DOOR_H - 0.04 - R() * 0.03, 0.07), M.wood, {
        x: pw * (i + 0.5),
        y: DOOR_H / 2,
      }),
    );
  for (const y of [0.4, DOOR_H - 0.45])
    leaf.add(part(new THREE.BoxGeometry(DOOR_W - 0.04, 0.07, 0.085), M.iron, { x: DOOR_W / 2, y }));
  leaf.add(part(new THREE.TorusGeometry(0.05, 0.01, 6, 16), M.iron, { x: DOOR_W - 0.16, y: 1.1, z: 0.05 }));

  if (state === "locked") {
    leaf.add(part(new THREE.BoxGeometry(DOOR_W + 0.18, 0.09, 0.06), M.iron, { x: DOOR_W / 2, y: 1.2, z: 0.07 }));
    const lock = padlock(M, false);
    lock.position.set(DOOR_W - 0.14, 1.08, 0.1);
    leaf.add(lock);
  } else {
    const lock = padlock(M, true);
    lock.position.set(DOOR_W - 0.14, 1.0, 0.07);
    leaf.add(lock);
  }
  if (state === "open") hinge.rotation.y = -Math.PI * 0.46;

  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/**
 * The way out: a stone arch with an iron portcullis and a rune keystone. Locked: gate down,
 * runes cold. Unlocked: gate down, runes lit arcane green (the canvas's "safe" channel). Open:
 * gate raised, the passage beyond lit.
 */
export function escapeDoor(state, axis) {
  const M = materials();
  const g = new THREE.Group();
  const W = 1.1;
  const H = 2.2;
  const stone = M.stone;
  for (const sx of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.34, H, 0.44), stone, { x: sx * (W / 2 + 0.17), y: H / 2 }));
    g.add(part(new THREE.BoxGeometry(0.42, 0.12, 0.5), M.cap, { x: sx * (W / 2 + 0.17), y: 0.06 }));
  }
  const arch = new THREE.TorusGeometry(W / 2 + 0.17, 0.17, 8, 18, Math.PI);
  g.add(part(arch, stone, { y: H, sz: 1.3 }));
  const lit = state !== "locked";
  const runeMat = lit ? M.arcane : plain(shade("necrotic", 0.45), { rough: 0.6 });
  g.add(part(new THREE.BoxGeometry(0.26, 0.3, 0.1), runeMat, { y: H + W / 2 + 0.17, z: 0.2 }));
  for (const sx of [-1, 1])
    g.add(part(new THREE.BoxGeometry(0.06, 0.5, 0.02), runeMat, { x: sx * (W / 2 + 0.17), y: 1.3, z: 0.225 }));

  // The passage: a dark recess, lit when open.
  g.add(part(new THREE.PlaneGeometry(W, H + W / 2), state === "open" ? glow(mix("arcane", "vellum", 0.3), 0.9) : M.black, { y: (H + W / 2) / 2, z: -0.18 }));

  const gate = new THREE.Group();
  const bars = 6;
  for (let i = 0; i < bars; i++)
    gate.add(part(new THREE.BoxGeometry(0.04, H + 0.2, 0.04), M.iron, { x: -W / 2 + (W / (bars - 1)) * i * 0.96 + 0.02, y: (H + 0.2) / 2 }));
  for (const y of [0.35, 1.1, 1.85]) gate.add(part(new THREE.BoxGeometry(W, 0.05, 0.05), M.iron, { y }));
  for (let i = 0; i < bars; i++)
    gate.add(part(new THREE.ConeGeometry(0.03, 0.1, 6), M.iron, { x: -W / 2 + (W / (bars - 1)) * i * 0.96 + 0.02, y: -0.04, rx: Math.PI }));
  if (state === "open") gate.position.y = H * 0.82;
  g.add(gate);

  if (axis === "y") g.rotation.y = Math.PI / 2;
  return g;
}

/** A floor lever on a stone plinth. Active: thrown forward, rune lit. */
export function lever(state) {
  const M = materials();
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.5, 0.18, 0.4), M.stone, { y: 0.09 }));
  g.add(part(new THREE.BoxGeometry(0.56, 0.05, 0.46), M.cap, { y: 0.02 }));
  const active = state === "active";
  g.add(part(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), active ? M.arcane : plain(shade("necrotic", 0.4)), { x: 0.14, y: 0.19, z: 0.1 }));
  const pivot = joint(g, 0, 0.2, 0);
  pivot.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), M.iron, { rz: Math.PI / 2 }));
  const arm = joint(pivot, 0, 0, 0);
  arm.add(part(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 8), M.iron, { y: 0.25 }));
  arm.add(part(new THREE.SphereGeometry(0.045, 10, 8), M.brass, { y: 0.52 }));
  arm.rotation.x = active ? 0.75 : -0.75;
  return scaled(g, 1.2);
}

/** A banded coffer. Open: lid thrown back, coin glinting inside. */
export function chest(state) {
  const M = materials();
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.9, 0.45, 0.55), M.wood, { y: 0.225 }));
  for (const sx of [-0.3, 0.3]) g.add(part(new THREE.BoxGeometry(0.06, 0.47, 0.57), M.iron, { x: sx, y: 0.235 }));
  g.add(part(new THREE.BoxGeometry(0.1, 0.12, 0.02), M.brass, { y: 0.36, z: 0.285 }));
  const pv = joint(g, 0, 0.45, -0.275);
  pv.add(part(new THREE.BoxGeometry(0.92, 0.14, 0.57), M.wood, { y: 0.07, z: 0.275 }));
  for (const sx of [-0.3, 0.3]) pv.add(part(new THREE.BoxGeometry(0.06, 0.16, 0.59), M.iron, { x: sx, y: 0.07, z: 0.275 }));
  if (state === "open") {
    pv.rotation.x = -1.9;
    g.add(part(new THREE.BoxGeometry(0.84, 0.02, 0.49), M.black, { y: 0.44 }));
    const R = rng(4);
    for (let i = 0; i < 16; i++)
      g.add(
        part(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 12), M.gold, {
          x: (R() - 0.5) * 0.7,
          y: 0.45 + R() * 0.04,
          z: (R() - 0.5) * 0.4,
          rx: (R() - 0.5) * 0.6,
          rz: (R() - 0.5) * 0.6,
        }),
      );
  }
  return scaled(g, 1.5);
}
