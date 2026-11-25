// The dungeon encounters' cast (FS-4EC7Z §H R36, ADR-0021): the humans met on a Spire floor, built
// on the shared rig as the town's folk are (folk.js), with the town's faces (FS-67QQY) and its
// builds, and the playable classes' motion (clips.js): their carries, cuts, casts and death.
//
//  - pilgrim: a hooded habit to the ground under a rope girdle, a satchel on a strap across him, a
//    pilgrim's staff with a gourd hung under its knob. He fights with the staff (the Spellwarden's
//    heavy push) and cowers (`cower`) while the wave comes. Three variants (`pilgrim_a`..`_c`).
//  - captive: a ragged shirt over torn breeches, barefoot and bareheaded. Caged, he stands with his
//    wrists roped before him (`bound`); freed, he fights with a cudgel. Two variants.
//  - cutthroat: a hood with its point down his back, a leather jerkin skirted to mid-thigh, bracers
//    and tall boots, a long knife. Two variants, the second masked by a scarf.
//  - hooded duelist (a contract mark): a long slate-black coat to the knee under a deep cowl that
//    hides the face to the mouth, an oxblood sash, a curved blade in each hand.
//  - debtor knight (a contract mark): dented plate over rusted mail, a ruined house's tabard per
//    pale, the soot half torn short, a longsword, a broken manacle still on his wrist; bareheaded,
//    grizzled and bearded.
//
// A variant re-dresses the same rig (fabrics.js ENCOUNTER_TONES): its clips follow the first
// variant's as `<anim>_<letter>` (`idle_b`), as a hub resident's palette does (poses.js). One group,
// `encounter`, fetched on demand (src/render/art/sceneArt.ts `ENCOUNTER_ART`).

import * as THREE from "three";
import { materials } from "../materials.js";
import { attach, createRig, jointAt as J, mount } from "./rig.js";
import { encounterFabrics, encounterVariant, fabrics } from "./fabrics.js";
import { ANIMATIONS, FOLK_ANIMATIONS, add, idleCycle, pose } from "./clips.js";
import { KNIGHT_STYLE, MERCENARY_STYLE, REST_ARM, REST_BLADE, REST_ELBOW, SPELLWARDEN_STYLE, WARD_DEATH, WARD_HOLD } from "./classStyles.js";
import {
  arms,
  bareFeet,
  belt,
  boots,
  cowl,
  face,
  hair,
  hands,
  head,
  legs,
  neck,
  overTorso,
  sash,
  shortBeard,
  skirt,
  skirtBones,
  standingCollar,
  torso,
} from "./anatomy.js";
import { GRIP_BASIS, curvedSword, extrude, inHand, kneeCop, limbGuard, longsword, placed, rod, spaulder } from "./gear.js";
import { cut } from "./look.js";

// --- clips ---------------------------------------------------------------------------------------

/**
 * The cast's clips (FS-4EC7Z §H R36): the folk's short breathing idle, which keeps the group's
 * pages small, and the classes' walk, attack and death, the attack at the classes' 7 keys and
 * 12 fps with the strike on key 3, so an ally's or a mark's blow lands where a player's does.
 */
export const ENCOUNTER_ANIMATIONS = {
  idle: FOLK_ANIMATIONS.idle,
  walk: ANIMATIONS.walk,
  attack: ANIMATIONS.attack,
  death: ANIMATIONS.death,
};

/** The pilgrim's: the cast's and `cower`, a crouch under a raised arm that trembles, looping. */
export const PILGRIM_ANIMATIONS = { ...ENCOUNTER_ANIMATIONS, cower: { frames: 4, fps: 6, loop: true } };

/** The captive's: the cast's and `bound`, standing caged with his wrists roped before him, looping. */
export const CAPTIVE_ANIMATIONS = { ...ENCOUNTER_ANIMATIONS, bound: { frames: 4, fps: 3, loop: true } };

// --- variants ------------------------------------------------------------------------------------

/**
 * The variants of a figure built in variant `letters[0]`'s slot materials (`base`): each re-dresses
 * the meshes that wear a slot's material in its own (fabrics.js `encounterVariant`), and shows only
 * the pieces `only` keeps for it (a beard, a scarf, a hair cut). The first restores the figure as
 * built, since the bake dresses every pose before posing it (poses.js).
 */
function variantsOf(rig, kind, letters, base, only = {}) {
  const slots = Object.keys(base);
  const worn = Object.fromEntries(slots.map((s) => [s, []]));
  rig.root.traverse((o) => {
    if (!o.isMesh) return;
    for (const s of slots) if (o.material === base[s]) worn[s].push(o);
  });
  return letters.map((letter) => ({
    name: letter,
    dress: () => {
      const set = encounterVariant(kind, letter);
      for (const s of slots) for (const m of worn[s]) m.material = set[s];
      for (const { meshes, letters: shown } of Object.values(only)) for (const m of [meshes].flat()) m.visible = shown.includes(letter);
    },
  }));
}

// --- gear ----------------------------------------------------------------------------------------

/** A curve through model-space points (H) as a tube of radius `r` (H), rigid on `bone`. */
function strap(rig, bone, points, r, mat) {
  const H = rig.H;
  const g = mount(rig, bone, [0, 0, 0]);
  const pts = points.map(([x, y, z]) => new THREE.Vector3(x * H, y * H, z * H));
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r * H, 6, false), mat);
  // `mount` places a group at the bone's origin in the bind pose: points are model space
  g.add(m);
  return m;
}

/**
 * The pilgrim's staff, in the grip frame (gear.js): an ash staff a little taller than he is, the
 * fist a little under its middle as the Spellwarden holds hers (classStyles.js WARD_HOLD), shod in
 * iron at its foot, a turned knob at its head, and under the knob a dried gourd on a cord.
 */
export const PILGRIM_STAFF = { butt: -0.5, top: 0.34 };
function pilgrimStaff(rig, M, E) {
  const H = rig.H;
  const S = PILGRIM_STAFF;
  const g = new THREE.Group();
  g.add(placed(rod(0.0105 * H, 0.0095 * H, (S.top - S.butt) * H, 8), M.wood, 0, 0, ((S.top + S.butt) / 2) * H));
  g.add(placed(rod(0.011 * H, 0.0115 * H, 0.05 * H, 8), M.iron, 0, 0, (S.butt + 0.025) * H));
  g.add(placed(new THREE.SphereGeometry(0.018 * H, 12, 8), M.wood, 0, 0, (S.top + 0.008) * H));
  g.add(placed(rod(0.0125 * H, 0.0125 * H, 0.012 * H), E.rope, 0, 0, (S.top - 0.04) * H));
  // the gourd hangs off the staff's far side (grip +x), on a short cord
  const cordTop = new THREE.Vector3(0.012 * H, 0, (S.top - 0.045) * H);
  const cordFoot = new THREE.Vector3(0.03 * H, 0, (S.top - 0.1) * H);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(cordTop, cordFoot), 2, 0.0025 * H, 4, false), E.rope));
  g.add(placed(new THREE.SphereGeometry(0.02 * H, 10, 8), E.satchel, 0.034 * H, 0, (S.top - 0.13) * H));
  g.add(placed(new THREE.SphereGeometry(0.014 * H, 10, 8), E.satchel, 0.032 * H, 0, (S.top - 0.1) * H));
  return g;
}

/**
 * A satchel on the left hip, its strap over the right shoulder and across the chest: a soft
 * leather bag under a flap with a buckle.
 */
function satchel(rig, mat, M) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const [, ny] = J(rig, "neck");
  const [, cy] = J(rig, "chest");
  const hw = rig.p.hipW;
  const td = rig.p.torsoD;
  const x = 0.13 * hw;
  const y = hy - 0.02;
  attach(rig, "hips", new THREE.BoxGeometry(0.035 * H, 0.09 * H, 0.085 * H, 1, 2, 2), mat, [x, y, 0.012], { rz: 0.08 });
  attach(rig, "hips", new THREE.BoxGeometry(0.04 * H, 0.04 * H, 0.09 * H), mat, [x + 0.002, y + 0.03, 0.012], { rz: 0.08 });
  attach(rig, "hips", new THREE.BoxGeometry(0.008 * H, 0.016 * H, 0.016 * H), M.iron, [x + 0.022, y + 0.018, 0.012]);
  strap(
    rig,
    "chest",
    [
      [x - 0.02, hy + 0.035, 0.02],
      [0.05, cy - 0.02, 0.088 * td],
      [-0.06, cy + 0.06, 0.085 * td],
      [-0.1, ny - 0.008, 0.0],
      [-0.07, ny - 0.04, -0.075 * td],
      [0.04, cy - 0.04, -0.09 * td],
      [x - 0.01, hy + 0.04, -0.03],
    ],
    0.006,
    mat,
  );
}

/** A long knife in the grip frame: a clip-pointed blade, an iron cross, a cord-wound grip. */
function longKnife(rig, blade, F) {
  const H = rig.H;
  const g = new THREE.Group();
  const L = 0.2 * H;
  const w = 0.024 * H;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w * 0.42, L * 0.78);
  s.lineTo(0, L);
  s.lineTo(-w * 0.5, L * 0.7);
  s.closePath();
  const bg = extrude(s, 0.004 * H, 0.0016 * H);
  bg.applyMatrix4(GRIP_BASIS);
  bg.translate(0, 0, 0.034 * H);
  g.add(new THREE.Mesh(bg, blade));
  g.add(placed(new THREE.BoxGeometry(0.012 * H, 0.054 * H, 0.012 * H), F.blackIron, 0, 0, 0.03 * H));
  g.add(new THREE.Mesh(rod(0.0095 * H, 0.0085 * H, 0.07 * H), F.leatherDark));
  g.add(placed(new THREE.SphereGeometry(0.011 * H, 8, 6), F.blackIron, 0, 0, -0.04 * H));
  return g;
}

/** A sheathed knife on the belt at one hip, the hilt forward and up. */
function sheathedKnife(rig, side, F) {
  const H = rig.H;
  const [, hy] = J(rig, "hips");
  const sx = side === "L" ? 1 : -1;
  const g = mount(rig, "hips", [sx * 0.1 * rig.p.hipW, hy + 0.0, 0.055], { rx: -0.25, rz: sx * 0.35 });
  g.add(placed(new THREE.BoxGeometry(0.014 * H, 0.13 * H, 0.03 * H), F.leatherDark, 0, -0.065 * H, 0));
  g.add(placed(new THREE.CylinderGeometry(0.008 * H, 0.008 * H, 0.06 * H, 6), F.leatherDark, 0, 0.03 * H, 0));
  g.add(placed(new THREE.SphereGeometry(0.01 * H, 8, 6), F.blackIron, 0, 0.065 * H, 0));
  return g;
}

/** A cudgel in the grip frame: a length of oak, swelling to its head, bound in an iron band. */
function cudgel(rig, M) {
  const H = rig.H;
  const g = new THREE.Group();
  const L = 0.34 * H;
  const club = new THREE.CylinderGeometry(0.03 * H, 0.014 * H, L, 10);
  club.rotateX(Math.PI / 2);
  club.translate(0, 0, L * 0.42);
  g.add(new THREE.Mesh(club, M.woodDark));
  g.add(placed(rod(0.031 * H, 0.031 * H, 0.02 * H, 10), M.iron, 0, 0, L * 0.72));
  return g;
}

/**
 * Rope wound twice round each wrist and a tail of it hanging from the left, the captive's binding
 * (FS-4EC7Z §H R36: "bound wrists until freed"). Returns the meshes, which show in `bound` alone.
 */
function wristRopes(rig, mat) {
  const H = rig.H;
  const out = [];
  for (const s of ["L", "R"]) {
    const [x, wy] = J(rig, `hand${s}`);
    for (const dy of [0.012, 0.028]) out.push(attach(rig, `foreArm${s}`, new THREE.TorusGeometry(0.03 * H, 0.0075 * H, 5, 14), mat, [x, wy + dy, 0], { rx: Math.PI / 2 }));
  }
  const [x, wy] = J(rig, "handL");
  out.push(strap(rig, "foreArmL", [[x - 0.01, wy + 0.02, 0.028], [x - 0.03, wy - 0.03, 0.04], [x - 0.025, wy - 0.12, 0.03]], 0.006, mat));
  return out;
}

/** A broken iron manacle on the left wrist, three links of its chain hanging from it. */
function manacle(rig, F) {
  const H = rig.H;
  const [x, wy] = J(rig, "handL");
  attach(rig, "foreArmL", new THREE.TorusGeometry(0.036 * H, 0.009 * H, 6, 16), F.blackIron, [x, wy + 0.03, 0], { rx: Math.PI / 2 });
  for (let i = 0; i < 3; i++)
    attach(rig, "foreArmL", new THREE.TorusGeometry(0.011 * H, 0.0035 * H, 4, 10), F.blackIron, [x + 0.01, wy + 0.0 - i * 0.02, 0.04], { ry: i % 2 ? Math.PI / 2 : 0 });
}

/** A scarf over the mouth and nose, up under the hood (the cutthroat's second variant). */
function scarf(rig, mat) {
  const H = rig.H;
  const [, hy, hz] = J(rig, "head");
  const r = rig.p.headR;
  const g = new THREE.SphereGeometry(r * 1.09 * H, 18, 6, Math.PI / 2 - 1.25, 2.5, Math.PI * 0.5, Math.PI * 0.3);
  return attach(rig, "head", g, mat, [0, hy + 0.05, hz + 0.004], { sy: 1.05 });
}

// --- the cast ------------------------------------------------------------------------------------

/** A front-open garment's arc: open by `gap` radians each side of the front (π/2). */
const openFront = (gap) => [Math.PI / 2 + gap, Math.PI / 2 + Math.PI * 2 - gap];

/**
 * The pilgrim's heavy push with the staff and the fist's give as he falls are the Spellwarden's
 * (classStyles.js SPELLWARDEN_STYLE, clips.js `wardCast`), on a body that walks shorter and bowed.
 */
const PILGRIM_HOLD = WARD_HOLD;

/** The cower's keys: a crouch under the raised left arm, the staff clutched upright before him. */
function cowerClip(spec) {
  return Array.from({ length: spec.frames }, (_, i) => {
    const ph = (i / spec.frames) * Math.PI * 2;
    const t = Math.sin(ph * 2);
    return pose(
      {
        hips: [0, 0.12, 0],
        spine: [0.32 + 0.015 * t, 0, 0],
        chest: [0.22, 0.18, 0.02 * t],
        neck: [0.38, -0.25 + 0.03 * Math.sin(ph), 0],
        thighL: [-0.5, 0, 0.08],
        shinL: [0.95, 0, 0],
        footL: [-0.45, 0, 0],
        thighR: [-0.36, 0, -0.06],
        shinR: [0.85, 0, 0],
        footR: [-0.49, 0, 0],
        upperArmL: [-2.25 + 0.05 * t, -0.3, 0.42],
        foreArmL: [-1.5 - 0.04 * t, 0, 0],
        handL: [0.35, 0, 0],
        upperArmR: [-0.55, 0, -0.12],
        foreArmR: [-1.45 + 0.03 * t, 0, 0],
        handR: [-0.25, -0.45, 0],
      },
      { z: -0.02, x: 0.004 * t },
    );
  });
}

/**
 * The pilgrim (FS-4EC7Z §B, §H R36): a stooped traveller in a hooded habit to the ground, a rope
 * girdle, a satchel on its strap, the staff in his right hand. Variants: the habit, the hood and
 * the hair (ENCOUNTER_TONES.pilgrim); `a` grey-bearded, `b` clean-shaven, `c` black-bearded.
 */
export function pilgrim() {
  const M = materials();
  const F = fabrics();
  const E = encounterFabrics();
  const V = encounterVariant("pilgrim", "a");
  const rig = createRig(1.9, { shoulderW: 0.96, torsoW: 0.96, hipW: 1.0, limbR: 0.95, armR: 0.95 });
  rig.hooks = [];
  skirtBones(rig, { stiffness: 45, drag: 0.26 });
  const [, hy] = J(rig, "hips");
  const robe = { top: hy - 0.005, bottom: 0.016, rTop: [0.102, 0.078], rBottom: [0.15, 0.134], legFollow: 0.5, panels: true, panelWeight: 0.35, segs: 64, trail: 0.02, kneeCover: 0.05 };

  torso(rig, V.robe);
  neck(rig, F.skin);
  arms(rig, V.robe, { sleeve: (t) => 1 + 0.55 * THREE.MathUtils.smoothstep(t, 0.5, 1) });
  legs(rig, F.breeches, { under: cut(robe) });
  hands(rig, F.skin);
  boots(rig, F.leatherDark, { top: 0.06 });
  head(rig, F.skin);
  face(rig, F.face, V.brow);
  const beard = shortBeardMeshes(rig, V.hair, 1.3);
  // the Confessor's cowl, its point drooping down his back, the face left open
  cowl(rig, V.hood, { shade: 0, brow: 0.4, gap: 1.05, reach: 0.012, point: { dir: [0, 0.45, -0.9], length: 0.06, droop: 0.5, pinch: 0.75, girth: 2.6 } });
  skirt(rig, V.robe, robe);
  belt(rig, E.rope, E.rope, { r: [0.106, 0.092], dy: 0.0 });
  satchel(rig, E.satchel, M);
  inHand(rig, "R").add(pilgrimStaff(rig, M, E));

  const style = {
    ...SPELLWARDEN_STYLE,
    speed: 0.75,
    hold: PILGRIM_HOLD,
    idle: { lean: 0.07 },
    idleExtra: undefined,
    walk: { stride: 0.8, knee: 0.9, arms: [0.6, 0.3], lean: 0.09, twist: 0.6 },
    deathExtra: (i) => WARD_DEATH[i] && pose({ handR: WARD_DEATH[i] }),
    clips: { cower: cowerClip },
  };
  const variants = variantsOf(rig, "pilgrim", ["a", "b", "c"], V, { beard: { meshes: beard, letters: ["a", "c"] } });
  return { rig, style, variants };
}

/** A short beard's meshes (anatomy.js `shortBeard` returns none): its jaw and its lip. */
function shortBeardMeshes(rig, mat, full = 1) {
  const before = rig.bones.head.children.length;
  shortBeard(rig, mat, { full });
  return rig.bones.head.children.slice(before);
}

/** His wrists roped before him at the belt, the head bowed: the captive caged (`bound`). */
const BOUND_HOLD = pose(
  {
    upperArmL: [-0.28, -0.68, -0.08],
    foreArmL: [-1.15, 0, 0],
    upperArmR: [-0.28, 0.68, 0.08],
    foreArmR: [-1.15, 0, 0],
    neck: [0.28, 0, 0],
  },
  {},
  { bound: 1 },
);

/**
 * The captive (FS-4EC7Z §D R13, §H R36): thin and filthy, a ragged shirt to mid-thigh over torn
 * breeches, barefoot, bareheaded. Caged (`bound`) his wrists are roped before him; freed, the rope
 * is gone and he fights with a cudgel taken up off the floor, the mercenary's drawing cut. Variants:
 * `a` dark-haired and stubbled, `b` flax-haired, long and clean-shaven.
 */
export function captive() {
  const M = materials();
  const F = fabrics();
  const E = encounterFabrics();
  const V = encounterVariant("captive", "a");
  const rig = createRig(1.9, { shoulderW: 0.98, torsoW: 0.92, torsoD: 0.94, hipW: 0.96, limbR: 0.92, armR: 0.92 });
  rig.hooks = [];
  skirtBones(rig, { stiffness: 60 });
  const [, hy] = J(rig, "hips");
  const tail = { top: hy + 0.02, bottom: hy - 0.14, rTop: [0.1, 0.078], rBottom: [0.116, 0.098] };

  torso(rig, V.shirt);
  neck(rig, F.skin);
  arms(rig, V.shirt);
  hands(rig, F.skin);
  legs(rig, V.breeches, { under: tail });
  bareFeet(rig, F.skin, { size: 0.82 });
  head(rig, F.skin);
  face(rig, F.face, V.brow);
  const crop = hair(rig, V.hair);
  const long = hair(rig, V.hair, { long: true });
  const stubble = shortBeardMeshes(rig, V.hair, 0.7);
  skirt(rig, V.shirt, { ...tail, legFollow: 0.7, panels: true, panelWeight: 0.3, ragged: { teeth: 13, depth: 0.035, seed: 5 } });
  belt(rig, E.rope, E.rope, { r: [0.1, 0.08], dy: 0.02 });
  const ropes = wristRopes(rig, E.rope);
  const club = inHand(rig, "R");
  club.add(cudgel(rig, M));
  // caged he is bound and empty-handed; freed, the rope is off and the cudgel in his fist
  rig.hooks.push((r, p) => {
    const bound = !!p.fx.bound;
    for (const m of ropes) m.visible = bound;
    club.visible = !bound;
  });

  const style = {
    ...MERCENARY_STYLE,
    speed: 0.85,
    hold: pose({ upperArmL: [-0.04, 0, 0.06], foreArmL: [-0.3, 0, 0], upperArmR: [REST_ARM[0], 0, -0.12], foreArmR: REST_ELBOW, handR: [0.75, 0, 0] }),
    idle: { lean: 0.07 },
    walk: { stride: 0.85, knee: 0.95, arms: [0.6, 0.4], lean: 0.08, twist: 0.7 },
    clips: { bound: (spec) => idleCycle({ idle: { lean: 0.1, hold: BOUND_HOLD } }, spec.frames) },
  };
  const variants = variantsOf(rig, "captive", ["a", "b"], V, {
    crop: { meshes: crop, letters: ["a"] },
    long: { meshes: long, letters: ["b"] },
    stubble: { meshes: stubble, letters: ["a"] },
  });
  return { rig, style, variants };
}

/**
 * The cutthroat (FS-4EC7Z §D R14, §H R36): lean and quick, a hood drawn into a point down his back
 * over a capelet, a leather jerkin skirted to mid-thigh, leather bracers, tall boots, a long knife
 * in his fist and a second on his belt; the mercenary's carry and drawing cut. Variants: `a` in
 * brown leathers, `b` in slate-black with a scarf over his mouth.
 */
export function cutthroat() {
  const F = fabrics();
  const E = encounterFabrics();
  const V = encounterVariant("cutthroat", "a");
  const rig = createRig(1.94, { shoulderW: 1.02, torsoW: 0.96, torsoD: 0.96, hipW: 0.95, limbR: 0.96, armR: 0.98 });
  rig.hooks = [];
  skirtBones(rig, { stiffness: 55 });
  const [, hy] = J(rig, "hips");
  const [, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");
  const jerkin = { top: hy + 0.02, bottom: hy - 0.17, rTop: [0.104, 0.082], rBottom: [0.124, 0.104], legFollow: 0.7, panels: true, panelWeight: 0.35, arc: openFront(0.14), segs: 30 };

  torso(rig, V.jerkin);
  neck(rig, F.skin);
  arms(rig, F.hunterWool);
  hands(rig, F.leatherDark);
  legs(rig, F.breeches, { under: cut(jerkin) });
  boots(rig, F.leatherDark, { top: 0.22 });
  head(rig, F.skin);
  face(rig, F.face, V.brow);
  const beard = shortBeardMeshes(rig, V.hair, 0.9);
  cowl(rig, V.hood, { shade: 1, brow: 0.42, gap: 1.0, reach: 0.012, point: { dir: [0, 0.3, -0.95], length: 0.05, droop: 0.7, pinch: 0.75, girth: 2.4 } });
  const mask = scarf(rig, V.hood);
  skirt(rig, V.jerkin, jerkin);
  overTorso(rig, V.jerkin, { from: hy + 0.06, pad: 0.008, arc: openFront(0.1) });
  belt(rig, F.leatherDark, F.blackIron, { r: [0.108, 0.088], dy: 0.03, pouch: true });
  for (const s of ["L", "R"]) limbGuard(rig, `foreArm${s}`, wy + 0.02, fy - 0.035, [0.038, 0.035], F.leatherDark);
  sheathedKnife(rig, "L", F);
  inHand(rig, "R").add(longKnife(rig, E.dagger, F));

  const style = {
    ...MERCENARY_STYLE,
    speed: 1.1,
    walk: { stride: 1.0, arms: [0.7, 0.45], lean: 0.1, twist: 0.9 },
    idle: { lean: 0.06 },
  };
  const variants = variantsOf(rig, "cutthroat", ["a", "b"], V, {
    beard: { meshes: beard, letters: ["a"] },
    mask: { meshes: mask, letters: ["b"] },
  });
  return { rig, style, variants };
}

/** The duelist's carry: both blades low at his sides, their points down and forward. */
const TWIN_HOLD = pose({
  upperArmL: [REST_ARM[0], 0, 0.14],
  foreArmL: REST_ELBOW,
  handL: REST_BLADE,
  upperArmR: [REST_ARM[0], 0, -0.14],
  foreArmR: REST_ELBOW,
  handR: REST_BLADE,
});

/**
 * The hooded duelist (FS-4EC7Z §E, §H R36), one look of a contract mark: tall and spare in a long
 * slate-black coat to the knee, split at the front over dark breeches and tall boots, a standing
 * collar, a deep cowl drawn into a point that hides his face to the mouth, an oxblood sash and
 * bracers; a curved blade in each hand. The mercenary's drawing cut, the second blade flung out
 * behind against it.
 */
export function hoodedDuelist() {
  const F = fabrics();
  const E = encounterFabrics();
  const rig = createRig(2.0, { shoulderW: 1.06, torsoW: 0.98, torsoD: 0.98, hipW: 0.95, limbR: 1.0, armR: 1.02 });
  rig.hooks = [];
  skirtBones(rig, { stiffness: 50, drag: 0.28 });
  const [, hy] = J(rig, "hips");
  const [, ky] = J(rig, "shinL");
  const [, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");
  const coat = { top: hy + 0.02, bottom: ky + 0.02, rTop: [0.104, 0.082], rBottom: [0.13, 0.112], legFollow: 0.75, panels: true, panelWeight: 0.3, arc: openFront(0.12), segs: 30 };

  torso(rig, E.duelistCoat);
  neck(rig, F.skin);
  arms(rig, E.duelistCoat, { r: 1.04 });
  hands(rig, F.leatherDark);
  legs(rig, F.breeches, { under: cut(coat) });
  boots(rig, F.leatherDark, { top: 0.24 });
  head(rig, F.skin);
  face(rig, F.face, F.browDark);
  shortBeard(rig, F.hairDark, { full: 0.8 });
  standingCollar(rig, E.duelistCoat, { rise: 0.035, gap: 0.9 });
  cowl(rig, E.duelistCoat, { shade: 2, brow: 0.46, gap: 0.9, reach: 0.02, capeMat: E.duelistOxblood, point: { dir: [0, 0.4, -0.92], length: 0.11, droop: 0.5, pinch: 0.78, girth: 2.5 } });
  skirt(rig, E.duelistCoat, coat);
  sash(rig, E.duelistOxblood, { side: "L", depth: 0.05 });
  for (const s of ["L", "R"]) limbGuard(rig, `foreArm${s}`, wy + 0.02, fy - 0.035, [0.04, 0.037], F.leatherDark);
  const blades = { steel: E.duelistBlade, blackIron: F.blackIron, leatherDark: F.leatherDark };
  inHand(rig, "R").add(curvedSword(rig, blades));
  inHand(rig, "L").add(curvedSword(rig, blades));

  const style = {
    ...MERCENARY_STYLE,
    speed: 1.08,
    hold: TWIN_HOLD,
    walk: { stride: 1.02, arms: [0.45, 0.45], wrist: [0.6, 0.6], lean: 0.07 },
    // the off blade's wrist cocked back as the free arm is flung out against the cut
    attackExtra: pose({ handL: [0.5, 0, 0] }),
  };
  return { rig, style };
}

/** The tabard's halves per pale (rad, 0 his right, π/2 his front): his right in ochre, his left in soot. */
const PALE = {
  frontRight: [Math.PI / 2 - 0.62, Math.PI / 2],
  frontLeft: [Math.PI / 2, Math.PI / 2 + 0.62],
  backRight: [-Math.PI / 2, -Math.PI / 2 + 0.62],
  backLeft: [-Math.PI / 2 - 0.62, -Math.PI / 2],
};

/**
 * The debtor knight (FS-4EC7Z §E, §H R36), the other look of a contract mark: big and heavy in plate
 * gone dark and dented, rust at its seams, over a rusted mail hauberk to the knee; spaulders,
 * vambraces, knee cops and greaves; over it all the tabard of a ruined house, per pale ochre and
 * soot, the soot half torn away short; a longsword, notched and dull; a broken manacle still on his
 * left wrist, the debt that hunts him. Bareheaded, his hair long and grizzled, a full beard. The
 * knight's compact slash, his free fist up before him where a shield should be.
 */
export function debtorKnight() {
  const M = materials();
  const F = fabrics();
  const E = encounterFabrics();
  const rig = createRig(2.04, { shoulderW: 1.14, torsoW: 1.08, torsoD: 1.06, hipW: 1.02, limbR: 1.06, armR: 1.08 });
  rig.hooks = [];
  skirtBones(rig, { stiffness: 55 });
  const [, hy] = J(rig, "hips");
  const [, ky] = J(rig, "shinL");
  const [, ay] = J(rig, "footL");
  const [, fy] = J(rig, "foreArmL");
  const [, wy] = J(rig, "handL");
  const hauberk = { top: hy + 0.02, bottom: ky + 0.02, rTop: [0.104, 0.082], rBottom: [0.13, 0.112], legFollow: 0.75, panels: true, panelWeight: 0.3, segs: 32 };

  torso(rig, E.knightPlate);
  neck(rig, E.knightMail);
  arms(rig, E.knightMail);
  hands(rig, E.knightPlate);
  legs(rig, E.knightMail, { under: cut(hauberk) });
  boots(rig, F.leatherDark, { top: 0.1 });
  head(rig, F.skin, { jaw: 1.05 });
  face(rig, F.face, F.browDark);
  // grizzled: the hair dark, the beard gone grey
  hair(rig, F.hairDark, { long: true });
  shortBeard(rig, F.hairGrey, { full: 1.5 });
  skirt(rig, E.knightMail, hauberk);
  // the tabard: per pale over the breastplate and down over the hauberk, the soot half torn short
  for (const [arc, mat, hem] of [
    [PALE.frontRight, E.houseOchre, 0.06],
    [PALE.backRight, E.houseOchre, 0.06],
    [PALE.frontLeft, E.houseSoot, 0.16],
    [PALE.backLeft, E.houseSoot, 0.13],
  ]) {
    overTorso(rig, mat, { from: hy - 0.01, arc, pad: 0.016 });
    skirt(rig, mat, { over: hauberk, rTop: [hauberk.rTop[0] + 0.016, hauberk.rTop[1] + 0.016], rBottom: [hauberk.rBottom[0] + 0.016, hauberk.rBottom[1] + 0.016], bottom: hauberk.bottom + hem, arc });
  }
  belt(rig, F.leatherDark, F.blackIron, { r: [0.11, 0.09], dy: 0.03 });
  for (const s of ["L", "R"]) {
    spaulder(rig, s, E.knightPlateDouble, { lames: 3, size: 1.0 });
    limbGuard(rig, `foreArm${s}`, wy + 0.02, fy - 0.03, [0.043, 0.041], E.knightPlate);
    kneeCop(rig, s, E.knightPlate);
    limbGuard(rig, `shin${s}`, ay + 0.1, ky - 0.04, [0.044, 0.046], E.knightPlate, { z: 0.004 });
  }
  manacle(rig, F);
  inHand(rig, "R").add(longsword(rig, M, { ...F, steel: E.knightBlade }));

  const style = {
    ...KNIGHT_STYLE,
    speed: 0.95,
    hold: add(KNIGHT_STYLE.hold, pose({ upperArmL: [0.3, 0.85, -0.04], foreArmL: [0.9, 0, 0] })),
    walk: { arms: [0.5, 0.55], lean: 0.06, stride: 0.95 },
  };
  return { rig, style };
}

/**
 * The encounter cast as manifest sheets (FS-4EC7Z §H R36), on group `encounter`, which a run fetches
 * the first time its state carries an encounter NPC or a `cutthroat` or `contract_mark` monster
 * (ADR-0071; src/render/art/sceneArt.ts `ENCOUNTER_ART`). `letters` are the variants each sheet
 * carries: the first is the plain clips, the rest `<anim>_<letter>`. Each frame is trimmed to its
 * pixels (lib/trim.mjs, ADR-0058, ADR-0076) as the classes' are, to keep the group's decoded pages in
 * the memory budget (ADR-0071 Consequences).
 */
export const ENCOUNTER = [
  { sheet: "npc_pilgrim", fn: "pilgrim", build: pilgrim, animations: PILGRIM_ANIMATIONS, letters: ["a", "b", "c"] },
  { sheet: "npc_captive", fn: "captive", build: captive, animations: CAPTIVE_ANIMATIONS, letters: ["a", "b"] },
  { sheet: "npc_cutthroat", fn: "cutthroat", build: cutthroat, animations: ENCOUNTER_ANIMATIONS, letters: ["a", "b"] },
  { sheet: "npc_hooded_duelist", fn: "hoodedDuelist", build: hoodedDuelist, animations: ENCOUNTER_ANIMATIONS, letters: ["a"] },
  { sheet: "npc_debtor_knight", fn: "debtorKnight", build: debtorKnight, animations: ENCOUNTER_ANIMATIONS, letters: ["a"] },
].map((c) => ({ ...c, group: "encounter", trim: true }));
