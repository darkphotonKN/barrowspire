// The cast (FS-2325V §E.3): the three playable classes and the run's creatures, each dressed on
// the shared rig and given a movement style for the clips. Rivals reuse the class models.
//
// Heights are in world units (one unit = one tile edge). A delver stands about 2 units: under the
// 2.4-unit door lintel, roughly 80 px tall on screen, one tile wide at the shoulders.
//
// Every cast member returns { rig, style }. `style` feeds clips.js: `attack` names the attack,
// `hold` is how the arms carry the weapon (added to idle and walk), `walk` scales the gait.

import * as THREE from "three";
import { materials } from "../materials.js";
import { attach, createRig, ellipsoid, jointAt as J, mount } from "./rig.js";
import { fabrics } from "./fabrics.js";
import { pose, solveArm } from "./clips.js";
import {
  arms,
  bareFeet,
  beard,
  belt,
  boneLimbs,
  boots,
  cloak,
  cloakBones,
  hands,
  head,
  hood,
  legs,
  neck,
  overTorso,
  skirt,
  skirtBones,
  torso,
} from "./anatomy.js";
import {
  cleaver,
  greatHelm,
  gripAt,
  inHand,
  kiteShield,
  limbGuard,
  longbow,
  longsword,
  pauldrons,
  poleyns,
  quiver,
  spikedClub,
  staff,
  wizardHat,
} from "./gear.js";

const FRONT = [Math.PI / 2 - 0.95, Math.PI / 2 + 0.95];
const BACK = [-Math.PI / 2 - 0.95, -Math.PI / 2 + 0.95];

export function knight() {
  const M = materials();
  const F = fabrics();
  const rig = createRig(2.0, { shoulderW: 1.1, torsoW: 1.06 });
  rig.hooks = [];
  cloakBones(rig, { length: 0.5 });
  skirtBones(rig);
  const [, hy] = J(rig, "hips");
  const [, ky] = J(rig, "shinL");
  const [, ay] = J(rig, "footL");
  const [, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");

  torso(rig, F.mail);
  neck(rig, F.mail);
  arms(rig, F.mail);
  legs(rig, F.mailDark);
  hands(rig, F.blackIron);
  boots(rig, F.leatherDark, { top: 0.06 });
  greatHelm(rig, F, M, F.tabard);
  pauldrons(rig, F);
  for (const s of ["L", "R"]) {
    limbGuard(rig, `foreArm${s}`, wy + 0.02, fy - 0.03, [0.037, 0.035], F.steel);
    limbGuard(rig, `shin${s}`, ay + 0.02, ky - 0.035, [0.045, 0.05], F.darkSteel, { z: 0.004, taper: 1.05 });
  }
  poleyns(rig, F);
  skirt(rig, F.mail, { top: hy + 0.02, bottom: hy - 0.17, rTop: [0.1, 0.078], rBottom: [0.114, 0.096], legFollow: 0.75 });
  overTorso(rig, F.tabard, { from: hy - 0.01, arc: FRONT, pad: 0.012 });
  overTorso(rig, F.tabard, { from: hy - 0.01, arc: BACK, pad: 0.012 });
  for (const arc of [FRONT, BACK])
    skirt(rig, F.tabard, { top: hy - 0.005, bottom: hy - 0.27, rTop: [0.11, 0.09], rBottom: [0.122, 0.108], arc, panels: true, legFollow: 0.35, segs: 12 });
  belt(rig, F.leatherDark, M.brass, { r: [0.112, 0.092], dy: 0.0 });
  cloak(rig, F.cloakKnight, { length: 0.5, spread: 1.35 });
  inHand(rig, "R").add(longsword(rig, M, F));
  kiteShield(rig, "L", F);

  const style = {
    attack: "slash",
    speed: 1,
    hold: pose({
      upperArmL: [-0.38, -0.85, 0.12],
      foreArmL: [-1.25, 0, 0],
      upperArmR: [-0.12, 0, -0.04],
      foreArmR: [-0.62, 0, 0],
      handR: [-0.55, 0, 0],
    }),
    walk: { arms: [0.2, 0.55], lean: 0.05 },
  };
  return { rig, style };
}

export function archer() {
  const M = materials();
  const F = fabrics();
  const rig = createRig(1.96, { shoulderW: 1.0, torsoW: 0.98 });
  rig.hooks = [];
  cloakBones(rig, { length: 0.56, drag: 0.36 });
  skirtBones(rig, { stiffness: 55 });
  const [, hy] = J(rig, "hips");
  const [, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");

  torso(rig, F.leatherLight);
  neck(rig, F.skin);
  arms(rig, F.rangerDark);
  legs(rig, F.breeches);
  hands(rig, F.leather);
  boots(rig, F.leather, { top: 0.21 });
  head(rig, F.skin);
  hood(rig, F.ranger);
  for (const s of ["L", "R"]) limbGuard(rig, `foreArm${s}`, wy + 0.02, fy - 0.025, [0.034, 0.031], F.leatherDark);
  skirt(rig, F.leatherLight, { top: hy + 0.02, bottom: hy - 0.14, rTop: [0.1, 0.077], rBottom: [0.112, 0.094], legFollow: 0.7, panels: true, panelWeight: 0.3 });
  belt(rig, F.leatherDark, M.brass, { pouch: true });
  cloak(rig, F.ranger, { length: 0.56, spread: 1.4, ragged: { teeth: 13, depth: 0.03, seed: 4 } });
  quiver(rig, M, F);
  const bowMount = inHand(rig, "L");
  const bow = longbow(rig, M, F);
  bowMount.add(bow.group);

  // the string follows the right hand while drawing
  const handR = rig.bones.handR;
  const gripR = gripAt(rig, "R");
  const local = new THREE.Vector3(
    gripR[0] * rig.H - rig.bind.handR.x,
    gripR[1] * rig.H - rig.bind.handR.y,
    gripR[2] * rig.H - rig.bind.handR.z,
  );
  const tmp = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const drawLen = 0.36 * rig.H;
  const gripBow = new THREE.Vector3(0, -0.012 * rig.H, 0);
  const restNock = new THREE.Vector3(0, 0.075 * rig.H, 0);
  rig.hooks.push((r, p) => {
    r.root.updateMatrixWorld(true);
    const ik = p.fx.ik ?? 0;
    if (ik > 0) {
      // the draw hand travels back along the arrow line, from the string toward the jaw
      const G = gripBow.clone().applyMatrix4(bow.group.matrixWorld);
      const N = restNock.clone().applyMatrix4(bow.group.matrixWorld);
      const dir = G.clone().sub(N).normalize();
      const target = N.clone().addScaledVector(dir, -drawLen * ik);
      const pole = target.clone().addScaledVector(dir, -0.3 * r.H).add(new THREE.Vector3(0, 0.12 * r.H, 0));
      r.bones.handR.rotation.set(0, 0, 0);
      solveArm(r, "R", target, pole, local);
    }
    tmp.copy(local).applyMatrix4(handR.matrixWorld);
    inv.copy(bow.group.matrixWorld).invert();
    tmp.applyMatrix4(inv);
    bow.update((p.fx.draw ?? 0) > 0.5 ? tmp.clone() : null, (p.fx.arrow ?? 0) > 0.5);
  });

  const style = {
    attack: "shot",
    speed: 1.05,
    hold: pose({
      upperArmL: [0.02, 0, 0.04],
      foreArmL: [-0.3, 0, 0],
      handL: [-0.9, 0, 0],
      foreArmR: [-0.1, 0, 0],
    }),
    walk: { arms: [0.7, 1], lean: 0.06 },
  };
  return { rig, style };
}

export function wizard() {
  const M = materials();
  const F = fabrics();
  const rig = createRig(1.98, { shoulderW: 0.98, torsoW: 0.96 });
  rig.hooks = [];
  const addBeard = beard(rig, F.beard);
  skirtBones(rig, { stiffness: 38, drag: 0.28 });
  const [, hy] = J(rig, "hips");

  torso(rig, F.robe);
  neck(rig, F.skin);
  arms(rig, F.robe, { sleeve: (t) => 1 + 1.1 * THREE.MathUtils.smoothstep(t, 0.45, 1) });
  legs(rig, F.breeches);
  hands(rig, F.skin);
  boots(rig, F.leatherDark, { top: 0.08 });
  head(rig, F.skin);
  wizardHat(rig, F.robeDark, M.brass);
  addBeard();
  skirt(rig, F.robe, { top: hy + 0.03, bottom: 0.018, rTop: [0.1, 0.078], rBottom: [0.17, 0.15], legFollow: 0.5, panels: true, panelWeight: 0.35, segs: 32 });
  belt(rig, F.linen, M.brass, { r: [0.1, 0.08], dy: 0.03, pouch: true });
  const orbMat = M.arcane.clone();
  const base = orbMat.emissiveIntensity;
  inHand(rig, "R").add(staff(rig, M, F, orbMat));
  rig.hooks.push((r, p) => {
    orbMat.emissiveIntensity = base * (p.fx.glow ?? 1);
  });

  const style = {
    attack: "cast",
    speed: 0.9,
    hold: pose({
      upperArmR: [-0.28, 0, -0.08],
      foreArmR: [-1.15, 0, 0],
      handR: [-0.1, 0, 0],
      foreArmL: [-0.15, 0, 0],
    }),
    walk: { arms: [0.8, 0.4], lean: 0.05, stride: 0.95 },
    idleExtra: () => pose({}, {}, { glow: 1 }),
  };
  return { rig, style };
}

/** A skull on the head bone, its jaw on the jaw bone, ember light in the sockets. */
function skull(rig, boneMat, M) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  attach(rig, "head", ellipsoid(r * 0.9 * H, r * 0.95 * H, r * 1.08 * H, 18), boneMat, [0, hy + 0.06, hz - 0.004]);
  attach(rig, "head", ellipsoid(r * 0.78 * H, r * 0.45 * H, r * 0.7 * H, 14), boneMat, [0, hy + 0.028, hz + 0.022]);
  for (const sx of [-1, 1]) {
    attach(rig, "head", ellipsoid(r * 0.3 * H, r * 0.26 * H, r * 0.2 * H, 10), materials().black, [sx * r * 0.36, hy + 0.052, hz + r * 0.86]);
    attach(rig, "head", ellipsoid(r * 0.24 * H, r * 0.2 * H, r * 0.1 * H, 8), M.ember, [sx * r * 0.36, hy + 0.052, hz + r * 0.97], { noShadow: true });
  }
  const [, jy, jz] = J(rig, "jaw");
  attach(rig, "jaw", ellipsoid(r * 0.62 * H, r * 0.26 * H, r * 0.62 * H, 12), boneMat, [0, jy - 0.012, jz + 0.012]);
  attach(rig, "jaw", ellipsoid(r * 0.45 * H, r * 0.2 * H, r * 0.4 * H, 10), materials().black, [0, jy - 0.002, jz + 0.02]);
}

export function ghoul() {
  const M = materials();
  const F = fabrics();
  const rig = createRig(1.9, {
    hunch: 1,
    jaw: true,
    torsoW: 0.78,
    torsoD: 0.82,
    shoulderW: 0.94,
    hipW: 0.86,
    headR: 0.058,
    limbR: 0.6,
  });
  rig.hooks = [];
  rig.rest.hunch = [0.42, 0, 0];
  rig.rest.neck = [-0.34, 0, 0];
  rig.rest.head = [-0.12, 0, 0];
  rig.rest.jaw = [0.05, 0, 0];
  cloakBones(rig, { length: 0.34, drag: 0.4, back: 0.065 });
  skirtBones(rig, { stiffness: 50 });
  const [, hy] = J(rig, "hips");

  torso(rig, F.bone, { ribs: true, waist: 0.42 });
  neck(rig, F.bone, { w: 0.62 });
  boneLimbs(rig, F.bone);
  hands(rig, F.bone, { size: 0.82, claws: F.bone });
  bareFeet(rig, F.bone, { size: 0.8 });
  skull(rig, F.bone, M);
  skirt(rig, F.rag, { top: hy + 0.012, bottom: hy - 0.2, rTop: [0.074, 0.058], rBottom: [0.098, 0.084], legFollow: 0.5, panels: true, ragged: { teeth: 11, depth: 0.07, seed: 3 } });
  cloak(rig, F.rag, { length: 0.34, spread: 0.85, flare: 0.2, back: 0.065, ragged: { teeth: 7, depth: 0.14, seed: 5 } });
  inHand(rig, "R", { rx: 0.2 }).add(cleaver(rig, M, F));

  const style = {
    attack: "chop",
    speed: 0.8,
    hold: pose({
      upperArmL: [-0.62, 0, 0.1],
      foreArmL: [-0.5, 0, 0],
      handL: [0.3, 0, 0],
      upperArmR: [-0.4, 0, -0.1],
      foreArmR: [-0.55, 0, 0],
      handR: [0.25, 0, 0],
      neck: [-0.05, 0, 0],
    }),
    walk: { stride: 0.72, knee: 1.1, arms: [0.35, 0.35], lean: 0.06, twist: 1.5 },
    // a shambling limp: the right step drags
    walkExtra: (i) => pose({ neck: [0.06 * Math.sin((i / 8) * Math.PI * 4), 0, 0.08 * Math.sin((i / 8) * Math.PI * 2)], shinR: [i >= 4 ? 0.12 : 0, 0, 0] }),
    idle: { lean: 0.02 },
    idleExtra: (i, ph) => pose({ neck: [0, 0.18 * Math.sin(ph), 0.1 * Math.sin(ph * 2)] }, {}, { jaw: 0.1 + 0.08 * Math.sin(ph * 2) }),
  };
  return { rig, style };
}

/** A troll's head: a low skull, heavy brow, long ears, tusked jaw and small ember eyes. */
function trollHead(rig, mat, F, M) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  attach(rig, "head", ellipsoid(r * 1.05 * H, r * 0.9 * H, r * 1.1 * H, 18), mat, [0, hy + 0.045, hz - 0.006]);
  attach(rig, "head", ellipsoid(r * 1.02 * H, r * 0.32 * H, r * 0.45 * H, 14), mat, [0, hy + 0.058, hz + r * 0.72]);
  attach(rig, "head", ellipsoid(r * 0.32 * H, r * 0.32 * H, r * 0.4 * H, 10), mat, [0, hy + 0.035, hz + r * 1.02]);
  for (const sx of [-1, 1]) {
    const ear = new THREE.ConeGeometry(r * 0.28 * H, r * 1.3 * H, 6);
    attach(rig, "head", ear, mat, [sx * r * 1.05, hy + 0.055, hz - 0.004], { rz: -sx * 1.25, rx: -0.3 });
    attach(rig, "head", ellipsoid(r * 0.2 * H, r * 0.13 * H, r * 0.07 * H, 8), M.ember, [sx * r * 0.42, hy + 0.047, hz + r * 0.95], { noShadow: true });
  }
  const [, jy, jz] = J(rig, "jaw");
  attach(rig, "jaw", ellipsoid(r * 0.95 * H, r * 0.42 * H, r * 0.95 * H, 14), mat, [0, jy - 0.012, jz + 0.01]);
  for (const sx of [-1, 1])
    attach(rig, "jaw", new THREE.ConeGeometry(r * 0.13 * H, r * 0.55 * H, 6), F.bone, [sx * r * 0.5, jy + 0.004, jz + r * 0.78], { rx: -0.25 });
}

export function troll() {
  const M = materials();
  const F = fabrics();
  const rig = createRig(2.7, {
    hunch: 1,
    jaw: true,
    hipY: 0.46,
    thigh: 0.2,
    shin: 0.205,
    spine: 0.1,
    neck: 0.1,
    torsoW: 1.45,
    torsoD: 1.3,
    shoulderW: 1.55,
    hipW: 1.25,
    limbR: 1.5,
    armR: 1.7,
    upperArm: 0.2,
    foreArm: 0.195,
    headR: 0.05,
  });
  rig.hooks = [];
  rig.rest.hunch = [0.5, 0, 0];
  rig.rest.neck = [-0.42, 0, 0];
  rig.rest.head = [-0.05, 0, 0];
  rig.rest.upperArmL = [0, 0, 0.3];
  rig.rest.upperArmR = [0, 0, -0.3];
  skirtBones(rig, { stiffness: 50 });
  const [, hy] = J(rig, "hips");

  torso(rig, F.troll, { hump: 0.022, neckW: 1.35 });
  neck(rig, F.troll, { w: 1.55 });
  arms(rig, F.troll, { bulk: 1.15 });
  legs(rig, F.troll);
  hands(rig, F.troll, { size: 1.45, claws: F.bone });
  bareFeet(rig, F.troll, { size: 1.35, claws: F.bone });
  trollHead(rig, F.troll, F, M);
  skirt(rig, F.fur, { top: hy + 0.02, bottom: hy - 0.19, rTop: [0.128, 0.104], rBottom: [0.15, 0.13], legFollow: 0.55, panels: true, ragged: { teeth: 12, depth: 0.06, seed: 8 } });
  belt(rig, F.leatherDark, F.bone, { r: [0.13, 0.108], dy: 0.03 });
  // a necklace of bones
  const [, ny] = J(rig, "neck");
  const necklace = mount(rig, "chest", [0, ny - 0.03, 0.02]);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + (0.7 * i) / 8);
    const tooth = new THREE.ConeGeometry(0.008 * rig.H, 0.028 * rig.H, 5);
    const m = new THREE.Mesh(tooth, F.bone);
    m.position.set(Math.cos(a) * 0.075 * rig.H, -Math.sin(a) * 0.02 * rig.H, Math.sin(a) * 0.07 * rig.H);
    m.rotation.x = Math.PI;
    necklace.add(m);
  }
  inHand(rig, "R", { rx: 0.1 }).add(spikedClub(rig, M, F));

  const style = {
    attack: "smash",
    speed: 0.75,
    hold: pose({
      upperArmL: [-0.18, 0, 0.0],
      foreArmL: [-0.35, 0, 0],
      upperArmR: [-0.22, 0, 0.0],
      foreArmR: [-0.55, 0, 0],
      handR: [0.35, 0, 0],
    }),
    walk: { stride: 0.78, knee: 0.85, arms: [0.9, 0.7], lean: 0.08, twist: 1.3 },
    walkExtra: (i) => pose({}, { rz: 0.035 * Math.sin((i / 8) * Math.PI * 2) }),
    idle: { lean: 0.04 },
    idleExtra: (i, ph) => pose({ neck: [0, 0.1 * Math.sin(ph), 0] }, {}, { jaw: 0.08 + 0.05 * Math.sin(ph) }),
  };
  return { rig, style };
}

/**
 * The cast as manifest sheets. `_base` is the body layer: equipment layers can join it later as
 * `<sheet>_<slot>` sheets sharing its frame size and anchor (FS-2325V §E.6).
 */
export const CAST = [
  { sheet: "char_knight_base", group: "characters", fn: "knight", build: knight },
  { sheet: "char_archer_base", group: "characters", fn: "archer", build: archer },
  { sheet: "char_wizard_base", group: "characters", fn: "wizard", build: wizard },
  { sheet: "creature_ghoul_base", group: "creatures", fn: "ghoul", build: ghoul },
  { sheet: "creature_troll_base", group: "creatures", fn: "troll", build: troll },
];
