// The playable classes' own motion on their own rigs and styles (classStyles.js): the run of
// FS-JS7C8 R2 as each class carries it, the weapon kept out of the body and the head, and the
// attack of FS-2325V § Change: The class attacks move with weight and cut deep.
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { ATTACKS, RUN_ANIMATIONS, add, applyPose, clipsFor, groundPose, pose, runCycle, walkCycle } from "./clips.js";
import { createRig, gripAt, jointAt as J, mount } from "./rig.js";
import { boots, legs } from "./anatomy.js";
import { footing, measurePace } from "./pace.js";
import { WIZARD_BUILD, WIZARD_SHEET, WIZARD_STYLE } from "./classStyles.js";

const DEG = 180 / Math.PI;

/** A class's rig as cast.js builds it, with the legs and boots every clip is grounded on. */
function rigOf(build) {
  const rig = createRig(...build);
  legs(rig, new THREE.MeshBasicMaterial());
  boots(rig, new THREE.MeshBasicMaterial(), { top: 0.1 });
  return rig;
}

/** Points riding `bone` at `at` (bind, H) turned by `o` (mount's), each at its own offset (H). */
function riding(rig, bone, at, o, offsets) {
  const g = mount(rig, bone, at, o);
  return offsets.map((p) => {
    const m = new THREE.Object3D();
    m.position.set(p[0] * rig.H, p[1] * rig.H, p[2] * rig.H);
    g.add(m);
    return m;
  });
}
const along = (from, to, n) => Array.from({ length: n + 1 }, (_, i) => [0, 0, from + ((to - from) * i) / n]);

/**
 * What a class carries, as points on the rig, from gear.js's own sizes (H): a weapon in the
 * grip frame (local +z from the fist), pommel to tip, the last point its tip.
 */
const GEAR = {
  /** The wizard's sceptre (gear.js `sceptre`, butt −0.06 to the orb's top 0.29) and the tome hanging from her left hand by its spine (`tome`, mounted turned a quarter back). */
  wizard: (rig) => ({
    weapon: riding(rig, "handR", gripAt(rig, "R"), {}, along(-0.06, 0.29, 7)),
    other: riding(rig, "handL", gripAt(rig, "L"), { rx: -Math.PI / 2 }, [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x * 0.018, -0.02 + y * 0.05, -0.03 + z * 0.039])))),
  }),
};

/**
 * The torso as anatomy.js `torso` profiles it (bind, H): rings from the pelvis to the shoulders,
 * each a superellipse of its half width and depth, carried by the bone it rides.
 */
function torsoRings(rig) {
  const p = rig.p;
  const [, hy] = J(rig, "hips");
  const [, cy] = J(rig, "chest");
  const [, ny] = J(rig, "neck");
  return [
    { y: hy - 0.065, z: 0, r: [0.066 * p.hipW, 0.06 * p.torsoD], n: 2 },
    { y: hy - 0.01, z: -0.004, r: [0.097 * p.hipW, 0.072 * p.torsoD], n: 2.2 },
    { y: hy + 0.06, z: 0.002, r: [0.084 * p.torsoW, 0.064 * p.torsoD], n: 2.2 },
    { y: cy - 0.005, z: 0.006, r: [0.099 * p.torsoW, 0.074 * p.torsoD], n: 2.5 },
    { y: cy + 0.06, z: 0.01, r: [0.112 * p.torsoW, 0.079 * p.torsoD], n: 2.7 },
    { y: ny - 0.022, z: 0, r: [0.104 * p.shoulderW, 0.062 * p.torsoD], n: 2.8 },
  ];
}

const _inv = new THREE.Matrix4();
/** A world point back in `bone`'s bind space (H): where it would sit were the bone at rest. */
function inBind(rig, bone, w) {
  _inv.copy(rig.bones[bone].matrixWorld).invert();
  return w.clone().applyMatrix4(_inv).add(rig.bind[bone]).divideScalar(rig.H);
}

/**
 * How deep a world point lies inside the body (H; negative outside): the torso, read on the bone
 * each part of it rides (the pelvis, the spine, the chest), and the head, an ellipsoid of the
 * head's radius on the head bone.
 */
function inside(rig, w) {
  const rings = torsoRings(rig);
  const [, hy] = J(rig, "hips");
  const [, cy] = J(rig, "chest");
  let deepest = -Infinity;
  for (const [bone, lo, hi] of [
    ["hips", -Infinity, hy + 0.03],
    ["spine", hy + 0.03, cy],
    ["chest", cy, Infinity],
  ]) {
    const b = inBind(rig, bone, w);
    if (b.y < lo || b.y > hi) continue;
    for (let k = 0; k + 1 < rings.length; k++) {
      const [a, c] = [rings[k], rings[k + 1]];
      if (b.y < a.y || b.y > c.y) continue;
      const t = (b.y - a.y) / (c.y - a.y);
      const lerp = (u, v) => u + (v - u) * t;
      const [rx, rz, n] = [lerp(a.r[0], c.r[0]), lerp(a.r[1], c.r[1]), lerp(a.n, c.n)];
      const v = (Math.abs(b.x / rx) ** n + Math.abs((b.z - lerp(a.z, c.z)) / rz) ** n) ** (1 / n);
      deepest = Math.max(deepest, (1 - v) * Math.min(rx, rz));
    }
  }
  const [, hhy, hhz] = J(rig, "head");
  const h = inBind(rig, "head", w);
  const r = rig.p.headR;
  const head = (1 - Math.hypot(h.x / r, (h.y - hhy - 0.048) / (r * 1.05), (h.z - hhz - 0.004) / (r * 1.08))) * r;
  return { torso: deepest, head };
}

const world = (m) => new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
const at = (rig, b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[b].matrixWorld);
const posed = (rig, p) => (applyPose(rig, p), groundPose(rig));

/** The class's carry on every key of `frames`: the deepest any carried point lies in the torso or the head (H). */
function deepestCarry(rig, gear, frames) {
  let torso = -Infinity;
  let head = -Infinity;
  for (const p of frames) {
    posed(rig, p);
    for (const m of [...gear.weapon, ...gear.other]) {
      const d = inside(rig, world(m));
      torso = Math.max(torso, d.torso);
      head = Math.max(head, d.head);
    }
  }
  return { torso, head };
}

/**
 * The classes under test, each with the arms that pump in the run (R2's elbow and reach bands)
 * and how far outside the body its carry must stay (H).
 */
const CLASSES = [
  {
    name: "wizard",
    build: WIZARD_BUILD,
    style: WIZARD_STYLE,
    sheet: WIZARD_SHEET,
    pump: ["L", "R"],
  },
];

describe.each(CLASSES)("the $name's sheet at 1.5x with the run and the backward step (FS-JS7C8 slices 6–8, FS-HF0WW § Change: Class sheets at 1.5x R35)", ({ sheet }) => {
  it("carries run, walk_attack over 0.75 walk cycles and backpedal_attack over 0.75, no standalone backpedal, at scale 1.5", () => {
    expect(sheet.scale).toBe(1.5);
    const a = sheet.animations;
    expect(a.run).toEqual(RUN_ANIMATIONS.run);
    expect(a.walk_attack.cycles).toBe(0.75);
    expect(a.backpedal_attack).toMatchObject({ frames: 14, fps: 24, loop: false, boxed: true, cycles: 0.75 });
    expect(a).not.toHaveProperty("backpedal");
    expect(a.walk_attack.frames / a.walk_attack.fps).toBeCloseTo(a.attack.frames / a.attack.fps, 9);
  });
});

describe.each(CLASSES)("the $name's fast run on its own rig and style (FS-JS7C8 R2, R3)", ({ build, style, pump }) => {
  const rig = rigOf(build);
  const run = runCycle(style);
  const SAMPLES = Array.from({ length: 32 }, (_, k) => k / 4);
  const pose8 = (f) => footing(rig, run, f);

  it("leans the trunk about 10° and brings the head back level", () => {
    applyPose(rig, pose());
    rig.root.updateMatrixWorld(true);
    const lean = () => {
      const [h, n] = [at(rig, "hips"), at(rig, "neck")];
      return Math.atan2(n.z - h.z, n.y - h.y) * DEG;
    };
    const pitch = () => {
      const fwd = new THREE.Vector3(0, 0, 1).transformDirection(rig.bones.head.matrixWorld);
      return Math.atan2(-fwd.y, fwd.z) * DEG;
    };
    const [restLean, restPitch] = [lean(), pitch()];
    for (const f of SAMPLES) {
      pose8(f);
      expect(lean() - restLean, `lean @${f}`).toBeGreaterThanOrEqual(8);
      expect(lean() - restLean, `lean @${f}`).toBeLessThanOrEqual(12);
      expect(Math.abs(pitch() - restPitch), `head @${f}`).toBeLessThanOrEqual(3);
    }
  });

  it("pumps its arms with the elbows bent about 90°, each hand to chest height and back past the hip", () => {
    for (const s of pump) {
      const samples = SAMPLES.map((f) => {
        pose8(f);
        const [sh, el, hand] = [at(rig, `upperArm${s}`), at(rig, `foreArm${s}`), at(rig, `hand${s}`)];
        if (Number.isInteger(f)) {
          const bend = 180 - sh.clone().sub(el).angleTo(hand.clone().sub(el)) * DEG;
          expect(bend, `${s} elbow @${f}`).toBeGreaterThanOrEqual(80);
          expect(bend, `${s} elbow @${f}`).toBeLessThanOrEqual(100);
        }
        return { hand, chest: at(rig, "chest"), shoulder: sh, hips: at(rig, "hips") };
      });
      const front = samples.reduce((a, b) => (b.hand.z - b.hips.z > a.hand.z - a.hips.z ? b : a));
      const back = samples.reduce((a, b) => (b.hand.z - b.hips.z < a.hand.z - a.hips.z ? b : a));
      expect(front.hand.y, `${s} front`).toBeGreaterThan(front.chest.y);
      expect(front.hand.y, `${s} front`).toBeLessThan(front.shoulder.y);
      expect((back.hips.z - back.hand.z) / rig.H, `${s} back`).toBeGreaterThanOrEqual(0.06);
    }
  });

  it("turns the shoulders 6.5–10° against the hips, and keeps the shared legs key for key", () => {
    const yaw = (l, r) => {
      const [a, b] = [at(rig, l), at(rig, r)];
      return Math.atan2(b.z - a.z, a.x - b.x) * DEG;
    };
    const turn = Math.max(...SAMPLES.map((f) => (pose8(f), Math.abs(yaw("upperArmL", "upperArmR")))));
    expect(turn).toBeGreaterThanOrEqual(6.5);
    expect(turn).toBeLessThanOrEqual(10);
    const plain = runCycle({ hold: pose() });
    run.forEach((p, i) => {
      for (const bone of ["hips", "thighL", "thighR", "shinL", "shinR", "footL", "footR"]) expect(p.b[bone], `${bone} @${i}`).toEqual(plain[i].b[bone]);
      expect(p.body, `body @${i}`).toEqual(plain[i].body);
    });
  });

  it("covers 180–220 world px/s on its legs, and its attacks on the move walk the legs at most 90", () => {
    const pace = measurePace(rig, run, RUN_ANIMATIONS.run.fps);
    expect(pace).toBeGreaterThanOrEqual(180);
    expect(pace).toBeLessThanOrEqual(220);
    // the walk's legs (backpedal_attack's are the same run backward) over 0.75 cycles of the 0.583 s swing
    const walk = measurePace(rig, walkCycle(style), 10);
    expect((walk * 0.8 * 0.75) / (7 / 12)).toBeLessThanOrEqual(90);
  });
});

describe.each(CLASSES)("the $name's carry stays out of the body and the head (FS-JS7C8 R2, FS-2325V § Change: The class attacks move with weight and cut deep R6)", ({ name, build, style, sheet }) => {
  const rig = rigOf(build);
  const gear = GEAR[name](rig);
  const clips = clipsFor(style, sheet.animations);

  it.each(["walk", "run", "attack", "walk_attack", "backpedal_attack"])("on every key of %s", (anim) => {
    expect(clips[anim], anim).toBeDefined();
    const d = deepestCarry(rig, gear, clips[anim]);
    expect(d.torso, `${anim}: into the torso`).toBeLessThan(0);
    expect(d.head, `${anim}: into the head`).toBeLessThan(0);
  });
});

/**
 * The attack's weapon tip on each key of the standing attack, model space (H), with the body's
 * weight shift (`body.z`) and the turns of the pelvis and the chest (about y; + turns the right
 * side forward).
 */
function attackPath(rig, tip, keys) {
  return keys.map((p) => {
    posed(rig, p);
    const yaw = (b) => (p.b[b] ?? [0, 0, 0])[1];
    return { tip: world(tip).divideScalar(rig.H), z: p.body.z ?? 0, hips: yaw("hips"), chest: yaw("hips") + yaw("spine") + yaw("chest"), key: p };
  });
}

describe("the wizard's cast moves with weight (FS-2325V § Change: The class attacks move with weight and cut deep R1, R4, R5)", () => {
  const rig = rigOf(WIZARD_BUILD);
  const orb = GEAR.wizard(rig).weapon.at(-1);
  const keys = clipsFor(WIZARD_STYLE, WIZARD_SHEET.animations).attack;
  const path = attackPath(rig, orb, keys);
  const STRIKE = 3;

  it("keeps 7 keys at 12 fps, the thrust and the glow's peak at key 3", () => {
    expect([WIZARD_SHEET.animations.attack.frames, WIZARD_SHEET.animations.attack.fps]).toEqual([7, 12]);
    expect(keys).toHaveLength(7);
    const glow = keys.map((p) => p.fx.glow ?? 0);
    expect(glow.indexOf(Math.max(...glow))).toBe(STRIKE);
  });

  it("winds up opposite the thrust: the orb drawn back against the facing and the weight back, before key 3", () => {
    const wind = path.slice(0, STRIKE).reduce((a, b) => (b.tip.z < a.tip.z ? b : a));
    expect(path[0].tip.z - wind.tip.z, "the orb drawn back").toBeGreaterThanOrEqual(0.04);
    expect(wind.z, "the weight back").toBeLessThan(0);
    expect(path[STRIKE].z - wind.z, "onto the front foot at the thrust").toBeGreaterThanOrEqual(0.03);
    expect(path[STRIKE].tip.z - wind.tip.z, "the thrust forward").toBeGreaterThanOrEqual(0.2);
  });

  it("turns the pelvis into the thrust before the chest", () => {
    const w = path.slice(0, STRIKE).reduce((a, b, i) => (b.chest < path[a].chest ? i : a), 0);
    const half = (part) => {
      const [from, to] = [path[w][part], path[STRIKE][part]];
      return path.findIndex((s, i) => i > w && (s[part] - from) / (to - from) >= 0.5);
    };
    expect(path[STRIKE].hips - path[w].hips, "the pelvis turns").toBeGreaterThanOrEqual(0.15);
    expect(half("hips")).toBeLessThan(half("chest"));
  });

  it("moves the orb on a curve, eased at the ends and fastest through the thrust", () => {
    const steps = path.slice(1).map((s, i) => s.tip.distanceTo(path[i].tip));
    const total = steps.reduce((a, b) => a + b, 0);
    expect(Math.max(...steps) / total, "no one step carries most of the path").toBeLessThanOrEqual(0.4);
    // the strike's steps (into and out of key 3) outrun the first and the last
    const fast = Math.max(steps[STRIKE - 1], steps[STRIKE]);
    expect(fast).toBeGreaterThan(steps[0]);
    expect(fast).toBeGreaterThan(steps.at(-1));
    // off the straight line from the wind-up to the follow-through
    const [a, b] = [path[1].tip, path[5].tip];
    const off = Math.max(...path.slice(2, 5).map((s) => new THREE.Line3(a, b).closestPointToPoint(s.tip, true, new THREE.Vector3()).distanceTo(s.tip)));
    expect(off / a.distanceTo(b)).toBeGreaterThanOrEqual(0.1);
  });

  it("opens the free hand out to the side at the thrust", () => {
    posed(rig, keys[STRIKE]);
    const [hand, shoulder] = [at(rig, "handL"), at(rig, "upperArmL")];
    // the character's left is +x
    expect((hand.x - shoulder.x) / rig.H).toBeGreaterThanOrEqual(0.08);
  });

  it("is the one attack the walk_attack and backpedal_attack draw from the waist up", () => {
    const clips = clipsFor(WIZARD_STYLE, WIZARD_SHEET.animations);
    for (const anim of ["walk_attack", "backpedal_attack"])
      clips[anim].forEach((p, i) => expect(p.b.upperArmR, `${anim} @${i}`).toEqual(add(ATTACKS.cast()[Math.floor(i / 2)]).b.upperArmR));
  });
});
