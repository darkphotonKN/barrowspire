// The Forlorn Forest's dead (FS-3QHQZ §C R29, R30): the zombie, the forest's common fodder, and
// the ghost, rarer, quicker and frailer. Both are built on the shared humanoid rig (ADR-0021) and
// follow the guideline's "Enemy design language": grave materials from the cold end of BARROW,
// ember-red eyes as the one emissive, a silhouette that breaks the human line, readable wind-ups,
// no gore. Neither may be mistaken for the Spire's ghoul (a bare skeleton with a cleaver) or for
// FS-Q14EV's wraith (dark, ragged, opaque, legless).
//
// The zombie is a fleshed corpse in a rotted burial shroud, hunched and lopsided: its right arm
// hangs longer and heavier, swollen and shackled, its head lolls, earth and moss cake its
// grave-rot skin. It drags its right foot, raises the heavy arm high before it brings it down,
// and dies by folding at the knees and collapsing onto its side.
//
// The ghost is pale, thin and see-through: its body is baked at about 0.6 alpha and its legs fade
// to nothing below the knee, while its eyes stay opaque (an opacity pass, page/opacity.js). It
// hovers, reaches ahead with long arms, wails as it rakes, and dies by stretching thin and
// dissolving.

import * as THREE from "three";
import { materials } from "../materials.js";
import { mix, shade } from "../palette.js";
import { smoothstep } from "../noise.js";
import { attach, createRig, ellipsoid, jointAt as J, skinTube } from "./rig.js";
import { mat, paint, pf, pn } from "./fabrics.js";
import { add, groundPose, idleCycle, pose, walkCycle } from "./clips.js";
import { bareFeet, cloak, cloakBones, hair, legs, neck, overTorso, skirt, skirtBones, torso } from "./anatomy.js";

const P = pose;
const sides = [
  ["L", 1],
  ["R", -1],
];

// --- grave materials -----------------------------------------------------------------------

/** Tones, all from BARROW's cold end (guideline "Materials are grave materials"). */
const TONE = {
  // grave-rot skin: a dead grey-green, pallid toward bone, never the arcane token
  rot: mix(mix("necrotic", "vellumDark", 0.5), "slate", 0.35),
  bruise: mix("slate", "barrowDeep", 0.5),
  moss: mix("arcaneDeep", "barrowDeep", 0.45),
  earth: mix("barrowBrown", "barrowDeep", 0.55),
  // a winding sheet gone the colour of the grave it lay in
  shroud: mix(mix("vellumDark", "slate", 0.55), "charcoal", 0.22),
  hairDead: mix("pitch", "slate", 0.45),
  // the ghost: pale, cold, bloodless
  pale: mix(mix("vellum", "necrotic", 0.7), "slateLight", 0.1),
  gown: mix(mix("vellum", "necrotic", 0.62), "slateLight", 0.18),
  wisp: mix(mix("vellumDark", "necrotic", 0.5), "slateLight", 0.2),
};

/** Grave-rot skin: mottled and bruised, with moss and caked earth in patches (`moss`, `earth`). */
function graveSkin(tone, { moss = 0.4, earth = 0.4, seed = 61 } = {}) {
  return paint(
    (x, y) => {
      const m = pf(x, y, 16, seed);
      const bruise = smoothstep(0.55, 0.8, pf(x, y, 32, seed + 1));
      const mossy = moss * smoothstep(0.6, 0.78, pf(x, y, 16, seed + 2));
      const caked = earth * smoothstep(0.58, 0.74, pf(x, y, 32, seed + 3));
      const crack = 1 - smoothstep(0.0, 0.06, Math.abs(pf(x, y, 32, seed + 4) - 0.5));
      let c = shade(tone, 0.8 + 0.3 * m - 0.2 * crack);
      c = mix(c, TONE.bruise, 0.45 * bruise);
      c = mix(c, shade(TONE.moss, 0.8 + 0.4 * pn(x, y, 2, 2, seed + 5)), mossy);
      c = mix(c, shade(TONE.earth, 0.75 + 0.35 * pn(x, y, 4, 4, seed + 6)), caked);
      return { c, h: 0.5 + 0.15 * m + 0.3 * caked + 0.2 * mossy - 0.3 * crack };
    },
    { strength: 1.6 },
  );
}

/** Rotted linen: a coarse weave, holed and stained, darkest where it touched the earth. */
function rottedLinen(tone, { seed = 71, holes = 0.6 } = {}) {
  return paint(
    (x, y) => {
      const weave = 0.5 + 0.25 * Math.sin((x * Math.PI) / 2) * Math.sin((y * Math.PI) / 2);
      const hole = holes * smoothstep(0.7, 0.76, pf(x, y, 16, seed));
      const stain = smoothstep(0.35, 0.8, pf(x, y, 32, seed + 1));
      const h = weave * (1 - hole) + 0.2 * pn(x, y, 1, 8, seed + 2);
      let c = shade(tone, 0.78 + 0.22 * weave - 0.6 * hole);
      c = mix(c, TONE.earth, 0.45 * stain);
      return { c, h };
    },
    { strength: 1.2 },
  );
}

/** Pale, smooth, bloodless: the ghost's skin and gown take little texture, so they read as mist. */
function pallor(tone, { seed = 81, streak = 0.15 } = {}) {
  return paint(
    (x, y) => {
      const m = pf(x, y, 32, seed);
      const s = pn(x, y, 1, 16, seed + 1);
      return { c: shade(tone, 0.86 + 0.16 * m + streak * (s - 0.5)), h: 0.5 + 0.1 * m + 0.1 * s };
    },
    { strength: 0.6 },
  );
}

/** Lank, dead hair. */
function strands(tone, { seed = 91 } = {}) {
  return paint(
    (x, y) => {
      const s = pn(x, y, 1, 32, seed);
      return { c: shade(tone, 0.65 + 0.5 * s), h: s };
    },
    { strength: 1.2 },
  );
}

let SET = null;

/** The forest dead's materials, painted once per bake (seeded, so a re-bake paints alike). */
function forlornFabrics() {
  if (SET) return SET;
  const D = THREE.DoubleSide;
  SET = {
    rot: mat(graveSkin(TONE.rot), { rough: 0.75, normal: 1 }),
    rotCaked: mat(graveSkin(TONE.rot, { moss: 0.55, earth: 0.75, seed: 63 }), { rough: 0.9, normal: 1.2 }),
    shroud: mat(rottedLinen(TONE.shroud), { rough: 0.95, side: D }),
    hairDead: mat(strands(TONE.hairDead), { rough: 0.9, side: D }),
    pale: mat(pallor(TONE.pale), { rough: 0.55, normal: 0.5 }),
    gown: mat(pallor(TONE.gown, { seed: 83, streak: 0.3 }), { rough: 0.7, side: D }),
    wisp: mat(strands(TONE.wisp, { seed: 93 }), { rough: 0.8, side: D }),
  };
  return SET;
}

// --- shared pieces -------------------------------------------------------------------------

/**
 * Lengthens one arm after the rig is built (the zombie's heavy arm): the forearm and the hand
 * bones move down their parents, and every bind position is re-read. Call before any skinned
 * mesh is bound.
 */
function lengthenArm(rig, side, { upper = 1, fore = 1 }) {
  if (rig.skeleton) throw new Error("forlorn: lengthenArm after the skeleton was bound");
  rig.bones[`foreArm${side}`].position.y *= upper;
  rig.bones[`hand${side}`].position.y *= fore;
  rig.root.updateMatrixWorld(true);
  for (const [name, b] of Object.entries(rig.bones)) rig.bind[name].setFromMatrixPosition(b.matrixWorld);
}

/** One arm, shoulder to wrist, as `arms()` builds it, with its own thickness (`r`) and swell. */
function arm(rig, s, material, { r = 1, bulk = 1, fore = 1 } = {}) {
  const ar = rig.p.armR * r;
  const [x, uy] = J(rig, `upperArm${s}`);
  const [, fy] = J(rig, `foreArm${s}`);
  const [, wy] = J(rig, `hand${s}`);
  const U = `upperArm${s}`;
  const F = `foreArm${s}`;
  return skinTube(
    rig,
    [
      { p: [x * 0.92, uy + 0.022, 0], r: [0.036 * ar, 0.042 * ar], w: { chest: 0.5, [U]: 0.5 } },
      { p: [x, uy - 0.012, 0], r: [0.046 * ar * bulk, 0.047 * ar * bulk], w: { [U]: 0.85, chest: 0.15 } },
      { p: [x, uy - 0.07, 0.002], r: [0.039 * ar, 0.042 * ar * bulk], w: { [U]: 1 } },
      { p: [x, fy + 0.03, 0], r: [0.031 * ar, 0.032 * ar], w: { [U]: 1 } },
      { p: [x, fy - 0.018, 0.002], r: [0.034 * ar * fore, 0.034 * ar * fore], w: { [F]: 1 } },
      { p: [x, (fy + wy) / 2, 0.005], r: [0.038 * ar * bulk * fore, 0.035 * ar * fore], w: { [F]: 1 } },
      { p: [x, wy + 0.03, 0], r: [0.027 * ar * fore, 0.022 * ar * fore], w: { [F]: 1 } },
      { p: [x, wy - 0.006, 0], r: [0.025 * ar * fore, 0.02 * ar * fore], w: { [F]: 0.5, [`hand${s}`]: 0.5 } },
    ],
    material,
    { segs: 14, steps: 4, uv: 5 },
  );
}

/**
 * A grasping hand: a palm and long fingers curled forward, nails at the tips. `size` scales it,
 * `reach` the fingers' length.
 */
function claw(rig, s, material, { size = 1, reach = 1, nail = null } = {}) {
  const H = rig.H;
  const sx = s === "L" ? 1 : -1;
  const [x, wy] = J(rig, `hand${s}`);
  const k = size;
  attach(rig, `hand${s}`, ellipsoid(0.022 * k * H, 0.034 * k * H, 0.03 * k * H, 12), material, [x, wy - 0.03 * k, 0.004]);
  for (let i = 0; i < 4; i++) {
    const len = (0.05 - Math.abs(i - 1.5) * 0.006) * k * reach;
    const finger = new THREE.CylinderGeometry(0.0055 * k * H, 0.0075 * k * H, len * H, 6);
    const fx = x + sx * (i - 1.5) * 0.011 * k;
    attach(rig, `hand${s}`, finger, material, [fx, wy - 0.058 * k - len * 0.42, 0.02 * k], { rx: 0.45 });
    if (nail)
      attach(rig, `hand${s}`, new THREE.ConeGeometry(0.0055 * k * H, 0.016 * k * H, 5), nail, [fx, wy - 0.058 * k - len * 0.9, 0.02 * k + len * 0.42], {
        rx: Math.PI + 0.6,
      });
  }
  // the thumb, across the palm
  attach(rig, `hand${s}`, ellipsoid(0.008 * k * H, 0.022 * k * H, 0.008 * k * H, 8), material, [x - sx * 0.016 * k, wy - 0.04 * k, 0.024 * k], {
    rz: sx * 0.5,
    rx: 0.3,
  });
}

/** Ember-red eyes that go dark over the death clip (`fx.eyes`), as the demon's do. */
function fadingEyes(rig) {
  const M = materials();
  const eye = M.hostileEye.clone();
  const base = eye.emissiveIntensity;
  rig.hooks.push((r, p) => {
    eye.emissiveIntensity = base * (p.fx.eyes ?? 1);
  });
  return eye;
}

// --- the zombie ----------------------------------------------------------------------------

/** A few lank strands hanging from a balding scalp, mostly on the lolling side. */
function lankHair(rig, material) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const spots = [
    [0.7, 0.4, -0.3, 0.13],
    [0.85, 0.1, -0.55, 0.15],
    [0.6, -0.2, -0.8, 0.12],
    [-0.2, 0.5, -0.9, 0.1],
    [-0.65, 0.2, -0.6, 0.11],
    [0.3, 0.7, -0.6, 0.09],
  ];
  for (const [x, y, z, len] of spots) {
    const strand = new THREE.CylinderGeometry(0.005 * H, 0.011 * H, len * H, 5);
    attach(rig, "head", strand, material, [x * r, hy + 0.06 + y * r - len * 0.45, hz + z * r], { rz: x * 0.25, rx: z * 0.2 });
  }
}

/** A fleshed, rotting head: heavy brow, sunken sockets with ember eyes, the jaw hanging slack. */
function zombieHead(rig, skin, eye) {
  const M = materials();
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  // cranium, a little lopsided
  attach(rig, "head", ellipsoid(r * 0.95 * H, r * 1.0 * H, r * 1.04 * H, 20), skin, [r * 0.04, hy + 0.056, hz - 0.004], { rz: 0.08 });
  // brow ridge and cheekbones over hollow cheeks
  attach(rig, "head", ellipsoid(r * 0.86 * H, r * 0.3 * H, r * 0.4 * H, 14), skin, [0, hy + 0.066, hz + r * 0.72]);
  attach(rig, "head", ellipsoid(r * 0.74 * H, r * 0.46 * H, r * 0.66 * H, 14), skin, [0, hy + 0.03, hz + r * 0.32]);
  for (const [, sx] of sides) {
    attach(rig, "head", ellipsoid(r * 0.3 * H, r * 0.27 * H, r * 0.22 * H, 10), M.black, [sx * r * 0.36, hy + 0.05, hz + r * 0.8]);
    attach(rig, "head", ellipsoid(r * 0.2 * H, r * 0.17 * H, r * 0.09 * H, 8), eye, [sx * r * 0.36, hy + 0.05, hz + r * 0.93], { noShadow: true });
  }
  // the nose rotted to a dark cavity
  attach(rig, "head", ellipsoid(r * 0.16 * H, r * 0.2 * H, r * 0.12 * H, 8), M.black, [0, hy + 0.034, hz + r * 0.9]);
  const [, jy, jz] = J(rig, "jaw");
  attach(rig, "jaw", ellipsoid(r * 0.7 * H, r * 0.3 * H, r * 0.72 * H, 12), skin, [0, jy - 0.016, jz + 0.012]);
  attach(rig, "jaw", ellipsoid(r * 0.48 * H, r * 0.2 * H, r * 0.42 * H, 10), M.black, [0, jy - 0.004, jz + 0.024]);
  for (let i = 0; i < 4; i++)
    attach(rig, "jaw", new THREE.ConeGeometry(r * 0.07 * H, r * 0.2 * H, 5), M.bone, [(i - 1.5) * r * 0.2, jy + 0.0, jz + r * 0.62], { rx: -0.1 });
}

export function zombie() {
  const M = materials();
  const F = forlornFabrics();
  const rig = createRig(1.96, {
    hunch: 1,
    jaw: true,
    torsoW: 0.9,
    torsoD: 0.92,
    shoulderW: 1.02,
    hipW: 0.94,
    headR: 0.06,
    limbR: 0.8,
    armR: 0.82,
  });
  rig.hooks = [];
  // hunched and lopsided: the heavy right side drags the shoulder down, the head lolls left
  rig.rest.hunch = [0.4, 0, 0.12];
  rig.rest.chest = [0.06, 0.08, 0.06];
  rig.rest.neck = [-0.08, 0, -0.42];
  rig.rest.head = [0.2, 0.12, -0.2];
  rig.rest.jaw = [0.22, 0, 0];
  rig.rest.clavicleR = [0, 0, 0.22];
  rig.rest.clavicleL = [0, 0, 0.05];
  lengthenArm(rig, "R", { upper: 1.15, fore: 1.4 });
  skirtBones(rig, { stiffness: 42, drag: 0.3 });
  const [, hy] = J(rig, "hips");
  const eye = fadingEyes(rig);

  torso(rig, F.rot, { ribs: true, waist: 0.86 });
  neck(rig, F.rot, { w: 0.85 });
  // the light arm withered, the heavy one swollen
  arm(rig, "L", F.rot, { r: 0.82 });
  arm(rig, "R", F.rotCaked, { r: 1.18, bulk: 1.25, fore: 1.3 });
  claw(rig, "L", F.rot, { size: 0.9, nail: M.bone });
  claw(rig, "R", F.rotCaked, { size: 1.4, reach: 1.15, nail: M.bone });
  legs(rig, F.rotCaked, { r: 0.84 });
  bareFeet(rig, F.rotCaked, { size: 0.9 });
  zombieHead(rig, F.rot, eye);
  lankHair(rig, F.hairDead);
  // a rusted shackle on the heavy wrist, the buried man's last iron
  const [xr, wy] = J(rig, "handR");
  const [, fy] = J(rig, "foreArmR");
  const shackle = new THREE.TorusGeometry(0.036 * rig.H, 0.011 * rig.H, 8, 16);
  attach(rig, "foreArmR", shackle, M.rust, [xr, wy + 0.028 + (fy - wy) * 0.05, 0.004], { rx: Math.PI / 2 });

  // the burial shroud: wound around the body, torn open down the right side, its hem in rags
  // wound over the left shoulder and round the back, open across the right of the chest
  overTorso(rig, F.shroud, { from: hy - 0.01, arc: [-Math.PI / 2 - 1.1, Math.PI / 2 - 0.15], pad: 0.014 });
  skirt(rig, F.shroud, {
    top: hy + 0.03,
    bottom: hy - 0.22,
    rTop: [0.104, 0.086],
    rBottom: [0.12, 0.102],
    legFollow: 0.6,
    panels: true,
    panelWeight: 0.45,
    ragged: { teeth: 11, depth: 0.15, seed: 21 },
    segs: 30,
  });

  const hold = pose({
    // the withered arm dangling crooked, the heavy one hanging low and forward
    upperArmL: [-0.6, 0.1, 0.06],
    foreArmL: [-0.55, 0, 0],
    handL: [0.5, 0, 0.2],
    // forward against the hunch (which swings a hanging arm back), and out from the side, so it
    // hangs a little ahead of the body, the claw at the knee
    upperArmR: [-0.62, 0, -0.34],
    foreArmR: [-0.05, 0, 0],
    handR: [0.25, 0, 0],
  });
  const style = {
    speed: 0.55,
    hold,
    walk: { stride: 0.62, knee: 0.85, arms: [0.15, 0.55], lean: 0.1, twist: 1.6 },
    // a lurching drag: the right foot scrapes, toes down, and the body pitches over the left
    walkExtra: (i) => {
      const ph = (i / 8) * Math.PI * 2;
      const dragging = i >= 4;
      return pose(
        {
          footR: [dragging ? 0.55 : 0.1, 0, 0],
          shinR: [dragging ? 0.18 : 0, 0, 0],
          hunch: [0.06 * Math.sin(ph * 2), 0, 0.08 * Math.sin(ph)],
          neck: [0.08 * Math.sin(ph * 2 + 1), 0, 0.1 * Math.sin(ph + 0.6)],
          upperArmR: [0.12 * Math.sin(ph + 0.8), 0, 0],
        },
        { rz: 0.05 * Math.sin(ph) },
      );
    },
    idle: { lean: 0.04 },
    idleExtra: (i, ph) =>
      pose(
        {
          neck: [0.06 * Math.sin(ph), 0.1 * Math.sin(ph + 0.4), 0.12 * Math.sin(ph)],
          upperArmR: [0.1 * Math.sin(ph + 1.2), 0, 0.04 * Math.sin(ph)],
          hunch: [0.03 * Math.sin(ph * 2), 0, 0],
        },
        {},
        { jaw: 0.15 + 0.12 * Math.sin(ph * 2) },
      ),
    clips: {
      idle: (spec) => idleCycle(style, spec.frames),
      walk: () => walkCycle(style),
      attack: () => zombieMaul(),
      death: () => zombieDeath(),
    },
  };
  return { rig, style };
}

/** A shuffling stance for the maul: the left foot forward, the heavy side back. */
const BRACE = pose({
  hips: [0, 0.2, 0],
  thighL: [-0.3, 0, 0.06],
  shinL: [0.32, 0, 0],
  footL: [0.0, 0, 0],
  thighR: [0.2, 0, -0.08],
  shinR: [0.3, 0, 0],
  footR: [-0.4, 0, 0],
});

/**
 * The maul: the heavy arm hauled up and back over the head and held (the wind-up, about a third
 * of a second), then brought down across the body in a falling blow, and recovered.
 */
function zombieMaul() {
  const L = { upperArmL: [-0.5, 0.2, 0.3], foreArmL: [-1.1, 0, 0], handL: [0.3, 0, 0.2] };
  return [
    P({ ...L, upperArmR: [-0.9, 0, -0.25], foreArmR: [-0.5, 0, 0], hunch: [-0.05, 0, 0] }, {}, { jaw: 0.3, eyes: 1 }),
    P({ ...L, upperArmR: [-2.3, 0.15, -0.45], foreArmR: [-0.9, 0, 0], handR: [0.4, 0, 0], hunch: [-0.22, -0.15, 0], chest: [-0.12, -0.2, 0], neck: [-0.2, 0, 0.2] }, { z: -0.01 }, { jaw: 0.6, eyes: 1 }),
    P({ ...L, upperArmR: [-2.75, 0.1, -0.35], foreArmR: [-0.75, 0, 0], handR: [0.45, 0, 0], hunch: [-0.3, -0.2, 0], chest: [-0.16, -0.25, 0], neck: [-0.25, 0, 0.25] }, { z: -0.02 }, { jaw: 0.9, eyes: 1 }),
    P({ ...L, upperArmR: [-2.8, 0.1, -0.33], foreArmR: [-0.7, 0, 0], handR: [0.45, 0, 0], hunch: [-0.31, -0.2, 0], chest: [-0.17, -0.26, 0], neck: [-0.26, 0, 0.25] }, { z: -0.02 }, { jaw: 1, eyes: 1 }),
    P({ ...L, upperArmR: [-1.0, 0.4, 0.15], foreArmR: [-0.15, 0, 0], handR: [-0.2, 0, 0], hunch: [0.35, 0.3, 0], chest: [0.15, 0.3, 0], neck: [0.15, 0, 0] }, { z: 0.06 }, { jaw: 0.6, eyes: 1 }),
    P({ ...L, upperArmR: [-0.35, 0.5, 0.3], foreArmR: [-0.2, 0, 0], handR: [-0.3, 0, 0], hunch: [0.42, 0.35, 0], chest: [0.18, 0.32, 0], neck: [0.1, 0, 0] }, { z: 0.07 }, { jaw: 0.35, eyes: 1 }),
    P({ ...L, upperArmR: [-0.4, 0.1, -0.05], foreArmR: [-0.35, 0, 0], hunch: [0.12, 0.1, 0] }, { z: 0.03 }, { jaw: 0.2, eyes: 1 }),
  ].map((p) => add(BRACE, p));
}

/**
 * Death: the head snaps back, the knees give, it folds down onto its heels with the chest over
 * the thighs, then tips onto its side and lies in a heap, the heavy arm flung out. The eyes go
 * out by the last frame. Unlike a player's fall it never pitches full length onto its face.
 */
function zombieDeath() {
  const limp = { upperArmL: [-0.4, 0, 0.3], foreArmL: [-0.9, 0, 0] };
  return [
    P({ ...limp, hunch: [-0.25, 0, 0], neck: [-0.45, 0, 0.1], head: [-0.2, 0, 0], upperArmR: [-0.5, 0, -0.5], foreArmR: [-0.3, 0, 0], thighR: [0.1, 0, 0], shinR: [0.15, 0, 0] }, { z: -0.02 }, { jaw: 1, eyes: 1 }),
    P({ ...limp, hunch: [0.1, 0, 0.05], neck: [0.1, 0, 0.2], upperArmR: [-0.2, 0, -0.3], foreArmR: [-0.2, 0, 0], thighL: [-0.7, 0, 0.1], thighR: [-0.6, 0, -0.1], shinL: [1.2, 0, 0], shinR: [1.1, 0, 0], footL: [-0.4, 0, 0], footR: [-0.4, 0, 0] }, { z: -0.04 }, { jaw: 0.8, eyes: 0.8 }),
    P({ ...limp, spine: [0.2, 0, 0], hunch: [0.45, 0, 0.1], neck: [0.3, 0, 0.3], upperArmR: [-0.1, 0, -0.2], foreArmR: [-0.1, 0, 0], thighL: [-1.5, 0, 0.12], thighR: [-1.4, 0, -0.12], shinL: [2.4, 0, 0], shinR: [2.3, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0] }, { z: -0.12 }, { jaw: 0.6, eyes: 0.6 }),
    // it tips onto its left side (the side its head lolls to), the withered arm out along the
    // ground ahead and the heavy one flopping over in front, so nothing props the heap up
    P({ ...limp, spine: [0.35, 0, 0], hunch: [0.55, 0, -0.1], neck: [0.4, 0, -0.2], upperArmR: [-0.6, 0, 0.1], foreArmR: [-0.2, 0, 0], thighL: [-1.6, 0, 0.12], thighR: [-1.5, 0, -0.12], shinL: [2.45, 0, 0], shinR: [2.35, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0] }, { rz: -0.4, x: -0.05, z: -0.14 }, { jaw: 0.5, eyes: 0.4 }),
    P({ upperArmL: [-1.2, 0, 0.2], foreArmL: [-0.4, 0, 0], spine: [0.3, 0, 0], hunch: [0.45, 0, -0.1], neck: [0.2, 0, -0.3], upperArmR: [-1.0, 0, 0.3], foreArmR: [-0.3, 0, 0], thighL: [-1.3, 0, 0.1], thighR: [-1.1, 0, -0.1], shinL: [2.0, 0, 0], shinR: [1.8, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0] }, { rz: -1.0, x: -0.14, z: -0.15 }, { jaw: 0.5, eyes: 0.2 }),
    P({ upperArmL: [-1.45, 0, 0.1], foreArmL: [-0.2, 0, 0], spine: [0.25, 0, 0], hunch: [0.4, 0, -0.1], neck: [0.1, 0, -0.35], upperArmR: [-1.25, 0, 0.4], foreArmR: [-0.25, 0, 0], thighL: [-1.1, 0, 0.1], thighR: [-0.9, 0, -0.1], shinL: [1.7, 0, 0], shinR: [1.5, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0] }, { rz: -1.42, x: -0.22, z: -0.15 }, { jaw: 0.6, eyes: 0.05 }),
    P({ upperArmL: [-1.5, 0, 0.1], foreArmL: [-0.15, 0, 0], spine: [0.25, 0, 0], hunch: [0.4, 0, -0.1], neck: [0.1, 0, -0.38], upperArmR: [-1.3, 0, 0.45], foreArmR: [-0.2, 0, 0], thighL: [-1.05, 0, 0.1], thighR: [-0.85, 0, -0.1], shinL: [1.65, 0, 0], shinR: [1.4, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0] }, { rz: -1.5, x: -0.24, z: -0.15 }, { jaw: 0.6, eyes: 0 }),
  ];
}

// --- the ghost -----------------------------------------------------------------------------

/** How opaque the ghost's body is in its baked sheet (FS-3QHQZ §C R29: alpha ≈ 0.6). */
const GHOST_ALPHA = 0.6;
/** Its ground shadow's opacity: faint, since little of it is there to cast one. */
const GHOST_SHADOW = 0.3;
/** How high it hovers over its footprint, in H, and how far it bobs. */
const HOVER = 0.05;
const BOB = 0.012;

/** A gaunt, bare head: a long face, deep sockets with the ember eyes, the jaw dropped to wail. */
function ghostHead(rig, skin, eye) {
  const M = materials();
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  attach(rig, "head", ellipsoid(r * 0.86 * H, r * 1.08 * H, r * 1.0 * H, 20), skin, [0, hy + 0.06, hz - 0.004]);
  attach(rig, "head", ellipsoid(r * 0.64 * H, r * 0.8 * H, r * 0.7 * H, 16), skin, [0, hy + 0.024, hz + 0.018]);
  for (const [, sx] of sides) {
    attach(rig, "head", ellipsoid(r * 0.3 * H, r * 0.34 * H, r * 0.2 * H, 10), M.black, [sx * r * 0.34, hy + 0.054, hz + r * 0.8]);
    attach(rig, "head", ellipsoid(r * 0.19 * H, r * 0.18 * H, r * 0.09 * H, 8), eye, [sx * r * 0.34, hy + 0.054, hz + r * 0.92], { noShadow: true });
  }
  const [, jy, jz] = J(rig, "jaw");
  attach(rig, "jaw", ellipsoid(r * 0.5 * H, r * 0.36 * H, r * 0.6 * H, 12), skin, [0, jy - 0.022, jz + 0.012]);
  attach(rig, "jaw", ellipsoid(r * 0.3 * H, r * 0.3 * H, r * 0.3 * H, 10), M.black, [0, jy - 0.01, jz + r * 0.48]);
}

/**
 * The opacity pass's materials (page/opacity.js): the body at `GHOST_ALPHA`, its skinned parts
 * fading below the knee by a per-vertex ramp, the eyes opaque. `fx.fade` thins the body and
 * `fx.eyes` the eyes over the death clip.
 */
function ghostOpacity(rig, eye) {
  const H = rig.H;
  const [, ky] = J(rig, "shinL");
  const ramp = (y) => smoothstep(ky - 0.1, ky + 0.04, y / H);
  const basic = (vertexColors) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(GHOST_ALPHA, GHOST_ALPHA, GHOST_ALPHA), vertexColors, toneMapped: false, side: THREE.DoubleSide });
  const body = basic(false);
  const faded = basic(true);
  const eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1), toneMapped: false });
  rig.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === eye) {
      o.userData.opacity = eyes;
      return;
    }
    if (o.isSkinnedMesh) {
      // bind-pose heights: a skinned part's geometry is authored in model space
      const pos = o.geometry.attributes.position;
      const c = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) c.fill(ramp(pos.getY(i)), i * 3, i * 3 + 3);
      o.geometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
      o.userData.opacity = faded;
    } else o.userData.opacity = body;
  });
  rig.hooks.push((r, p) => {
    const a = GHOST_ALPHA * (p.fx.fade ?? 1);
    body.color.setRGB(a, a, a);
    faded.color.setRGB(a, a, a);
    const e = p.fx.eyes ?? 1;
    eyes.color.setRGB(e, e, e);
    // the shadow thins with the body (the baker reads `floor` per frame)
    rig.opacity.floor = GHOST_SHADOW * (p.fx.fade ?? 1);
  });
  rig.opacity = { floor: GHOST_SHADOW };
}

export function ghost() {
  const F = forlornFabrics();
  const rig = createRig(1.98, {
    jaw: true,
    torsoW: 0.7,
    torsoD: 0.72,
    shoulderW: 0.88,
    hipW: 0.78,
    neck: 0.135,
    limbR: 0.62,
    armR: 0.6,
    upperArm: 0.2,
    foreArm: 0.19,
    headR: 0.056,
  });
  rig.hooks = [];
  rig.rest.chest = [0.12, 0, 0];
  rig.rest.neck = [0.1, 0, 0];
  rig.rest.head = [-0.08, 0, 0];
  rig.rest.jaw = [0.25, 0, 0];
  // the hair streams from the back of the head on a cloak chain
  cloakBones(rig, { length: 0.54, drag: 0.6, back: 0.05 });
  // hair, not a cloak: it streams behind the glide but never flings out flat on a lunge
  for (const sp of rig.springs) Object.assign(sp, { inertia: sp.inertia * 0.3, limit: 0.7 });
  skirtBones(rig, { stiffness: 30, drag: 0.4 });
  const [, hy] = J(rig, "hips");
  const [, ky] = J(rig, "shinL");
  const eye = fadingEyes(rig);

  torso(rig, F.gown, { waist: 0.72 });
  neck(rig, F.pale, { w: 0.75 });
  for (const [s] of sides) arm(rig, s, F.pale, { r: 0.85, fore: 0.9 });
  for (const [s] of sides) claw(rig, s, F.pale, { size: 0.95, reach: 1.5 });
  // the legs, which the opacity pass fades to nothing below the knee; they cast no shadow
  for (const m of legs(rig, F.pale, { r: 0.8 })) m.userData.noShadow = true;
  ghostHead(rig, F.pale, eye);
  hair(rig, F.wisp, { long: true });
  cloak(rig, F.wisp, { length: 0.54, spread: 0.9, flare: 0.35, back: 0.05, ragged: { teeth: 11, depth: 0.12, seed: 31 } });
  // the burial gown, its hem a wisp at the knee
  skirt(rig, F.gown, {
    top: hy + 0.03,
    bottom: ky - 0.06,
    rTop: [0.09, 0.075],
    rBottom: [0.15, 0.13],
    legFollow: 0.3,
    panels: true,
    panelWeight: 0.55,
    ragged: { teeth: 17, depth: 0.07, seed: 33 },
    segs: 34,
  });
  ghostOpacity(rig, eye);
  // it hovers, bobbing (`fx.bob`), and stretches thin as it dissolves (`fx.thin`)
  rig.hooks.push((r, p) => {
    const thin = p.fx.thin ?? 0;
    r.body.scale.set(1 - 0.55 * thin, 1 + 0.18 * thin, 1 - 0.55 * thin);
    // the pose was grounded at the last pose's scale: ground it again at this one
    groundPose(r);
    r.body.position.y += (HOVER + BOB * (p.fx.bob ?? 0)) * r.H;
    r.root.updateMatrixWorld(true);
  });

  const reach = {
    upperArmL: [-1.25, 0, 0.1],
    foreArmL: [-0.3, 0, 0],
    handL: [0.25, 0, 0],
    upperArmR: [-1.2, 0, -0.1],
    foreArmR: [-0.35, 0, 0],
    handR: [0.3, 0, 0],
  };
  const dangle = { thighL: [-0.12, 0, 0.03], thighR: [0.05, 0, -0.03], shinL: [0.35, 0, 0], shinR: [0.45, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0] };
  const style = {
    speed: 0.9,
    clips: {
      idle: (spec) => ghostIdle(spec.frames, reach, dangle),
      walk: () => ghostDrift(reach, dangle),
      attack: () => ghostRake(dangle),
      death: () => ghostDeath(dangle),
    },
  };
  return { rig, style };
}

/** Hovering in place: a slow bob, the reaching arms drifting, the head turning. */
function ghostIdle(n, reach, dangle) {
  return Array.from({ length: n }, (_, i) => {
    const ph = (i / n) * Math.PI * 2;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    return P(
      {
        ...dangle,
        upperArmL: [reach.upperArmL[0] + 0.1 * s, 0.05 * c, reach.upperArmL[2]],
        upperArmR: [reach.upperArmR[0] - 0.1 * s, -0.05 * c, reach.upperArmR[2]],
        foreArmL: [reach.foreArmL[0] - 0.08 * c, 0, 0],
        foreArmR: [reach.foreArmR[0] + 0.08 * c, 0, 0],
        handL: reach.handL,
        handR: reach.handR,
        spine: [0.03 * s, 0, 0.02 * c],
        neck: [0.04 * c, 0.15 * s, 0.05 * s],
        shinL: [dangle.shinL[0] + 0.08 * s, 0, 0],
        shinR: [dangle.shinR[0] - 0.08 * s, 0, 0],
      },
      {},
      { bob: s, jaw: 0.3 + 0.1 * c },
    );
  });
}

/**
 * The drift (its walk): leaning into its glide with the arms reaching further ahead, the legs
 * trailing and swaying from the hip, the whole of it bobbing twice a cycle.
 */
function ghostDrift(reach, dangle) {
  return Array.from({ length: 8 }, (_, i) => {
    const ph = (i / 8) * Math.PI * 2;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    return P(
      {
        ...dangle,
        spine: [0.12, 0.06 * s, 0],
        chest: [0.08, 0.06 * s, 0],
        neck: [-0.18, -0.08 * s, 0],
        upperArmL: [reach.upperArmL[0] - 0.2 + 0.12 * s, 0, reach.upperArmL[2]],
        upperArmR: [reach.upperArmR[0] - 0.2 - 0.12 * s, 0, reach.upperArmR[2]],
        foreArmL: [reach.foreArmL[0] + 0.1 * c, 0, 0],
        foreArmR: [reach.foreArmR[0] - 0.1 * c, 0, 0],
        handL: reach.handL,
        handR: reach.handR,
        thighL: [0.3 + 0.25 * s, 0, 0.04],
        thighR: [0.3 - 0.25 * s, 0, -0.04],
        shinL: [0.5 + 0.15 * c, 0, 0],
        shinR: [0.5 - 0.15 * c, 0, 0],
      },
      { rz: 0.03 * s },
      { bob: Math.sin(ph * 2), jaw: 0.35 },
    );
  });
}

/**
 * The rake: it rears back with both arms flung up and wide (the wind-up, about a quarter of a
 * second), its jaw dropping to a wail, then lunges and rakes both claws down through the target,
 * and draws back.
 */
function ghostRake(dangle) {
  const legs = { ...dangle, thighL: [0.25, 0, 0.04], thighR: [0.3, 0, -0.04], shinL: [0.6, 0, 0], shinR: [0.6, 0, 0] };
  return [
    P({ ...legs, upperArmL: [-1.5, 0, 0.3], upperArmR: [-1.5, 0, -0.3], foreArmL: [-0.4, 0, 0], foreArmR: [-0.4, 0, 0], chest: [-0.05, 0, 0] }, {}, { jaw: 0.5, bob: 0 }),
    P({ ...legs, upperArmL: [-2.5, 0, 0.6], upperArmR: [-2.5, 0, -0.6], foreArmL: [-0.5, 0, 0], foreArmR: [-0.5, 0, 0], handL: [0.4, 0, 0], handR: [0.4, 0, 0], spine: [-0.15, 0, 0], chest: [-0.2, 0, 0], neck: [-0.3, 0, 0] }, { z: -0.04 }, { jaw: 0.9, bob: 0.6 }),
    P({ ...legs, upperArmL: [-2.7, 0, 0.7], upperArmR: [-2.7, 0, -0.7], foreArmL: [-0.45, 0, 0], foreArmR: [-0.45, 0, 0], handL: [0.5, 0, 0], handR: [0.5, 0, 0], spine: [-0.2, 0, 0], chest: [-0.24, 0, 0], neck: [-0.35, 0, 0] }, { z: -0.05 }, { jaw: 1, bob: 1 }),
    P({ ...legs, upperArmL: [-1.3, 0, 0.15], upperArmR: [-1.3, 0, -0.15], foreArmL: [-0.1, 0, 0], foreArmR: [-0.1, 0, 0], handL: [-0.2, 0, 0], handR: [-0.2, 0, 0], spine: [0.25, 0, 0], chest: [0.25, 0, 0], neck: [-0.1, 0, 0] }, { z: 0.09 }, { jaw: 1, bob: 0 }),
    P({ ...legs, upperArmL: [-0.5, 0, 0.05], upperArmR: [-0.5, 0, -0.05], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0], handL: [-0.4, 0, 0], handR: [-0.4, 0, 0], spine: [0.35, 0, 0], chest: [0.3, 0, 0], neck: [0, 0, 0] }, { z: 0.1 }, { jaw: 0.7, bob: -0.6 }),
    P({ ...legs, upperArmL: [-0.8, 0, 0.1], upperArmR: [-0.8, 0, -0.1], foreArmL: [-0.3, 0, 0], foreArmR: [-0.3, 0, 0], spine: [0.2, 0, 0], chest: [0.15, 0, 0] }, { z: 0.05 }, { jaw: 0.5, bob: -0.3 }),
    P({ ...legs, upperArmL: [-1.2, 0, 0.1], upperArmR: [-1.15, 0, -0.1], foreArmL: [-0.3, 0, 0], foreArmR: [-0.35, 0, 0], spine: [0.05, 0, 0] }, { z: 0.01 }, { jaw: 0.35, bob: 0 }),
  ];
}

/**
 * Death: it convulses, rises with its arms thrown up, stretches thin and dissolves, the eyes last
 * to go. Nothing is left on the last frame: the ghost leaves no corpse.
 */
function ghostDeath(dangle) {
  const up = (k) => ({
    upperArmL: [-1.2 - 1.6 * k, 0, 0.2 + 0.2 * k],
    upperArmR: [-1.2 - 1.6 * k, 0, -0.2 - 0.2 * k],
    foreArmL: [-0.3 + 0.2 * k, 0, 0],
    foreArmR: [-0.3 + 0.2 * k, 0, 0],
  });
  const head = (k) => ({ spine: [-0.15 * k, 0, 0], chest: [-0.2 * k, 0, 0], neck: [-0.45 * k, 0, 0] });
  return [
    P({ ...dangle, ...up(0.2), ...head(0.6), thighL: [0.2, 0, 0.05], thighR: [0.25, 0, -0.05] }, { z: -0.03 }, { jaw: 1, fade: 1, eyes: 1, thin: 0, bob: 0 }),
    P({ ...dangle, ...up(0.5), ...head(1), thighL: [0.1, 0, 0.05], thighR: [0.15, 0, -0.05] }, { z: -0.04 }, { jaw: 1, fade: 0.9, eyes: 1, thin: 0.1, bob: 1.5 }),
    P({ ...dangle, ...up(0.8), ...head(1) }, { z: -0.04 }, { jaw: 1, fade: 0.72, eyes: 0.95, thin: 0.3, bob: 3 }),
    P({ ...dangle, ...up(1), ...head(0.9) }, { z: -0.04 }, { jaw: 0.9, fade: 0.5, eyes: 0.8, thin: 0.55, bob: 4.5 }),
    P({ ...dangle, ...up(1), ...head(0.8) }, { z: -0.04 }, { jaw: 0.8, fade: 0.28, eyes: 0.55, thin: 0.78, bob: 5.5 }),
    P({ ...dangle, ...up(1), ...head(0.7) }, { z: -0.04 }, { jaw: 0.7, fade: 0.1, eyes: 0.25, thin: 0.92, bob: 6.2 }),
    P({ ...dangle, ...up(1), ...head(0.7) }, { z: -0.04 }, { jaw: 0.7, fade: 0, eyes: 0, thin: 1, bob: 6.5 }),
  ];
}
