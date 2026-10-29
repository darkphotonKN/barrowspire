// The boar (FS-X2F2H §H R61), Gentle Meadows' one creature, and its elite: the first field
// wildlife, built on the shared rig's quadruped variant (rig.js QUADRUPED, ADR-0021) under the
// guideline's field-wildlife clause. A living beast of the country outside the Spire, never a
// cartoon pig and never livestock.
//
// Low and heavy in front: a deep, wedge-shaped head on a neck that is all muscle, high
// shoulders under a bristled ridge that runs from the brow to the middle of the back, slimmer
// haunches and short, thin legs on cloven trotters. Tusks curl up out of the lower jaw. Hide and
// bristle come from the warm, desaturated end of BARROW (barrowBrown, barrowDeep, umber,
// charcoal), tusks from the bone mix of vellum and vellumDark. Its eyes are the ember-red hostile
// accent, the one emissive, so it reads hostile in daylight through silhouette, tusks and eyes.
//
// It moves at a heavy trot. Its attack is a lowered-head wind-up, held, a front trotter scraping
// the ground, then the charge and an upward hook of the tusks, then recovery. It dies by
// buckling at the knees and falling onto its side, legs out, and lying still: no gore.
//
// The elite is the same build at the same size: bigger tusks, a darker and taller ridge,
// healed scars across the hide and the snout, a torn ear.
//
// H is the boar's body length, rump to snout (rig.js QUADRUPED): its size tier is measured by it.

import * as THREE from "three";
import { materials } from "../materials.js";
import { mix, shade } from "../palette.js";
import { rng, smoothstep } from "../noise.js";
import { attach, createRig, ellipsoid, jointAt as J, rigidTube, skinTube, spring } from "./rig.js";
import { mat, paint, pf, pn } from "./fabrics.js";
import { pose } from "./clips.js";
import { fadingEyes } from "./forlorn.js";

const P = pose;
const sides = [
  ["L", 1],
  ["R", -1],
];

/**
 * Body length in world units (a tile edge). A player stands about 2: fodder is 0.85–1.0 of that
 * by body length, and shorter than a player is tall (guideline "Size is a threat tier").
 */
const LENGTH = 1.98;

/** The head against the barrel: big, since a boar carries its weight in front. */
const HEAD = 1.15;

/**
 * Its clips. The attack is longer than the cast's 7 frames: the lowered head is held through the
 * server's 0.45 s wind-up (FS-X2F2H §E R37) before the charge lands, then it recovers.
 */
export const BOAR_ANIMATIONS = {
  idle: { frames: 6, fps: 5, loop: true },
  walk: { frames: 8, fps: 10, loop: true },
  attack: { frames: 9, fps: 12, loop: false },
  death: { frames: 7, fps: 9, loop: false },
};

// --- natural materials ---------------------------------------------------------------------

/** Tones from BARROW's warm, desaturated end (guideline "Field-wildlife clause"). */
const TONE = {
  hide: mix(mix("barrowDeep", "umber", 0.3), "barrowBrown", 0.2),
  grizzle: mix("barrowBrown", "vellumDark", 0.4),
  bristle: mix("charcoal", "barrowDeep", 0.4),
  snout: mix(mix("umber", "charcoal", 0.4), "barrowBrown", 0.12),
  trotter: mix("pitch", "charcoal", 0.5),
  tusk: mix("vellum", "vellumDark", 0.4),
  // healed scars: hairless, paler than the hide, never red
  scar: mix(mix("barrowBrown", "vellumDark", 0.45), "barrowDeep", 0.15),
  // the elite: older, darker, its tusks yellowed toward vellumDark
  hideOld: mix(mix("barrowDeep", "charcoal", 0.45), "umber", 0.2),
  bristleOld: mix("pitch", "charcoal", 0.55),
  tuskOld: mix("vellum", "vellumDark", 0.68),
};

/**
 * Coarse, grizzled hair: streaks along the body (texture y runs along a tube), pale tips
 * flecked through a dark coat, darker clumps, and (`scars`) a few healed, hairless weals.
 */
function bristledHide(tone, { grizzle = 0.35, scars = 0, seed = 101 } = {}) {
  return paint(
    (x, y) => {
      const streak = pn(x, y, 1, 16, seed);
      const clump = pf(x, y, 16, seed + 1);
      const tip = smoothstep(0.62, 0.9, pn(x, y, 2, 8, seed + 2)) * grizzle;
      let c = shade(tone, 0.72 + 0.4 * streak - 0.25 * smoothstep(0.55, 0.8, clump));
      c = mix(c, shade(TONE.grizzle, 0.85 + 0.3 * streak), tip);
      let h = 0.35 + 0.45 * streak + 0.2 * clump;
      if (scars > 0) {
        // a scar is a thin diagonal weal where the hair never grew back
        const u = (x + y * 0.6) / 128;
        const band = Math.abs(((u * 3 + pf(x, y, 32, seed + 3) * 0.4) % 1) - 0.5);
        const weal = scars * (1 - smoothstep(0.0, 0.035, band)) * smoothstep(0.45, 0.6, pf(x, y, 32, seed + 4));
        c = mix(c, shade(TONE.scar, 0.92 + 0.15 * streak), weal);
        h += 0.35 * weal;
      }
      return { c, h };
    },
    { strength: 1.5 },
  );
}

/** Bare, leathery skin for the snout disc and the lips: fine creases, no hair. */
function leathery(tone, { seed = 111 } = {}) {
  return paint(
    (x, y) => {
      const crease = pn(x, y, 4, 2, seed);
      const m = pf(x, y, 16, seed + 1);
      return { c: shade(tone, 0.8 + 0.25 * m + 0.1 * crease), h: 0.5 + 0.3 * crease + 0.1 * m };
    },
    { strength: 1.2 },
  );
}

/** Tusk ivory: banded growth lines along its length, darker toward the root. */
function ivory(tone, { seed = 121 } = {}) {
  return paint(
    (x, y) => {
      const band = 0.5 + 0.5 * Math.sin((y / 128) * Math.PI * 12 + pf(x, y, 32, seed) * 2);
      const m = pf(x, y, 16, seed + 1);
      return { c: shade(tone, 0.82 + 0.12 * band + 0.12 * m), h: 0.5 + 0.2 * band };
    },
    { strength: 0.8 },
  );
}

const SETS = {};

/** The boar's materials, painted once per bake (seeded, so a re-bake paints alike). */
function boarFabrics(elite) {
  const key = elite ? "elite" : "base";
  if (SETS[key]) return SETS[key];
  const D = THREE.DoubleSide;
  const hide = elite ? TONE.hideOld : TONE.hide;
  SETS[key] = {
    hide: mat(bristledHide(hide, { seed: elite ? 103 : 101, grizzle: elite ? 0.3 : 0.55, scars: elite ? 1 : 0 }), { rough: 0.95, normal: 1.3 }),
    legs: mat(bristledHide(shade(hide, 0.85), { seed: 105, grizzle: 0.25 }), { rough: 0.95 }),
    bristle: mat(bristledHide(elite ? TONE.bristleOld : TONE.bristle, { seed: 107, grizzle: elite ? 0.08 : 0.2 }), { rough: 1, side: D }),
    snout: mat(leathery(elite ? shade(TONE.snout, 0.85) : TONE.snout), { rough: 0.6, normal: 0.8 }),
    scar: mat(leathery(TONE.scar, { seed: 113 }), { rough: 0.7 }),
    trotter: mat(leathery(TONE.trotter, { seed: 115 }), { rough: 0.45 }),
    tusk: mat(ivory(elite ? TONE.tuskOld : TONE.tusk), { rough: 0.5 }),
  };
  return SETS[key];
}

/**
 * Shades a skinned part per vertex from its bind-pose position (`fn(p) → multiplier`, p in H):
 * the dark dorsal line, legs darkening toward the trotters. Baked shading, form first.
 */
function shadeBy(mesh, H, fn) {
  const pos = mesh.geometry.attributes.position;
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = fn([pos.getX(i) / H, pos.getY(i) / H, pos.getZ(i) / H]);
    c.fill(v, i * 3, i * 3 + 3);
  }
  mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  mesh.material = mesh.material.clone();
  mesh.material.vertexColors = true;
  return mesh;
}

// --- the build -----------------------------------------------------------------------------

/**
 * The barrel: rump to the back of the head, deepest and highest at the shoulders. Each entry is
 * [z, centre y, lateral r, vertical r, weights], in H.
 */
const BARREL = [
  // the rump rounds down toward the tail, the back rising to the hump over the shoulders
  [-0.385, 0.33, 0.03, 0.035, { hips: 1 }],
  [-0.37, 0.335, 0.08, 0.095, { hips: 1 }],
  [-0.335, 0.345, 0.11, 0.125, { hips: 1 }],
  [-0.25, 0.36, 0.132, 0.15, { hips: 1 }],
  [-0.1, 0.375, 0.143, 0.168, { hips: 0.4, spine: 0.6 }],
  [0.04, 0.392, 0.153, 0.19, { spine: 1 }],
  [0.15, 0.408, 0.163, 0.21, { spine: 0.3, chest: 0.7 }],
  [0.25, 0.408, 0.153, 0.2, { chest: 1 }],
  [0.32, 0.397, 0.125, 0.165, { chest: 0.35, neck: 0.65 }],
  [0.36, 0.388, 0.098, 0.13, { neck: 0.5, head: 0.5 }],
];

/** The top of the barrel at `z` (H): where the ridge bristles stand. */
function backAt(z) {
  for (let i = 1; i < BARREL.length; i++) {
    const [z1, y1, , r1] = BARREL[i];
    const [z0, y0, , r0] = BARREL[i - 1];
    if (z <= z1) {
      const t = (z - z0) / (z1 - z0);
      return y0 + r0 + (y1 + r1 - y0 - r0) * t;
    }
  }
  const [, y, , r] = BARREL[BARREL.length - 1];
  return y + r;
}

/** The bone a point on the back rides: the spine's segment it sits over. */
const ridgeBone = (z) => (z > 0.36 ? "head" : z > 0.29 ? "neck" : z > 0.08 ? "chest" : z > -0.12 ? "spine" : "hips");

function barrel(rig, F) {
  const mesh = skinTube(
    rig,
    BARREL.map(([z, y, rx, ry, w]) => ({ p: [0, y, z], r: [rx, ry], w, n: 2.3 })),
    F.hide,
    { segs: 22, steps: 4, uv: 4, front: [0, 1, 0] },
  );
  // a dark dorsal line, the flanks lighter, the belly in shadow
  return shadeBy(mesh, rig.H, ([, y, z]) => {
    const top = backAt(Math.max(-0.375, Math.min(0.37, z)));
    const up = (y - (top - 0.2)) / 0.2;
    return 1.02 - 0.28 * smoothstep(0.5, 1, up) - 0.22 * smoothstep(0.1, -0.6, up);
  });
}

/**
 * The bristled ridge: the hackles, a crest of coarse dark bristle from the brow over the
 * shoulders to the middle of the back, tallest at the withers and raked back.
 */
function ridge(rig, F, { height = 1 } = {}) {
  const H = rig.H;
  const rand = rng(height > 1 ? 131 : 129);
  for (let i = 0; i < 20; i++) {
    const z = 0.37 - (i / 19) * 0.55;
    // tallest over the withers, short on the brow and fading out down the back
    const tall = 0.025 + 0.07 * smoothstep(0.4, 0.22, z) * smoothstep(-0.2, 0.1, z);
    for (const dx of [-0.022, 0, 0.022]) {
      const len = tall * height * (0.7 + 0.6 * rand()) * (dx === 0 ? 1 : 0.75);
      const y = backAt(z) - 0.015;
      const bristle = new THREE.ConeGeometry(0.016 * H, len * H, 5);
      attach(rig, ridgeBone(z), bristle, F.bristle, [dx + (rand() - 0.5) * 0.01, y + len * 0.42, z - len * 0.2], {
        rx: -0.45 - 0.35 * rand(),
        rz: dx * 12 + (rand() - 0.5) * 0.3,
      });
    }
  }
}

/** One foreleg: a thick forearm under the shoulder, a thin cannon, a cloven trotter. */
function foreleg(rig, s, sx, F) {
  const [, sy, sz] = J(rig, `upperArm${s}`);
  const [, ey, ez] = J(rig, `foreArm${s}`);
  const [, ky, kz] = J(rig, `hand${s}`);
  const x = sx * 0.078;
  const U = `upperArm${s}`;
  const A = `foreArm${s}`;
  const W = `hand${s}`;
  const mesh = skinTube(
    rig,
    [
      { p: [x * 1.05, sy + 0.07, sz + 0.01], r: [0.07, 0.09], w: { chest: 0.7, [U]: 0.3 } },
      { p: [x * 1.08, sy - 0.015, sz - 0.004], r: [0.058, 0.072], w: { [U]: 1 } },
      { p: [x * 1.04, ey + 0.012, ez], r: [0.04, 0.048], w: { [U]: 0.5, [A]: 0.5 } },
      { p: [x, (ey + ky) / 2, (ez + kz) / 2], r: [0.033, 0.037], w: { [A]: 1 } },
      { p: [x, ky + 0.006, kz], r: [0.028, 0.031], w: { [A]: 0.5, [W]: 0.5 } },
      { p: [x, 0.055, kz + 0.004], r: [0.022, 0.025], w: { [W]: 1 } },
      { p: [x, 0.03, kz + 0.01], r: [0.025, 0.028], w: { [W]: 1 } },
    ],
    F.legs,
    { segs: 12, steps: 3, uv: 5 },
  );
  shadeBy(mesh, rig.H, ([, y]) => 0.8 + 0.22 * smoothstep(0.05, 0.3, y));
  trotter(rig, W, x, kz + 0.016, F);
}

/** One hind leg: a heavy ham, the stifle forward, the hock back, a cloven trotter. */
function hindleg(rig, s, sx, F) {
  const [, hy, hz] = J(rig, `thigh${s}`);
  const [, ty, tz] = J(rig, `shin${s}`);
  const [, ky, kz] = J(rig, `foot${s}`);
  const x = sx * 0.074;
  const T = `thigh${s}`;
  const S = `shin${s}`;
  const Fo = `foot${s}`;
  const mesh = skinTube(
    rig,
    [
      { p: [x, hy + 0.06, hz + 0.005], r: [0.07, 0.095], w: { hips: 0.65, [T]: 0.35 } },
      { p: [x * 1.1, hy - 0.03, hz + 0.02], r: [0.064, 0.078], w: { [T]: 1 } },
      { p: [x * 1.08, ty + 0.018, tz - 0.008], r: [0.042, 0.048], w: { [T]: 0.5, [S]: 0.5 } },
      { p: [x, (ty + ky) / 2, (tz + kz) / 2], r: [0.033, 0.037], w: { [S]: 1 } },
      { p: [x, ky + 0.006, kz], r: [0.027, 0.03], w: { [S]: 0.5, [Fo]: 0.5 } },
      { p: [x, 0.055, kz + 0.012], r: [0.022, 0.025], w: { [Fo]: 1 } },
      { p: [x, 0.03, kz + 0.018], r: [0.024, 0.028], w: { [Fo]: 1 } },
    ],
    F.legs,
    { segs: 12, steps: 3, uv: 5 },
  );
  shadeBy(mesh, rig.H, ([, y]) => 0.8 + 0.22 * smoothstep(0.05, 0.3, y));
  trotter(rig, Fo, x, kz + 0.026, F);
}

/** A cloven trotter: two hard toes and the dewclaws behind, standing on the ground. */
function trotter(rig, bone, x, z, F) {
  const H = rig.H;
  for (const dx of [-0.009, 0.009])
    attach(rig, bone, ellipsoid(0.0105 * H, 0.016 * H, 0.02 * H, 10), F.trotter, [x + dx, 0.014, z + 0.006], { rx: 0.25, ground: true });
  for (const dx of [-0.012, 0.012]) attach(rig, bone, ellipsoid(0.005 * H, 0.008 * H, 0.007 * H, 6), F.trotter, [x + dx, 0.03, z - 0.022]);
}

/**
 * The head: a long wedge falling from a high brow to the snout disc, small sunk eyes glowing
 * ember red under the brow, pricked ears, and the lower jaw carrying the tusks (`tusk` scales
 * them). `torn` notches the left ear.
 */
function head(rig, F, eye, { tusk = 1, torn = false, whetters = false } = {}) {
  const M = materials();
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const K = HEAD;
  // a point off the head joint and one off the jaw joint, in H, scaled with the head
  const at = (x, y, z) => [x * K, hy + y * K, hz + z * K];
  const [, jy, jz] = J(rig, "jaw");
  const atJaw = (x, y, z) => [x * K, jy + y * K, jz + z * K];
  const r = (...v) => v.map((x) => x * K * H);
  // the wedge, from inside the neck to the snout: its back ring sits inside the neck and its
  // widest ring covers the neck's end, so head and body meet without a ledge
  const skull = rigidTube(
    H,
    [
      { p: at(0, 0.03, -0.07), r: [0.08, 0.1] },
      { p: at(0, 0.03, 0.0), r: [0.098, 0.124] },
      { p: at(0, 0.0, 0.075), r: [0.068, 0.082] },
      { p: at(0, -0.04, 0.125), r: [0.048, 0.053] },
      { p: at(0, -0.066, 0.162), r: [0.041, 0.041] },
      { p: at(0, -0.074, 0.172), r: [0.039, 0.039] },
    ].map((c) => ({ ...c, r: c.r.map((x) => x * K) })),
    { segs: 16, steps: 3, uv: 5, front: [0, 1, 0], caps: true },
  );
  attach(rig, "head", skull, F.hide);
  // the brow over the eyes and the heavy cheeks
  attach(rig, "head", ellipsoid(...r(0.085, 0.04, 0.06), 14), F.hide, at(0, 0.06, 0.02), { rx: 0.35 });
  for (const [, sx] of sides) attach(rig, "head", ellipsoid(...r(0.045, 0.065, 0.075), 12), F.hide, at(sx * 0.068, -0.01, 0.005));
  // the snout disc, tilted down along the snout, and its nostrils
  const tilt = Math.atan2(0.03, 0.05);
  const disc = new THREE.CylinderGeometry(...r(0.044, 0.041, 0.02), 16);
  attach(rig, "head", disc, F.snout, at(0, -0.078, 0.18), { rx: Math.PI / 2 - tilt });
  for (const [, sx] of sides) attach(rig, "head", ellipsoid(...r(0.008, 0.011, 0.004), 8), M.black, at(sx * 0.014, -0.08, 0.19), { rx: -tilt });
  // sunk sockets and the ember-red eyes, set high on the side of the head under the brow
  for (const [, sx] of sides) {
    attach(rig, "head", ellipsoid(...r(0.019, 0.016, 0.022), 10), M.black, at(sx * 0.074, 0.035, 0.035), { ry: sx * 0.5 });
    attach(rig, "head", ellipsoid(...r(0.0145, 0.0125, 0.016), 10), eye, at(sx * 0.0795, 0.036, 0.039), { ry: sx * 0.5, noShadow: true });
  }
  // pricked ears, a little forward; the elite's left one torn short
  for (const [s, sx] of sides) {
    const short = torn && s === "L";
    const ear = new THREE.ConeGeometry(...r(0.032, 0.085), 7);
    attach(rig, "head", ear, F.bristle, at(sx * 0.058, 0.1 - (short ? 0.012 : 0), -0.035), {
      rz: -sx * 0.55,
      rx: 0.15,
      sz: 0.45,
      sy: short ? 0.62 : 1,
    });
  }
  // the lower jaw and its lip line
  attach(rig, "jaw", ellipsoid(...r(0.05, 0.03, 0.1), 12), F.hide, atJaw(0, -0.035, 0.075), { rx: 0.4 });
  attach(rig, "jaw", ellipsoid(...r(0.044, 0.012, 0.08), 10), F.snout, atJaw(0, -0.022, 0.09), { rx: 0.4 });
  // tusks: lower canines curling up and out past the snout, the hostile silhouette's hooks
  for (const [, sx] of sides) {
    const k = tusk;
    const b = [sx * 0.036, -0.035, 0.115];
    const pts = [
      { p: atJaw(...b), r: 0.012 * K * Math.sqrt(k) },
      { p: atJaw(sx * (0.05 + 0.006 * k), b[1] + 0.025 * k, b[2] + 0.01), r: 0.0105 * K * Math.sqrt(k) },
      { p: atJaw(sx * (0.06 + 0.012 * k), b[1] + 0.05 * k, b[2]), r: 0.0075 * K * Math.sqrt(k) },
      { p: atJaw(sx * (0.062 + 0.014 * k), b[1] + 0.068 * k, b[2] - 0.02 * k), r: 0.002 },
    ];
    attach(rig, "jaw", rigidTube(H, pts, { segs: 8, steps: 3, uv: 6 }), F.tusk);
    if (whetters) {
      // the upper tusks, short and outward, that the lower ones grind against
      const up = [
        { p: at(sx * 0.04, -0.06, 0.14), r: 0.009 * K },
        { p: at(sx * 0.058, -0.052, 0.135), r: 0.007 * K },
        { p: at(sx * 0.07, -0.04, 0.12), r: 0.002 },
      ];
      attach(rig, "head", rigidTube(H, up, { segs: 6, steps: 3 }), F.tusk);
    }
  }
}

/** A thin tail on the rump with a dark tuft, its last joints lagging on springs. */
function tail(rig, F) {
  const H = rig.H;
  const [, y0, z0] = J(rig, "tail0");
  const [, y2, z2] = J(rig, "tail2");
  skinTube(
    rig,
    [
      { p: [0, y0 + 0.012, z0 + 0.012], r: 0.014, w: { hips: 0.5, tail0: 0.5 } },
      { p: [0, y0 - 0.02, z0], r: 0.011, w: { tail0: 1 } },
      { p: [0, (y0 + y2) / 2, z0], r: 0.009, w: { tail1: 1 } },
      { p: [0, y2 - 0.01, z2], r: 0.008, w: { tail2: 1 } },
    ],
    F.legs,
    { segs: 8, steps: 3, ground: false },
  );
  attach(rig, "tail2", new THREE.ConeGeometry(0.016 * H, 0.05 * H, 6), F.bristle, [0, y2 - 0.03, z2], { rx: Math.PI });
  spring(rig, "tail1", { stiffness: 55, damping: 6, gravity: 0.8, limit: 0.9 });
  spring(rig, "tail2", { stiffness: 45, damping: 5, gravity: 0.85, limit: 0.9 });
}

/** Healed scars across the elite's face and shoulder: raised, hairless weals in a pale tone. */
function scars(rig, F) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  // a slash across the brow and down the snout, and a long one over the left shoulder
  attach(rig, "head", new THREE.CapsuleGeometry(0.005 * H, 0.09 * H, 3, 6), F.scar, [0.03, hy + 0.04, hz + 0.075], { rx: 1.05, rz: 0.5 });
  attach(rig, "chest", new THREE.CapsuleGeometry(0.006 * H, 0.16 * H, 3, 6), F.scar, [0.155, 0.5, 0.17], { rx: 0.9, rz: 0.15 });
}

/** The boar on the shared rig's quadruped variant, with its style for the clips. */
function build({ elite = false } = {}) {
  const F = boarFabrics(elite);
  const rig = createRig(LENGTH, {
    // short legs under a deep body
    quadruped: { hipY: 0.36, foreLeg: [0.12, 0.12], hindLeg: [0.12, 0.11], headDrop: -0.025, jaw: [-0.035 * HEAD, 0.03 * HEAD] },
    jaw: true,
    tail: { root: [0.08, -0.15], segments: 3, length: 0.11 },
  });
  rig.hooks = [];
  const eye = fadingEyes(rig);

  barrel(rig, F);
  for (const [s, sx] of sides) {
    foreleg(rig, s, sx, F);
    hindleg(rig, s, sx, F);
  }
  head(rig, F, eye, elite ? { tusk: 1.6, torn: true, whetters: true } : {});
  ridge(rig, F, { height: elite ? 1.3 : 1 });
  tail(rig, F);
  if (elite) scars(rig, F);

  const style = {
    speed: 1.1,
    clips: {
      idle: (spec) => idle(spec.frames),
      walk: (spec) => trot(spec.frames),
      attack: () => charge(),
      death: () => fall(),
    },
  };
  return { rig, style };
}

export const boar = () => build();
export const eliteBoar = () => build({ elite: true });

// --- clips ---------------------------------------------------------------------------------
//
// Bone angles on the quadruped (clips.js conventions): for a leg hanging along -y, +rx swings it
// back and -rx forward; +rx on a foreleg's `hand` folds the knee (the trotter tucks back); on the
// spine bones, which run along +z, +rx pitches the front down. `body.rx` pitches the whole boar
// (+ nose down), `body.rz` rolls it (+ onto its right side), `body.z` carries it forward.

/** The head carried a little low, as a boar's is. */
const CARRY = { neck: [0.06, 0, 0], head: [0.04, 0, 0] };

/** Rooting about: slow breath, the snout down and sniffing, an ear-flick of the head, the tail. */
function idle(n) {
  return Array.from({ length: n }, (_, i) => {
    const ph = (i / n) * Math.PI * 2;
    return P(
      {
        spine: [0.012 * Math.sin(ph), 0, 0],
        chest: [-0.012 * Math.sin(ph), 0, 0],
        neck: [CARRY.neck[0] + 0.06 + 0.05 * Math.sin(ph), 0.08 * Math.sin(ph + 0.9), 0],
        head: [CARRY.head[0] + 0.05 * Math.sin(ph * 2), 0.06 * Math.sin(ph + 0.4), 0.04 * Math.sin(ph * 2 + 1)],
        tail0: [0.2, 0, 0.3 * Math.sin(ph * 2)],
        thighL: [0.02 * Math.sin(ph), 0, 0],
        thighR: [-0.02 * Math.sin(ph), 0, 0],
      },
      { x: 0.004 * Math.sin(ph + 0.7) },
      { jaw: 0.08 + 0.06 * Math.sin(ph * 2), eyes: 1 },
    );
  });
}

/** A heavy trot: diagonal pairs together (near fore with far hind), the head nodding twice. */
function trot(n) {
  const legs = [
    ["L", "fore", 0],
    ["R", "hind", 0],
    ["R", "fore", Math.PI],
    ["L", "hind", Math.PI],
  ];
  return Array.from({ length: n }, (_, i) => {
    const ph = (i / n) * Math.PI * 2;
    const b = {
      spine: [0.02 * Math.sin(ph * 2), 0, 0.03 * Math.sin(ph)],
      chest: [-0.02 * Math.sin(ph * 2), 0, -0.02 * Math.sin(ph)],
      neck: [CARRY.neck[0] + 0.06 * Math.sin(ph * 2 + 0.8), 0, 0],
      head: [CARRY.head[0] + 0.03 * Math.sin(ph * 2 + 1.2), 0, 0],
      tail0: [0.35, 0, 0.25 * Math.sin(ph)],
    };
    for (const [s, kind, off] of legs) {
      const reach = Math.sin(ph + off);
      // the foot moves forward (the swing, lifted) while cos > 0, back along the ground otherwise
      const lift = Math.max(0, Math.cos(ph + off));
      if (kind === "fore") {
        b[`upperArm${s}`] = [-0.34 * reach - 0.12 * lift, 0, 0];
        b[`foreArm${s}`] = [-0.15 * lift, 0, 0];
        b[`hand${s}`] = [1.0 * lift, 0, 0];
      } else {
        b[`thigh${s}`] = [-0.32 * reach, 0, 0];
        b[`shin${s}`] = [0.55 * lift, 0, 0];
        b[`foot${s}`] = [-0.25 * lift + 0.1 * reach, 0, 0];
      }
    }
    return P(b, { rz: 0.015 * Math.sin(ph) }, { jaw: 0.1, eyes: 1 });
  });
}

/** Both forelegs or both hind legs at once. */
const pair = (front, hind) => ({
  ...(front ? { upperArmL: front[0], upperArmR: front[0], foreArmL: front[1], foreArmR: front[1], handL: front[2], handR: front[2] } : {}),
  ...(hind ? { thighL: hind[0], thighR: hind[0], shinL: hind[1], shinR: hind[1], footL: hind[2], footR: hind[2] } : {}),
});

/**
 * The charge (9 frames at 12 fps): the head drops and is held, haunches gathered, a front trotter
 * scraping the ground, through the server's 0.45 s wind-up (frames 1–4); then the lunge, the
 * tusks hooking upward (5–6), and the recovery (7–8).
 */
function charge() {
  const low = (k) => ({ neck: [0.32 + 0.12 * k, 0, 0], head: [0.22 + 0.06 * k, 0, 0] });
  const gathered = pair([[-0.2, 0, 0], [0, 0, 0], [0.05, 0, 0]], [[-0.22, 0, 0], [0.28, 0, 0], [-0.12, 0, 0]]);
  return [
    P({ neck: [-0.12, 0, 0], head: [-0.06, 0, 0], tail0: [0.6, 0, 0] }, {}, { jaw: 0.15, eyes: 1 }),
    P({ ...gathered, ...low(0), tail0: [0.9, 0, 0] }, { z: -0.02, rx: 0.04 }, { jaw: 0.3, eyes: 1 }),
    P({ ...gathered, ...low(1), upperArmL: [-0.42, 0, 0], handL: [0.75, 0, 0], tail0: [1.0, 0, 0] }, { z: -0.035, rx: 0.06 }, { jaw: 0.35, eyes: 1 }),
    P({ ...gathered, ...low(1), upperArmL: [0.18, 0, 0], handL: [0.25, 0, 0], tail0: [1.0, 0, 0.2] }, { z: -0.04, rx: 0.07 }, { jaw: 0.4, eyes: 1 }),
    P({ ...gathered, ...low(1.1), tail0: [1.0, 0, 0] }, { z: -0.045, rx: 0.075 }, { jaw: 0.4, eyes: 1 }),
    P({ ...pair([[-0.6, 0, 0], [0, 0, 0], [0.25, 0, 0]], [[0.5, 0, 0], [-0.1, 0, 0], [0.35, 0, 0]]), neck: [0.18, 0, 0], head: [0.1, 0, 0] }, { z: 0.1, rx: 0.02 }, { jaw: 0.5, eyes: 1 }),
    P({ ...pair([[-0.42, 0, 0], [0, 0, 0], [0.15, 0, 0]], [[0.32, 0, 0], [0, 0, 0], [0.2, 0, 0]]), neck: [-0.38, 0, 0], head: [-0.32, 0, 0] }, { z: 0.14, rx: -0.09 }, { jaw: 0.65, eyes: 1 }),
    P({ ...pair([[-0.12, 0, 0], [0, 0, 0], [0.1, 0, 0]], [[0.1, 0, 0], [0.1, 0, 0], [0, 0, 0]]), neck: [-0.05, 0, 0], head: [-0.04, 0, 0] }, { z: 0.08, rx: -0.02 }, { jaw: 0.3, eyes: 1 }),
    P({ ...CARRY }, { z: 0.02 }, { jaw: 0.12, eyes: 1 }),
  ];
}

/**
 * Death (7 frames at 9 fps): struck, the head jerks up; the forelegs buckle and the front drops;
 * the hindquarters sag and it rolls onto its right side, legs out, and lies still while the eyes
 * go out. It slides across as it rolls, so the carcass lies over its footprint.
 */
function fall() {
  return [
    P({ neck: [-0.32, 0, 0], head: [-0.2, 0, 0], tail0: [0.4, 0, 0] }, { z: -0.02, rx: -0.05 }, { jaw: 0.5, eyes: 1 }),
    P({ ...pair([[0.3, 0, 0], [-0.2, 0, 0], [1.3, 0, 0]], null), neck: [0.15, 0, 0], head: [0.1, 0, 0] }, { rx: 0.16, z: -0.02 }, { jaw: 0.6, eyes: 0.85 }),
    P({ ...pair([[0.35, 0, 0], [-0.2, 0, 0], [1.4, 0, 0]], [[-0.45, 0, 0], [0.9, 0, 0], [-0.3, 0, 0]]), neck: [0.2, 0, 0.1], head: [0.1, 0, 0] }, { rx: 0.12, rz: 0.15, x: 0.03 }, { jaw: 0.5, eyes: 0.6 }),
    P({ ...pair([[0.1, 0, 0], [-0.1, 0, 0], [0.9, 0, 0]], [[-0.3, 0, 0], [0.6, 0, 0], [-0.2, 0, 0]]), neck: [0.05, 0, 0.2], head: [0, 0, 0.1] }, { rx: 0.06, rz: 0.6, x: 0.13 }, { jaw: 0.45, eyes: 0.4 }),
    P({ ...pair([[-0.15, 0, 0], [0, 0, 0], [0.4, 0, 0]], [[-0.05, 0, 0], [0.25, 0, 0], [0, 0, 0]]), neck: [-0.05, 0, 0.25], head: [-0.05, 0, 0.15] }, { rx: 0.02, rz: 1.15, x: 0.26 }, { jaw: 0.4, eyes: 0.15 }),
    P({ ...pair([[-0.25, 0, 0], [0, 0, 0], [0.15, 0, 0]], [[0.15, 0, 0], [0.05, 0, 0], [0.1, 0, 0]]), neck: [-0.08, 0, 0.3], head: [-0.06, 0, 0.18] }, { rz: 1.48, x: 0.34 }, { jaw: 0.35, eyes: 0.03 }),
    P({ ...pair([[-0.22, 0, 0], [0, 0, 0], [0.18, 0, 0]], [[0.18, 0, 0], [0.05, 0, 0], [0.12, 0, 0]]), neck: [-0.08, 0, 0.32], head: [-0.06, 0, 0.2] }, { rz: 1.54, x: 0.36 }, { jaw: 0.35, eyes: 0 }),
  ];
}
