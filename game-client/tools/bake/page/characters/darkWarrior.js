// The dark warrior (FS-C8VM7 §H R46): a new family on the shared humanoid rig (ADR-0021), built in
// code, never sourced. Grim and reaper-like, bony but upright and deliberate: a tall, gaunt figure
// that stands straight and moves with purpose, never a hunched, shambling skeleton. A skull with
// ember eyes in the shadow of a deep, pointed cowl ringed by a spiked iron circlet; a blackened
// iron cuirass and pauldrons over a bare ribcage; bone arms and hands; a long tattered robe and
// cloak. It holds a two-handed greatsword point-down before it, both bony hands on the long grip.
//
// Its attack is the cleave (R38): the blade drawn back low to the right, the body wound round
// after it and held, then swept flat and wide across the front through 120 degrees and on round
// to the left, and brought back. Its death: it sinks to its knees and topples, the eyes going out.
//
// Its tier (R46), the Dark Reaper, is a baked recolour of this look (DARK_WARRIOR_STEPS): bone gone
// the dark grey of grave ash, the robe black with a blood cast, the iron the same.

import * as THREE from "three";
import { materials } from "../materials.js";
import { mix, shade } from "../palette.js";
import { attach, createRig, ellipsoid, gripAt, jointAt as J } from "./rig.js";
import { bareFeet, boneLimbs, cloak, cloakBones, cowl, hands, overTorso, skirt, skirtBones, torso } from "./anatomy.js";
import { add, deathClip, idleCycle, pose, solveArm, walkCycle } from "./clips.js";
import { fabrics, retonedFabrics } from "./fabrics.js";
import { inHand, spaulder } from "./gear.js";
import { fadingEyes } from "./forlorn.js";
import { toneOf } from "./variantTones.js";

const P = pose;
const sides = [
  ["L", 1],
  ["R", -1],
];

/**
 * The two steps' tones (R46), recipes over BARROW (variantTones.js `toneOf`): `bone` the skull,
 * ribs and limbs, `rag` the robe, cowl and cloak. The Reaper's both deeper than the Warrior's.
 */
export const DARK_WARRIOR_STEPS = {
  dark_warrior: {
    bone: { base: "vellumDark", steps: [["slateLight", 0.3]] },
    rag: { base: "charcoal", steps: [["slate", 0.5]] },
  },
  dark_reaper: {
    bone: { base: "slateLight", steps: [["charcoal", 0.3]] },
    rag: { base: "pitch", steps: [["oxblood", 0.22]] },
  },
};

/** A skull on the head bone, its jaw on the jaw bone, ember light (`eye`) deep in the sockets. */
function skull(rig, bone, eye) {
  const M = materials();
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  attach(rig, "head", ellipsoid(r * 0.86 * H, r * 0.94 * H, r * 1.04 * H, 18), bone, [0, hy + 0.058, hz - 0.004]);
  attach(rig, "head", ellipsoid(r * 0.72 * H, r * 0.46 * H, r * 0.66 * H, 14), bone, [0, hy + 0.026, hz + 0.024]);
  for (const [, sx] of sides) {
    attach(rig, "head", ellipsoid(r * 0.28 * H, r * 0.25 * H, r * 0.2 * H, 10), M.black, [sx * r * 0.34, hy + 0.05, hz + r * 0.84]);
    attach(rig, "head", ellipsoid(r * 0.2 * H, r * 0.15 * H, r * 0.1 * H, 8), eye, [sx * r * 0.34, hy + 0.05, hz + r * 0.95], { noShadow: true });
  }
  attach(rig, "head", ellipsoid(r * 0.12 * H, r * 0.16 * H, r * 0.1 * H, 8), M.black, [0, hy + 0.028, hz + r * 0.92]);
  const [, jy, jz] = J(rig, "jaw");
  attach(rig, "jaw", ellipsoid(r * 0.58 * H, r * 0.24 * H, r * 0.6 * H, 12), bone, [0, jy - 0.012, jz + 0.014]);
}

/** A spiked iron circlet round the cowl's brow: the mark of a lord, not a mindless dead thing. */
function circlet(rig, iron) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR * 1.42;
  const band = new THREE.TorusGeometry(r * H, 0.006 * H, 6, 28);
  attach(rig, "head", band, iron, [0, hy + 0.072, hz + 0.01], { rx: Math.PI / 2 - 0.12 });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + (i - 3) * 0.42;
    const spike = new THREE.ConeGeometry(0.008 * H, (i === 3 ? 0.05 : 0.034) * H, 5);
    attach(rig, "head", spike, iron, [Math.cos(a) * r, hy + 0.072 + 0.018 + Math.sin(a) * 0.0, hz + 0.01 + Math.sin(a) * r], { rx: -0.12 + Math.sin(a) * 0.15 });
  }
}

/**
 * A two-handed greatsword in the grip frame (gear.js): a long, blackened blade with a fuller, a
 * broad straight guard, a grip long enough for two hands and a heavy pommel.
 */
function greatsword(rig, M, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const L = 0.6 * H;
  const w = 0.036 * H;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w * 0.44, L * 0.86);
  s.lineTo(0, L);
  s.lineTo(-w * 0.44, L * 0.86);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.005 * H, bevelEnabled: true, bevelThickness: 0.002 * H, bevelSize: 0.002 * H, bevelSegments: 2 });
  blade.translate(0, 0, -0.0025 * H);
  blade.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  blade.translate(0, 0, 0.055 * H);
  g.add(new THREE.Mesh(blade, F.darkSteel));
  const fuller = new THREE.BoxGeometry(0.009 * H, 0.009 * H, L * 0.6);
  const fm = new THREE.Mesh(fuller, F.blackIron);
  fm.position.z = 0.055 * H + L * 0.34;
  g.add(fm);
  const guard = new THREE.BoxGeometry(0.018 * H, 0.17 * H, 0.016 * H);
  const gm = new THREE.Mesh(guard, F.blackIron);
  gm.position.z = 0.05 * H;
  g.add(gm);
  // the grip runs back from the guard past the fist, long enough for the second hand
  const grip = new THREE.CylinderGeometry(0.011 * H, 0.012 * H, 0.17 * H, 8);
  grip.rotateX(Math.PI / 2);
  const gr = new THREE.Mesh(grip, F.leatherDark);
  gr.position.z = -0.03 * H;
  g.add(gr);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02 * H, 10, 8), F.blackIron);
  pommel.position.z = -0.12 * H;
  g.add(pommel);
  return g;
}

/** Where the left hand takes the grip, behind the right fist (H, along the grip frame's -z). */
export const SECOND_HAND = 0.085;

/**
 * The dark warrior at one step (DARK_WARRIOR_STEPS): every step shares the rig, the clips and
 * the size.
 */
function darkWarriorOf(step = "dark_warrior") {
  const M = materials();
  const F = fabrics();
  const recipe = DARK_WARRIOR_STEPS[step];
  if (!recipe) throw new Error(`darkWarrior: no step "${step}"`);
  const D = retonedFabrics(Object.fromEntries(Object.entries(recipe).map(([k, r]) => [k, toneOf(mix, shade, r)])));
  const rig = createRig(2.62, {
    jaw: true,
    hipY: 0.53,
    torsoW: 0.84,
    torsoD: 0.8,
    shoulderW: 1.0,
    hipW: 0.82,
    neck: 0.13,
    limbR: 0.62,
    armR: 0.62,
    upperArm: 0.19,
    foreArm: 0.175,
    headR: 0.056,
  });
  rig.hooks = [];
  // upright: the head held level and a little high, the chest open
  rig.rest.neck = [0.04, 0, 0];
  rig.rest.head = [-0.06, 0, 0];
  rig.rest.jaw = [0.04, 0, 0];
  cloakBones(rig, { length: 0.66, drag: 0.36 });
  skirtBones(rig, { stiffness: 42, drag: 0.3 });
  const [, hy] = J(rig, "hips");
  const [, ky] = J(rig, "shinL");
  const eye = fadingEyes(rig);
  const robe = {
    top: hy + 0.02,
    bottom: ky - 0.09,
    rTop: [0.092, 0.074],
    rBottom: [0.15, 0.13],
    legFollow: 0.45,
    panels: true,
    panelWeight: 0.45,
    ragged: { teeth: 15, depth: 0.08, seed: 61 },
    segs: 40,
  };

  torso(rig, D.bone, { ribs: true, waist: 0.46 });
  boneLimbs(rig, D.bone);
  hands(rig, D.bone, { size: 0.95, claws: D.bone });
  bareFeet(rig, D.bone, { size: 0.82 });
  skull(rig, D.bone, eye);
  // the cuirass over the ribs, the robe from the hips, a long cloak behind
  overTorso(rig, F.blackIron, { from: hy + 0.08, pad: 0.016 });
  for (const [side] of sides) spaulder(rig, side, F.blackIron, { lames: 3, size: 1.12 });
  skirt(rig, D.rag, robe);
  cowl(rig, D.rag, { shade: 0, brow: 0.42, gap: 1.0, reach: 0.02, point: { dir: [0, 0.6, -0.8], length: 0.06, droop: 0.3, pinch: 0.7, girth: 3 } });
  circlet(rig, F.blackIron);
  cloak(rig, D.rag, { length: 0.66, spread: 1.3, flare: 0.9, ragged: { teeth: 13, depth: 0.12, seed: 63 } });
  const sword = greatsword(rig, M, F);
  inHand(rig, "R").add(sword);

  // the second hand on the grip: the left arm is solved each pose onto the grip behind the right
  // fist, its elbow bending down and out to the left of the chest
  const g = gripAt(rig, "L");
  const leftGrip = new THREE.Vector3(g[0] * rig.H - rig.bind.handL.x, g[1] * rig.H - rig.bind.handL.y, g[2] * rig.H - rig.bind.handL.z);
  const q = new THREE.Quaternion();
  rig.hooks.push((r, p) => {
    if (p.fx.oneHand) return;
    r.root.updateMatrixWorld(true);
    const target = new THREE.Vector3(0, 0, -SECOND_HAND * r.H).applyMatrix4(sword.matrixWorld);
    r.bones.chest.getWorldQuaternion(q);
    const pole = target.clone().add(new THREE.Vector3(0.3 * r.H, -0.25 * r.H, -0.05 * r.H).applyQuaternion(q));
    solveArm(r, "L", target, pole, leftGrip);
  });

  // the carry: the greatsword held point-down before the body, both hands on the grip at the waist
  const hold = pose({
    upperArmR: [-0.38, -0.3, 0.05],
    foreArmR: [-0.95, 0, 0],
    handR: [1.45, 0, 0],
  });
  const style = {
    speed: 0.8,
    hold,
    // measured and upright: a long, even stride, no lean, the sword arm steady
    walk: { stride: 0.82, knee: 0.85, arms: [0.1, 0.12], lean: 0.0, twist: 0.8 },
    idle: { lean: 0.0 },
    idleExtra: (i, ph) => pose({ neck: [0, 0.06 * Math.sin(ph), 0] }, {}, { jaw: 0.04 }),
    deathExtra: (i) => pose({}, {}, { eyes: 1 - i / 6, oneHand: i >= 1 ? 1 : 0 }),
    clips: {
      idle: (spec) => idleCycle(style, spec.frames),
      walk: () => walkCycle(style),
      attack: () => cleave(),
      death: () => deathClip(style),
    },
  };
  return { rig, style };
}

/** A wide, braced stance: the feet apart, the left forward. */
const BRACE = pose({
  hips: [0, -0.1, 0],
  thighL: [-0.32, 0, 0.12],
  shinL: [0.3, 0, 0],
  thighR: [0.2, 0, -0.12],
  shinR: [0.26, 0, 0],
  footR: [-0.4, 0, 0],
});

/**
 * The cleave (R38): the greatsword drawn back low to the right, the hips and chest wound round
 * after it (keys 0-1) and held (key 2, the wind-up); then swept flat across the front at the
 * waist, the hips leading the chest, the arms straight out (key 3, the strike, the blade crossing
 * the facing), on round to the left (key 4), and back to the carry (keys 5-6).
 */
function cleave() {
  const arm = (rx, ry, rz, fore, hand) => ({ upperArmR: [rx, ry, rz], foreArmR: [fore, 0, 0], handR: [hand, 0, 0] });
  return [
    P({ ...arm(-0.42, -0.3, 0.1, -1.0, 1.2), hips: [0, -0.15, 0], spine: [0, -0.1, 0], chest: [0, -0.25, 0] }, {}, { jaw: 0.1, eyes: 1 }),
    P({ ...arm(-0.55, -0.42, 0.22, -1.05, 1.25), hips: [0, -0.4, 0], spine: [0, -0.32, 0], chest: [-0.05, -0.55, 0], neck: [0, 0.5, 0] }, { z: -0.015 }, { jaw: 0.3, eyes: 1 }),
    P({ ...arm(-0.6, -0.48, 0.24, -1.0, 1.3), hips: [0, -0.45, 0], spine: [0, -0.36, 0], chest: [-0.06, -0.6, 0], neck: [0, 0.6, 0] }, { z: -0.02 }, { jaw: 0.4, eyes: 1 }),
    P({ ...arm(-1.35, 0.1, 0.0, -0.15, 1.5), hips: [0, 0.3, 0], spine: [0.04, 0.2, 0], chest: [0.06, 0.3, 0], neck: [0, -0.3, 0] }, { z: 0.04 }, { jaw: 0.6, eyes: 1 }),
    P({ ...arm(-1.2, 0.9, 0.5, -0.2, 1.4), hips: [0, 0.5, 0], spine: [0.05, 0.3, 0], chest: [0.08, 0.45, 0], neck: [0, -0.5, 0] }, { z: 0.035 }, { jaw: 0.4, eyes: 1 }),
    P({ ...arm(-0.7, 0.4, 0.2, -0.6, 1.0), hips: [0, 0.2, 0], spine: [0.02, 0.1, 0], chest: [0.02, 0.15, 0], neck: [0, -0.15, 0] }, { z: 0.015 }, { jaw: 0.2, eyes: 1 }),
    P({ ...arm(-0.4, -0.28, 0.05, -0.92, 1.3) }, { z: 0.004 }, { jaw: 0.1, eyes: 1 }),
  ].map((p) => add(BRACE, p));
}

/** The two dark warrior variants (R3). */
export const darkWarrior = () => darkWarriorOf("dark_warrior");
export const darkReaper = () => darkWarriorOf("dark_reaper");
