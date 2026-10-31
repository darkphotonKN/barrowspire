// Interactables, one model per server state (FS-2325V §B.4): door, escape door, switch,
// chest/container. Each state is framed with the others of its sheet, so a state swap changes
// the frame and never moves the sprite.

import * as THREE from "three";
import { fbm, rng, smoothstep, vnoise, vnoise3 } from "../noise.js";
import { mix, shade } from "../palette.js";
import { glow, materials, pixelTexture, plain, textured } from "../materials.js";
import { joint, part, scaled, V3 } from "./util.js";

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

// The sack's cloth: coarse burlap, a loose weave over slubbed, grimy fibre. Made once per bake
// (seeded, so deterministic) from the chest's palette, a shade humbler than its oak.
const BURLAP = mix(mix("barrowBrown", "brass", 0.5), "vellumDark", 0.3);
let SACK = null;
function sackMaterials() {
  if (SACK) return SACK;
  const weave = (s) =>
    pixelTexture(128, 128, (x, y) => {
      const warp = x % 4 < 2 ? 1 : 0.84;
      const weft = y % 4 < 2 ? 1 : 0.86;
      const slub = 0.9 + 0.18 * vnoise(x / 1.5, y / 18, s + 2);
      const grime = 1 - 0.22 * smoothstep(0.5, 0.78, fbm(x / 22, y / 22, s + 4));
      return shade(BURLAP, (0.66 + 0.42 * fbm(x / 12, y / 12, s)) * warp * weft * slub * grime);
    }, 3);
  SACK = {
    burlap: textured(weave(61), { bump: 0.9, rough: 1, side: THREE.DoubleSide }),
    thong: plain(mix("barrowDeep", "ember", 0.28), { rough: 0.7 }),
    dark: plain(mix("pitch", "barrowDeep", 0.25), { rough: 1, side: THREE.DoubleSide }),
  };
  return SACK;
}

/**
 * A sack's body: a lathe of `profile` ([radius, height] in r, h units), slumped onto the floor
 * and lumpy with whatever is inside it. Above `neck` (a height fraction) the cloth is gathered
 * into pleats that fan out below the tie and fade down the belly.
 */
function sackBody(profile, r, h, neck, seed, { pleats = 9, crown = 0.3, slump = 0.14 } = {}) {
  const geo = new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x * r, y * h)),
    40,
  );
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const R = rng(seed);
  const phase = R() * Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.y / h;
    const a = Math.atan2(v.z, v.x);
    const n = vnoise3(v.x * 7, v.y * 7, v.z * 7, seed);
    const fine = vnoise3(v.x * 22, v.y * 22, v.z * 22, seed + 1);
    // gathered folds: deepest at the tie, fading out down the belly; flaring above it
    const below = smoothstep(neck - 0.45, neck, t) * (t <= neck ? 1 : 0);
    const above = t > neck ? crown : 0;
    const fold = Math.sin(a * pleats + phase + n * 2.2);
    let k = 1 + (below * 0.2 + above) * fold + (n - 0.5) * 0.22 + (fine - 0.5) * 0.05;
    // the weight settles low: the belly bulges, mostly toward the front
    const belly = smoothstep(0.55, 0.05, t);
    k *= 1 + belly * slump;
    pos.setXYZ(i, v.x * k, v.y * (1 + (n - 0.5) * 0.06), v.z * k * 0.9);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A leather thong lying along `pts` (a curve of [x, y, z]). */
function thong(M, pts, r = 0.014) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => V3(x, y, z)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, r, 6, false), M.thong);
}

/**
 * A burlap sack, the chest's humbler cousin (FS-1D6BX R17). Closed: tied at the neck with a
 * leather thong, the cloth above the tie fanned into a ruff, the belly slumped and lumpy with
 * what it holds. Open: the thong slipped and lying loose, the neck fallen open and rolled down,
 * the dark inside showing a glint of coin, one coin spilled at its lip.
 */
export function sack(state) {
  const M = materials();
  const S = sackMaterials();
  const g = new THREE.Group();
  const r = 0.27;
  if (state !== "open") {
    const h = 0.56;
    const neck = 0.82;
    const profile = [
      [0.0, 0.0],
      [0.62, 0.0],
      [0.92, 0.05],
      [1.06, 0.18],
      [1.1, 0.33],
      [1.02, 0.5],
      [0.82, 0.64],
      [0.52, 0.75],
      [0.27, 0.81],
      [0.2, 0.84],
      [0.21, 0.88],
      [0.36, 0.95],
      [0.5, 1.03],
      [0.46, 1.08],
      [0.3, 1.04],
      [0.12, 0.99],
      [0.0, 0.97],
    ];
    const body = part(sackBody(profile, r, h, neck, 71), S.burlap, { ry: 0.4, rz: -0.06, rx: 0.05 });
    g.add(body);
    // the tie: two turns of thong round the neck, a knot, and the ends hanging down the front
    const ny = h * 0.85;
    const nr = r * 0.22;
    for (const [dy, tilt] of [
      [0.0, 0.08],
      [0.022, -0.06],
    ])
      g.add(part(new THREE.TorusGeometry(nr + 0.01, 0.012, 6, 20), S.thong, { y: ny + dy, rx: Math.PI / 2 + tilt, rz: 0.1 }));
    const kx = nr * 0.7;
    const kz = nr * 0.75;
    g.add(part(new THREE.SphereGeometry(0.02, 8, 6), S.thong, { x: kx, y: ny + 0.01, z: kz, sx: 1.3 }));
    g.add(thong(S, [[kx, ny + 0.01, kz], [kx + 0.04, ny - 0.04, kz + 0.05], [kx + 0.05, ny - 0.13, kz + 0.1], [kx + 0.03, ny - 0.19, kz + 0.14]]));
    g.add(thong(S, [[kx, ny + 0.01, kz], [kx + 0.07, ny - 0.02, kz + 0.02], [kx + 0.12, ny - 0.09, kz + 0.06], [kx + 0.14, ny - 0.15, kz + 0.11]]));
    return scaled(g, 1.5);
  }

  // open: the neck untied and fallen open, the mouth rolled down over the shoulders
  const h = 0.44;
  const profile = [
    [0.0, 0.0],
    [0.66, 0.0],
    [0.98, 0.05],
    [1.14, 0.2],
    [1.16, 0.38],
    [1.06, 0.58],
    [0.9, 0.74],
    [0.84, 0.84],
    [0.92, 0.92],
    [1.02, 0.94],
    [1.0, 0.88],
    [0.86, 0.82],
    [0.76, 0.72],
  ];
  const body = sackBody(profile, r, h, 0.86, 73, { pleats: 6, crown: 0.07, slump: 0.1 });
  // the mouth slumps toward the viewer so its dark inside reads from the camera
  g.add(part(body, S.burlap, { ry: 0.2, rx: 0.16, rz: -0.16 }));
  const inside = new THREE.Group();
  inside.rotation.set(0.16, 0.2, -0.16);
  g.add(inside);
  inside.add(part(new THREE.CircleGeometry(r * 0.74, 20), S.dark, { y: h * 0.7, rx: -Math.PI / 2 }));
  const R = rng(5);
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * r * 0.5;
    inside.add(
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), M.gold, {
        x: Math.cos(a) * d,
        y: h * 0.71 + R() * 0.01,
        z: Math.sin(a) * d,
        rx: (R() - 0.5) * 0.7,
        rz: (R() - 0.5) * 0.7,
      }),
    );
  }
  // one coin spilled over the lip onto the floor
  g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), M.gold, { x: r * 1.05, y: 0.005, z: r * 1.25, rx: 0.08 }));
  // the slipped thong, lying loose beside the sack
  g.add(thong(S, [[r * 0.6, h * 0.86, r * 0.6], [r * 1.1, h * 0.5, r * 0.95], [r * 1.35, 0.012, r * 0.9], [r * 1.7, 0.012, r * 0.55], [r * 1.9, 0.012, r * 0.75]]));
  return scaled(g, 1.5);
}
