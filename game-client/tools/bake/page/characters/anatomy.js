// Anatomy and garments on the shared rig (FS-2325V §E.1): torso, limbs, head, hands and feet as
// shaped, smooth-skinned geometry, and the cloth that hangs from them (tabards, skirts, robes,
// cloaks, hoods). Every function reads joint heights from the rig's bind pose, so the same code
// dresses a lean ghoul and a hulking troll.
//
// Units are fractions of H (rig.js). The model faces +z; its left is +x.

import * as THREE from "three";
import { attach, ellipsoid, jointAt as J, rigidTube, skinTube, spring } from "./rig.js";
import { hash2 } from "../noise.js";

const sides = [
  ["L", 1],
  ["R", -1],
];
const midBone = (rig) => (rig.bones.hunch ? "hunch" : "spine");

/**
 * The torso: one skinned tube from crotch to neck base, hips → spine (→ hunch) → chest → neck.
 * `o.ribs` cuts rib ridges into the chest (the ghoul); `o.waist` pinches it.
 */
export function torso(rig, mat, o = {}) {
  const cps = torsoProfile(rig, o);
  const ribs = o.ribs
    ? (t, a) => {
        // t spans crotch → neck; ribs live on the ribcage band, strongest at the front/sides
        if (t < 0.45 || t > 0.86) return 1;
        const band = Math.sin(((t - 0.45) / 0.41) * Math.PI);
        const ridge = 0.5 + 0.5 * Math.cos((t - 0.45) * 2 * Math.PI * 16);
        const frontness = 0.5 + 0.5 * Math.sin(a);
        return 1 - 0.1 * band * (1 - ridge) * (0.4 + 0.6 * frontness);
      }
    : undefined;
  return skinTube(rig, cps, mat, { segs: 24, steps: o.ribs ? 8 : 4, shape: ribs, uv: 5 });
}

/**
 * Cloth over the torso (a tabard's upper half): the torso's own profile from `from` (H) up to the
 * neck, padded out, as an open panel over `arc`.
 */
export function overTorso(rig, mat, o = {}) {
  const pad = o.pad ?? 0.012;
  const cps = torsoProfile(rig, o)
    .filter((c) => c.p[1] >= o.from - 1e-6)
    .map((c) => ({ ...c, r: c.r.map((v) => v + pad) }));
  return skinTube(rig, cps, mat, { segs: 16, steps: 4, arc: o.arc, caps: false, ground: false, uv: 4 });
}

function torsoProfile(rig, o = {}) {
  const p = rig.p;
  const [, hy] = J(rig, "hips");
  const [, cy] = J(rig, "chest");
  const [, ny] = J(rig, "neck");
  const tw = p.torsoW;
  const td = p.torsoD;
  const hw = p.hipW;
  const sw = p.shoulderW;
  const mid = midBone(rig);
  const waist = o.waist ?? 1;
  const back = o.hump ?? 0;
  const cps = [
    { p: [0, hy - 0.065, 0], r: [0.066 * hw, 0.06 * td], w: { hips: 1 } },
    { p: [0, hy - 0.01, -0.004], r: [0.097 * hw, 0.072 * td], w: { hips: 1 }, n: 2.2 },
    { p: [0, hy + 0.06, 0.002], r: [0.084 * tw * waist, 0.064 * td * waist], w: { hips: 0.35, [mid]: 0.65 }, n: 2.2 },
    { p: [0, cy - 0.005, 0.006 - back * 0.3], r: [0.099 * tw, (0.074 + back * 0.4) * td], w: { [mid]: 0.4, chest: 0.6 }, n: 2.5 },
    { p: [0, cy + 0.06, 0.01 - back * 0.6], r: [0.112 * tw, (0.079 + back) * td], w: { chest: 1 }, n: 2.7 },
    { p: [0, ny - 0.022, -back * 0.5], r: [0.104 * sw, (0.062 + back * 0.6) * td], w: { chest: 1 }, n: 2.8 },
    { p: [0, ny + 0.006, 0], r: [0.042 * (o.neckW ?? 1), 0.04 * (o.neckW ?? 1)], w: { chest: 0.5, neck: 0.5 } },
  ];
  return cps;
}

export function neck(rig, mat, o = {}) {
  const [, ny, nz] = J(rig, "neck");
  const [, hy, hz] = J(rig, "head");
  const r = 0.034 * (o.w ?? 1);
  return skinTube(
    rig,
    [
      { p: [0, ny - 0.015, nz], r: r * 1.1, w: { chest: 0.4, neck: 0.6 } },
      { p: [0, (ny + hy) / 2, (nz + hz) / 2], r, w: { neck: 1 } },
      { p: [0, hy + 0.02, hz + 0.004], r: r * 1.02, w: { neck: 0.3, head: 0.7 } },
    ],
    mat,
    { segs: 14, steps: 3 },
  );
}

/** Both arms, shoulder to wrist, each one continuous tube. `o.sleeve(t)` flares a robe sleeve. */
export function arms(rig, mat, o = {}) {
  const ar = rig.p.armR * (o.r ?? 1);
  const out = [];
  for (const [s] of sides) {
    const [x, uy] = J(rig, `upperArm${s}`);
    const [, fy] = J(rig, `foreArm${s}`);
    const [, wy] = J(rig, `hand${s}`);
    const bulk = o.bulk ?? 1;
    const cps = [
      { p: [x * 0.92, uy + 0.022, 0], r: [0.036 * ar, 0.042 * ar], w: { chest: 0.5, [`upperArm${s}`]: 0.5 } },
      { p: [x, uy - 0.012, 0], r: [0.046 * ar * bulk, 0.047 * ar * bulk], w: { [`upperArm${s}`]: 0.85, chest: 0.15 } },
      { p: [x, uy - 0.07, 0.002], r: [0.039 * ar, 0.042 * ar * bulk], w: { [`upperArm${s}`]: 1 } },
      { p: [x, fy + 0.03, 0], r: [0.032 * ar, 0.033 * ar], w: { [`upperArm${s}`]: 1 } },
      { p: [x, fy - 0.018, 0.002], r: [0.033 * ar, 0.033 * ar], w: { [`foreArm${s}`]: 1 } },
      { p: [x, fy - 0.055, 0.005], r: [0.036 * ar * bulk, 0.033 * ar], w: { [`foreArm${s}`]: 1 } },
      { p: [x, wy + 0.03, 0], r: [0.025 * ar, 0.02 * ar], w: { [`foreArm${s}`]: 1 } },
      { p: [x, wy - 0.006, 0], r: [0.024 * ar, 0.019 * ar], w: { [`foreArm${s}`]: 0.5, [`hand${s}`]: 0.5 } },
    ];
    if (o.sleeve) cps.forEach((c, i) => (c.r = c.r.map((v) => v * o.sleeve(i / (cps.length - 1)))));
    out.push(skinTube(rig, cps, mat, { segs: 14, steps: 4, uv: 5 }));
  }
  return out;
}

/** Both legs, hip to ankle, each one continuous tube. */
export function legs(rig, mat, o = {}) {
  const lr = rig.p.limbR * (o.r ?? 1);
  const out = [];
  for (const [s, sx] of sides) {
    const [x, ty] = J(rig, `thigh${s}`);
    const [, ky] = J(rig, `shin${s}`);
    const [, ay] = J(rig, `foot${s}`);
    const cps = [
      { p: [x * 0.8, ty + 0.05, -0.004], r: 0.068 * lr, w: { hips: 0.65, [`thigh${s}`]: 0.35 } },
      { p: [x, ty - 0.012, 0], r: [0.066 * lr, 0.07 * lr], w: { [`thigh${s}`]: 0.85, hips: 0.15 } },
      { p: [x + sx * 0.002, ty - 0.09, 0.004], r: [0.057 * lr, 0.061 * lr], w: { [`thigh${s}`]: 1 } },
      { p: [x, ky + 0.035, 0.004], r: [0.043 * lr, 0.045 * lr], w: { [`thigh${s}`]: 1 } },
      { p: [x, ky - 0.02, 0.006], r: [0.042 * lr, 0.044 * lr], w: { [`shin${s}`]: 1 } },
      { p: [x, ky - 0.075, -0.008], r: [0.044 * lr, 0.05 * lr], w: { [`shin${s}`]: 1 } },
      { p: [x, ay + 0.07, 0], r: [0.029 * lr, 0.031 * lr], w: { [`shin${s}`]: 1 } },
      { p: [x, ay + 0.008, 0.002], r: [0.026 * lr, 0.029 * lr], w: { [`shin${s}`]: 0.6, [`foot${s}`]: 0.4 } },
    ];
    out.push(skinTube(rig, cps, mat, { segs: 16, steps: 4, uv: 5 }));
  }
  return out;
}

/**
 * A skeletal limb set (the ghoul): thin shafts with knobbed joints, still one tube per limb so the
 * joints bend cleanly.
 */
export function boneLimbs(rig, mat) {
  for (const [s] of sides) {
    const [x, uy] = J(rig, `upperArm${s}`);
    const [, fy] = J(rig, `foreArm${s}`);
    const [, wy] = J(rig, `hand${s}`);
    const U = `upperArm${s}`;
    const F = `foreArm${s}`;
    skinTube(
      rig,
      [
        { p: [x * 0.9, uy + 0.01, 0], r: 0.028, w: { chest: 0.4, [U]: 0.6 } },
        { p: [x, uy - 0.015, 0], r: 0.026, w: { [U]: 1 } },
        { p: [x, uy - 0.05, 0], r: 0.014, w: { [U]: 1 } },
        { p: [x, fy + 0.04, 0], r: 0.013, w: { [U]: 1 } },
        { p: [x, fy + 0.008, 0], r: 0.022, w: { [U]: 1 } },
        { p: [x, fy - 0.012, 0], r: 0.021, w: { [F]: 1 } },
        { p: [x, fy - 0.045, 0], r: 0.013, w: { [F]: 1 } },
        { p: [x, wy + 0.02, 0], r: 0.013, w: { [F]: 1 } },
        { p: [x, wy - 0.004, 0], r: 0.018, w: { [F]: 0.5, [`hand${s}`]: 0.5 } },
      ],
      mat,
      { segs: 10, steps: 3, uv: 6 },
    );
    const [lx, ty] = J(rig, `thigh${s}`);
    const [, ky] = J(rig, `shin${s}`);
    const [, ay] = J(rig, `foot${s}`);
    const T = `thigh${s}`;
    const S = `shin${s}`;
    skinTube(
      rig,
      [
        { p: [lx * 0.9, ty + 0.02, 0], r: 0.032, w: { hips: 0.5, [T]: 0.5 } },
        { p: [lx, ty - 0.02, 0], r: 0.026, w: { [T]: 1 } },
        { p: [lx, ty - 0.07, 0], r: 0.017, w: { [T]: 1 } },
        { p: [lx, ky + 0.05, 0], r: 0.016, w: { [T]: 1 } },
        { p: [lx, ky + 0.012, 0.004], r: 0.028, w: { [T]: 1 } },
        { p: [lx, ky - 0.014, 0.004], r: 0.026, w: { [S]: 1 } },
        { p: [lx, ky - 0.06, 0], r: 0.016, w: { [S]: 1 } },
        { p: [lx, ay + 0.04, 0], r: 0.014, w: { [S]: 1 } },
        { p: [lx, ay + 0.004, 0], r: 0.022, w: { [S]: 0.6, [`foot${s}`]: 0.4 } },
      ],
      mat,
      { segs: 10, steps: 3, uv: 6 },
    );
  }
}

/** A plain human head: cranium, face and jaw mass, nose. */
export function head(rig, mat, o = {}) {
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const H = rig.H;
  attach(rig, "head", ellipsoid(r * 0.92 * H, r * 1.02 * H, r * 1.0 * H, 20), mat, [0, hy + 0.058, hz - 0.002]);
  attach(rig, "head", ellipsoid(r * 0.72 * H, r * 0.72 * H, r * 0.78 * H, 16), mat, [0, hy + 0.028, hz + 0.016]);
  if (o.nose !== false) {
    const nose = new THREE.ConeGeometry(0.009 * H, 0.024 * H, 6);
    attach(rig, "head", nose, mat, [0, hy + 0.046, hz + 0.066], { rx: 1.35 });
  }
}

/** Hands: a closed grip (or claws) on each hand bone. */
export function hands(rig, mat, o = {}) {
  const H = rig.H;
  const k = o.size ?? 1;
  for (const [s, sx] of sides) {
    const [x, wy] = J(rig, `hand${s}`);
    attach(rig, `hand${s}`, ellipsoid(0.024 * k * H, 0.04 * k * H, 0.03 * k * H, 12), mat, [x, wy - 0.035 * k, 0.006]);
    attach(rig, `hand${s}`, ellipsoid(0.011 * k * H, 0.022 * k * H, 0.011 * k * H, 8), mat, [x - sx * 0.018 * k, wy - 0.03 * k, 0.022 * k], {
      rz: sx * 0.5,
    });
    if (o.claws)
      for (let i = 0; i < 3; i++) {
        const claw = new THREE.ConeGeometry(0.008 * k * H, 0.05 * k * H, 5);
        attach(rig, `hand${s}`, claw, o.claws, [x + sx * (i - 1) * 0.014 * k, wy - 0.085 * k, 0.018 * k], { rx: Math.PI + 0.35 });
      }
  }
}

/** Boots: a shaped foot on the foot bone, and a shaft on the shin that hides the ankle joint. */
export function boots(rig, mat, o = {}) {
  const H = rig.H;
  const k = o.size ?? 1;
  const top = o.top ?? 0.16;
  for (const [s] of sides) {
    const [x, ay] = J(rig, `foot${s}`);
    const foot = rigidTube(
      H,
      [
        { p: [x, ay - 0.008, -0.036 * k], r: [0.026 * k, 0.024 * k] },
        { p: [x, ay - 0.01, -0.02 * k], r: [0.03 * k, 0.03 * k] },
        { p: [x, ay - 0.016, 0.03 * k], r: [0.031 * k, 0.022 * k] },
        { p: [x, ay - 0.024, 0.072 * k], r: [0.027 * k, 0.016 * k] },
        { p: [x, ay - 0.028, 0.094 * k], r: [0.018 * k, 0.011 * k] },
      ],
      { front: [0, 1, 0], segs: 14, steps: 3 },
    );
    attach(rig, `foot${s}`, foot, mat, [0, 0, 0], { ground: true });
    if (top > 0) {
      const shaft = rigidTube(
        H,
        [
          { p: [x, ay - 0.012, -0.004], r: [0.032 * k, 0.036 * k] },
          { p: [x, ay + top * 0.5, -0.004], r: [0.033 * k, 0.037 * k] },
          { p: [x, ay + top, 0], r: [0.039 * k, 0.041 * k] },
        ],
        { segs: 14, steps: 3, caps: false },
      );
      attach(rig, `shin${s}`, shaft, o.shaftMat ?? mat, [0, 0, 0]);
    }
  }
}

/** Bare, broad feet with toes (the troll). */
export function bareFeet(rig, mat, o = {}) {
  const H = rig.H;
  const k = o.size ?? 1;
  for (const [s, sx] of sides) {
    const [x, ay] = J(rig, `foot${s}`);
    const foot = rigidTube(
      H,
      [
        { p: [x, ay - 0.01, -0.03 * k], r: [0.03 * k, 0.03 * k] },
        { p: [x, ay - 0.016, 0.02 * k], r: [0.04 * k, 0.024 * k] },
        { p: [x, ay - 0.022, 0.06 * k], r: [0.042 * k, 0.017 * k] },
      ],
      { front: [0, 1, 0], segs: 14, steps: 3 },
    );
    attach(rig, `foot${s}`, foot, mat, [0, 0, 0], { ground: true });
    for (let i = 0; i < 3; i++)
      attach(rig, `foot${s}`, ellipsoid(0.012 * k * H, 0.01 * k * H, 0.02 * k * H, 8), mat, [x + sx * (i - 1) * 0.022 * k, ay - 0.026 * k, 0.082 * k]);
    if (o.claws)
      for (let i = 0; i < 3; i++)
        attach(rig, `foot${s}`, new THREE.ConeGeometry(0.006 * k * H, 0.02 * k * H, 5), o.claws, [x + sx * (i - 1) * 0.022 * k, ay - 0.028 * k, 0.1 * k], {
          rx: Math.PI / 2,
        });
  }
}

/**
 * Adds a skirt's spring bones (front and back panels) under the hips. Call before any skinned
 * mesh is built; `skirt({ panels: true })` then weights its hem to them.
 */
export function skirtBones(rig, o = {}) {
  rig.addBone("skirtF", "hips", 0, -0.03, 0.05);
  rig.addBone("skirtB", "hips", 0, -0.03, -0.05);
  rig.addBone("skirtL", "hips", 0.07, -0.03, 0);
  rig.addBone("skirtR", "hips", -0.07, -0.03, 0);
  for (const b of ["skirtF", "skirtB", "skirtL", "skirtR"])
    spring(rig, b, { stiffness: o.stiffness ?? 45, damping: 7, drag: o.drag ?? 0.2, inertia: 1.1, limit: 0.8, gravity: 0.6 });
}

/**
 * A skirt, robe or tabard hem hanging from the waist. `top`/`bottom` are heights (H); `rTop`,
 * `rBottom` radii [lateral, depth]. The hem follows the thighs by `legFollow` and, with
 * `panels`, lags on the skirt spring bones. `arc` makes an open panel; `ragged` tears the hem.
 */
export function skirt(rig, mat, o = {}) {
  const top = o.top;
  const bottom = o.bottom;
  const rt = o.rTop;
  const rb = o.rBottom;
  const mid = [(rt[0] + rb[0]) / 2 + (o.belly ?? 0), (rt[1] + rb[1]) / 2 + (o.belly ?? 0)];
  const z = o.z ?? 0;
  const cps = [
    { p: [0, top, z], r: rt, w: { hips: 1 } },
    { p: [0, top - (top - bottom) * 0.3, z], r: [rt[0] * 0.55 + rb[0] * 0.45, rt[1] * 0.55 + rb[1] * 0.45], w: { hips: 1 } },
    { p: [0, (top + bottom) / 2, z], r: mid, w: { hips: 1 } },
    { p: [0, bottom, z - (o.trail ?? 0)], r: rb, w: { hips: 1 } },
  ];
  const follow = o.legFollow ?? 0.5;
  const panel = o.panels ? (o.panelWeight ?? 0.5) : 0;
  const weight = (t, a) => {
    const down = Math.max(0, (t - 0.12) / 0.88) ** 1.3;
    const lat = Math.cos(a); // +1 left, -1 right
    const fr = Math.sin(a); // +1 front, -1 back
    const L = THREE.MathUtils.smoothstep(lat, -0.35, 0.35);
    const w = { hips: 1 };
    const legs = follow * down * (0.35 + 0.65 * Math.abs(fr) ** 0.5);
    if (legs > 0) {
      w.hips -= legs;
      w.thighL = legs * L;
      w.thighR = legs * (1 - L);
    }
    if (panel > 0) {
      const pw = panel * down;
      w.hips -= pw;
      const f = Math.max(0, fr);
      const b = Math.max(0, -fr);
      const l = Math.max(0, lat);
      const r = Math.max(0, -lat);
      const n = f + b + l + r || 1;
      w.skirtF = (pw * f) / n;
      w.skirtB = (pw * b) / n;
      w.skirtL = (pw * l) / n;
      w.skirtR = (pw * r) / n;
    }
    w.hips = Math.max(0, w.hips);
    return w;
  };
  const drop = o.ragged
    ? (t, a) => {
        if (t < 0.7) return 0;
        const j = Math.floor(((a + Math.PI * 4) / (Math.PI * 2)) * o.ragged.teeth);
        return ((t - 0.7) / 0.3) * o.ragged.depth * (0.2 + hash2(j, 3, o.ragged.seed ?? 1));
      }
    : undefined;
  return skinTube(rig, cps, mat, { segs: o.segs ?? 28, steps: 4, arc: o.arc, weight, drop, caps: false, uv: 4, ground: false });
}

/**
 * Adds a cloak's bone chain (cloak0..cloak3) down the back, each a spring. Call before any
 * skinned mesh is built.
 */
export function cloakBones(rig, o = {}) {
  const [, ny] = J(rig, "neck");
  const [, cy] = J(rig, "chest");
  const len = o.length ?? 0.62;
  const back = o.back ?? 0.075;
  rig.addBone("cloak0", "chest", 0, ny - 0.02 - cy, -back);
  const seg = len / 4;
  for (let i = 1; i <= 3; i++) rig.addBone(`cloak${i}`, `cloak${i - 1}`, 0, -seg, -0.004);
  for (let i = 0; i <= 3; i++)
    spring(rig, `cloak${i}`, {
      stiffness: 70 - i * 12,
      damping: 8,
      drag: (o.drag ?? 0.32) * (0.5 + i * 0.35),
      inertia: 0.8 + i * 0.25,
      limit: 1.0,
      gravity: i === 0 ? 0.25 : 0.85,
      drape: -0.3,
      axes: "xz",
    });
}

/** The cloak sheet: an open tube behind the shoulders, weighted down the cloak chain. */
export function cloak(rig, mat, o = {}) {
  const [, ny] = J(rig, "neck");
  const sw = rig.p.shoulderW;
  const td = rig.p.torsoD;
  const len = o.length ?? 0.62;
  const top = ny - 0.012;
  const spread = o.spread ?? 1.45;
  const flare = o.flare ?? 1;
  const back = o.back ?? 0.075;
  const cps = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = top - len * t;
    const lat = (0.075 + 0.07 * Math.min(1, t * 2.4) + 0.05 * t * flare) * sw;
    const dep = (0.052 + 0.045 * Math.min(1, t * 2.2) + 0.03 * t * flare) * td;
    // cloak chain weights: segment index along its length
    const k = t * 4;
    const w = {};
    if (t < 0.08) {
      w.chest = 1 - t / 0.08;
      w.cloak0 = t / 0.08;
    } else {
      const i0 = Math.min(3, Math.floor(k - 0.3));
      const f = THREE.MathUtils.clamp(k - 0.3 - i0, 0, 1);
      w[`cloak${Math.max(0, i0)}`] = 1 - f;
      w[`cloak${Math.min(3, i0 + 1)}`] = (w[`cloak${Math.min(3, i0 + 1)}`] ?? 0) + f;
    }
    cps.push({ p: [0, y, -back * 0.2 - 0.012 * t], r: [lat, dep], w });
  }
  const arc = [-Math.PI / 2 - spread, -Math.PI / 2 + spread];
  const drop = o.ragged
    ? (t, a) => {
        if (t < 0.75) return 0;
        const j = Math.floor(((a + Math.PI * 4) / (Math.PI * 2)) * o.ragged.teeth);
        return ((t - 0.75) / 0.25) * o.ragged.depth * (0.2 + hash2(j, 7, o.ragged.seed ?? 2));
      }
    : undefined;
  return skinTube(rig, cps, mat, { segs: 22, steps: 4, arc, caps: false, drop, uv: 4, ground: false });
}

/** A hood with an open face, a short capelet over the shoulders, and a tail down the back. */
export function hood(rig, mat, o = {}) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const [, ny] = J(rig, "neck");
  const r = rig.p.headR * 1.38;
  const shell = new THREE.SphereGeometry(r * H, 22, 16, Math.PI / 2 + 0.52, Math.PI * 2 - 1.04, 0, Math.PI * 0.7);
  attach(rig, "head", shell, mat, [0, hy + 0.05, hz - 0.002], { sy: 1.12 });
  // the hood's shadowed interior, so the face reads as a glimpse, not a mask
  const inner = new THREE.SphereGeometry(r * 0.94 * H, 18, 12, Math.PI / 2 + 0.52, Math.PI * 2 - 1.04, 0, Math.PI * 0.7);
  const shade = mat.clone();
  shade.side = THREE.BackSide;
  shade.color = new THREE.Color(0.3, 0.3, 0.3);
  attach(rig, "head", inner, shade, [0, hy + 0.05, hz - 0.002], { sy: 1.12, noShadow: true });
  // peak: the hood rises to a soft point behind the crown
  attach(rig, "head", new THREE.ConeGeometry(r * 0.55 * H, r * 1.1 * H, 12), mat, [0, hy + 0.1, hz - 0.045], { rx: -0.95 });
  // capelet: rides the chest, covers the shoulder line
  const cape = rigidTube(
    H,
    [
      { p: [0, ny + 0.02, -0.004], r: [0.05, 0.048] },
      { p: [0, ny - 0.015, -0.004], r: [0.1 * rig.p.shoulderW, 0.075 * rig.p.torsoD] },
      { p: [0, ny - 0.085, 0.0], r: [0.142 * rig.p.shoulderW, 0.098 * rig.p.torsoD] },
    ],
    { segs: 24, steps: 4, caps: false },
  );
  attach(rig, "chest", cape, o.capeMat ?? mat, [0, 0, 0]);
}

/**
 * Adds a beard's spring bone under the chin. Call before any skinned mesh is built. The beard
 * itself is rigid on that bone, so it swings as a piece.
 */
export function beard(rig, mat) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  rig.addBone("beard", "head", 0, 0.02, 0.05);
  spring(rig, "beard", { stiffness: 80, damping: 9, drag: 0.15, inertia: 0.7, limit: 0.5, gravity: 0.5 });
  return () => {
    // a long grey beard spilling from the chin down over the robe (apex down and a little out)
    attach(rig, "beard", new THREE.ConeGeometry(0.046 * H, 0.16 * H, 12), mat, [0, hy - 0.05, hz + 0.088], { rx: Math.PI - 0.32, sz: 0.65 });
    attach(rig, "beard", ellipsoid(0.042 * H, 0.034 * H, 0.03 * H, 12), mat, [0, hy + 0.018, hz + 0.058]);
  };
}

/** A belt around the hips with a buckle and a pouch. */
export function belt(rig, mat, buckleMat, o = {}) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const y = hy + (o.dy ?? 0.02);
  const rx = (o.r?.[0] ?? 0.1) * rig.p.hipW;
  const rz = (o.r?.[1] ?? 0.076) * rig.p.torsoD;
  const band = new THREE.CylinderGeometry(1, 1, 0.024 * H, 28, 1, true);
  band.scale(rx * H, 1, rz * H);
  attach(rig, "hips", band, mat, [0, y, 0]);
  attach(rig, "hips", new THREE.BoxGeometry(0.032 * H, 0.03 * H, 0.012 * H), buckleMat, [0, y, rz + 0.002]);
  if (o.pouch) attach(rig, "hips", new THREE.BoxGeometry(0.04 * H, 0.05 * H, 0.03 * H), mat, [rx * 0.8, y - 0.035, rz * 0.45], { ry: 0.9 });
}

/**
 * Hair over a bare head (FS-2325V §G): a cap over the crown with the hairline above the brow,
 * and the back of the head down to the nape. `long` lets it fall to the collar; `bun` gathers it
 * at the back. Returns the meshes, so a palette can recolour them.
 */
export function hair(rig, mat, o = {}) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const at = [0, hy + 0.058, hz - 0.004];
  const scale = { sx: 0.99 * r * H, sy: 1.08 * r * H, sz: 1.06 * r * H };
  const out = [];
  // the crown, tipped back so the hairline sits above the brow and low at the nape
  out.push(attach(rig, "head", new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), mat, at, { ...scale, rx: -0.28 }));
  // the back and sides, open over the face
  const fall = o.long ? 0.62 : 0.4;
  out.push(
    attach(rig, "head", new THREE.SphereGeometry(1, 20, 10, Math.PI / 2 + 1.15, Math.PI * 2 - 2.3, Math.PI * 0.25, Math.PI * fall), mat, at, scale),
  );
  if (o.bun) out.push(attach(rig, "head", ellipsoid(r * 0.5 * H, r * 0.46 * H, r * 0.44 * H, 12), mat, [0, hy + 0.078, hz - r * 1.02]));
  return out;
}

/** A soft felt cap with a short brim, worn over the crown. */
export function cap(rig, mat) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  attach(rig, "head", ellipsoid(r * 1.04 * H, r * 0.62 * H, r * 1.1 * H, 18), mat, [0, hy + 0.09, hz - 0.01], { rx: -0.12 });
  const band = new THREE.CylinderGeometry(1, 1.02, 1, 22, 1, true);
  attach(rig, "head", band, mat, [0, hy + 0.078, hz - 0.004], { sx: r * 0.99 * H, sy: r * 0.4 * H, sz: r * 1.05 * H, rx: -0.12 });
  const brim = new THREE.CylinderGeometry(r * 0.72 * H, r * 0.72 * H, 0.008 * H, 16, 1, false, -Math.PI / 2, Math.PI);
  attach(rig, "head", brim, mat, [0, hy + 0.072, hz + r * 0.62], { rx: 0.1, sz: 0.8 });
}

/** A shawl over the shoulders, riding the chest. Returns the mesh, for a palette to recolour. */
export function shawl(rig, mat) {
  const [, ny] = J(rig, "neck");
  const sw = rig.p.shoulderW;
  const td = rig.p.torsoD;
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny + 0.012, -0.004], r: [0.046, 0.045] },
      { p: [0, ny - 0.02, -0.004], r: [0.116 * sw, 0.086 * td] },
      { p: [0, ny - 0.065, 0.0], r: [0.142 * sw, 0.1 * td] },
      { p: [0, ny - 0.1, -0.004], r: [0.152 * sw, 0.106 * td] },
    ],
    { segs: 24, steps: 4, caps: false },
  );
  return attach(rig, "chest", geo, mat, [0, 0, 0]);
}
