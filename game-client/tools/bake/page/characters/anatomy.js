// Anatomy and garments on the shared rig (FS-2325V §E.1): torso, limbs, head, hands and feet as
// shaped, smooth-skinned geometry, and the cloth that hangs from them (tabards, skirts, robes,
// cloaks, hoods). Every function reads joint heights from the rig's bind pose, so the same code
// dresses a lean ghoul and a hulking troll.
//
// Units are fractions of H (rig.js). The model faces +z; its left is +x.

import * as THREE from "three";
import { attach, ellipsoid, jointAt as J, mount, rigidTube, skinTube, spring } from "./rig.js";
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

/** A modest bust on the chest, under the garment it is dressed in (the Mage). */
export function bust(rig, mat, k = 1) {
  const H = rig.H;
  const [, cy] = J(rig, "chest");
  const td = rig.p.torsoD;
  for (const [, sx] of sides)
    attach(rig, "chest", ellipsoid(0.03 * k * H, 0.03 * k * H, 0.028 * k * H, 12), mat, [sx * 0.028, cy + 0.03, 0.062 * td], { rz: sx * 0.15 });
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

/**
 * Both legs, hip to ankle, each one continuous tube. `o.under` is the garment the thighs are worn
 * under (the options its `skirt` takes: the four classes, the trousered resident, the
 * spirewarden, the quartermaster's breeches seat): every part of a thigh that would show outside
 * it is drawn in to UNDER_CLEAR inside its wall (`underGarment`), so the thighs no longer show as
 * dark wedges at the sides of the waist. It draws a thigh in all round, so a garment open over
 * most of the leg (the quartermaster's apron) is never given as `under`, or the thigh it leaves
 * bare would slim. Without it (creatures) the legs are as they always were.
 */
export function legs(rig, mat, o = {}) {
  const lr = rig.p.limbR * (o.r ?? 1);
  const out = [];
  const place = o.under && underGarment(rig, o.under);
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
    const leg = skinTube(rig, cps, mat, { segs: 16, steps: 4, uv: 5, place });
    // what the leg-clearance guard keeps inside any garment (clearance.js)
    leg.userData.leg = s;
    out.push(leg);
  }
  return out;
}

/**
 * How far inside a garment's wall `legs({ under })` keeps a thigh (H; about 3.5–3.6 1x px on the
 * classes, H 1.92–2.0): one value for the four classes, the least (in 0.0025 steps) that keeps
 * every class's legs inside its garment in every clip, to the leg-clearance guard's one baked px (clearance.js). The 2x
 * wizard's walk and walk_attack set it (FS-3V7GC §C): her leading thigh and knee swing out
 * through the robe, which follows a thigh by only a fifth of its swing; at 0.0375 she shows 0.52
 * 1x px, past the half px a 2x sheet allows. Under the cloth, so no garment changes for it. (It
 * was 0.012, set by the 2x archer's walk, before the other classes were baked at 2x.)
 */
export const UNDER_CLEAR = 0.04;

/**
 * Draws a thigh in under the garment `g` (its `skirt` options), as rig.js `place` moves a vertex
 * in the bind pose: a vertex the garment covers that lies further from its axis than its wall less
 * UNDER_CLEAR is pulled in toward the axis to that line, and one inside it stays where it is, so
 * only the outer flank of the thigh's root moves and the front a split coat shows does not. Above
 * the garment's top, under the belt, the top's wall holds. A vertex under the hem stays where it
 * was: the leg narrows back to itself between its last ring over the hem and its first under it.
 */
function underGarment(rig, g) {
  const H = rig.H;
  const rings = skirtRings(g);
  // the garment's ellipse at height y (H): radii and centre's z, or null under its hem
  const wallAt = (y) => {
    if (y >= rings[0].y) return rings[0];
    for (let i = 0; i + 1 < rings.length; i++) {
      const [a, b] = [rings[i], rings[i + 1]];
      if (y < b.y) continue;
      const t = (a.y - y) / (a.y - b.y);
      return { r: [a.r[0] + (b.r[0] - a.r[0]) * t, a.r[1] + (b.r[1] - a.r[1]) * t], z: a.z + (b.z - a.z) * t };
    }
    return null;
  };
  // over the garment's top, where the torso alone covers the thigh's root (`g.torso`, its options):
  // the torso's wall there when it is the narrower, as a pinched waist is
  const body = g.torso && torsoProfile(rig, g.torso);
  const torsoAt = (y) => {
    for (let i = 0; i + 1 < body.length; i++) {
      const [a, b] = [body[i], body[i + 1]];
      if (y < a.p[1] || y > b.p[1]) continue;
      const t = (y - a.p[1]) / (b.p[1] - a.p[1]);
      return { r: [a.r[0] + (b.r[0] - a.r[0]) * t, a.r[1] + (b.r[1] - a.r[1]) * t], z: a.p[2] + (b.p[2] - a.p[2]) * t };
    }
    return null;
  };
  const wallOver = (y) => {
    const e = wallAt(y);
    if (!body || y < rings[0].y) return e;
    const t = torsoAt(y);
    return t && t.r[0] < e.r[0] ? t : e;
  };
  return (p) => {
    const y = p.y / H;
    const e = wallOver(y);
    if (!e) return;
    const x = p.x / H;
    const z = p.z / H - e.z;
    const rho = Math.hypot(x, z);
    if (rho < 1e-9) return;
    const wall = 1 / Math.hypot(x / rho / (e.r[0] - UNDER_CLEAR), z / rho / (e.r[1] - UNDER_CLEAR));
    if (rho <= wall) return;
    const k = wall / rho;
    p.x *= k;
    p.z = (e.z + z * k) * H;
  };
}

/**
 * The rings a garment made by `skirt` with options `o` is laid through, top to hem: each one's
 * height `y`, radii `r` [lateral, depth] and centre's `z` (H).
 */
function skirtRings(o) {
  const top = o.top;
  const bottom = o.bottom;
  const rt = o.rTop;
  const rb = o.rBottom;
  const mid = [(rt[0] + rb[0]) / 2 + (o.belly ?? 0), (rt[1] + rb[1]) / 2 + (o.belly ?? 0)];
  const z = o.z ?? 0;
  return [
    { y: top, r: rt, z },
    { y: top - (top - bottom) * 0.3, r: [rt[0] * 0.55 + rb[0] * 0.45, rt[1] * 0.55 + rb[1] * 0.45], z },
    { y: (top + bottom) / 2, r: mid, z },
    { y: bottom, r: rb, z: z - (o.trail ?? 0) },
  ];
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

// The human head (FS-67QQY §A): a distance field, meshed by pushing a sphere out to its surface,
// and a second, slightly larger, as the shell the face is painted on (face.js).

/** Polynomial smooth min of two distances, softness `k` (Quílez). */
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};
const smax = (a, b, k) => -smin(-a, -b, k);

/** Signed distance to an ellipsoid at `c` with radii `r` (Quílez's bound, close near the surface). */
function ellipsoidSd(x, y, z, c, r) {
  const [px, py, pz] = [x - c[0], y - c[1], z - c[2]];
  const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
  const k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(...r);
}

/**
 * The head as a distance field (R1, R3): the smooth union of cranium and jaw, its upper face
 * pressed by a smooth max to the face plane, which passes through the front of the mouth, leans
 * back toward the brow and curves round the cheeks.
 */
function headSd(hy, hz, r, jaw) {
  const cranium = { c: [0, hy + 0.058, hz - 0.002], r: [0.92 * r, 1.02 * r, 1.0 * r] };
  const chin = { c: [0, hy + 0.028, hz + 0.016], r: [0.72 * jaw * r, 0.72 * r, 0.78 * r] };
  return (x, y, z) => {
    const skull = smin(ellipsoidSd(x, y, z, cranium.c, cranium.r), ellipsoidSd(x, y, z, chin.c, chin.r), 0.014);
    const plane = z - (hz + 0.058 - 0.17 * (y - (hy + 0.054)) - (0.5 * x * x) / r);
    return smax(skull, plane, 0.012);
  };
}

/**
 * A sphere pushed out along its rays from `c` to where `sd` crosses `off` (bisection), in model
 * units: one closed mesh, no seam across the face (R2).
 */
function surface(sd, c, off, H, wide, high) {
  const g = new THREE.SphereGeometry(1, wide, high);
  const p = g.attributes.position;
  const d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    let lo = 0;
    let hi = 0.2;
    for (let k = 0; k < 40; k++) {
      const t = (lo + hi) / 2;
      if (sd(c[0] + d.x * t, c[1] + d.y * t, c[2] + d.z * t) - off < 0) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    p.setXYZ(i, (c[0] + d.x * t) * H, (c[1] + d.y * t) * H, (c[2] + d.z * t) * H);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The frame the face is painted in (face.js), in head coordinates (H, y from the head joint): the
 * canvas covers x -0.06…0.06 and y -0.02…0.10 (R6).
 */
export const FACE_CANVAS = { left: -0.06, below: -0.02, span: 0.12 };

/**
 * The head and its paint shell for a rig (`jaw` scales the jaw's width). Both are in model units
 * at absolute head coordinates, so they attach to the head bone at the origin. The shell sits
 * 0.0006 H off the head, its UVs projected straight from the front; a vertex facing away maps to
 * the canvas's transparent corner, so nothing smears round the back (R6).
 */
function headSurface(rig, jaw = 1) {
  const [, hy, hz] = J(rig, "head");
  const sd = headSd(hy, hz, rig.p.headR, jaw);
  const c = [0, hy + 0.048, hz + 0.004];
  const head = surface(sd, c, 0, rig.H, 48, 36);
  const shell = surface(sd, c, 0.0006, rig.H, 64, 48);
  const { left, below, span } = FACE_CANVAS;
  const p = shell.attributes.position;
  const n = shell.attributes.normal;
  const uv = shell.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (n.getZ(i) < 0.2) uv.setXY(i, 0, 0);
    else uv.setXY(i, (p.getX(i) / rig.H - left) / span, (p.getY(i) / rig.H - hy - below) / span);
  }
  return { head, shell };
}

/**
 * A plain human head (FS-67QQY): cranium and jaw as one seamless surface, the upper face pressed
 * flat, and a nose. `o.jaw` scales the jaw's width; `o.nose: false` drops the nose. The painted
 * face and the brows go over it with `face`.
 */
export function head(rig, mat, o = {}) {
  const [, hy, hz] = J(rig, "head");
  const H = rig.H;
  const { head: skull, shell } = headSurface(rig, o.jaw ?? 1);
  attach(rig, "head", skull, mat, [0, 0, 0]);
  rig.faceShell = shell;
  if (o.nose !== false) {
    // today's cone, 0.004 H lower, riding the face plane (R5)
    const nose = new THREE.ConeGeometry(0.009 * H, 0.024 * H, 6);
    attach(rig, "head", nose, mat, [0, hy + 0.042, hz + 0.058 + 0.006 + 0.17 * 0.004], { rx: 1.35 });
  }
}

/**
 * The face over a `head`: the shared painted face in `paint` (face.js `faceMaterial`), then the
 * brows over it in `brow` (face.js `browMaterial`, from the character's hair tone, R10), each on
 * the head's shell. Neither casts a shadow. Returns the brows, so a palette can recolour them.
 */
export function face(rig, paint, brow) {
  if (!rig.faceShell) throw new Error("anatomy: face before head");
  attach(rig, "head", rig.faceShell, paint, [0, 0, 0], { noShadow: true }).renderOrder = 1;
  const m = attach(rig, "head", rig.faceShell.clone(), brow, [0, 0, 0], { noShadow: true });
  m.renderOrder = 2;
  return m;
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
 * Keeps a skirt's swaying panels (skirtBones) out of the legs: cloth can sway away from a leg but
 * not through it. The front panel swings at least as far forward as any leg reaches, the back
 * panel at least as far back, and each side panel at least as far as the leg on its side, the way
 * that leg goes: a one-sided limit on the spring's angle (applyPose, clips.js), the collision a
 * cloth simulation would do, for the one shape a skirt has. How far a leg reaches is taken down
 * to the deepest hem on the rig: the knee (the thigh's own angle) and, for a hem below the knee
 * (a robe), the point on the shin at the hem, which the calf carries back as the knee folds.
 * Bone angles are pose offsets about the hips, +x swinging back.
 */
function pushPanels(rig, bottom) {
  const [, ty] = J(rig, "thighL");
  const [, ky] = J(rig, "shinL");
  const [, ay] = J(rig, "footL");
  const thigh = ty - ky;
  const shin = ky - ay;
  rig.hemDepth = Math.max(rig.hemDepth ?? 0, ty - bottom);
  // [furthest forward, furthest back] a leg reaches above the hem, as angles about the hips
  const swing = (p, s) => {
    const t = p.b[`thigh${s}`]?.[0] ?? 0;
    if (rig.hemDepth <= thigh) return [t, t];
    const k = t + (p.b[`shin${s}`]?.[0] ?? 0);
    const d = Math.min(rig.hemDepth - thigh, shin);
    const a = Math.atan2(thigh * Math.sin(t) + d * Math.sin(k), thigh * Math.cos(t) + d * Math.cos(k));
    return [Math.min(t, a), Math.max(t, a)];
  };
  const side = (x, [fwd, back]) => (fwd < 0 && -fwd > back ? Math.min(x, fwd) : Math.max(x, back));
  const push = {
    skirtF: (x, p) => Math.min(x, swing(p, "L")[0], swing(p, "R")[0]),
    skirtB: (x, p) => Math.max(x, swing(p, "L")[1], swing(p, "R")[1]),
    skirtL: (x, p) => side(x, swing(p, "L")),
    skirtR: (x, p) => side(x, swing(p, "R")),
  };
  for (const s of rig.springs) if (push[s.bone]) s.push = push[s.bone];
}

/**
 * A skirt, robe or tabard hem hanging from the waist. `top`/`bottom` are heights (H); `rTop`,
 * `rBottom` radii [lateral, depth]. The hem follows the thighs by `legFollow` and, with
 * `panels`, lags on the skirt spring bones. `arc` makes an open panel; `ragged` tears the hem.
 *
 * The legs stay inside it, at rest and while they move (the leg-clearance guard, clearance.js,
 * fails a bake where they do not), by four things:
 *  - the thighs are built under it (`legs(rig, mat, { under })`, the same options): a thigh is
 *    wider at the hip than a fitted tunic's top, so without it the thighs showed as dark wedges
 *    at both sides of the waist, through a robe too;
 *  - each half of the hem follows the thigh on ITS side. The tube is wound top to bottom, so its
 *    side axis (tangent × front, rig.js tubeGeometry) is -x and angle 0 is the character's
 *    right; the weights once read it as the left, so each half followed the OPPOSITE thigh;
 *  - the follow builds from just under the waistband, full by mid-skirt, where a fitted skirt
 *    already touches the thigh (it once built slowly toward the hem, lagging the thigh above it);
 *  - with `panels`, the swaying panels cannot swing in through a leg: each is pushed out by how
 *    far the legs reach above the hem (`pushPanels`); below the knee a robe hangs on the panels
 *    alone, since the thigh does not carry the shin that kicks it. `kneeCover` (H) keeps the
 *    thigh carrying the cloth that far under the knee before the panels take it, so a knee bent
 *    high in a run stays inside a robe (the mage's, 0.05; 0 elsewhere).
 * `over` (another skirt's options) cuts a panel on that garment's rig, to lie over it ({@link overSkirt}).
 * `mirrored: true` keeps the old weighting and none of the rest, for the sheets baked with it and
 * not yet re-baked, so their pixels do not move; never use it on new work.
 */
export function skirt(rig, mat, o = {}) {
  if (o.over) return overSkirt(rig, mat, o);
  const bottom = o.bottom;
  const cps = skirtRings(o).map((c) => ({ p: [0, c.y, c.z], r: c.r, w: { hips: 1 } }));
  const weight = skirtWeights(rig, o);
  const drop = o.ragged
    ? (t, a) => {
        if (t < 0.7) return 0;
        const j = Math.floor(((a + Math.PI * 4) / (Math.PI * 2)) * o.ragged.teeth);
        return ((t - 0.7) / 0.3) * o.ragged.depth * (0.2 + hash2(j, 3, o.ragged.seed ?? 1));
      }
    : undefined;
  if (o.panels && (o.panelWeight ?? 0.5) > 0 && !o.mirrored) pushPanels(rig, bottom);
  return garment(skinTube(rig, cps, mat, { segs: o.segs ?? 28, steps: 4, arc: o.arc, weight, drop, caps: false, uv: 4, ground: false }), o);
}

/** Tags a garment for the leg-clearance guard (clearance.js). */
function garment(mesh, o) {
  // a garment the legs must stay inside while they move (clearance.js)
  mesh.userData.garment = true;
  // the bake fails a sheet off MIRRORED_LEGACY that still asks for the old weighting (clearance.js)
  if (o.mirrored) mesh.userData.mirrored = true;
  return mesh;
}

/**
 * How much further out than its own radii a panel worn over a garment (`skirt({ over })`) is cut
 * (H; about 0.17 1x px on the mage): the blended skin closes the space between the two layers
 * where a stride turns the bones under them apart (the run's knee, the back flung out behind), and
 * the black gown came through the teal scapular in dashes a baked px long. The least, in 0.001
 * steps, that leaves at most a stray baked px of it in any frame of the run.
 */
export const OVER_CLEAR = 0.002;

/**
 * A panel worn over another `skirt` (`o.over`, that garment's options: the mage's scapular over her
 * gown): cut on the garment beneath's own rig, so the two move as one cloth and the one beneath
 * never shows through it, however far a stride or a run's drag swings them. Its columns are the
 * garment beneath's, column for column: its arc is snapped to that garment's columns (`over.segs`
 * round the full turn) and cut one column per column, so each face lies over the face beneath it
 * (`segs` cuts it across its own arc instead, the cut before 2026-11-12).
 * Cut finer or across its own angles, the panel's vertices followed the skin's turn from one thigh
 * to the other behind the knee while the coarser face beneath cut straight across it, and the
 * panel dipped under the gown in the run (owner 2026-11-12: "法師跑步時 膝蓋背後關節處 衣服綠色區塊會有黑點").
 * Its rings are the garment beneath's, ring for ring (the same heights, centres and trail), each `rTop - over.rTop`
 * out from it at the top easing to `rBottom - over.rBottom` at the hem, and OVER_CLEAR more; its skin weights are the
 * garment beneath's at the same ring. Two layers skinned apart (each its own `legFollow` and panel
 * weight) and cut on rings at other heights part under a stride: the one that follows the legs
 * further comes out through the other (the gown through the scapular at the knee, past it behind
 * the calves in the run). Its hem is lifted to `bottom` on the last ring, where the weights beneath
 * no longer change, so the cloth beneath shows below it as before. `top` is the garment
 * beneath's; `legFollow` and `panelWeight` are not read.
 */
function overSkirt(rig, mat, o) {
  const u = o.over;
  const rings = skirtRings(u);
  const n = rings.length - 1;
  const cps = rings.map((c, k) => {
    const f = k / n;
    const r = [0, 1].map((i) => c.r[i] + (o.rTop[i] - u.rTop[i]) * (1 - f) + (o.rBottom[i] - u.rBottom[i]) * f + OVER_CLEAR);
    return { p: [0, c.y, c.z], r, w: { hips: 1 } };
  });
  const lift = o.bottom - u.bottom;
  const under = skirtWeights(rig, u);
  if (u.panels && (u.panelWeight ?? 0.5) > 0) pushPanels(rig, o.bottom);
  // the garment beneath's columns (rig.js tubeGeometry: a closed tube's column j at 2πj/segs)
  // (`o.segs` cuts it across its own arc instead, as before 2026-11-12)
  const step = (Math.PI * 2) / (u.segs ?? 28);
  const arc = o.segs ? o.arc : o.arc.map((a) => Math.round(a / step) * step);
  const mesh = skinTube(rig, cps, mat, {
    segs: o.segs ?? Math.round((arc[1] - arc[0]) / step),
    steps: 4,
    arc,
    weight: under,
    drop: (t) => (t >= 1 ? -lift : 0),
    caps: false,
    uv: 4,
    ground: false,
  });
  // the hem ring's centre where its vertices are, for the guard's rings (clearance.js)
  const { centres } = mesh.geometry.userData.tube;
  centres[centres.length - 1][1] += lift * rig.H;
  return garment(mesh, o);
}

/**
 * A `skirt`'s skin weights for options `o`: at a fraction `t` of the way from its top ring to its
 * hem and an angle `a` round it, how much of each vertex the hips, the thighs and the panels carry.
 */
function skirtWeights(rig, o) {
  const top = o.top;
  const bottom = o.bottom;
  const follow = o.legFollow ?? 0.5;
  const [, kneeY] = J(rig, "shinL");
  const panel = o.panels ? (o.panelWeight ?? 0.5) : 0;
  return (t, a) => {
    const down = o.mirrored ? Math.max(0, (t - 0.12) / 0.88) ** 1.3 : THREE.MathUtils.smoothstep(t, 0.05, 0.55);
    const lat = (o.mirrored ? 1 : -1) * Math.cos(a); // +1 left (+x), -1 right
    const fr = Math.sin(a); // +1 front, -1 back
    const L = THREE.MathUtils.smoothstep(lat, -0.35, 0.35);
    const w = { hips: 1 };
    const reach = follow * down * (0.35 + 0.65 * Math.abs(fr) ** 0.5);
    // under the knee the thigh's share passes to the pushed panels: from the knee, or from
    // `kneeCover` (H) under it, so the thigh carries the cloth over the knee it bends
    const cover = o.kneeCover ?? 0;
    const below = o.mirrored || !panel ? 0 : THREE.MathUtils.smoothstep(kneeY - (top - (top - bottom) * t), cover, cover + 0.1);
    const legs = reach * (1 - below);
    if (legs > 0) {
      w.hips -= legs;
      w.thighL = legs * L;
      w.thighR = legs * (1 - L);
    }
    if (panel > 0) {
      const pw = panel * down + reach * below;
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
}

/**
 * Adds a cloak's bone chain (cloak0..cloak3) down the back, each a spring. Call before any
 * skinned mesh is built. `strap` (per bone from the top, 1 free) holds the cloak's top to the back
 * under something strapped over it (the archer's quiver): that bone's drag and fling scale by it,
 * its stiffness by its inverse (at most 5x), so the cloth under the strap stays on the back and
 * the rest swings from there.
 */
export function cloakBones(rig, o = {}) {
  const [, ny] = J(rig, "neck");
  const [, cy] = J(rig, "chest");
  const len = o.length ?? 0.62;
  const back = o.back ?? 0.075;
  rig.addBone("cloak0", "chest", 0, ny - 0.02 - cy, -back);
  const seg = len / 4;
  for (let i = 1; i <= 3; i++) rig.addBone(`cloak${i}`, `cloak${i - 1}`, 0, -seg, -0.004);
  for (let i = 0; i <= 3; i++) {
    const held = o.strap?.[i] ?? 1;
    spring(rig, `cloak${i}`, {
      stiffness: (70 - i * 12) / Math.max(held, 0.2),
      damping: 8,
      drag: (o.drag ?? 0.32) * (0.5 + i * 0.35) * held,
      inertia: (0.8 + i * 0.25) * held,
      limit: 1.0,
      gravity: i === 0 ? 0.25 : 0.85,
      drape: -0.3,
      axes: "xz",
    });
  }
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
  const mesh = skinTube(rig, cps, mat, { segs: 22, steps: 4, arc, caps: false, drop, uv: 4, ground: false });
  // a cloak no leg or boot may come out through (clearance.js `cloakClearance`)
  mesh.userData.cloak = true;
  return mesh;
}

/** A hood with an open face, a short capelet over the shoulders, and a tail down the back. */
export function hood(rig, mat, o = {}) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
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
  capelet(rig, o.capeMat ?? mat);
}

/**
 * A deep cowl: the crown closed all round, the face opening cut only from the brow down, and the
 * whole drawn forward so the face sits in its shadow. `brow` is where the opening starts (a
 * fraction of π down from the crown), `gap` its width (radians), `reach` how far the cowl is
 * pulled forward over the face. `shade` darkens the face beneath: 0 none, 1 the eyes, 2 down to
 * the mouth. `point` draws the crown out behind into one tapering point (see `drawToPoint`).
 */
export function cowl(rig, mat, o = {}) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const R = rig.p.headR;
  const r = R * 1.38;
  const gap = o.gap ?? 0.9;
  const brow = (o.brow ?? 0.46) * Math.PI;
  const end = Math.PI * 0.72;
  const at = [0, hy + 0.05, hz - 0.002 + (o.reach ?? 0.014)];
  const shape = { sy: 1.12, sz: 1.08 };
  // the crown drawn out behind into one long point, every layer by the same pull so they stay flush
  const pt = o.point;
  const draw = (geo) => (pt ? drawToPoint(geo, { ...pt, length: pt.length * H }) : geo);
  attach(rig, "head", draw(new THREE.SphereGeometry(r * H, 28, 14, 0, Math.PI * 2, 0, brow)), mat, at, shape);
  attach(rig, "head", draw(new THREE.SphereGeometry(r * H, 28, 10, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, brow, end - brow)), mat, at, shape);
  // the turned edge over the brow, a fold of cloth that gives the opening its line
  const lip = new THREE.SphereGeometry(r * 1.03 * H, 16, 3, Math.PI / 2 - gap / 2 - 0.35, gap + 0.7, brow - 0.07 * Math.PI, 0.08 * Math.PI);
  attach(rig, "head", draw(lip), mat, at, shape);
  // the inside, near black: what shows through the opening is the cowl's dark, not its lining
  const dark = mat.clone();
  dark.side = THREE.BackSide;
  dark.color = new THREE.Color(0.12, 0.12, 0.12);
  const inner = draw(new THREE.SphereGeometry(r * 0.95 * H, 24, 14, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, 0, end));
  attach(rig, "head", inner, dark, at, { ...shape, noShadow: true });
  // the face under the cowl's shadow: a dark veil over the head's front, down to `shade`
  const shade = o.shade ?? 1;
  if (shade > 0) {
    const veil = mat.clone();
    veil.color = new THREE.Color(0.07, 0.07, 0.07);
    const to = shade > 1 ? 0.78 : 0.52;
    const front = new THREE.SphereGeometry(1, 16, 8, Math.PI / 2 - 0.8, 1.6, 0.28 * Math.PI, (to - 0.28) * Math.PI);
    attach(rig, "head", front, veil, [0, hy + 0.058, hz - 0.002], { sx: R * 0.97 * H, sy: R * 1.08 * H, sz: R * 1.2 * H, noShadow: true });
  }
  capelet(rig, o.capeMat ?? mat);
}

/**
 * Pulls a hood piece out toward `dir` into a point `length` long. A vertex is pulled by how
 * squarely it faces `dir`, and its girth narrows by the same measure, so the hood tapers over its
 * whole length instead of ending in a nub. `pinch` is how far the girth narrows at the tip (1 a
 * needle, lower a blunter, fuller end); `girth` is how late it starts narrowing (higher keeps the
 * hood full for longer); `swell` fattens the middle of the run, as cloth bags. `droop` bends the
 * far end down, as cloth hangs.
 */
function drawToPoint(geo, { dir, length, droop = 0, pinch = 0.92, girth = 2.2, swell = 0 }) {
  const d = new THREE.Vector3(...dir).normalize();
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const side = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.length();
    if (!n) continue;
    const a = v.dot(d);
    const t = Math.max(0, a / n);
    const w = Math.pow(t, 2.2);
    side.copy(v).addScaledVector(d, -a).multiplyScalar((1 - pinch * Math.pow(t, girth)) * (1 + swell * 4 * w * (1 - w)));
    v.copy(d).multiplyScalar(a + length * w).add(side);
    v.y -= droop * length * w * w;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A mail coif: a hood of mail over the crown and round the face, the face itself left open, and
 * its mantle spread over the neck and the shoulder line. Worn under a helm; `mat` should be
 * double-sided.
 */
export function coif(rig, mat) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const [, ny] = J(rig, "neck");
  const r = rig.p.headR;
  const hoodG = new THREE.SphereGeometry(r * 1.1 * H, 22, 14, Math.PI / 2 + 0.62, Math.PI * 2 - 1.24, 0, Math.PI * 0.8);
  attach(rig, "head", hoodG, mat, [0, hy + 0.055, hz - 0.004]);
  const mantle = rigidTube(
    H,
    [
      { p: [0, hy + 0.0, hz - 0.01], r: [r * 1.0, r * 1.0] },
      { p: [0, ny + 0.0, -0.006], r: [0.072, 0.068] },
      { p: [0, ny - 0.05, -0.004], r: [0.13 * rig.p.shoulderW, 0.094 * rig.p.torsoD] },
    ],
    { segs: 24, steps: 4, caps: false },
  );
  attach(rig, "chest", mantle, mat, [0, 0, 0]);
}

/** A short capelet riding the chest and covering the shoulder line, under a hood or cowl. */
function capelet(rig, mat) {
  const H = rig.H;
  const [, ny] = J(rig, "neck");
  const cape = rigidTube(
    H,
    [
      { p: [0, ny + 0.02, -0.004], r: [0.05, 0.048] },
      { p: [0, ny - 0.015, -0.004], r: [0.1 * rig.p.shoulderW, 0.075 * rig.p.torsoD] },
      { p: [0, ny - 0.085, 0.0], r: [0.142 * rig.p.shoulderW, 0.098 * rig.p.torsoD] },
    ],
    { segs: 24, steps: 4, caps: false },
  );
  attach(rig, "chest", cape, mat, [0, 0, 0]);
}

/** A close-trimmed beard along the jaw and over the lip; `full` scales its depth down the chin. */
export function shortBeard(rig, mat, { full = 1 } = {}) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  attach(rig, "head", ellipsoid(r * 0.66 * H, r * 0.42 * full * H, r * 0.52 * H, 14), mat, [0, hy + 0.016, hz + 0.028]);
  attach(rig, "head", ellipsoid(r * 0.34 * H, r * 0.09 * H, r * 0.12 * H, 8), mat, [0, hy + 0.034, hz + 0.06]);
}

/** A sash wound about the waist, its knotted end hanging at one hip (`side`). */
export function sash(rig, mat, { side = "L", depth = 0.05, pad = 0.006 } = {}) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const sx = side === "L" ? 1 : -1;
  const band = rigidTube(
    H,
    [
      { p: [0, hy - 0.02, 0.002], r: [0.104 * rig.p.hipW + pad, 0.082 * rig.p.torsoD + pad] },
      { p: [0, hy + 0.02, 0.004], r: [0.1 * rig.p.torsoW + pad, 0.08 * rig.p.torsoD + pad] },
      { p: [0, hy + depth, 0.004], r: [0.09 * rig.p.torsoW + pad, 0.072 * rig.p.torsoD + pad] },
    ],
    { segs: 24, steps: 3, caps: false },
  );
  // the band covers the root of the thighs under it (the leg-clearance guard, clearance.js)
  attach(rig, "hips", band, mat, [0, 0, 0]).userData.cover = true;
  attach(rig, "hips", ellipsoid(0.022 * H, 0.02 * H, 0.016 * H, 10), mat, [sx * 0.07, hy + 0.012, 0.07]);
  const tail = mount(rig, "hips", [sx * 0.078, hy, 0.066], { rz: sx * 0.12, rx: 0.08 });
  const cloth = new THREE.BoxGeometry(0.036 * H, 0.15 * H, 0.008 * H);
  cloth.translate(0, -0.075 * H, 0);
  // a little twist and taper down its length
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = -p.getY(i) / (0.15 * H);
    p.setX(i, p.getX(i) * (1 - 0.3 * t));
    p.setZ(i, p.getZ(i) + Math.sin(t * 3) * 0.006 * H);
  }
  cloth.computeVertexNormals();
  tail.add(new THREE.Mesh(cloth, mat));
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
  // the band covers the root of the thighs under it (the leg-clearance guard, clearance.js): its
  // two rings of 29 vertices, top then bottom, as a tube lays them out (rig.js)
  band.userData.tube = { rows: 2, cols: 29, closed: true, centres: [[0, 0.012 * H, 0], [0, -0.012 * H, 0]] };
  attach(rig, "hips", band, mat, [0, y, 0]).userData.cover = true;
  attach(rig, "hips", new THREE.BoxGeometry(0.032 * H, 0.03 * H, 0.012 * H), buckleMat, [0, y, rz + 0.002]);
  if (o.pouch) attach(rig, "hips", new THREE.BoxGeometry(0.04 * H, 0.05 * H, 0.03 * H), mat, [rx * 0.8, y - 0.035, rz * 0.45], { ry: 0.9 });
}

/**
 * Hair over a bare head (FS-2325V §G): a cap over the crown with the hairline above the brow,
 * and the back of the head down to the nape. `long` lets it fall to the collar; `bun` gathers it
 * at the back; `tail` ties it at the nape in a short tail. Returns the meshes, so a palette can
 * recolour them.
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
  if (o.tail) out.push(attach(rig, "head", ellipsoid(r * 0.3 * H, r * 0.75 * H, r * 0.3 * H, 10), mat, [0, hy + 0.01, hz - r * 1.02], { rx: 0.35 }));
  return out;
}

/**
 * Long hair falling loose down the back from under the crown to `length` below the neck: an open
 * panel over the back `arc` (radians each side of centre), `width` and `depth` its radii at the
 * shoulders. Rigid on the chest, so a turn of the head never parts it from the back.
 */
export function hairFall(rig, mat, { length = 0.22, width = 0.075, depth = 0.09, arc = 1.0 } = {}) {
  const [, ny] = J(rig, "neck");
  const [, hy, hz] = J(rig, "head");
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, hy + 0.07, hz - 0.006], r: [0.06, 0.066] },
      { p: [0, hy + 0.01, hz - 0.012], r: [0.058, 0.066] },
      { p: [0, ny - 0.01, -0.004], r: [width, depth] },
      { p: [0, ny - length * 0.55, 0.0], r: [width * 1.06, depth * 1.02] },
      { p: [0, ny - length, 0.004], r: [width * 0.8, depth * 0.96] },
    ],
    { segs: 20, steps: 4, caps: false, arc: [-Math.PI / 2 - arc, -Math.PI / 2 + arc] },
  );
  return attach(rig, "chest", geo, mat, [0, 0, 0]);
}

/**
 * Two long locks from the parting down either side of the face, resting on the front of the
 * shoulders. Skinned from head to chest, so a turn of the head bends them instead of parting them.
 */
export function faceLocks(rig, mat, { width = 0.017, depth = 0.012 } = {}) {
  const [, ny] = J(rig, "neck");
  const [, hy, hz] = J(rig, "head");
  for (const [, sx] of sides)
    skinTube(
      rig,
      [
        { p: [sx * 0.022, hy + 0.114, hz + 0.028], r: [width * 0.7, depth], w: { head: 1 } },
        { p: [sx * 0.05, hy + 0.088, hz + 0.04], r: [width * 0.95, depth], w: { head: 1 } },
        { p: [sx * 0.06, hy + 0.05, hz + 0.036], r: [width, depth], w: { head: 1 } },
        { p: [sx * 0.06, hy + 0.01, hz + 0.03], r: [width, depth], w: { head: 0.6, chest: 0.4 } },
        { p: [sx * 0.062, ny - 0.005, 0.042], r: [width * 0.95, depth * 0.9], w: { head: 0.15, chest: 0.85 } },
        { p: [sx * 0.066, ny - 0.052, 0.062], r: [width * 0.45, depth * 0.45], w: { chest: 1 } },
      ],
      mat,
      { segs: 10, steps: 4, ground: false, uv: 4 },
    );
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

/** A stiff standing collar rising behind the neck by `rise`, open at the throat by `gap` (radians). */
export function standingCollar(rig, mat, { rise = 0.04, gap = 0.8 } = {}) {
  const [, ny] = J(rig, "neck");
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny - 0.02, 0.0], r: [0.07, 0.064] },
      { p: [0, ny + rise * 0.5, -0.008], r: [0.074, 0.068] },
      { p: [0, ny + rise, -0.016], r: [0.088, 0.08] },
    ],
    { segs: 22, steps: 3, caps: false, arc: [Math.PI / 2 + gap, Math.PI / 2 + Math.PI * 2 - gap] },
  );
  return attach(rig, "chest", geo, mat, [0, 0, 0]);
}
