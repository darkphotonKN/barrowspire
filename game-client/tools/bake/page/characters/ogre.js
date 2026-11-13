// The ogre (FS-C8VM7 §H R46): a new family on the shared humanoid rig (ADR-0021), built in code,
// never sourced. Bigger than a troll, at the top of the brute band, and heavier: a vast gut and
// chest on short, thick legs, the shoulders hunched up round a small, low head. A heavy brow over
// small ember eyes, a broad flat nose, an underslung jaw with two stub tusks, small ears, a bald
// pate with a tuft of hair tied on the crown. Its right arm, the throwing arm, is the heavier, a
// broken iron manacle on its wrist; a hide kilt under a broad belt, fur pads on the shoulders.
//
// It walks slowly, the weight rolling from foot to foot. Its attack is one heavy overhand with the
// right arm: hauled back high over the head and held, then brought over and down as the body
// pitches after it. It reads as a pounding blow and as a rock thrown (R38), so the one clip serves
// both. It topples with weight and lies still, the eyes going out by the last frame.
//
// Its tiers (R46) are baked recolours of this look, deepening with the step (OGRE_STEPS): the
// hide from a ruddy, sun-cured flesh to a dark umber, then a slate-black.

import * as THREE from "three";
import { materials } from "../materials.js";
import { mix, shade } from "../palette.js";
import { smoothstep } from "../noise.js";
import { attach, createRig, ellipsoid, jointAt as J } from "./rig.js";
import { bareFeet, belt, hands, legs, neck, skirt, skirtBones, torso } from "./anatomy.js";
import { add, deathClip, idleCycle, pose, walkCycle } from "./clips.js";
import { fabrics, mat, paint, pf, pn } from "./fabrics.js";
import { limbGuard, spaulder } from "./gear.js";
import { arm, fadingEyes } from "./forlorn.js";
import { toneOf } from "./variantTones.js";

const P = pose;
const sides = [
  ["L", 1],
  ["R", -1],
];

/**
 * The three steps' tones (R46), recipes over BARROW (variantTones.js `toneOf`): `skin` the hide,
 * `leather` the kilt and belt, `fur` the shoulder pads and the tuft. Each step deeper than the one below.
 */
export const OGRE_STEPS = {
  ogre: {
    skin: { base: "barrowBrown", steps: [["vellumDark", 0.3], ["oxbloodText", 0.16]] },
    leather: { base: "barrowBrown", steps: [["barrowDeep", 0.4]] },
    fur: { base: "barrowDeep", steps: [["slate", 0.2]] },
  },
  ogre_mauler: {
    skin: { base: "barrowBrown", steps: [["barrowDeep", 0.35], ["oxblood", 0.08]] },
    leather: { base: "barrowDeep", steps: [["pitch", 0.3]] },
    fur: { base: "charcoal", steps: [["barrowDeep", 0.4]] },
  },
  ogre_tyrant: {
    skin: { base: "slate", steps: [["barrowDeep", 0.45], ["charcoal", 0.3]] },
    leather: { base: "pitch", steps: [["barrowDeep", 0.3]] },
    fur: { base: "pitch", steps: [["slate", 0.25]] },
  },
};

// --- materials -----------------------------------------------------------------------------

/** Thick, coarse flesh: big pores, broad mottling, scars, creased dark in the folds. */
function coarseHide(tone, seed) {
  return paint(
    (x, y) => {
      const pore = pn(x, y, 2, 2, seed);
      const fold = 1 - smoothstep(0.03, 0.09, Math.abs(pf(x, y, 32, seed + 1) - 0.5));
      const mottle = pf(x, y, 32, seed + 2);
      const scar = smoothstep(0.82, 0.9, pf(x, y, 16, seed + 3));
      const h = 0.5 + 0.14 * pore - 0.15 * fold + 0.12 * scar;
      let c = shade(tone, 0.84 + 0.1 * pore + 0.24 * (mottle - 0.5) - 0.1 * fold + 0.1 * scar);
      c = mix(c, mix("barrowDeep", "pitch", 0.4), 0.2 * smoothstep(0.6, 0.85, pf(x, y, 16, seed + 4)));
      return { c, h };
    },
    { strength: 1.6 },
  );
}

/** Cured hide for the kilt: stiff, cracked, sewn from patches. */
function curedHide(tone, seed) {
  return paint(
    (x, y) => {
      const crack = 1 - smoothstep(0.0, 0.05, Math.abs(pf(x, y, 16, seed) - 0.5));
      const patch = pf(x, y, 32, seed + 1) > 0.5 ? 1.08 : 0.92;
      const h = 0.5 - 0.35 * crack + 0.1 * pn(x, y, 4, 4, seed + 2);
      const c = shade(tone, patch * (0.82 + 0.22 * pf(x, y, 16, seed + 3)) - 0.3 * crack);
      return { c, h };
    },
    { strength: 1.6 },
  );
}

/** Matted fur. */
function mattedFur(tone, seed) {
  return paint(
    (x, y) => {
      const strand = pn(x, y, 1, 16, seed);
      const clump = pf(x, y, 16, seed + 1);
      return { c: shade(tone, 0.65 + 0.45 * strand + 0.2 * (clump - 0.5)), h: 0.6 * strand + 0.4 * clump };
    },
    { strength: 1.4 },
  );
}

const SETS = {};

/** A step's material set, painted once per bake. */
function ogreFabrics(step) {
  if (SETS[step]) return SETS[step];
  const recipe = OGRE_STEPS[step];
  if (!recipe) throw new Error(`ogre: no step "${step}"`);
  const tone = Object.fromEntries(Object.entries(recipe).map(([k, r]) => [k, toneOf(mix, shade, r)]));
  const D = THREE.DoubleSide;
  SETS[step] = {
    skin: mat(coarseHide(tone.skin, 151), { rough: 0.7, normal: 1 }),
    leather: mat(curedHide(tone.leather, 153), { rough: 0.78, side: D }),
    fur: mat(mattedFur(tone.fur, 155), { rough: 0.95, side: D }),
  };
  return SETS[step];
}

// --- the body ------------------------------------------------------------------------------

/** A small head sunk between the shoulders: heavy brow, flat nose, underslung jaw, stub tusks. */
function ogreHead(rig, O, F, eye) {
  const M = materials();
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  attach(rig, "head", ellipsoid(r * 1.0 * H, r * 0.92 * H, r * 1.04 * H, 18), O.skin, [0, hy + 0.04, hz - 0.004]);
  // the brow: one heavy shelf, the eyes small and deep under it
  attach(rig, "head", ellipsoid(r * 1.0 * H, r * 0.3 * H, r * 0.42 * H, 14), O.skin, [0, hy + 0.05, hz + r * 0.7]);
  for (const [, sx] of sides) {
    attach(rig, "head", ellipsoid(r * 0.24 * H, r * 0.16 * H, r * 0.14 * H, 10), M.black, [sx * r * 0.4, hy + 0.036, hz + r * 0.86]);
    attach(rig, "head", ellipsoid(r * 0.17 * H, r * 0.11 * H, r * 0.08 * H, 8), eye, [sx * r * 0.4, hy + 0.036, hz + r * 0.94], { noShadow: true });
    // small, thick ears, low on the skull
    attach(rig, "head", ellipsoid(r * 0.16 * H, r * 0.3 * H, r * 0.24 * H, 10), O.skin, [sx * r * 1.0, hy + 0.034, hz - r * 0.05], { rz: sx * 0.3 });
  }
  // a broad, flat nose and cheeks swollen under it
  attach(rig, "head", ellipsoid(r * 0.36 * H, r * 0.28 * H, r * 0.3 * H, 12), O.skin, [0, hy + 0.024, hz + r * 0.98]);
  attach(rig, "head", ellipsoid(r * 0.9 * H, r * 0.42 * H, r * 0.6 * H, 14), O.skin, [0, hy + 0.012, hz + r * 0.42]);
  // a tuft of hair tied on the bald crown
  const tuft = new THREE.ConeGeometry(r * 0.32 * H, r * 1.1 * H, 8);
  attach(rig, "head", tuft, O.fur, [0, hy + 0.04 + r * 1.35, hz - r * 0.3], { rx: -0.6 });
  attach(rig, "head", new THREE.TorusGeometry(r * 0.24 * H, r * 0.07 * H, 6, 12), F.leatherDark, [0, hy + 0.04 + r * 0.92, hz - r * 0.12], { rx: Math.PI / 2 - 0.6 });
  // the jaw, broad and underslung, a dark mouth and two stub tusks standing out of it
  const [, jy, jz] = J(rig, "jaw");
  attach(rig, "jaw", ellipsoid(r * 1.0 * H, r * 0.42 * H, r * 0.9 * H, 14), O.skin, [0, jy - 0.01, jz + r * 0.3]);
  attach(rig, "jaw", ellipsoid(r * 0.7 * H, r * 0.12 * H, r * 0.3 * H, 10), M.black, [0, jy + 0.002, jz + r * 0.88]);
  for (const [, sx] of sides)
    attach(rig, "jaw", new THREE.ConeGeometry(r * 0.11 * H, r * 0.42 * H, 6), F.bone, [sx * r * 0.42, jy + 0.012, jz + r * 0.96], { rx: -0.2, rz: sx * 0.15 });
}

/**
 * The ogre at one step (OGRE_STEPS): every step shares the rig, the clips and the size.
 */
function ogreOf(step = "ogre") {
  const M = materials();
  const F = fabrics();
  const O = ogreFabrics(step);
  const rig = createRig(3.34, {
    hunch: 1,
    jaw: true,
    hipY: 0.42,
    thigh: 0.19,
    shin: 0.18,
    spine: 0.1,
    chest: 0.13,
    neck: 0.1,
    torsoW: 1.7,
    torsoD: 1.55,
    shoulderW: 1.75,
    hipW: 1.45,
    limbR: 1.65,
    armR: 1.7,
    upperArm: 0.19,
    foreArm: 0.18,
    headR: 0.054,
  });
  rig.hooks = [];
  rig.rest.hunch = [0.3, 0, 0];
  rig.rest.neck = [-0.42, 0, 0];
  rig.rest.head = [-0.02, 0, 0];
  rig.rest.upperArmL = [0, 0, 0.34];
  rig.rest.upperArmR = [0, 0, -0.36];
  skirtBones(rig, { stiffness: 55, drag: 0.25 });
  const [, hy] = J(rig, "hips");
  const [, wy] = J(rig, "handR");
  const eye = fadingEyes(rig);
  const kilt = {
    top: hy + 0.03,
    bottom: hy - 0.17,
    rTop: [0.15, 0.13],
    rBottom: [0.18, 0.16],
    legFollow: 0.62,
    panels: true,
    panelWeight: 0.4,
    ragged: { teeth: 10, depth: 0.05, seed: 51 },
    segs: 30,
  };

  torso(rig, O.skin, { hump: 0.02, neckW: 1.2 });
  // the gut, hanging over the belt, and the slab of the chest
  attach(rig, "spine", ellipsoid(0.13 * rig.H, 0.11 * rig.H, 0.1 * rig.H, 18), O.skin, [0, hy + 0.07, 0.06]);
  // the shoulders' muscle heaped up round the neck: the yoke a small head sits sunk in
  const [, ny] = J(rig, "neck");
  attach(rig, "chest", ellipsoid(0.15 * rig.H, 0.055 * rig.H, 0.1 * rig.H, 20), O.skin, [0, ny - 0.018, -0.012]);
  neck(rig, O.skin, { w: 1.15 });
  // the throwing arm (the right) heavier than the left
  arm(rig, "L", O.skin, { r: 0.95, bulk: 1.06 });
  arm(rig, "R", O.skin, { r: 1.06, bulk: 1.16, fore: 1.1 });
  legs(rig, O.skin, { r: 1.05, under: kilt });
  hands(rig, O.skin, { size: 1.5 });
  bareFeet(rig, O.skin, { size: 1.45 });
  ogreHead(rig, O, F, eye);
  // a fur pad on each shoulder
  for (const [side] of sides) spaulder(rig, side, O.fur, { lames: 2, size: 1.25 });
  skirt(rig, O.leather, kilt);
  belt(rig, O.leather, M.iron, { r: [0.108, 0.09], dy: 0.03 });
  // the broken manacle on the throwing wrist, two links of its chain hanging from it
  limbGuard(rig, "foreArmR", wy + 0.03, wy + 0.07, [0.05, 0.048], M.rust, { taper: 1.02 });
  const [xr] = J(rig, "handR");
  for (let i = 0; i < 2; i++)
    attach(rig, "foreArmR", new THREE.TorusGeometry(0.012 * rig.H, 0.004 * rig.H, 6, 10), M.rust, [xr - 0.04, wy + 0.03 - i * 0.022, 0.0], { ry: i * Math.PI / 2 });

  const hold = pose({
    upperArmL: [-0.1, 0, 0],
    foreArmL: [-0.35, 0, 0],
    upperArmR: [-0.12, 0, 0],
    foreArmR: [-0.4, 0, 0],
    handR: [0.2, 0, 0],
  });
  const style = {
    speed: 0.6,
    hold,
    // slow and heavy: short steps, the weight rolling over each foot
    walk: { stride: 0.62, knee: 0.7, arms: [0.55, 0.6], lean: 0.05, twist: 1.6 },
    walkExtra: (i) => {
      const ph = (i / 8) * Math.PI * 2;
      return pose({ hunch: [0.03 * Math.cos(ph * 2), 0, 0], neck: [0, 0.05 * Math.sin(ph), 0] }, { rz: 0.05 * Math.sin(ph), y: -0.012 * Math.abs(Math.cos(ph)) });
    },
    idle: { lean: 0.03 },
    idleExtra: (i, ph) => pose({ neck: [0, 0.08 * Math.sin(ph), 0], hunch: [0.02 * Math.sin(ph), 0, 0] }, {}, { jaw: 0.1 + 0.06 * Math.sin(ph) }),
    deathExtra: (i) => pose({}, {}, { eyes: 1 - i / 6 }),
    clips: {
      idle: (spec) => idleCycle(style, spec.frames),
      walk: () => walkCycle(style),
      attack: () => overhand(),
      death: () => deathClip(style),
    },
  };
  return { rig, style };
}

/** Its feet set for the blow: the left forward, the right back, the knees bent under the weight. */
const SET = pose({
  hips: [0, -0.18, 0],
  thighL: [-0.3, 0, 0.06],
  shinL: [0.3, 0, 0],
  thighR: [0.18, 0, -0.06],
  shinR: [0.28, 0, 0],
  footR: [-0.4, 0, 0],
});

/**
 * The overhand (R46): the right arm hauled up and back high over the head, the body arched back
 * under it (keys 0-2, the wind-up, held), then brought over and down as the chest pitches after
 * it, the arm straightening forward as a throw does (key 3, the strike), on down past the knee
 * (key 4), and back up to the stance (keys 5-6). The left arm goes out forward for balance.
 */
function overhand() {
  const L = (k) => ({ upperArmL: [-0.6 - 0.4 * k, 0, 0.3], foreArmL: [-0.5 + 0.2 * k, 0, 0] });
  return [
    P({ ...L(0), upperArmR: [-0.9, 0, -0.3], foreArmR: [-1.0, 0, 0], hunch: [-0.05, -0.1, 0], chest: [-0.05, -0.15, 0] }, {}, { jaw: 0.3, eyes: 1 }),
    P({ ...L(0.4), upperArmR: [-2.5, 0.2, -0.4], foreArmR: [-1.5, 0, 0], handR: [0.4, 0, 0], hunch: [-0.22, -0.2, 0], chest: [-0.2, -0.3, 0], neck: [-0.2, 0, 0] }, { z: -0.02 }, { jaw: 0.7, eyes: 1 }),
    P({ ...L(0.5), upperArmR: [-2.9, 0.15, -0.3], foreArmR: [-1.4, 0, 0], handR: [0.4, 0, 0], hunch: [-0.3, -0.24, 0], chest: [-0.24, -0.34, 0], neck: [-0.25, 0, 0] }, { z: -0.03 }, { jaw: 0.9, eyes: 1 }),
    P({ ...L(1), upperArmR: [-1.5, 0.1, -0.05], foreArmR: [-0.15, 0, 0], handR: [-0.2, 0, 0], hunch: [0.3, 0.25, 0], chest: [0.25, 0.3, 0], neck: [0.1, 0, 0] }, { z: 0.06 }, { jaw: 1, eyes: 1 }),
    P({ ...L(0.8), upperArmR: [-0.5, 0.25, 0.2], foreArmR: [-0.2, 0, 0], handR: [-0.3, 0, 0], hunch: [0.42, 0.3, 0], chest: [0.3, 0.35, 0], spine: [0.1, 0, 0] }, { z: 0.07 }, { jaw: 0.6, eyes: 1 }),
    P({ ...L(0.4), upperArmR: [-0.4, 0.1, -0.1], foreArmR: [-0.5, 0, 0], hunch: [0.2, 0.12, 0], chest: [0.12, 0.12, 0] }, { z: 0.03 }, { jaw: 0.3, eyes: 1 }),
    P({ ...L(0), upperArmR: [-0.2, 0, -0.05], foreArmR: [-0.45, 0, 0], hunch: [0.04, 0, 0] }, { z: 0.01 }, { jaw: 0.15, eyes: 1 }),
  ].map((p) => add(SET, p));
}

/** The three ogre variants (R3). */
export const ogre = () => ogreOf("ogre");
export const ogreMauler = () => ogreOf("ogre_mauler");
export const ogreTyrant = () => ogreOf("ogre_tyrant");
