// The archer's wolf (FS-X2CMM §Change: The archer's wolf W1; Call the Wolf, R28): a grey-brown
// timber wolf, the archer's ally for its 40 s, built on the shared rig's quadruped variant (rig.js
// QUADRUPED, ADR-0021) as the boar is. In code it keeps the summon's internal name, `hound`: the
// sheet (`creature_hound_base`), its group, this file and its exports are the hound's, so nothing
// that loads it changes (W2). A wild wolf of the barrow country that came to the archer's call, never
// a cartoon dog and never a hostile: its eyes are dark, not the hostile ember (guideline "Enemy
// design language": the ember red is the hostile channel), and it is known for the archer's by the
// verdigris ring the client lays under it.
//
// Built heavy in front, as a wolf is, against R47's lean hound: a deep, broad chest let down to the
// elbow, a heavy neck under a thick ruff that stands out over the shoulders and hangs at the throat,
// a straight back over a barely tucked belly, a sloping croup with full breeches on the thighs, long
// strong legs on big paws. The head is broad in the skull with a long muzzle, cheek ruffs flaring
// behind the jaw, and pricked ears standing up. The tail is a long full brush carried low behind the
// hocks, its tip dark, lagging on springs. A grizzled grey-brown coat: a dark cape over the shoulders
// and the back, tawny on the muzzle and the legs, pale at the throat, under the belly and inside the
// legs, every tone from BARROW's slate and brown (slate, slateLight, charcoal, barrowBrown,
// barrowDeep, vellumDark, vellum, pitch) through palette.js.
//
// Its clips: an alert idle, a running gallop (the spine gathering and stretching), the bite (a
// crouch with the head drawn back, the lunge with the jaws open, the snap, the recovery) and the
// fall (struck, the hind legs go, it rolls onto its side and lies still: no gore, as every living
// animal falls).
//
// H is the wolf's body length, rump to nose (rig.js QUADRUPED). It is drawn at its baked size: at
// 1.5 units against a player's 2 it stands a little under half a player's height at the withers, as
// a big wolf beside a man.
//
// The look is all in this file, so the owner can swap the wolf without touching the bake or the
// client: cast.js only names `hound` and HOUND_ANIMATIONS.

import * as THREE from "three";
import { materials } from "../materials.js";
import { mix, shade } from "../palette.js";
import { hash2, smoothstep } from "../noise.js";
import { attach, createRig, ellipsoid, jointAt as J, rigidTube, skinTube, spring } from "./rig.js";
import { mat, paint, pf, pn } from "./fabrics.js";
import { pose } from "./clips.js";

const P = pose;
const sides = [
  ["L", 1],
  ["R", -1],
];

/** Body length in world units, rump to nose (a player stands about 2). */
const LENGTH = 1.5;

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

/** Tones from BARROW's slate and brown: a grizzled grey-brown wolf, never a hostile's ember. */
const TONE = {
  coat: mix(mix("slate", "barrowBrown", 0.38), "slateLight", 0.3),
  cape: mix(mix("charcoal", "slate", 0.35), "barrowDeep", 0.25),
  pale: mix(mix("vellumDark", "slateLight", 0.25), "vellum", 0.4),
  tawny: mix(mix("barrowBrown", "vellumDark", 0.35), "slate", 0.38),
  grizzle: mix("vellumDark", "slateLight", 0.6),
  dark: mix("pitch", "charcoal", 0.5),
  nose: mix("pitch", "charcoal", 0.4),
  claw: mix("charcoal", "slate", 0.25),
};

/**
 * A long, rough coat: guard hairs streaking along the body (texture y runs along a tube), each
 * banded pale and dark at random (the wolf's grizzle), over a soft mottle, so the grey-brown is
 * never a flat fill.
 */
function roughCoat(tone, { grizzle = 0.3, seed = 201 } = {}) {
  return paint(
    (x, y) => {
      const streak = pn(x, y, 1, 14, seed);
      const mottle = pf(x, y, 32, seed + 1);
      const tip = smoothstep(0.6, 0.9, pn(x, y, 2, 6, seed + 2)) * grizzle;
      const deep = smoothstep(0.62, 0.92, pn(x, y, 2, 10, seed + 3)) * 0.6;
      let c = shade(tone, 0.82 + 0.26 * streak + 0.16 * (mottle - 0.5));
      c = mix(c, shade(TONE.grizzle, 0.95 + 0.15 * streak), tip);
      c = mix(c, shade(TONE.dark, 1.2), deep * (1 - tip));
      return { c, h: 0.4 + 0.4 * streak + 0.15 * mottle };
    },
    { strength: 1.1 },
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

let FABRICS = null;

/** The wolf's materials, painted once per bake (seeded, so a re-bake paints alike). */
function wolfFabrics() {
  if (FABRICS) return FABRICS;
  FABRICS = {
    coat: mat(roughCoat(TONE.coat), { rough: 0.95, normal: 1.1 }),
    ruff: mat(roughCoat(TONE.coat, { grizzle: 0.45, seed: 231 }), { rough: 0.95, normal: 1.3 }),
    legs: mat(roughCoat(TONE.tawny, { grizzle: 0.15, seed: 203 }), { rough: 0.9, normal: 0.8 }),
    muzzle: mat(roughCoat(TONE.tawny, { grizzle: 0.05, seed: 205 }), { rough: 0.85, normal: 0.6 }),
    brush: mat(roughCoat(TONE.coat, { grizzle: 0.35, seed: 209 }), { rough: 0.95, normal: 1.3 }),
    ear: mat(roughCoat(TONE.cape, { grizzle: 0.1, seed: 207 }), { rough: 0.9, side: THREE.DoubleSide }),
    nose: mat(leather(TONE.nose), { rough: 0.35, normal: 0.6 }),
    claw: mat(leather(TONE.claw, { seed: 213 }), { rough: 0.5 }),
  };
  return FABRICS;
}

/**
 * Shades a part per vertex from its bind-pose position (`fn(p) → [r, g, b]` multiplier, p in H):
 * the dark cape, the pale throat and belly, the legs tawny to the paws. Form first.
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

/** A tone as a multiplier over a part's own tone (vertex colours multiply the map). */
const over = (tone, base = TONE.coat, v = 1) => tone.map((x, i) => (x / Math.max(1, base[i])) * v);
const lerp3 = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const ONE = [1, 1, 1];

/**
 * A shaggy outline for a tube (rig.js `shape`): every other vertex round a ring, and every other
 * ring, pushed out by a seeded amount, so the edge reads as tufts of fur, never a smooth hull.
 * `amount(t, a)` scales the push where the fur is long (the ruff at the throat, the belly fringe).
 */
function shag({ segs, rings, seed, amount }) {
  return (t, a) => {
    const j = Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / ((2 * Math.PI) / segs));
    const i = Math.round(t * (rings - 1));
    // the seam column folds to the first, for the parity as for the hash, so the seam never tears
    const jj = j % segs;
    const tuft = (jj + i) % 2 === 0 ? hash2(jj, i, seed) : 0.15 * hash2(jj, i, seed + 1);
    return 1 + amount(t, a) * tuft;
  };
}

/** Pushes every vertex of a geometry centred on the origin out a little at random: a tufted lump. */
function tufted(geo, amount, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + amount * hash2(Math.round(p.getX(i) * 997), Math.round(p.getY(i) * 991 + p.getZ(i) * 983), seed);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- the build ---------------------------------------------------------------------------------

/**
 * The barrel: croup to the base of the neck, deepest and broadest at the brisket, the belly barely
 * tucked. Each entry is [z, centre y, lateral r, vertical r, weights], in H.
 */
const BARREL = [
  [-0.39, 0.49, 0.03, 0.035, { hips: 1 }],
  [-0.37, 0.476, 0.062, 0.07, { hips: 1 }],
  [-0.32, 0.47, 0.078, 0.09, { hips: 1 }],
  [-0.24, 0.478, 0.078, 0.09, { hips: 1 }],
  [-0.15, 0.486, 0.074, 0.088, { hips: 0.55, spine: 0.45 }],
  [-0.06, 0.488, 0.078, 0.1, { spine: 1 }],
  [0.03, 0.48, 0.088, 0.125, { spine: 0.6, chest: 0.4 }],
  [0.11, 0.47, 0.098, 0.15, { spine: 0.2, chest: 0.8 }],
  [0.18, 0.474, 0.1, 0.156, { chest: 1 }],
  [0.24, 0.49, 0.092, 0.14, { chest: 1 }],
  [0.29, 0.515, 0.074, 0.105, { chest: 0.6, neck: 0.4 }],
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

/** The coat's light and dark: the dark cape over the shoulders and down the back, pale beneath. */
function coatShade([x, y, z]) {
  const { top, bottom } = barrelAt(z);
  const up = (y - bottom) / Math.max(0.02, top - bottom); // 0 at the belly, 1 on the back
  const side = Math.abs(x) / 0.1;
  // the cape is widest over the shoulders and narrows to a stripe down the back
  const cape = smoothstep(-0.3, 0.12, z);
  let c = lerp3(over(TONE.pale), ONE, smoothstep(0.1, 0.5, up));
  c = lerp3(c, over(TONE.cape), smoothstep(0.86 - 0.22 * cape, 1.0 - 0.1 * cape, up) * (1 - 0.35 * smoothstep(0.5, 1, side)));
  return c;
}

function barrel(rig, F) {
  const segs = 24;
  const steps = 4;
  const mesh = skinTube(
    rig,
    BARREL.map(([z, y, rx, ry, w]) => ({ p: [0, y, z], r: [rx, ry], w, n: 2.1 })),
    F.coat,
    {
      segs,
      steps,
      uv: 5,
      front: [0, 1, 0],
      // a little shag everywhere, a longer fringe under the chest and the belly
      shape: shag({ segs, rings: (BARREL.length - 1) * steps + 1, seed: 241, amount: (t, a) => 0.05 + 0.1 * Math.max(0, -Math.sin(a)) * smoothstep(0.2, 0.6, t) }),
    },
  );
  return shadeBy(mesh, rig.H, coatShade);
}

/**
 * The heavy neck under its ruff: thick from the shoulders to the back of the skull, its fur
 * standing out in tufts over the shoulders and hanging long at the throat, pale in front and
 * dark on the crest, as the cape runs up it.
 */
function neckRuff(rig, F) {
  const [, ny, nz] = J(rig, "neck");
  const [, hy, hz] = J(rig, "head");
  const cps = [
    { p: [0, 0.52, 0.2], r: [0.085, 0.1], w: { chest: 1 } },
    { p: [0, 0.535, 0.26], r: [0.098, 0.13], w: { chest: 0.8, neck: 0.2 } },
    { p: [0, (ny + 0.54) / 2 + 0.005, (nz + 0.28) / 2 + 0.01], r: [0.088, 0.115], w: { chest: 0.45, neck: 0.55 } },
    { p: [0, ny + 0.01, nz + 0.005], r: [0.074, 0.095], w: { neck: 0.9, head: 0.1 } },
    { p: [0, (ny + hy) / 2 + 0.008, (nz + hz) / 2], r: [0.062, 0.075], w: { neck: 0.6, head: 0.4 } },
    { p: [0, hy + 0.004, hz - 0.03], r: [0.05, 0.058], w: { neck: 0.2, head: 0.8 } },
  ];
  const segs = 22;
  const steps = 3;
  const mesh = skinTube(rig, cps, F.ruff, {
    segs,
    steps,
    uv: 5,
    front: [0, 1, 0],
    // tufts all round, longest under the throat and at the shoulders, short toward the head
    shape: shag({
      segs,
      rings: (cps.length - 1) * steps + 1,
      seed: 251,
      amount: (t, a) => (0.1 + 0.16 * Math.max(0, -Math.sin(a))) * smoothstep(0, 0.2, t) * (1 - 0.5 * smoothstep(0.6, 1, t)),
    }),
    // the throat's fur hangs: the lower half of each ring let down a little
    drop: (t, a) => 0.022 * Math.max(0, -Math.sin(a)) * Math.sin(Math.PI * Math.min(1, t * 1.3)),
  });
  // dark along the crest (the cape runs up it), pale down the throat
  return shadeBy(mesh, rig.H, ([, y, z]) => {
    const t = Math.max(0, Math.min(1, (z - 0.2) / (hz - 0.2)));
    const crest = 0.65 + (hy + 0.058 - 0.65) * t;
    const up = (y - (crest - 0.22 + 0.1 * t)) / (0.22 - 0.1 * t);
    return lerp3(lerp3(over(TONE.pale), ONE, smoothstep(0.2, 0.55, up)), over(TONE.cape), smoothstep(0.72, 1.0, up));
  });
}

/** A leg's shade: the coat's own where it meets the barrel, tawny below, paling at the paw. */
function legShade(p) {
  const [, y, z] = p;
  const below = lerp3(ONE, over(TONE.pale, TONE.tawny, 1.02), 1 - smoothstep(0.03, 0.12, y));
  return lerp3(below, coatShade(p).map((v, i) => (v * TONE.coat[i]) / Math.max(1, TONE.tawny[i])), smoothstep(barrelAt(z).bottom - 0.05, barrelAt(z).bottom + 0.03, y));
}

/** A big wolf's paw: a broad pad of toes and four dark claws, standing on the ground. */
function paw(rig, bone, x, y, z, F) {
  const H = rig.H;
  attach(rig, bone, ellipsoid(0.026 * H, 0.016 * H, 0.034 * H, 10), F.legs, [x, y + 0.013, z + 0.013], { ground: true });
  for (const dx of [-0.013, -0.005, 0.005, 0.013])
    attach(rig, bone, ellipsoid(0.003 * H, 0.0045 * H, 0.007 * H, 6), F.claw, [x + dx, y + 0.006, z + 0.045], { rx: 0.6 });
}

/** One foreleg: a strong forearm under the shoulder, a straight cannon to the pastern, a paw. */
function foreleg(rig, s, sx, F) {
  const [, sy, sz] = J(rig, `upperArm${s}`);
  const [, ey, ez] = J(rig, `foreArm${s}`);
  const [, ky, kz] = J(rig, `hand${s}`);
  const x = sx * J(rig, `upperArm${s}`)[0];
  const U = `upperArm${s}`;
  const A = `foreArm${s}`;
  const W = `hand${s}`;
  const mesh = skinTube(
    rig,
    [
      { p: [x * 0.6, sy + 0.07, sz + 0.01], r: [0.05, 0.075], w: { chest: 0.8, [U]: 0.2 } },
      { p: [x * 0.95, sy - 0.03, sz + 0.004], r: [0.042, 0.062], w: { chest: 0.15, [U]: 0.85 } },
      { p: [x * 1.02, ey + 0.015, ez + 0.002], r: [0.03, 0.04], w: { [U]: 0.5, [A]: 0.5 } },
      { p: [x, (ey + ky) / 2 + 0.02, (ez + kz) / 2], r: [0.022, 0.025], w: { [A]: 1 } },
      { p: [x, ky + 0.008, kz], r: [0.02, 0.022], w: { [A]: 0.5, [W]: 0.5 } },
      { p: [x, 0.03, kz + 0.008], r: [0.018, 0.02], w: { [W]: 1 } },
    ],
    F.legs,
    { segs: 12, steps: 3, uv: 5 },
  );
  shadeBy(mesh, rig.H, legShade);
  paw(rig, W, x, 0, kz + 0.004, F);
}

/** One hind leg: a thigh in full breeches of fur, a long second thigh, the hock let down, a paw. */
function hindleg(rig, s, sx, F) {
  const [, hy, hz] = J(rig, `thigh${s}`);
  const [, ty, tz] = J(rig, `shin${s}`);
  const [, ky, kz] = J(rig, `foot${s}`);
  const x = sx * J(rig, `thigh${s}`)[0];
  const T = `thigh${s}`;
  const S = `shin${s}`;
  const Fo = `foot${s}`;
  const cps = [
    { p: [x * 0.5, hy + 0.035, hz - 0.012], r: [0.055, 0.072], w: { hips: 0.8, [T]: 0.2 } },
    { p: [x * 0.95, hy - 0.04, hz + 0.016], r: [0.05, 0.076], w: { hips: 0.1, [T]: 0.9 } },
    { p: [x * 1.1, ty + 0.02, tz - 0.006], r: [0.032, 0.042], w: { [T]: 0.5, [S]: 0.5 } },
    { p: [x * 1.02, (ty + ky) / 2, (tz + kz) / 2 - 0.006], r: [0.024, 0.03], w: { [S]: 1 } },
    { p: [x, ky + 0.008, kz - 0.008], r: [0.019, 0.023], w: { [S]: 0.5, [Fo]: 0.5 } },
    { p: [x, (ky + 0.03) / 2, kz + 0.012], r: [0.0175, 0.019], w: { [Fo]: 1 } },
    { p: [x, 0.03, kz + 0.022], r: [0.017, 0.019], w: { [Fo]: 1 } },
  ];
  const segs = 14;
  const steps = 3;
  const mesh = skinTube(rig, cps, F.legs, {
    segs,
    steps,
    uv: 5,
    // the breeches: the fur round the thigh stands out in tufts, short below the stifle
    shape: shag({ segs, rings: (cps.length - 1) * steps + 1, seed: 261 + (sx > 0 ? 0 : 7), amount: (t) => 0.14 * smoothstep(0.05, 0.15, t) * (1 - smoothstep(0.2, 0.4, t)) }),
  });
  shadeBy(mesh, rig.H, legShade);
  paw(rig, Fo, x, 0, kz + 0.018, F);
}

/**
 * The head: broad in the skull, a slight stop, a long, strong muzzle to the nose leather, the
 * cheek ruffs flaring out behind the jaw, dark eyes set slanting under the brow, pricked ears
 * standing up, and the lower jaw that opens for the bite.
 */
function head(rig, F) {
  const M = materials();
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const [, jy, jz] = J(rig, "jaw");
  const at = (x, y, z) => [x, hy + y, hz + z];
  const atJaw = (x, y, z) => [x, jy + y, jz + z];
  const r = (...v) => v.map((x) => x * H);
  // the skull and the muzzle, one tube, the muzzle long and only a little finer than the skull
  const skull = rigidTube(
    H,
    [
      { p: at(0, 0.014, -0.04), r: [0.042, 0.044] },
      { p: at(0, 0.018, -0.008), r: [0.054, 0.05] },
      { p: at(0, 0.014, 0.028), r: [0.046, 0.043] },
      { p: at(0, -0.002, 0.06), r: [0.032, 0.032] },
      { p: at(0, -0.008, 0.1), r: [0.026, 0.026] },
      { p: at(0, -0.012, 0.135), r: [0.022, 0.021] },
      { p: at(0, -0.014, 0.152), r: [0.016, 0.015] },
    ],
    { segs: 16, steps: 3, uv: 5, front: [0, 1, 0], caps: true },
  );
  const skullMesh = attach(rig, "head", skull, F.coat);
  // the forehead and the crown greyer, the muzzle tawny and darker toward the nose, pale beneath
  shadeBy(skullMesh, H, ([, y, z]) => {
    const along = smoothstep(hz + 0.03, hz + 0.08, z);
    let c = lerp3(ONE, over(TONE.tawny), along);
    c = lerp3(c, over(TONE.dark, TONE.coat, 1.3), smoothstep(hz + 0.1, hz + 0.15, z) * 0.7);
    return lerp3(over(TONE.pale), c, smoothstep(hy - 0.03, hy, y));
  });
  // the cheek ruffs: tufted lumps behind the jaw, flaring out, pale, the face's broad outline
  for (const [, sx] of sides) {
    const cheek = tufted(ellipsoid(...r(0.03, 0.038, 0.036), 12), 0.35, 271 + (sx > 0 ? 0 : 3));
    const m = attach(rig, "head", cheek, F.ruff, at(sx * 0.04, -0.016, -0.01), { rz: sx * 0.3 });
    shadeBy(m, H, () => lerp3(ONE, over(TONE.pale), 0.5));
  }
  // the brow over the eyes
  attach(rig, "head", ellipsoid(...r(0.038, 0.014, 0.026), 10), F.coat, at(0, 0.04, 0.012), { rx: 0.25 });
  // the nose leather at the tip
  attach(rig, "head", ellipsoid(...r(0.015, 0.012, 0.011), 10), F.nose, at(0, -0.009, 0.157));
  // dark eyes, slanting, under the brow
  for (const [, sx] of sides)
    attach(rig, "head", ellipsoid(...r(0.009, 0.0065, 0.009), 8), M.black, at(sx * 0.033, 0.025, 0.036), { ry: sx * 0.6, rz: sx * 0.35, noShadow: true });
  // pricked ears: broad-based triangles standing up from the crown, a little back and out
  for (const [, sx] of sides) {
    const ear = new THREE.ConeGeometry(0.03 * H, 0.078 * H, 4);
    ear.rotateY(Math.PI / 4);
    ear.scale(1, 1, 0.45);
    attach(rig, "head", ear, F.ear, at(sx * 0.032, 0.082, -0.022), { rx: -0.15, rz: -sx * 0.24 });
  }
  // the lower jaw, a long strong bar under the muzzle, and a line of pale teeth seen when it opens
  attach(rig, "jaw", ellipsoid(...r(0.021, 0.012, 0.072), 10), F.muzzle, atJaw(0, -0.004, 0.065), { rx: 0.08 });
  for (const [, sx] of sides)
    attach(rig, "jaw", new THREE.ConeGeometry(0.0045 * H, 0.014 * H, 5), M.bone, atJaw(sx * 0.011, 0.009, 0.115), { rx: 0.1 });
  for (const [, sx] of sides)
    attach(rig, "head", new THREE.ConeGeometry(0.0045 * H, 0.015 * H, 5), M.bone, at(sx * 0.013, -0.024, 0.128), { rx: Math.PI - 0.1 });
}

/** The long full brush, carried low behind the hocks, its tip dark, its joints lagging on springs. */
function tail(rig, F) {
  const H = rig.H;
  const pts = [0, 1, 2, 3].map((i) => J(rig, `tail${i}`));
  const [, y3, z3] = pts[3];
  const cps = [
    { p: [0, pts[0][1] + 0.02, pts[0][2] + 0.025], r: 0.026, w: { hips: 0.6, tail0: 0.4 } },
    { p: [0, pts[0][1] - 0.01, pts[0][2]], r: 0.032, w: { tail0: 1 } },
    { p: [0, pts[1][1], pts[1][2]], r: 0.042, w: { tail1: 1 } },
    { p: [0, pts[2][1], pts[2][2]], r: 0.044, w: { tail2: 1 } },
    { p: [0, y3, z3], r: 0.034, w: { tail3: 1 } },
    { p: [0, y3 - 0.05, z3], r: 0.016, w: { tail3: 1 } },
    { p: [0, y3 - 0.068, z3], r: 0.004, w: { tail3: 1 } },
  ];
  const segs = 14;
  const steps = 3;
  const mesh = skinTube(rig, cps, F.brush, {
    segs,
    steps,
    ground: false,
    shape: shag({ segs, rings: (cps.length - 1) * steps + 1, seed: 281, amount: (t) => 0.22 * smoothstep(0.1, 0.3, t) }),
  });
  // the cape's dark down the top of the brush, the last of it black
  const top = pts[0][1] + 0.02;
  const end = y3 - 0.068;
  shadeBy(mesh, H, ([, y]) => {
    const t = Math.max(0, Math.min(1, (top - y) / (top - end)));
    return lerp3(over(TONE.cape, TONE.coat, 1.1), over(TONE.dark, TONE.coat, 1.2), smoothstep(0.72, 0.85, t));
  });
  // carried low, hanging behind the hocks, a little out from the legs
  rig.rest.tail0 = [0.32, 0, 0];
  spring(rig, "tail1", { stiffness: 46, damping: 6, gravity: 0.35, limit: 0.7, rest: [-0.05, 0, 0] });
  spring(rig, "tail2", { stiffness: 40, damping: 5, gravity: 0.35, limit: 0.7, rest: [-0.08, 0, 0] });
  spring(rig, "tail3", { stiffness: 34, damping: 5, gravity: 0.3, limit: 0.7, rest: [-0.1, 0, 0] });
}

/** The wolf on the shared rig's quadruped variant, with its style for the clips. */
export function hound() {
  const F = wolfFabrics();
  const rig = createRig(LENGTH, {
    quadruped: {
      hipY: 0.47,
      rump: -0.27,
      back: 0.44,
      rise: 0.035,
      neck: 0.1,
      head: 0.11,
      headDrop: 0.11,
      jaw: [-0.026, 0.016],
      shoulderX: 0.058,
      shoulderDrop: 0.07,
      hipX: 0.056,
      foreLeg: [0.185, 0.19],
      hindLeg: [0.18, 0.2],
      stifle: 0.07,
      hock: -0.1,
    },
    jaw: true,
    tail: { root: [-0.005, -0.12], segments: 4, length: 0.3 },
  });
  rig.hooks = [];

  barrel(rig, F);
  neckRuff(rig, F);
  for (const [s, sx] of sides) {
    foreleg(rig, s, sx, F);
    hindleg(rig, s, sx, F);
  }
  head(rig, F);
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
// whole wolf (+ nose down), `body.rz` rolls it (+ onto its right side), `body.z` carries it
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
 * The gallop (8 frames at 14 fps): a wolf's, a little less flung out than a sighthound's. The hind
 * legs reach forward under the gathered, arched body and drive; it stretches out in flight,
 * forelegs reaching ahead and hind legs out behind; the forelegs land and pull, and it gathers
 * again. Each pair a little apart (a rotary gallop), the head carried low and forward, steady.
 */
function gallop(n) {
  return Array.from({ length: n }, (_, i) => {
    const ph = (i / n) * Math.PI * 2;
    // stretch: +1 laid out flat (forelegs ahead, hind legs behind), -1 gathered (all four under it)
    const stretch = Math.sin(ph);
    const b = {
      spine: [0.11 * stretch, 0, 0],
      chest: [-0.08 * stretch, 0, 0],
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
      b[`upperArm${s}`] = [-0.82 * reach - 0.1 * swing, 0, 0];
      b[`foreArm${s}`] = [-0.3 * swing + 0.05, 0, 0];
      b[`hand${s}`] = [1.7 * swing + 0.15 * Math.max(0, -reach), 0, 0];
      // hind legs: flung out behind when stretched, forward under the belly when gathered
      const h = ph + lead + 0.15;
      const back = Math.sin(h);
      const hswing = Math.max(0, -Math.cos(h));
      b[`thigh${s}`] = [0.7 * back - 0.3 * hswing, 0, 0];
      b[`shin${s}`] = [0.28 * hswing - 0.1 * Math.max(0, back), 0, 0];
      b[`foot${s}`] = [-0.4 * hswing + 0.35 * Math.max(0, back), 0, 0];
    }
    return P(b, { y: 0.05 * Math.max(0, stretch), rx: -0.05 * stretch }, { jaw: 0.15 + 0.05 * Math.max(0, stretch) });
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
