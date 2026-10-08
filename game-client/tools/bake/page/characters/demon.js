// The demon (FS-Q14EV §B): the first boss, an infernal being the Spire summons. Built on the
// shared rig (ADR-0021) with its creature variants: reverse-jointed (digitigrade) legs, a bat wing
// per side on its own bone chain with a skinned membrane, and a tail. Clawed arms stay separate
// from the wings. The hide is a dark, desaturated bog green (demonTone.js); the eyes are the
// hostile ember red and the only emissive part.
//
// Units and conventions are rig.js's: lengths are fractions of H, the model faces +z, its left
// is +x. Wing and tail rest poses are aimed (aimRest) rather than typed as Euler angles: a
// direction per bone is far easier to read and tune than a compound rotation.

import * as THREE from "three";
import { materials } from "../materials.js";
import { mix, shade } from "../palette.js";
import { smoothstep, voronoi } from "../noise.js";
import { attach, createRig, ellipsoid, jointAt as J, rigidTube, skinMembrane, skinTube, spring } from "./rig.js";
import { arms, neck, skirt, skirtBones, torso } from "./anatomy.js";
import { add, mirror, pose } from "./clips.js";
import { fabrics, mat, paint, pf, pn } from "./fabrics.js";
import { hideTone } from "./demonTone.js";

/**
 * The demon's clips (FS-Q14EV §B.6). Its attack is its own length and rate, not the 7-frame
 * default: a roar held for half a second, then the strike and recovery.
 */
export const DEMON_ANIMATIONS = {
  idle: { frames: 4, fps: 4, loop: true },
  walk: { frames: 8, fps: 8, loop: true },
  attack: { frames: 10, fps: 10, loop: false },
  death: { frames: 6, fps: 7, loop: false },
};

const sides = [
  ["L", 1],
  ["R", -1],
];

// --- materials -----------------------------------------------------------------------------

const S = 128;

/**
 * Thick hide: fine wrinkles running round the limbs, soft broad mottling, sparse warty nodules,
 * with a normal map strong enough for the key light to rake it. Low contrast, so at 1x it reads
 * as one dark skin rather than a pattern.
 */
function scaledHide(tone, seed) {
  return paint(
    (x, y) => {
      const wrinkle = pn(x, y, 4, 4, seed);
      const fold = pf(x, y, 16, seed + 5, 3);
      const v = voronoi(x / 8, y / 8, seed, S / 8);
      const wart = (1 - smoothstep(0.05, 0.32, v.f1)) * (v.id > 0.88 ? 1 : 0);
      const mottle = pf(x, y, 32, seed + 3);
      const h = 0.42 + 0.26 * wrinkle + 0.22 * fold + 0.4 * wart + 0.1 * pf(x, y, 16, seed + 2);
      let c = shade(tone, 0.8 + 0.16 * wrinkle + 0.14 * wart + 0.34 * (mottle - 0.5));
      c = mix(c, shade(tone, 0.62), 0.35 * smoothstep(0.55, 0.8, pf(x, y, 16, seed + 4)));
      return { c, h };
    },
    { strength: 2.1 },
  );
}

/** Wing membrane: thin leathery skin with raised veins running along the fingers, and wrinkles. */
function membrane(tone, seed) {
  return paint(
    (x, y) => {
      const wob = pf(x, y, 32, seed) * 12;
      const vein = 1 - smoothstep(0, 0.14, Math.abs(Math.sin(((y + wob) * Math.PI) / 16)));
      const wrinkle = pn(x, y, 2, 16, seed + 1);
      const h = 0.45 + 0.35 * vein + 0.15 * wrinkle;
      let c = shade(tone, 0.78 + 0.3 * pf(x, y, 16, seed + 2) + 0.12 * wrinkle);
      c = mix(c, shade(tone, 1.4), 0.35 * vein);
      return { c, h };
    },
    { strength: 1.8 },
  );
}

/** Horn and wing-bone: growth rings round the length, streaks along it. */
function horn(tone, seed) {
  return paint(
    (x, y) => {
      const ring = 0.5 + 0.5 * Math.sin((y * Math.PI) / 4 + 2 * pf(x, y, 32, seed));
      const streak = pn(x, y, 1, 32, seed + 1);
      const h = 0.4 + 0.35 * ring + 0.2 * streak;
      const c = shade(tone, 0.7 + 0.25 * ring + 0.3 * streak + 0.2 * pf(x, y, 16, seed + 2));
      return { c, h };
    },
    { strength: 1.6 },
  );
}

let SET = null;

/** The demon's material set, painted once per bake. No colour here is emissive. */
function demonFabrics() {
  if (SET) return SET;
  const hide = hideTone(mix, shade);
  const D = THREE.DoubleSide;
  const tone = {
    hide,
    membrane: shade(mix(hide, "barrowDeep", 0.4), 0.8),
    horn: mix(mix("vellumDark", "charcoal", 0.62), hide, 0.12),
    claw: mix("pitch", "vellumDark", 0.24),
    tooth: mix("vellum", "barrowBrown", 0.4),
    maw: mix("pitch", "oxblood", 0.4),
  };
  SET = {
    hide: mat(scaledHide(tone.hide, 61), { rough: 0.62, normal: 1.1 }),
    membrane: mat(membrane(tone.membrane, 65), { rough: 0.58, side: D }),
    horn: mat(horn(tone.horn, 67), { rough: 0.45 }),
    claw: mat(horn(tone.claw, 69), { rough: 0.32 }),
    tooth: mat(horn(tone.tooth, 71), { rough: 0.5 }),
    maw: mat(scaledHide(tone.maw, 73), { rough: 0.5 }),
  };
  return SET;
}

// --- geometry helpers ----------------------------------------------------------------------

/**
 * A tapering, curving rigid spike through model-space points (H): a horn, a claw, a tooth or a
 * dorsal spine. `r` [base, tip] radii (H); `ridges` cuts growth rings round it.
 */
function spike(rig, boneName, pts, r, material, o = {}) {
  const n = pts.length;
  const cps = pts.map((p, i) => ({ p, r: Math.max(0.0008, r[0] + (r[1] - r[0]) * (i / (n - 1)) ** (o.taper ?? 1)) }));
  const ridges = o.ridges ?? 0;
  const geo = rigidTube(rig.H, cps, {
    segs: o.segs ?? 10,
    steps: o.steps ?? 3,
    front: o.front ?? [0, 0, 1],
    shape: ridges ? (t) => 1 - 0.12 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 * ridges)) * (1 - t) : undefined,
  });
  return attach(rig, boneName, geo, material, [0, 0, 0], o);
}

const addV = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/**
 * Rest rotations that aim each bone's child along a model-space direction, in order, parents
 * first: `aims` is [[bone, child, [x, y, z]], …]. The minimal rotation is taken, so a bone keeps
 * its roll. Returns { bone: [rx, ry, rz] } (Euler XYZ, as applyPose adds them).
 */
function aimRest(rig, aims, base = rig.rest) {
  const out = {};
  const restOf = (name) => out[name] ?? base[name] ?? [0, 0, 0];
  const qp = new THREE.Quaternion();
  for (const [name, child, dir] of aims) {
    for (const [n, b] of Object.entries(rig.bones)) b.rotation.set(...restOf(n));
    rig.root.updateMatrixWorld(true);
    rig.bones[name].parent.getWorldQuaternion(qp);
    const from = rig.bones[child].position.clone().normalize();
    const to = new THREE.Vector3(...dir).normalize().applyQuaternion(qp.invert());
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(from, to), "XYZ");
    out[name] = [e.x, e.y, e.z];
  }
  for (const b of Object.values(rig.bones)) b.rotation.set(0, 0, 0);
  rig.root.updateMatrixWorld(true);
  return out;
}

/** The left wing's aims for a posture (directions in model space); the right wing mirrors x. */
function wingAims(rig, w) {
  const aims = [];
  for (const [s, sx] of sides) {
    const m = (d) => [d[0] * sx, d[1], d[2]];
    aims.push([`wingArm${s}`, `wingFore${s}`, m(w.arm)]);
    aims.push([`wingFore${s}`, `wingFinger${s}0`, m(w.fore)]);
    w.fingers.forEach((d, i) => aims.push([`wingFinger${s}${i}`, `wingTip${s}${i}`, m(d)]));
  }
  return aims;
}

// --- the body ------------------------------------------------------------------------------

const WING = {
  root: [0.085, 0.05, -0.085],
  arm: [0.12, 0.13, -0.05],
  fore: [0.2, -0.01, -0.03],
  // full finger vectors from the wrist; the tip bone sits halfway
  fingers: [
    [0.29, 0.08, -0.03],
    [0.22, -0.19, -0.04],
    [0.085, -0.28, -0.04],
  ],
  split: 0.5,
};

/** Wing postures as directions (left wing, model space, in the rest stance). */
const FURLED = {
  arm: [0.38, 0.42, -0.82],
  fore: [0.16, 0.97, -0.18],
  fingers: [
    [0.62, -0.72, -0.3],
    [0.4, -0.88, -0.25],
    [0.16, -0.97, -0.18],
  ],
};
const FLARED = {
  arm: [0.42, 0.8, -0.43],
  fore: [0.26, 0.93, -0.26],
  fingers: [
    [0.2, 0.97, -0.12],
    [0.46, 0.8, -0.38],
    [0.54, 0.16, -0.83],
  ],
};
/**
 * Collapsed over a corpse that lies on its chest. Directions are in the standing frame: pointing
 * down and a little forward there, so with the body pitched onto its chest the wings lie limp
 * along its back and sides, trailing toward its legs.
 */
const SPENT = {
  arm: [0.75, -0.45, 0.12],
  fore: [0.5, -0.84, 0.18],
  fingers: [
    [0.72, -0.56, 0.4],
    [0.5, -0.8, 0.32],
    [0.25, -0.94, 0.22],
  ],
};

const nlerp = (a, b, t) => {
  const v = a.map((x, i) => x + (b[i] - x) * t);
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

/** A posture `t` of the way from `a` to `b` (directions blended and renormalised). */
function blendPosture(a, b, t) {
  return { arm: nlerp(a.arm, b.arm, t), fore: nlerp(a.fore, b.fore, t), fingers: a.fingers.map((f, i) => nlerp(f, b.fingers[i], t)) };
}

/** Digitigrade legs, hip to the ball of the foot, one skinned tube each; toes on the foot. */
function legs(rig, F) {
  const lr = rig.p.limbR;
  const H = rig.H;
  for (const [s, sx] of sides) {
    const [x, ty] = J(rig, `thigh${s}`);
    const [, ky] = J(rig, `shin${s}`);
    const [, my] = J(rig, `metatarsal${s}`);
    const [, fy] = J(rig, `foot${s}`);
    const T = `thigh${s}`;
    const Sh = `shin${s}`;
    const Mt = `metatarsal${s}`;
    const Ft = `foot${s}`;
    skinTube(
      rig,
      [
        { p: [x * 0.7, ty + 0.06, -0.004], r: 0.07 * lr, w: { hips: 0.7, [T]: 0.3 } },
        { p: [x, ty - 0.01, 0.004], r: [0.07 * lr, 0.076 * lr], w: { [T]: 0.85, hips: 0.15 } },
        { p: [x + sx * 0.004, ty - 0.07, 0.014], r: [0.064 * lr, 0.074 * lr], w: { [T]: 1 } },
        { p: [x, ky + 0.035, 0.006], r: [0.046 * lr, 0.05 * lr], w: { [T]: 1 } },
        { p: [x, ky - 0.004, 0.004], r: [0.043 * lr, 0.047 * lr], w: { [T]: 0.5, [Sh]: 0.5 } },
        { p: [x, ky - 0.045, -0.012], r: [0.046 * lr, 0.056 * lr], w: { [Sh]: 1 } },
        { p: [x, my + 0.045, -0.004], r: [0.026 * lr, 0.03 * lr], w: { [Sh]: 1 } },
        { p: [x, my, -0.008], r: [0.031 * lr, 0.034 * lr], w: { [Sh]: 0.5, [Mt]: 0.5 } },
        { p: [x, my - 0.045, 0], r: [0.022 * lr, 0.024 * lr], w: { [Mt]: 1 } },
        { p: [x, fy + 0.014, 0.002], r: [0.026 * lr, 0.026 * lr], w: { [Mt]: 0.6, [Ft]: 0.4 } },
      ],
      F.hide,
      { segs: 16, steps: 4, uv: 5 },
    );
    // the hock's bony point, behind the ankle
    attach(rig, Mt, ellipsoid(0.02 * lr * H, 0.026 * lr * H, 0.022 * lr * H, 10), F.hide, [x, my + 0.004, -0.022 * lr]);
    // three splayed toes forward, a spur behind, each clawed
    const k = lr;
    for (let i = 0; i < 3; i++) {
      const out = (i - 1) * 0.42;
      const dx = Math.sin(out);
      const dz = Math.cos(out);
      const a = [x + sx * 0.0 + dx * 0.01 * k, fy - 0.006, 0.012 * k];
      const b = [x + dx * 0.04 * k, fy - 0.014, a[2] + dz * 0.04 * k];
      const c = [x + dx * 0.062 * k, fy - 0.022, a[2] + dz * 0.066 * k];
      attach(rig, Ft, rigidTube(H, [{ p: a, r: 0.017 * k }, { p: b, r: 0.014 * k }, { p: c, r: 0.011 * k }], { segs: 10, steps: 3 }), F.hide, [0, 0, 0], { ground: true });
      spike(rig, Ft, [c, addV(c, [dx * 0.02 * k, -0.004, dz * 0.022 * k]), addV(c, [dx * 0.03 * k, -0.016, dz * 0.03 * k])], [0.01 * k, 0.001], F.claw, { ground: true });
    }
    spike(rig, Ft, [[x, fy, -0.012 * k], [x, fy - 0.01, -0.035 * k], [x, fy - 0.022, -0.045 * k]], [0.011 * k, 0.001], F.claw, { ground: true });
  }
}

/** Big clawed hands: a broad palm and four hooked, black-clawed fingers plus a thumb. */
function clawHands(rig, F) {
  const H = rig.H;
  const k = 1.55;
  for (const [s, sx] of sides) {
    const [x, wy] = J(rig, `hand${s}`);
    const hand = `hand${s}`;
    attach(rig, hand, ellipsoid(0.022 * k * H, 0.034 * k * H, 0.03 * k * H, 12), F.hide, [x, wy - 0.028 * k, 0.004 * k]);
    for (let i = 0; i < 4; i++) {
      const z = (i - 1.5) * 0.013 * k + 0.004 * k;
      const len = (i === 1 || i === 2 ? 1 : 0.85) * k;
      const a = [x, wy - 0.05 * k, z];
      const b = [x - sx * 0.008 * k, wy - 0.05 * k - 0.032 * len, z + 0.004 * k];
      const c = [x - sx * 0.02 * k, wy - 0.05 * k - 0.052 * len, z + 0.006 * k];
      attach(rig, hand, rigidTube(H, [{ p: a, r: 0.0085 * k }, { p: b, r: 0.0075 * k }, { p: c, r: 0.0065 * k }], { segs: 8, steps: 2 }), F.hide);
      spike(rig, hand, [c, addV(c, [-sx * 0.012 * k, -0.012 * k, 0.002]), addV(c, [-sx * 0.026 * k, -0.014 * k, 0.003])], [0.0065 * k, 0.0006], F.claw, { segs: 7 });
    }
    const t0 = [x - sx * 0.012 * k, wy - 0.03 * k, 0.026 * k];
    const t1 = [x - sx * 0.02 * k, wy - 0.05 * k, 0.034 * k];
    attach(rig, hand, rigidTube(H, [{ p: t0, r: 0.009 * k }, { p: t1, r: 0.0075 * k }], { segs: 8, steps: 2 }), F.hide);
    spike(rig, hand, [t1, addV(t1, [-sx * 0.012 * k, -0.012 * k, 0.004 * k]), addV(t1, [-sx * 0.022 * k, -0.012 * k, 0.003 * k])], [0.007 * k, 0.0006], F.claw, { segs: 7 });
  }
}

/** The head: a long horned skull with a heavy brow, a muzzle, a hinged jaw full of teeth. */
function demonHead(rig, F, eyeMat) {
  const H = rig.H;
  const M = materials();
  const r = rig.p.headR;
  const [, hy, hz] = J(rig, "head");
  const c = [0, hy + 0.045, hz - 0.006];
  const at = (dx, dy, dz) => [c[0] + dx * r, c[1] + dy * r, c[2] + dz * r];
  const E = (rx, ry, rz, seg = 16) => ellipsoid(rx * r * H, ry * r * H, rz * r * H, seg);
  attach(rig, "head", E(0.95, 0.82, 1.12, 20), F.hide, at(0, 0, 0));
  // heavy, overhanging brow and cheekbones
  attach(rig, "head", E(1.02, 0.3, 0.42, 16), F.hide, at(0, 0.32, 0.78), { rx: -0.25 });
  for (const sx of [-1, 1]) attach(rig, "head", E(0.32, 0.26, 0.42, 10), F.hide, at(sx * 0.62, -0.08, 0.66));
  // muzzle and the dark maw behind the teeth
  attach(rig, "head", E(0.56, 0.38, 0.78, 16), F.hide, at(0, -0.22, 1.12), { rx: 0.12 });
  attach(rig, "head", E(0.44, 0.2, 0.66, 12), F.maw, at(0, -0.52, 1.08), { noShadow: true });
  for (const sx of [-1, 1]) {
    // deep sockets under the brow, the ember eyes in them
    attach(rig, "head", E(0.27, 0.2, 0.16, 10), M.black, at(sx * 0.38, 0.1, 0.94));
    attach(rig, "head", E(0.2, 0.13, 0.08, 8), eyeMat, at(sx * 0.38, 0.1, 1.03), { noShadow: true });
    attach(rig, "head", E(0.09, 0.07, 0.06, 6), M.black, at(sx * 0.16, -0.08, 1.86));
    // swept-back pointed ears
    spike(rig, "head", [at(sx * 0.85, 0.1, -0.1), at(sx * 1.25, 0.32, -0.45), at(sx * 1.45, 0.5, -0.85)], [0.16 * r, 0.004 * r], F.hide, { segs: 8 });
    // upper fangs
    for (const [fx, len] of [
      [0.3, 0.42],
      [0.16, 0.26],
    ])
      spike(rig, "head", [at(sx * fx, -0.5, 1.6), at(sx * fx, -0.5 - len * 0.6, 1.66), at(sx * fx * 0.9, -0.5 - len, 1.62)], [0.07 * r, 0.004 * r], F.tooth, { segs: 6 });
    // the horns: out from the temples, up and back, the tips curling forward
    spike(
      rig,
      "head",
      [at(sx * 0.5, 0.55, 0.3), at(sx * 1.25, 0.9, -0.05), at(sx * 1.85, 1.55, -0.55), at(sx * 1.95, 2.45, -0.75), at(sx * 1.6, 3.15, -0.35)],
      [0.36 * r, 0.02 * r],
      F.horn,
      { segs: 12, steps: 4, ridges: 9, taper: 1.3 },
    );
  }
  // a crest of short spines down the back of the skull
  for (let i = 0; i < 3; i++) spike(rig, "head", [at(0, 0.7 - i * 0.25, -0.3 - i * 0.35), at(0, 1.05 - i * 0.28, -0.55 - i * 0.38)], [0.13 * r, 0.004 * r], F.horn, { segs: 6 });

  // the jaw: lower mandible, tusks, a bony chin
  const [, jy, jz] = J(rig, "jaw");
  const ja = (dx, dy, dz) => [dx * r, jy + dy * r, jz + dz * r];
  attach(rig, "jaw", E(0.55, 0.24, 0.82, 14), F.hide, ja(0, -0.62, 0.92), { rx: 0.1 });
  for (const sx of [-1, 1]) {
    spike(rig, "jaw", [ja(sx * 0.34, -0.5, 1.45), ja(sx * 0.37, -0.15, 1.5), ja(sx * 0.3, 0.12, 1.44)], [0.075 * r, 0.004 * r], F.tooth, { segs: 6 });
    spike(rig, "jaw", [ja(sx * 0.5, -0.7, 0.5), ja(sx * 0.66, -0.9, 0.42)], [0.08 * r, 0.004 * r], F.horn, { segs: 6 });
  }
}

/** The tail: one skinned tube down the tail chain, tapering to a bony barb, spined along the top. */
function tail(rig, F) {
  const n = rig.p.tail.segments;
  const cps = [];
  const pt = (i) => J(rig, `tail${i}`);
  const [, ly, lz] = pt(n - 1);
  const seg = rig.p.tail.length / n;
  for (let i = 0; i < n; i++) {
    const [, y, z] = pt(i);
    const t = i / n;
    const r = 0.05 * (1 - t) ** 0.9 + 0.006;
    cps.push({ p: [0, y + (i === 0 ? 0.03 : 0), z + (i === 0 ? 0.01 : 0)], r: [r, r * 1.1], w: i === 0 ? { hips: 0.6, tail0: 0.4 } : { [`tail${i - 1}`]: 0.4, [`tail${i}`]: 0.6 } });
    cps.push({ p: [0, y - seg * 0.5, z], r: [r * 0.92, r], w: { [`tail${i}`]: 1 } });
  }
  cps.push({ p: [0, ly - seg, lz], r: 0.006, w: { [`tail${n - 1}`]: 1 } });
  skinTube(rig, cps, F.hide, { segs: 12, steps: 3, uv: 6, front: [0, 0, -1] });
  // the barb: a flat-sided bony point at the tip
  const tip = [0, ly - seg, lz];
  spike(rig, `tail${n - 1}`, [addV(tip, [0, 0.02, 0]), addV(tip, [0, -0.03, -0.004]), addV(tip, [0, -0.07, 0.006])], [0.016, 0.001], F.horn, { segs: 6, sz: 0.5 });
  // spines along the tail's back (bind: the tail hangs down, its back faces -z)
  for (let i = 1; i < n; i++) {
    const [, y, z] = pt(i);
    const r = 0.05 * (1 - i / n) + 0.006;
    spike(rig, `tail${i}`, [[0, y - seg * 0.2, z - r * 0.8], [0, y - seg * 0.45, z - r - 0.026 * (1 - i / n)]], [0.012 * (1 - i / n) + 0.003, 0.0008], F.horn, { segs: 6 });
  }
}

/** Dorsal spines from the nape down the back, largest over the shoulders. */
function dorsalSpines(rig, F) {
  const [, ny] = J(rig, "neck");
  const [, cy] = J(rig, "chest");
  const [, sy] = J(rig, "hunch");
  const td = rig.p.torsoD;
  const list = [
    ["neck", ny + 0.03, -0.035, 0.022],
    ["chest", ny - 0.01, -0.085 * td, 0.03],
    ["chest", cy + 0.045, -0.105 * td, 0.034],
    ["chest", cy + 0.005, -0.1 * td, 0.028],
    ["hunch", sy + 0.01, -0.085 * td, 0.022],
    ["spine", sy - 0.04, -0.074 * td, 0.016],
  ];
  for (const [bone, y, z, len] of list) spike(rig, bone, [[0, y, z + 0.01], [0, y + len * 0.35, z - len * 0.6], [0, y + len * 0.4, z - len]], [len * 0.42, 0.001], F.horn, { segs: 7 });
}

/** Muscle masses over the torso tube: traps, pecs, a heavy shoulder cap per arm. */
function musculature(rig, F) {
  const H = rig.H;
  const [, ny] = J(rig, "neck");
  const [, cy] = J(rig, "chest");
  const td = rig.p.torsoD;
  const E = (a, b, c) => ellipsoid(a * H, b * H, c * H, 14);
  for (const [s, sx] of sides) {
    const [ux, uy] = J(rig, `upperArm${s}`);
    attach(rig, "chest", E(0.064, 0.032, 0.056), F.hide, [sx * 0.07, ny - 0.03, -0.026 * td], { rz: sx * 0.42 });
    attach(rig, "chest", E(0.062, 0.048, 0.03), F.hide, [sx * 0.056, cy + 0.06, 0.07 * td], { rz: sx * 0.25 });
    attach(rig, `upperArm${s}`, E(0.05, 0.056, 0.052), F.hide, [ux + sx * 0.004, uy - 0.012, 0.002]);
  }
}

/** Each wing: the arm and finger bones as skinned tubes, the membrane skinned between them. */
function wings(rig, F) {
  const W = rig.p.wings;
  for (const [s, sx] of sides) {
    const root = J(rig, `wingArm${s}`);
    const elbow = J(rig, `wingFore${s}`);
    const wrist = J(rig, `wingFinger${s}0`);
    const A = `wingArm${s}`;
    const Fo = `wingFore${s}`;
    // the membrane's inner edge runs down the flank, so furled wings fold at the sides rather
    // than meeting across the back
    const waist = [sx * 0.085 * rig.p.torsoW, J(rig, "spine")[1] - 0.01, -0.035 * rig.p.torsoD];
    skinTube(
      rig,
      [
        { p: addV(root, [-sx * 0.01, 0, 0.012]), r: 0.03, w: { chest: 0.6, [A]: 0.4 } },
        { p: root, r: 0.028, w: { chest: 0.2, [A]: 0.8 } },
        { p: addV(root, [elbow[0] - root[0], elbow[1] - root[1], elbow[2] - root[2]], 0.5), r: 0.019, w: { [A]: 1 } },
        { p: elbow, r: 0.022, w: { [A]: 0.5, [Fo]: 0.5 } },
        { p: addV(elbow, [wrist[0] - elbow[0], wrist[1] - elbow[1], wrist[2] - elbow[2]], 0.5), r: 0.014, w: { [Fo]: 1 } },
        { p: wrist, r: 0.019, w: { [Fo]: 1 } },
      ],
      F.hide,
      { segs: 10, steps: 3, uv: 6, front: [0, 1, 0] },
    );
    // the thumb's hooked claw at the wrist knuckle
    spike(rig, Fo, [addV(wrist, [0, 0.01, 0.004]), addV(wrist, [sx * 0.01, 0.035, 0.02]), addV(wrist, [sx * 0.004, 0.05, 0.036])], [0.012, 0.001], F.claw, { segs: 7 });
    const ribs = [
      // the arm line back to the shoulder blade, then down the back to the waist: the inner panel
      [
        { p: wrist, w: { [Fo]: 1 } },
        { p: elbow, w: { [A]: 0.5, [Fo]: 0.5 } },
        { p: root, w: { chest: 0.5, [A]: 0.5 } },
      ],
      [
        { p: wrist, w: { [Fo]: 1 } },
        { p: waist, w: { spine: 0.5, hips: 0.5 } },
      ],
    ];
    const fingers = [];
    W.fingers.forEach((f, i) => {
      const Fi = `wingFinger${s}${i}`;
      const Ti = `wingTip${s}${i}`;
      const mid = J(rig, Ti);
      const tip = addV(wrist, [sx * f[0], f[1], f[2]]);
      fingers.push([
        { p: wrist, w: { [Fi]: 1 } },
        { p: addV(wrist, [mid[0] - wrist[0], mid[1] - wrist[1], mid[2] - wrist[2]], 0.6), w: { [Fi]: 1 } },
        { p: mid, w: { [Fi]: 0.5, [Ti]: 0.5 } },
        { p: tip, w: { [Ti]: 1 } },
      ]);
      skinTube(
        rig,
        [
          { p: wrist, r: 0.014, w: { [Fi]: 1 } },
          { p: mid, r: 0.009, w: { [Fi]: 0.5, [Ti]: 0.5 } },
          { p: tip, r: 0.003, w: { [Ti]: 1 } },
        ],
        F.horn,
        { segs: 8, steps: 4, uv: 6, front: [0, 0, 1] },
      );
    });
    // fans from the wrist in angular order: arm line, waist, the fingers back to front
    ribs.push(...fingers.reverse());
    skinMembrane(rig, ribs, F.membrane, {
      cols: 12,
      rows: 5,
      scallop: [0, 0.3, 0.3, 0.24],
      bulge: (u, v) => [0, 0, -0.014 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u)],
    });
  }
}

// --- the build -----------------------------------------------------------------------------

export function demon() {
  const F = demonFabrics();
  const G = fabrics();
  const M = materials();
  const rig = createRig(4.3, {
    hunch: 1,
    jaw: true,
    hipY: 0.56,
    thigh: 0.19,
    shin: 0.2,
    digitigrade: 0.165,
    spine: 0.09,
    neck: 0.115,
    torsoW: 1.45,
    torsoD: 1.32,
    shoulderW: 1.55,
    hipW: 1.0,
    limbR: 1.12,
    armR: 1.45,
    upperArm: 0.175,
    foreArm: 0.165,
    headR: 0.058,
    wings: WING,
    tail: { root: [-0.03, -0.075], segments: 5, length: 0.42 },
  });
  rig.hooks = [];
  skirtBones(rig, { stiffness: 40, drag: 0.3 });

  // the stance: hunched, head thrust forward, legs in their reverse-jointed zig-zag
  Object.assign(rig.rest, {
    hunch: [0.18, 0, 0],
    chest: [0.04, 0, 0],
    neck: [-0.02, 0, 0],
    head: [-0.2, 0, 0],
    jaw: [0.04, 0, 0],
    upperArmL: [-0.32, 0, 0.36],
    upperArmR: [-0.32, 0, -0.36],
    foreArmL: [-0.62, 0, 0],
    foreArmR: [-0.62, 0, 0],
    handL: [-0.25, 0, 0],
    handR: [-0.25, 0, 0],
    tail0: [1.12, 0, 0],
  });
  for (const [s, sx] of sides)
    Object.assign(rig.rest, {
      [`thigh${s}`]: [-0.8, 0, sx * 0.08],
      [`shin${s}`]: [1.72, 0, 0],
      [`metatarsal${s}`]: [-1.32, 0, 0],
      [`foot${s}`]: [0.4, 0, 0],
    });
  // the wings rest furled; poses carry other postures as offsets from it
  const restWing = aimRest(rig, wingAims(rig, FURLED));
  Object.assign(rig.rest, restWing);
  const wingOffset = (posture) => {
    const target = aimRest(rig, wingAims(rig, posture));
    return Object.fromEntries(Object.entries(target).map(([b, e]) => [b, e.map((v, j) => v - restWing[b][j])]));
  };
  // a wing part-way between two postures: each bone's direction is blended, then re-aimed, so a
  // half-flare is a believable half-open wing rather than a blend of Euler angles
  const toward = (to) => (t) => wingOffset(blendPosture(FURLED, to, t));
  const flare = toward(FLARED);
  const spent = toward(SPENT);

  // springs (besides the loincloth's): the trailing half of every wing finger, the tail past its root
  for (const [s] of sides)
    WING.fingers.forEach((_, i) =>
      spring(rig, `wingTip${s}${i}`, {
        stiffness: 40 - i * 4,
        damping: 6,
        drag: 0.1,
        inertia: 2.4,
        limit: 0.6,
        gravity: 0,
        drape: 0.2,
      }),
    );
  for (let i = 1; i < rig.p.tail.segments; i++)
    spring(rig, `tail${i}`, { stiffness: 42 - i * 5, damping: 6, drag: 0.4, inertia: 1.3, limit: 0.75, gravity: 0.22, rest: [0.06, 0, 0], drape: -0.5 });

  const eyeMat = M.hostileEye.clone();
  const eyeBase = eyeMat.emissiveIntensity;
  rig.hooks.push((r, p) => {
    eyeMat.emissiveIntensity = eyeBase * (p.fx.eyes ?? 1);
  });

  const [, hy] = J(rig, "hips");
  torso(rig, F.hide, { hump: 0.03, waist: 0.74, neckW: 1.6 });
  musculature(rig, F);
  neck(rig, F.hide, { w: 1.9 });
  arms(rig, F.hide, { bulk: 1.18 });
  clawHands(rig, F);
  legs(rig, F);
  demonHead(rig, F, eyeMat);
  dorsalSpines(rig, F);
  tail(rig, F);
  wings(rig, F);
  skirt(rig, G.leatherDark, { top: hy + 0.035, bottom: hy - 0.2, rTop: [0.104, 0.112], rBottom: [0.128, 0.13], legFollow: 0.5, panels: true, ragged: { teeth: 9, depth: 0.09, seed: 12 } });

  const style = {
    speed: 0.5,
    clips: {
      idle: (spec) => idle(spec.frames),
      walk: () => walk(),
      attack: () => attack(flare),
      death: () => death(spent),
    },
  };
  return { rig, style };
}

// --- clips ---------------------------------------------------------------------------------

const P = pose;
const scaleBones = (b, k) => Object.fromEntries(Object.entries(b).map(([n, v]) => [n, v.map((x) => x * k)]));

/** Slow, heavy breathing; the wings stir with each breath; the tail sways. */
function idle(n) {
  return Array.from({ length: n }, (_, i) => {
    const ph = (i / n) * Math.PI * 2;
    const br = Math.sin(ph);
    return P(
      {
        hunch: [-0.02 * br, 0, 0],
        chest: [-0.03 * br, 0.02 * Math.sin(ph + 1), 0],
        neck: [0.03 * br, 0.1 * Math.sin(ph * 0.5 + 0.6), 0],
        head: [0, 0.06 * Math.sin(ph + 2), 0],
        upperArmL: [0.03 * br, 0, 0.03 * br],
        upperArmR: [0.03 * br, 0, -0.03 * br],
        wingArmL: [0, 0, 0.05 * br],
        wingArmR: [0, 0, -0.05 * br],
        tail0: [0, 0, 0.18 * Math.sin(ph)],
        thighL: [0, 0, 0.02 * Math.sin(ph + 0.7)],
        thighR: [0, 0, 0.02 * Math.sin(ph + 0.7)],
      },
      { x: 0.005 * Math.sin(ph + 0.7) },
      { jaw: 0.12 + 0.08 * Math.max(0, br) },
    );
  });
}

/**
 * The walk: one heavy step per half, contact, down, passing, up, then mirrored. The swing leg
 * folds at every joint of its zig-zag; the body rolls over the planted foot; the arms swing
 * against the legs; the furled wings bob and the tail swings.
 */
function walk() {
  const legR = [
    // thigh, shin, metatarsal, foot (offsets from the rest zig-zag)
    [-0.42, -0.1, 0.12, -0.08],
    [-0.28, 0.2, -0.06, -0.02],
    [0.02, 0.06, 0.0, 0.0],
    [0.24, 0.0, 0.2, -0.3],
  ];
  const legL = [
    [0.32, 0.12, 0.3, -0.55],
    [0.12, 0.62, 0.34, -0.4],
    [-0.28, 0.86, 0.06, 0.12],
    [-0.5, 0.32, -0.12, 0.2],
  ];
  const half = [0, 1, 2, 3].map((i) => {
    const [tR, sR, mR, fR] = legR[i];
    const [tL, sL, mL, fL] = legL[i];
    const roll = [-0.06, -0.1, -0.04, 0][i];
    return P(
      {
        thighR: [tR, 0, 0],
        shinR: [sR, 0, 0],
        metatarsalR: [mR, 0, 0],
        footR: [fR, 0, 0],
        thighL: [tL, 0, 0],
        shinL: [sL, 0, 0],
        metatarsalL: [mL, 0, 0],
        footL: [fL, 0, 0],
        hips: [0, [0.12, 0.08, 0, -0.06][i], [-0.03, -0.05, -0.02, 0][i]],
        hunch: [[0.02, 0.06, 0.03, 0][i], [-0.06, -0.04, 0, 0.04][i], 0],
        chest: [0, [-0.1, -0.06, 0, 0.06][i], [0.02, 0.04, 0.02, 0][i]],
        neck: [[-0.02, 0.05, 0.02, -0.02][i], [0.08, 0.05, 0, -0.04][i], 0],
        upperArmR: [[0.3, 0.2, 0, -0.2][i], 0, 0],
        foreArmR: [[-0.1, -0.15, -0.25, -0.35][i], 0, 0],
        upperArmL: [[-0.32, -0.22, 0, 0.2][i], 0, 0],
        foreArmL: [[-0.4, -0.3, -0.2, -0.12][i], 0, 0],
        wingArmL: [0, 0, [0.02, -0.06, -0.02, 0.04][i]],
        wingArmR: [0, 0, [-0.02, 0.06, 0.02, -0.04][i]],
        tail0: [0, 0, [0.22, 0.12, -0.05, -0.18][i]],
      },
      { rz: roll * 0.4 },
      { jaw: 0.14 },
    );
  });
  return [...half, ...half.map(mirror)];
}

/**
 * The attack: rear up into a roar (head back, jaw wide, wings flared, arms thrown out), held for
 * half a second; then the right claw raised high and swept down in a raking blow; recovery.
 */
function attack(flare) {
  const k = flare;
  const roar = (wob) =>
    P(
      {
        hips: [-0.06, 0, 0],
        spine: [-0.14, 0, 0],
        hunch: [-0.36, 0, 0],
        chest: [-0.2, 0.03 * wob, 0],
        neck: [-0.3, 0.1 * wob, 0.06 * wob],
        head: [-0.42, 0.08 * wob, 0],
        upperArmL: [-0.85 + 0.05 * wob, 0, 0.62],
        upperArmR: [-0.85 - 0.05 * wob, 0, -0.62],
        foreArmL: [-0.95, 0, 0],
        foreArmR: [-0.95, 0, 0],
        handL: [-0.5, 0, 0],
        handR: [-0.5, 0, 0],
        thighL: [-0.1, 0, 0.06],
        thighR: [0.12, 0, -0.06],
        shinL: [-0.1, 0, 0],
        shinR: [-0.06, 0, 0],
        ...k(1 + 0.04 * wob),
      },
      { z: -0.03 },
      { jaw: 0.92 + 0.08 * Math.abs(wob) },
    );
  const frames = [
    // gather: a crouch, head low, wings lifting
    P(
      { hunch: [0.12, 0, 0], neck: [0.12, 0, 0], upperArmL: [0.1, 0, 0.1], upperArmR: [0.1, 0, -0.1], shinL: [0.15, 0, 0], shinR: [0.15, 0, 0], ...k(0.25) },
      { z: 0.01 },
      { jaw: 0.25 },
    ),
    // the roar, frames 1-5: half a second before the claw moves
    add(scalePose(roar(0.4), 0.9), P({}, {}, { jaw: 0.9 })),
    roar(1),
    roar(-1),
    roar(0.5),
    roar(-0.4),
    // the claw goes up and back
    P(
      {
        spine: [-0.1, -0.2, 0],
        hunch: [-0.25, -0.25, 0],
        chest: [-0.12, -0.3, 0],
        neck: [-0.05, 0.3, 0],
        upperArmR: [-2.05, 0.25, -0.45],
        foreArmR: [-1.35, 0, 0],
        handR: [0.4, 0, 0],
        upperArmL: [-0.4, 0, 0.5],
        foreArmL: [-0.6, 0, 0],
        thighL: [-0.2, 0, 0.06],
        thighR: [0.15, 0, -0.06],
        ...k(0.5),
      },
      { z: -0.02 },
      { jaw: 0.6 },
    ),
    // the rake: down and across, lunging onto the front foot
    P(
      {
        spine: [0.15, 0.25, 0],
        hunch: [0.25, 0.3, 0],
        chest: [0.15, 0.3, 0],
        neck: [0.05, -0.2, 0],
        upperArmR: [-1.1, 0.5, 0.35],
        foreArmR: [-0.2, 0, 0],
        handR: [-0.3, 0, 0],
        upperArmL: [0.3, 0, 0.35],
        foreArmL: [-0.5, 0, 0],
        thighL: [-0.42, 0, 0.06],
        shinL: [0.15, 0, 0],
        thighR: [0.28, 0, -0.06],
        ...k(0.35),
      },
      { z: 0.06 },
      { jaw: 0.8 },
    ),
    // follow-through, the arm low across the body
    P(
      {
        spine: [0.2, 0.3, 0],
        hunch: [0.3, 0.32, 0],
        chest: [0.15, 0.3, 0],
        upperArmR: [-0.4, 0.6, 0.55],
        foreArmR: [-0.4, 0, 0],
        handR: [-0.4, 0, 0],
        upperArmL: [0.35, 0, 0.3],
        thighL: [-0.42, 0, 0.06],
        shinL: [0.2, 0, 0],
        thighR: [0.3, 0, -0.06],
        ...k(0.15),
      },
      { z: 0.07 },
      { jaw: 0.5 },
    ),
    // recovering: back toward the stance, the wings settling on their springs
    P({ spine: [0.06, 0.08, 0], hunch: [0.06, 0.08, 0], upperArmR: [-0.25, 0.12, 0.08], foreArmR: [-0.3, 0, 0], thighL: [-0.1, 0, 0], thighR: [0.06, 0, 0] }, { z: 0.015 }, { jaw: 0.2 }),
  ];
  return frames;
}

function scalePose(p, k) {
  return P(scaleBones(p.b, k), Object.fromEntries(Object.entries(p.body).map(([n, v]) => [n, v * k])), { ...p.fx });
}

/**
 * Death: struck, a last roar; the reverse knees buckle and it drops onto them; it pitches forward
 * and lands on its chest, legs and tail flat behind, the wings falling limp across its back; the eyes fade and are out on the last frame.
 */
function death(spent) {
  const k = spent;
  const legs = (t, kn, mt, ft) => ({ thighL: [t, 0, 0.1], thighR: [t * 0.92, 0, -0.1], shinL: [kn, 0, 0], shinR: [kn * 0.94, 0, 0], metatarsalL: [mt, 0, 0], metatarsalR: [mt * 0.94, 0, 0], footL: [ft, 0, 0], footR: [ft, 0, 0] });
  const prone = legs(0.7, -1.62, 1.22, -0.35);
  return [
    // struck: thrown back, a last roar, the wings jerk up
    P({ hunch: [-0.32, 0, 0], chest: [-0.2, 0.1, 0], neck: [-0.3, 0.12, 0], head: [-0.32, 0, 0], upperArmL: [-0.5, 0, 0.7], upperArmR: [-0.4, 0, -0.6], foreArmL: [-0.5, 0, 0], foreArmR: [-0.6, 0, 0], tail0: [0.2, 0, 0.2], ...legs(0.1, -0.1, 0, 0) }, { z: -0.03 }, { jaw: 1, eyes: 1 }),
    // the reverse knees buckle: down onto them, slumping
    P({ hunch: [0.28, 0, 0.08], chest: [0.15, -0.1, 0.06], neck: [0.3, 0, 0], upperArmL: [-0.25, 0, 0.2], upperArmR: [-0.1, 0, -0.15], foreArmL: [-0.2, 0, 0], tail0: [-0.2, 0, -0.15], ...legs(-0.95, 0.7, 0.75, -0.3), ...k(0.3) }, { rx: 0.12, z: -0.06 }, { jaw: 0.4, eyes: 0.65 }),
    // pitching forward, the arms going out to break the fall
    P({ spine: [0.12, 0, 0], hunch: [0.25, 0, 0.08], chest: [0.15, -0.05, 0.08], neck: [0.15, 0, 0], upperArmL: [-0.9, 0, 0.3], upperArmR: [-0.8, 0, -0.25], foreArmL: [-0.3, 0, 0], foreArmR: [-0.3, 0, 0], tail0: [-0.5, 0, -0.2], ...legs(-0.6, 0.35, 0.55, -0.25), ...k(0.5) }, { rx: 0.5, z: -0.14 }, { jaw: 0.3, eyes: 0.45 }),
    // falling
    P({ spine: [0.05, 0, 0], hunch: [0.1, 0, 0.06], chest: [0.05, 0, 0.06], neck: [-0.15, 0.2, 0], upperArmL: [-1.3, 0, 0.4], upperArmR: [-1.15, 0, -0.35], foreArmL: [-0.4, 0, 0], foreArmR: [-0.4, 0, 0], tail0: [-0.9, 0, -0.2], ...legs(0.1, -0.5, 0.6, -0.3), ...k(0.75) }, { rx: 1.0, z: -0.26 }, { jaw: 0.25, eyes: 0.25 }),
    // it lands on its chest, legs and tail behind it, the wings slumping across its back
    P({ hunch: [0.02, 0, 0.05], chest: [0, 0.05, 0.05], neck: [-0.3, 0.45, 0], upperArmL: [-1.35, 0, 0.6], upperArmR: [-0.7, 0, -0.45], foreArmL: [-0.8, 0, 0], foreArmR: [-0.3, 0, 0], tail0: [-1.15, 0, -0.25], ...prone, ...k(0.95) }, { rx: 1.4, z: -0.34 }, { jaw: 0.3, eyes: 0.1 }),
    P({ spine: [-0.03, 0, 0], hunch: [0, 0, 0.05], chest: [-0.03, 0.1, 0.05], neck: [-0.36, 0.66, 0], upperArmL: [-1.3, 0, 0.63], upperArmR: [-0.42, 0, -0.38], foreArmL: [-1.05, 0, 0], foreArmR: [-0.25, 0, 0], tail0: [-1.2, 0, -0.3], ...prone, ...k(1.02) }, { rx: 1.48, z: -0.37 }, { jaw: 0.35, eyes: 0 }),
  ];
}
