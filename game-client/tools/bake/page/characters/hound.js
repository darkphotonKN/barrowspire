// The archer's hound (FS-X2CMM §I R47, Call the Hound R28): a lean grey hunting hound, the
// archer's ally for its 40 s, built on the shared rig's quadruped variant (rig.js QUADRUPED,
// ADR-0021) as the boar is. A working sighthound of the barrow country, never a cartoon dog and
// never a hostile: it wears a plain leather collar, and its eyes are dark and wet, not the
// hostile ember (guideline "Enemy design language": the ember red is the hostile channel).
//
// Built lean and long-legged: a deep, narrow chest let down to the elbow, a tucked-up waist under
// an arched loin, a sloping croup, long fine legs on small tight paws. The neck is long and
// carries a long, narrow head with a fine muzzle and small rose ears folded back. The tail is
// long and thin, carried low with a curve, lagging on springs. A short grey coat, darker on the
// saddle and the muzzle, paler at the throat, chest and under the belly, with a little brindle
// through it; every tone from the cold, neutral end of BARROW (slate, slateLight, charcoal,
// vellumDark), the collar's leather and brass ring from the gear tones.
//
// Its clips: an alert idle, a running gallop (the double-suspension of a sighthound, the spine
// gathering and stretching), the bite (a crouch with the head drawn back, the lunge with the jaws
// open, the snap, the recovery) and the fall (struck, the hind legs go, it rolls onto its side
// and lies still: no gore, as every living animal falls).
//
// H is the hound's body length, rump to nose (rig.js QUADRUPED). It is drawn at its baked size:
// at 1.45 units against a player's 2 it stands a little under half a player's height at the
// withers, as a real hound beside a man.
//
// The look is all in this file, so the owner can swap the hound without touching the bake or the
// client: cast.js only names `hound` and HOUND_ANIMATIONS.

import * as THREE from "three";
import { materials } from "../materials.js";
import { mix, shade } from "../palette.js";
import { smoothstep } from "../noise.js";
import { attach, createRig, ellipsoid, jointAt as J, rigidTube, skinTube, spring } from "./rig.js";
import { mat, paint, pf, pn } from "./fabrics.js";
import { pose } from "./clips.js";

const P = pose;
const sides = [
  ["L", 1],
  ["R", -1],
];

/** Body length in world units, rump to nose (a player stands about 2). */
const LENGTH = 1.45;

/**
 * Its clips, in the standard slots (guideline: idle, walk, attack, death): the walk slot is its
 * run, the gallop it always moves at; the attack slot its bite; the death slot its fall. The bite
 * is as long as the server's 1 s between bites allows; the fall ends lying still.
 */
export const HOUND_ANIMATIONS = {
  idle: { frames: 6, fps: 5, loop: true },
  walk: { frames: 8, fps: 14, loop: true, speed: 2 },
  attack: { frames: 7, fps: 12, loop: false },
  death: { frames: 7, fps: 9, loop: false },
};

// --- coat and materials ------------------------------------------------------------------------

/** Tones from BARROW's cold, neutral end: a grey hound, never a hostile's grave tones or amber. */
const TONE = {
  coat: mix(mix("slate", "slateLight", 0.75), "vellumDark", 0.2),
  saddle: mix("slate", "charcoal", 0.35),
  pale: mix(mix("slateLight", "vellumDark", 0.45), "vellum", 0.12),
  muzzle: mix("slate", "charcoal", 0.55),
  brindle: mix("charcoal", "slate", 0.3),
  nose: mix("pitch", "charcoal", 0.4),
  claw: mix("charcoal", "slate", 0.25),
  collar: mix(mix("barrowDeep", "umber", 0.4), "barrowBrown", 0.25),
};

/**
 * A short, close coat: fine streaks along the body (texture y runs along a tube), a faint brindle
 * of darker bars across them, and a soft mottle, so the grey is never a flat fill.
 */
function shortCoat(tone, { brindle = 0.25, seed = 201 } = {}) {
  return paint(
    (x, y) => {
      const streak = pn(x, y, 1, 8, seed);
      const mottle = pf(x, y, 32, seed + 1);
      const bar = smoothstep(0.55, 0.85, pn(x, y, 16, 2, seed + 2) * 0.6 + pf(x, y, 16, seed + 3) * 0.4) * brindle;
      let c = shade(tone, 0.86 + 0.2 * streak + 0.14 * (mottle - 0.5));
      c = mix(c, shade(TONE.brindle, 0.9 + 0.2 * streak), bar);
      return { c, h: 0.45 + 0.3 * streak + 0.15 * mottle };
    },
    { strength: 0.9 },
  );
}

/** Bare leathery skin: the nose leather and the pads, fine creases. */
function leather(tone, { seed = 211 } = {}) {
  return paint(
    (x, y) => {
      const crease = pn(x, y, 4, 4, seed);
      const m = pf(x, y, 16, seed + 1);
      return { c: shade(tone, 0.85 + 0.2 * m + 0.1 * crease), h: 0.5 + 0.3 * crease };
    },
    { strength: 1 },
  );
}

/** The collar's worn leather: lengthwise grain and scuffs. */
function collarLeather(tone, { seed = 221 } = {}) {
  return paint(
    (x, y) => {
      const grain = pn(x, y, 2, 16, seed);
      const scuff = smoothstep(0.7, 0.9, pf(x, y, 16, seed + 1));
      return { c: shade(tone, 0.8 + 0.2 * grain + 0.3 * scuff), h: 0.5 + 0.2 * grain };
    },
    { strength: 1 },
  );
}

let FABRICS = null;

/** The hound's materials, painted once per bake (seeded, so a re-bake paints alike). */
function houndFabrics() {
  if (FABRICS) return FABRICS;
  FABRICS = {
    coat: mat(shortCoat(TONE.coat), { rough: 0.9, normal: 0.8 }),
    legs: mat(shortCoat(shade(TONE.coat, 0.95), { brindle: 0.15, seed: 203 }), { rough: 0.9, normal: 0.7 }),
    muzzle: mat(shortCoat(TONE.muzzle, { brindle: 0.05, seed: 205 }), { rough: 0.85, normal: 0.6 }),
    ear: mat(shortCoat(TONE.saddle, { brindle: 0, seed: 207 }), { rough: 0.9, side: THREE.DoubleSide }),
    nose: mat(leather(TONE.nose), { rough: 0.35, normal: 0.6 }),
    claw: mat(leather(TONE.claw, { seed: 213 }), { rough: 0.5 }),
    collar: mat(collarLeather(TONE.collar), { rough: 0.7 }),
  };
  return FABRICS;
}

/**
 * Shades a skinned part per vertex from its bind-pose position (`fn(p) → [r, g, b]` multiplier, p
 * in H): the dark saddle, the pale chest and belly, legs paling toward the paws. Form first.
 */
function shadeBy(mesh, H, fn) {
  const pos = mesh.geometry.attributes.position;
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = fn([pos.getX(i) / H, pos.getY(i) / H, pos.getZ(i) / H]);
    c.set(v, i * 3);
  }
  mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  mesh.material = mesh.material.clone();
  mesh.material.vertexColors = true;
  return mesh;
}

/** A tone as a multiplier over the coat's own tone (vertex colours multiply the map). */
const over = (tone, v = 1) => tone.map((x, i) => (x / Math.max(1, TONE.coat[i])) * v);
const lerp3 = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const ONE = [1, 1, 1];

// --- the build ---------------------------------------------------------------------------------

/**
 * The barrel: croup to the base of the neck, deepest at the brisket and tucked up at the waist.
 * Each entry is [z, centre y, lateral r, vertical r, weights], in H.
 */
const BARREL = [
  [-0.4, 0.515, 0.028, 0.032, { hips: 1 }],
  [-0.378, 0.5, 0.056, 0.066, { hips: 1 }],
  [-0.33, 0.497, 0.07, 0.088, { hips: 1 }],
  [-0.25, 0.51, 0.068, 0.084, { hips: 1 }],
  [-0.16, 0.525, 0.06, 0.072, { hips: 0.55, spine: 0.45 }],
  [-0.07, 0.522, 0.064, 0.085, { spine: 1 }],
  [0.02, 0.5, 0.074, 0.11, { spine: 0.6, chest: 0.4 }],
  [0.1, 0.48, 0.082, 0.14, { spine: 0.2, chest: 0.8 }],
  [0.17, 0.48, 0.084, 0.15, { chest: 1 }],
  [0.23, 0.495, 0.078, 0.135, { chest: 1 }],
  [0.275, 0.52, 0.062, 0.1, { chest: 0.6, neck: 0.4 }],
];

/** The top and the bottom of the barrel at `z` (H), clamped to its length. */
function barrelAt(z) {
  const zc = Math.max(BARREL[0][0], Math.min(BARREL[BARREL.length - 1][0], z));
  for (let i = 1; i < BARREL.length; i++) {
    const [z1, y1, , r1] = BARREL[i];
    const [z0, y0, , r0] = BARREL[i - 1];
    if (zc <= z1) {
      const t = (zc - z0) / (z1 - z0);
      const y = y0 + (y1 - y0) * t;
      const r = r0 + (r1 - r0) * t;
      return { top: y + r, bottom: y - r };
    }
  }
  const [, y, , r] = BARREL[BARREL.length - 1];
  return { top: y + r, bottom: y - r };
}

/** The coat's light and dark: a dark saddle down the back, pale under the chest and belly. */
function coatShade([x, y, z]) {
  const { top, bottom } = barrelAt(z);
  const up = (y - bottom) / Math.max(0.02, top - bottom); // 0 at the belly, 1 on the back
  const side = Math.abs(x) / 0.09;
  let c = lerp3(over(TONE.pale), ONE, smoothstep(0.08, 0.45, up));
  c = lerp3(c, over(TONE.saddle), smoothstep(0.72, 0.98, up) * (1 - 0.4 * smoothstep(0.5, 1, side)));
  return c;
}

function barrel(rig, F) {
  const mesh = skinTube(
    rig,
    BARREL.map(([z, y, rx, ry, w]) => ({ p: [0, y, z], r: [rx, ry], w, n: 2.15 })),
    F.coat,
    { segs: 22, steps: 4, uv: 5, front: [0, 1, 0] },
  );
  return shadeBy(mesh, rig.H, coatShade);
}

/** The long neck, rising forward from the shoulders to the back of the skull, pale at the throat. */
function neckTube(rig, F) {
  const [, ny, nz] = J(rig, "neck");
  const [, hy, hz] = J(rig, "head");
  const mesh = skinTube(
    rig,
    [
      { p: [0, 0.535, 0.22], r: [0.07, 0.1], w: { chest: 1 } },
      { p: [0, (ny + 0.545) / 2 + 0.01, (nz + 0.25) / 2], r: [0.056, 0.078], w: { chest: 0.5, neck: 0.5 } },
      { p: [0, ny + 0.01, nz], r: [0.046, 0.06], w: { neck: 1 } },
      { p: [0, (ny + hy) / 2 + 0.005, (nz + hz) / 2], r: [0.04, 0.05], w: { neck: 0.7, head: 0.3 } },
      { p: [0, hy - 0.002, hz - 0.012], r: [0.037, 0.046], w: { neck: 0.3, head: 0.7 } },
    ],
    F.coat,
    { segs: 16, steps: 3, uv: 5 },
  );
  // dark along the crest, pale down the throat
  return shadeBy(mesh, rig.H, ([, y, z]) => {
    const t = Math.max(0, Math.min(1, (z - 0.22) / (hz - 0.22)));
    const crest = 0.535 + (hy - 0.535) * t;
    const up = (y - (crest - 0.09)) / 0.11;
    return lerp3(lerp3(over(TONE.pale), ONE, smoothstep(0.15, 0.55, up)), over(TONE.saddle), smoothstep(0.75, 1.05, up));
  });
}

/** A leg's shade: the coat's own where it meets the barrel, paling down to the paw. */
function legShade(p) {
  const [, y, z] = p;
  const below = lerp3(over(TONE.pale, 1.02), ONE, smoothstep(0.06, 0.3, y));
  return lerp3(below, coatShade(p), smoothstep(barrelAt(z).bottom - 0.04, barrelAt(z).bottom + 0.02, y));
}

/** A small tight paw: a knuckled pad of toes and four dark claws, standing on the ground. */
function paw(rig, bone, x, y, z, F) {
  const H = rig.H;
  attach(rig, bone, ellipsoid(0.021 * H, 0.014 * H, 0.03 * H, 10), F.legs, [x, y + 0.012, z + 0.012], { ground: true });
  for (const dx of [-0.011, -0.004, 0.004, 0.011])
    attach(rig, bone, ellipsoid(0.0025 * H, 0.004 * H, 0.006 * H, 6), F.claw, [x + dx, y + 0.006, z + 0.04], { rx: 0.6 });
}

/** One foreleg: a lean forearm under the shoulder blade, a fine cannon to the pastern, a paw. */
function foreleg(rig, s, sx, F) {
  const [, sy, sz] = J(rig, `upperArm${s}`);
  const [, ey, ez] = J(rig, `foreArm${s}`);
  const [, ky, kz] = J(rig, `hand${s}`);
  const x = sx * J(rig, `upperArm${s}`)[0] * 1.0;
  const U = `upperArm${s}`;
  const A = `foreArm${s}`;
  const W = `hand${s}`;
  const mesh = skinTube(
    rig,
    [
      { p: [x * 0.6, sy + 0.06, sz + 0.01], r: [0.04, 0.06], w: { chest: 0.8, [U]: 0.2 } },
      { p: [x * 0.95, sy - 0.03, sz + 0.004], r: [0.033, 0.05], w: { chest: 0.15, [U]: 0.85 } },
      { p: [x * 1.02, ey + 0.015, ez + 0.002], r: [0.024, 0.032], w: { [U]: 0.5, [A]: 0.5 } },
      { p: [x, (ey + ky) / 2 + 0.02, (ez + kz) / 2], r: [0.017, 0.02], w: { [A]: 1 } },
      { p: [x, ky + 0.008, kz], r: [0.016, 0.018], w: { [A]: 0.5, [W]: 0.5 } },
      { p: [x, 0.03, kz + 0.008], r: [0.014, 0.016], w: { [W]: 1 } },
    ],
    F.legs,
    { segs: 12, steps: 3, uv: 5 },
  );
  shadeBy(mesh, rig.H, legShade);
  paw(rig, W, x, 0, kz + 0.004, F);
}

/** One hind leg: a muscled thigh, a long second thigh, the hock well let down, a paw. */
function hindleg(rig, s, sx, F) {
  const [, hy, hz] = J(rig, `thigh${s}`);
  const [, ty, tz] = J(rig, `shin${s}`);
  const [, ky, kz] = J(rig, `foot${s}`);
  const x = sx * J(rig, `thigh${s}`)[0];
  const T = `thigh${s}`;
  const S = `shin${s}`;
  const Fo = `foot${s}`;
  const mesh = skinTube(
    rig,
    [
      { p: [x * 0.5, hy + 0.05, hz - 0.01], r: [0.045, 0.07], w: { hips: 0.8, [T]: 0.2 } },
      { p: [x * 0.95, hy - 0.04, hz + 0.02], r: [0.042, 0.064], w: { hips: 0.1, [T]: 0.9 } },
      { p: [x * 1.1, ty + 0.02, tz - 0.004], r: [0.028, 0.034], w: { [T]: 0.5, [S]: 0.5 } },
      { p: [x * 1.02, (ty + ky) / 2, (tz + kz) / 2 - 0.006], r: [0.021, 0.026], w: { [S]: 1 } },
      { p: [x, ky + 0.008, kz - 0.008], r: [0.016, 0.02], w: { [S]: 0.5, [Fo]: 0.5 } },
      { p: [x, (ky + 0.03) / 2, kz + 0.012], r: [0.0145, 0.016], w: { [Fo]: 1 } },
      { p: [x, 0.03, kz + 0.022], r: [0.014, 0.016], w: { [Fo]: 1 } },
    ],
    F.legs,
    { segs: 12, steps: 3, uv: 5 },
  );
  shadeBy(mesh, rig.H, legShade);
  paw(rig, Fo, x, 0, kz + 0.018, F);
}

/**
 * The head: a long, narrow wedge from the back of the skull to a fine muzzle, a slight stop
 * between the eyes, the nose leather at its tip, dark wet eyes set to the side, small rose ears
 * folded back along the skull, and the lower jaw that opens for the bite.
 */
function head(rig, F) {
  const M = materials();
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const [, jy, jz] = J(rig, "jaw");
  const at = (x, y, z) => [x, hy + y, hz + z];
  const atJaw = (x, y, z) => [x, jy + y, jz + z];
  const r = (...v) => v.map((x) => x * H);
  // the skull and the muzzle, one tube, tipped a little down along the muzzle
  const skull = rigidTube(
    H,
    [
      { p: at(0, 0.012, -0.03), r: [0.034, 0.038] },
      { p: at(0, 0.014, 0.0), r: [0.042, 0.042] },
      { p: at(0, 0.008, 0.035), r: [0.038, 0.036] },
      { p: at(0, -0.004, 0.07), r: [0.026, 0.027] },
      { p: at(0, -0.012, 0.11), r: [0.02, 0.021] },
      { p: at(0, -0.018, 0.145), r: [0.016, 0.016] },
      { p: at(0, -0.02, 0.158), r: [0.012, 0.012] },
    ],
    { segs: 16, steps: 3, uv: 5, front: [0, 1, 0], caps: true },
  );
  const skullMesh = attach(rig, "head", skull, F.coat);
  // the muzzle darker toward the nose
  shadeBy(skullMesh, H, ([, , z]) => lerp3(ONE, over(TONE.muzzle), smoothstep(hz + 0.05, hz + 0.14, z)));
  // the cheeks and the brow over the eyes
  for (const [, sx] of sides) attach(rig, "head", ellipsoid(...r(0.018, 0.026, 0.034), 10), F.coat, at(sx * 0.026, -0.004, 0.012));
  attach(rig, "head", ellipsoid(...r(0.03, 0.012, 0.022), 10), F.coat, at(0, 0.03, 0.03), { rx: 0.3 });
  // the nose leather at the tip
  attach(rig, "head", ellipsoid(...r(0.013, 0.011, 0.01), 10), F.nose, at(0, -0.014, 0.161));
  // dark, wet eyes set a little to the side under the brow
  for (const [, sx] of sides) {
    attach(rig, "head", ellipsoid(...r(0.0085, 0.0075, 0.009), 8), M.black, at(sx * 0.03, 0.017, 0.04), { ry: sx * 0.6, noShadow: true });
  }
  // rose ears: small flaps folded back and down along the back of the skull
  for (const [, sx] of sides) {
    const ear = ellipsoid(...r(0.006, 0.026, 0.04), 10);
    attach(rig, "head", ear, F.ear, at(sx * 0.03, 0.03, -0.03), { rx: -0.55, rz: -sx * 0.5, ry: sx * 0.25 });
  }
  // the lower jaw, a long fine bar under the muzzle, and a line of pale teeth seen when it opens
  attach(rig, "jaw", ellipsoid(...r(0.017, 0.011, 0.07), 10), F.muzzle, atJaw(0, -0.004, 0.065), { rx: 0.08 });
  for (const [, sx] of sides)
    attach(rig, "jaw", new THREE.ConeGeometry(0.004 * H, 0.012 * H, 5), M.bone, atJaw(sx * 0.009, 0.008, 0.115), { rx: 0.1 });
  for (const [, sx] of sides)
    attach(rig, "head", new THREE.ConeGeometry(0.004 * H, 0.013 * H, 5), M.bone, at(sx * 0.011, -0.026, 0.13), { rx: Math.PI - 0.1 });
}

/** A plain leather collar about the neck, with its brass ring: a kept hound, never a stray. */
function collar(rig, F) {
  const M = materials();
  const H = rig.H;
  const [, ny, nz] = J(rig, "neck");
  const [, hy, hz] = J(rig, "head");
  // the neck's slope there: the collar rings it square
  const tilt = Math.atan2(hy - ny, hz - nz);
  const band = new THREE.TorusGeometry(0.05 * H, 0.009 * H, 6, 20);
  band.scale(0.92, 1.18, 1);
  const at = [0, ny + 0.012, nz + 0.005];
  attach(rig, "neck", band, F.collar, at, { rx: -tilt });
  const ring = new THREE.TorusGeometry(0.011 * H, 0.0028 * H, 5, 10);
  attach(rig, "neck", ring, M.brass, [0, at[1] - 0.058 * Math.cos(tilt), at[2] + 0.058 * Math.sin(tilt) * 0.6], { rx: -tilt, ry: Math.PI / 2 });
}

/** The long thin tail, carried low, curving at the tip, its joints lagging on springs. */
function tail(rig, F) {
  const H = rig.H;
  const pts = [0, 1, 2, 3].map((i) => J(rig, `tail${i}`));
  const [, y3, z3] = pts[3];
  const cps = [
    { p: [0, pts[0][1] + 0.016, pts[0][2] + 0.02], r: 0.016, w: { hips: 0.6, tail0: 0.4 } },
    { p: [0, pts[0][1] - 0.01, pts[0][2]], r: 0.013, w: { tail0: 1 } },
    { p: [0, pts[1][1], pts[1][2]], r: 0.011, w: { tail1: 1 } },
    { p: [0, pts[2][1], pts[2][2]], r: 0.009, w: { tail2: 1 } },
    { p: [0, y3, z3], r: 0.007, w: { tail3: 1 } },
    { p: [0, y3 - 0.05, z3 - 0.01], r: 0.003, w: { tail3: 1 } },
  ];
  const mesh = skinTube(rig, cps, F.legs, { segs: 8, steps: 3, ground: false });
  shadeBy(mesh, H, () => over(TONE.saddle, 1.05));
  // carried low and a little out behind, the tip lifting in a curve
  rig.rest.tail0 = [0.55, 0, 0];
  spring(rig, "tail1", { stiffness: 50, damping: 6, gravity: 0.3, limit: 0.8, rest: [-0.15, 0, 0] });
  spring(rig, "tail2", { stiffness: 42, damping: 5, gravity: 0.3, limit: 0.8, rest: [-0.35, 0, 0] });
  spring(rig, "tail3", { stiffness: 36, damping: 5, gravity: 0.25, limit: 0.8, rest: [-0.55, 0, 0] });
}

/** The hound on the shared rig's quadruped variant, with its style for the clips. */
export function hound() {
  const F = houndFabrics();
  const rig = createRig(LENGTH, {
    quadruped: {
      hipY: 0.5,
      rump: -0.28,
      back: 0.45,
      rise: 0.04,
      neck: 0.1,
      head: 0.09,
      headDrop: 0.12,
      jaw: [-0.022, 0.012],
      shoulderX: 0.052,
      shoulderDrop: 0.07,
      hipX: 0.05,
      foreLeg: [0.2, 0.2],
      hindLeg: [0.19, 0.2],
      stifle: 0.075,
      hock: -0.1,
    },
    jaw: true,
    tail: { root: [-0.005, -0.12], segments: 4, length: 0.3 },
  });
  rig.hooks = [];

  barrel(rig, F);
  neckTube(rig, F);
  for (const [s, sx] of sides) {
    foreleg(rig, s, sx, F);
    hindleg(rig, s, sx, F);
  }
  head(rig, F);
  collar(rig, F);
  tail(rig, F);

  const style = {
    speed: 1.6,
    clips: {
      idle: (spec) => idle(spec.frames),
      walk: (spec) => gallop(spec.frames),
      attack: () => bite(),
      death: () => fall(),
    },
  };
  return { rig, style };
}

// --- clips -------------------------------------------------------------------------------------
//
// Bone angles on the quadruped (clips.js conventions, as the boar's): for a leg hanging along -y,
// +rx swings it back and -rx forward; +rx on a foreleg's `hand` folds the knee (the paw tucks
// back); on the spine bones, which run along +z, +rx pitches the front down. `body.rx` pitches the
// whole hound (+ nose down), `body.rz` rolls it (+ onto its right side), `body.z` carries it
// forward, `body.y` lifts it off the ground (the gallop's flight).

/** The tail at its carry (`rig.rest.tail0`): clips add to it. */
const TAIL = { tail0: [0, 0, 0] };

/** Standing alert: slow breath, the head turning to look about, the tail swaying a little. */
function idle(n) {
  return Array.from({ length: n }, (_, i) => {
    const ph = (i / n) * Math.PI * 2;
    return P(
      {
        spine: [0.01 * Math.sin(ph), 0, 0],
        chest: [-0.01 * Math.sin(ph), 0, 0],
        neck: [0.04 * Math.sin(ph + 0.6), 0.1 * Math.sin(ph), 0],
        head: [0.04 * Math.sin(ph * 2), 0.12 * Math.sin(ph + 0.3), 0.04 * Math.sin(ph + 1)],
        tail0: [0, 0, 0.18 * Math.sin(ph)],
        thighL: [0.03, 0, 0],
        thighR: [0.03, 0, 0],
        upperArmL: [-0.02, 0, 0],
        upperArmR: [-0.02, 0, 0],
      },
      { x: 0.003 * Math.sin(ph + 0.7) },
      { jaw: 0.04 + 0.03 * Math.sin(ph * 2) },
    );
  });
}

/**
 * The gallop (8 frames at 14 fps): the sighthound's double suspension. The hind legs reach
 * forward under the gathered, arched body and drive; it stretches out flat in flight, forelegs
 * reaching ahead and hind legs flung out behind; the forelegs land and pull, and it gathers
 * again. Each pair a little apart (a rotary gallop), the head carried low and forward, steady.
 */
function gallop(n) {
  return Array.from({ length: n }, (_, i) => {
    const ph = (i / n) * Math.PI * 2;
    // stretch: +1 laid out flat (forelegs ahead, hind legs behind), -1 gathered (all four under it)
    const stretch = Math.sin(ph);
    const b = {
      spine: [0.14 * stretch, 0, 0],
      chest: [-0.1 * stretch, 0, 0],
      hips: [-0.04 * stretch, 0, 0],
      neck: [0.42 - 0.08 * stretch, 0, 0],
      head: [-0.16 + 0.04 * stretch, 0, 0],
      tail0: [0.4 + 0.15 * stretch, 0, 0.08 * Math.sin(ph)],
    };
    for (const [s, lead] of [
      ["L", 0],
      ["R", 0.35],
    ]) {
      const f = ph + lead;
      // forelegs: ahead when stretched, back under the body when gathered; tucked as they swing on
      const reach = Math.sin(f);
      const swing = Math.max(0, Math.cos(f));
      b[`upperArm${s}`] = [-0.95 * reach - 0.1 * swing, 0, 0];
      b[`foreArm${s}`] = [-0.3 * swing + 0.05, 0, 0];
      b[`hand${s}`] = [1.7 * swing + 0.15 * Math.max(0, -reach), 0, 0];
      // hind legs: flung out behind when stretched, forward under the belly when gathered
      const h = ph + lead + 0.15;
      const back = Math.sin(h);
      const hswing = Math.max(0, -Math.cos(h));
      b[`thigh${s}`] = [0.8 * back - 0.3 * hswing, 0, 0];
      b[`shin${s}`] = [0.28 * hswing - 0.1 * Math.max(0, back), 0, 0];
      b[`foot${s}`] = [-0.4 * hswing + 0.35 * Math.max(0, back), 0, 0];
    }
    return P(b, { y: 0.06 * Math.max(0, stretch), rx: -0.05 * stretch }, { jaw: 0.15 + 0.05 * Math.max(0, stretch) });
  });
}

/** Both forelegs or both hind legs at once. */
const pair = (front, hind) => ({
  ...(front ? { upperArmL: front[0], upperArmR: front[0], foreArmL: front[1], foreArmR: front[1], handL: front[2], handR: front[2] } : {}),
  ...(hind ? { thighL: hind[0], thighR: hind[0], shinL: hind[1], shinR: hind[1], footL: hind[2], footR: hind[2] } : {}),
});

/**
 * The bite (7 frames at 12 fps): it crouches, haunches gathered, the head drawn back and low and
 * the lips lifting (frames 0–2), the wind-up read before it lands; then the lunge, neck out and
 * jaws wide (3), the snap shut on the strike (4), and it settles back to stand (5–6).
 */
function bite() {
  const gathered = pair([[0.12, 0, 0], [0, 0, 0], [0.2, 0, 0]], [[-0.3, 0, 0], [0.4, 0, 0], [-0.2, 0, 0]]);
  return [
    P({ neck: [0.1, 0, 0], head: [-0.05, 0, 0], ...TAIL }, {}, { jaw: 0.1 }),
    P({ ...gathered, neck: [0.35, 0, 0], head: [-0.25, 0, 0], tail0: [0.15, 0, 0] }, { z: -0.03, rx: 0.04 }, { jaw: 0.25 }),
    P({ ...gathered, neck: [0.45, 0, 0], head: [-0.3, 0, 0], tail0: [0.2, 0, 0] }, { z: -0.045, rx: 0.06 }, { jaw: 0.35 }),
    P({ ...pair([[-0.55, 0, 0], [0, 0, 0], [0.3, 0, 0]], [[0.45, 0, 0], [-0.05, 0, 0], [0.3, 0, 0]]), neck: [0.7, 0, 0], head: [-0.15, 0, 0], tail0: [0.35, 0, 0] }, { z: 0.15, rx: 0.08 }, { jaw: 1.4 }),
    P({ ...pair([[-0.4, 0, 0], [0, 0, 0], [0.15, 0, 0]], [[0.35, 0, 0], [0, 0, 0], [0.2, 0, 0]]), neck: [0.62, 0, 0], head: [0.08, 0, 0], tail0: [0.35, 0, 0] }, { z: 0.16, rx: 0.07 }, { jaw: 0.05 }),
    P({ ...pair([[-0.15, 0, 0], [0, 0, 0], [0.08, 0, 0]], [[0.12, 0, 0], [0.05, 0, 0], [0.05, 0, 0]]), neck: [0.3, 0, 0], head: [0.02, 0, 0], tail0: [0.15, 0, 0] }, { z: 0.06 }, { jaw: 0.15 }),
    P({ neck: [0.1, 0, 0], head: [-0.03, 0, 0], ...TAIL }, { z: 0.02 }, { jaw: 0.08 }),
  ];
}

/**
 * The fall (7 frames at 9 fps): struck, the head flung up; the hind legs give and the haunches
 * drop; the forelegs fold and it rolls onto its right side, legs out, head down, and lies still.
 * It slides across as it rolls, so it lies over its footprint.
 */
function fall() {
  return [
    P({ neck: [-0.25, 0, 0], head: [-0.2, 0, 0], ...TAIL }, { z: -0.02, rx: -0.04 }, { jaw: 0.5 }),
    P({ ...pair(null, [[-0.5, 0, 0], [0.9, 0, 0], [-0.4, 0, 0]]), neck: [0.05, 0, 0.05], head: [-0.05, 0, 0], tail0: [-0.25, 0, 0] }, { rx: -0.14, z: -0.02 }, { jaw: 0.6 }),
    P({ ...pair([[0.3, 0, 0], [-0.2, 0, 0], [1.2, 0, 0]], [[-0.45, 0, 0], [0.9, 0, 0], [-0.35, 0, 0]]), neck: [0.2, 0, 0.12], head: [0.05, 0, 0.05], tail0: [-0.25, 0, 0] }, { rx: 0.02, rz: 0.2, x: 0.03 }, { jaw: 0.5 }),
    P({ ...pair([[0.1, 0, 0], [-0.1, 0, 0], [0.8, 0, 0]], [[-0.3, 0, 0], [0.6, 0, 0], [-0.2, 0, 0]]), neck: [0.25, 0, 0.22], head: [0.05, 0, 0.12], tail0: [-0.25, 0, 0.2] }, { rx: 0.03, rz: 0.65, x: 0.11 }, { jaw: 0.4 }),
    P({ ...pair([[-0.2, 0, 0], [0, 0, 0], [0.35, 0, 0]], [[-0.1, 0, 0], [0.25, 0, 0], [0, 0, 0]]), neck: [0.3, 0, 0.3], head: [0.1, 0, 0.15], tail0: [-0.35, 0, 0.3] }, { rx: 0.02, rz: 1.15, x: 0.22 }, { jaw: 0.3 }),
    P({ ...pair([[-0.35, 0, 0], [0, 0, 0], [0.15, 0, 0]], [[0.2, 0, 0], [0.05, 0, 0], [0.1, 0, 0]]), neck: [0.35, 0, 0.32], head: [0.15, 0, 0.18], tail0: [-0.45, 0, 0.35] }, { rz: 1.48, x: 0.29 }, { jaw: 0.25 }),
    P({ ...pair([[-0.32, 0, 0], [0, 0, 0], [0.18, 0, 0]], [[0.22, 0, 0], [0.05, 0, 0], [0.12, 0, 0]]), neck: [0.36, 0, 0.34], head: [0.16, 0, 0.2], tail0: [-0.45, 0, 0.35] }, { rz: 1.54, x: 0.3 }, { jaw: 0.25 }),
  ];
}
