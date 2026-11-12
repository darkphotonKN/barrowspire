// The playable classes' own motion on their own rigs and styles (classStyles.js): the run of
// FS-JS7C8 R2 as each class carries it, the weapon kept out of the body and the head, and the
// attack of FS-2325V § Change: The class attacks move with weight and cut deep.
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { ATTACKS, ATTACK_TURN_LIMIT, RUN_ANIMATIONS, add, applyPose, clipsFor, groundPose, pose, runCycle, walkCycle } from "./clips.js";
import { createRig, gripAt, jointAt as J, mount } from "./rig.js";
import { boots, legs } from "./anatomy.js";
import { footing, measurePace } from "./pace.js";
import { KNIGHT_BUILD, KNIGHT_SHEET, KNIGHT_STYLE, MERCENARY_BUILD, MERCENARY_SHEET, MERCENARY_STYLE, SCEPTRE_TILT, WIZARD_BUILD, WIZARD_SHEET, WIZARD_STYLE } from "./classStyles.js";
import { MERC_ANIMATIONS, parryClip } from "./clips.js";

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
  /** The mercenary's curved dueling sword (gear.js `curvedSword`: the pommel −0.046, the blade 0.045 to 0.505, its point 0.055 off straight). */
  mercenary: (rig) => ({
    weapon: riding(rig, "handR", gripAt(rig, "R"), {}, [[0, 0, -0.046], ...Array.from({ length: 11 }, (_, i) => [0, 0.055 * (i / 10) ** 1.6, 0.045 + 0.46 * (i / 10)])]),
    other: [],
  }),
  /**
   * The knight's longsword (gear.js `longsword`, pommel −0.05 to the point 0.45) and the kite
   * shield strapped to his left forearm (`kiteShield`: its outline in the forearm's frame, long
   * axis along the forearm's +z, width along its y), its centre the first point.
   */
  knight: (rig) => {
    const [x, fy] = J(rig, "foreArmL");
    const [, wy] = J(rig, "handL");
    const [w, top, bot] = [0.115, 0.145, -0.27];
    const outline = [[0, 0], [w, top * 0.72], [-w, top * 0.72], [0, top], [0, bot], [0.07, -0.1], [-0.07, -0.1], [0.1, 0.05], [-0.1, 0.05]];
    return {
      weapon: riding(rig, "handR", gripAt(rig, "R"), {}, along(-0.05, 0.45, 10)),
      other: riding(rig, "foreArmL", [x + 0.042, (fy + wy) / 2 - 0.01, -0.03], {}, outline.map(([u, v]) => [0, u, v])),
    };
  },
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
 * The classes under test, each with the arms that pump in the run (R2's elbow and reach bands) and
 * its weapon's rest in the idle and the walk: `point` down and forward (a blade's tip toward the
 * ground) or `upright` (the sceptre held up beside the leg, tilted forward and out, its head up).
 */
const CLASSES = [
  {
    name: "knight",
    build: KNIGHT_BUILD,
    style: KNIGHT_STYLE,
    sheet: KNIGHT_SHEET,
    // the sword arm pumps; the shield arm carries the shield before him (its own swing, R2's last point)
    pump: ["R"],
    rest: "point",
  },
  {
    name: "mercenary",
    build: MERCENARY_BUILD,
    style: MERCENARY_STYLE,
    sheet: MERCENARY_SHEET,
    pump: ["L", "R"],
    rest: "point",
  },
  {
    name: "wizard",
    build: WIZARD_BUILD,
    style: WIZARD_STYLE,
    sheet: WIZARD_SHEET,
    pump: ["L", "R"],
    rest: "upright",
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

describe.each(CLASSES)("the $name's fast run on its own rig and style (FS-JS7C8 R2, R3)", ({ name, build, style, pump, rest }) => {
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

  // owner, 2026-11-12: "拿武器的動作有點怪 武器的位置似乎太高了 擺動的時候舉得太高", "跑步時也不用太高",
  // then, of the held keys' fist turned over: "跑步時武器是不是拿反了"
  it(
    rest === "point"
      ? "carries the blade forward and down or about level on every sample, its tip ahead of the hand, under the shoulder and never behind the body"
      : "carries the sceptre up by its shaft on every sample, the orb above the hand and under the shoulder, ahead of the hand",
    () => {
      const tip = GEAR[name](rig).weapon.at(-1);
      for (const f of SAMPLES) {
        pose8(f);
        const [hand, t, shoulder, hips] = [at(rig, "handR"), world(tip), at(rig, "upperArmR"), at(rig, "hips")];
        const d = t.clone().sub(hand);
        const elev = Math.atan2(d.y, Math.hypot(d.x, d.z)) * DEG;
        if (rest === "point") {
          expect(elev, `blade @${f}`).toBeGreaterThanOrEqual(-45);
          expect(elev, `blade @${f}`).toBeLessThanOrEqual(5);
          expect(t.z - hips.z, `tip ahead of the body @${f}`).toBeGreaterThan(0);
        } else expect(elev, `orb over the hand @${f}`).toBeGreaterThan(0);
        expect(d.z, `tip ahead of the hand @${f}`).toBeGreaterThan(0);
        expect(t.y, `tip under the shoulder @${f}`).toBeLessThan(shoulder.y);
      }
    },
  );

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

// owner, 2026-11-12: "站立時武器應該可以放下手微微下垂"
describe.each(CLASSES)("the $name's weapon arm rests down at the side in the idle (FS-JS7C8 R2)", ({ name, build, style, sheet, rest }) => {
  const rig = rigOf(build);
  const gear = GEAR[name](rig);
  const idle = clipsFor(style, sheet.animations).idle;

  it("hangs the arm with the elbow a little bent and the hand a little below the waist, on every key", () => {
    idle.forEach((p, i) => {
      posed(rig, p);
      const [sh, el, hand, hips] = [at(rig, "upperArmR"), at(rig, "foreArmR"), at(rig, "handR"), at(rig, "hips")];
      const bend = 180 - sh.clone().sub(el).angleTo(hand.clone().sub(el)) * DEG;
      expect(bend, `elbow @${i}`).toBeGreaterThanOrEqual(5);
      expect(bend, `elbow @${i}`).toBeLessThanOrEqual(30);
      expect((hips.y - hand.y) / rig.H, `hand under the pelvis @${i}`).toBeGreaterThanOrEqual(0);
      expect((hips.y - hand.y) / rig.H, `hand under the pelvis @${i}`).toBeLessThanOrEqual(0.12);
    });
  });

  it(rest === "point" ? "points the blade down and forward, its tip toward the ground" : "holds the sceptre up beside the leg, its head under the shoulder", () => {
    const tip = gear.weapon.at(-1);
    idle.forEach((p, i) => {
      posed(rig, p);
      const [hand, t] = [at(rig, "handR"), world(tip)];
      const d = t.clone().sub(hand);
      const elev = Math.atan2(d.y, Math.hypot(d.x, d.z)) * DEG;
      if (rest === "point") {
        expect(elev, `blade @${i}`).toBeGreaterThanOrEqual(-60);
        expect(elev, `blade @${i}`).toBeLessThanOrEqual(-15);
        expect(d.z, `tip ahead of the hand @${i}`).toBeGreaterThan(0);
      } else {
        expect(elev, `sceptre @${i}`).toBeGreaterThanOrEqual(45);
        expect(t.y, `orb under the shoulder @${i}`).toBeLessThan(at(rig, "upperArmR").y);
      }
    });
  });

  // owner, 2026-11-12, of the wizard's held keys: "法師走路時武器可以垂一點 現在手垂下來了 但是武器卻還是拿得很直"
  if (rest === "upright")
    it(`lets the sceptre lean with the relaxed hand in the idle and the walk: ${SCEPTRE_TILT}° off vertical, 30–45° on every key, the orb forward and out a little and under the shoulder, the foot of the shaft back toward the heel, clear of the robe`, () => {
      const [butt, tip] = [gear.weapon[0], gear.weapon.at(-1)];
      const walk = clipsFor(style, sheet.animations).walk;
      const tilts = [];
      for (const [anim, keys] of [["idle", idle], ["walk", walk]])
        keys.forEach((p, i) => {
          posed(rig, p);
          const [hand, t, b] = [at(rig, "handR"), world(tip), world(butt)];
          const d = t.clone().sub(hand);
          const tilt = 90 - Math.atan2(d.y, Math.hypot(d.x, d.z)) * DEG;
          tilts.push(tilt);
          expect(tilt, `${anim} tilt @${i}`).toBeGreaterThanOrEqual(30);
          expect(tilt, `${anim} tilt @${i}`).toBeLessThanOrEqual(45);
          expect(d.z, `${anim} orb forward @${i}`).toBeGreaterThan(0);
          // the right hand: out is -x
          expect((hand.x - t.x) / rig.H, `${anim} orb out @${i}`).toBeGreaterThanOrEqual(0.01);
          expect(t.y, `${anim} orb under the shoulder @${i}`).toBeLessThan(at(rig, "upperArmR").y);
          // the grip, 0.06 H up the shaft from its foot (gear.js `sceptre`, butt −0.06 to the orb's top 0.29)
          const grip = b.clone().lerp(t, 0.06 / 0.35);
          expect(b.z, `${anim} the shaft's foot behind the grip @${i}`).toBeLessThan(grip.z);
          for (const m of gear.weapon) expect(outsideRobe(rig, world(m)), `${anim} @${i}: the sceptre into the robe`).toBeGreaterThan(0);
        });
      expect(Math.abs(tilts.reduce((a, b) => a + b) / tilts.length - SCEPTRE_TILT), "the mean tilt").toBeLessThanOrEqual(3);
    });

  if (name === "knight")
    it("rests the shield before him, lowered: its centre under the chest bone", () => {
      idle.forEach((p, i) => {
        posed(rig, p);
        expect(world(gear.other[0]).y, `shield @${i}`).toBeLessThan(at(rig, "chest").y);
      });
    });
});

/**
 * How far a world point lies outside the mage's robe as cast.js cuts it (H; negative inside): the
 * gown with the scapular over it (anatomy.js `skirt`, `overSkirt`), read in the pelvis's bind
 * space, an ellipse at each height from the gown's top to its hem, its centre trailing back
 * toward the hem.
 */
function outsideRobe(rig, w) {
  const [, hy] = J(rig, "hips");
  const [top, bottom] = [hy - 0.005, 0.016];
  const b = inBind(rig, "hips", w);
  if (b.y > top || b.y < bottom) return Infinity;
  const t = (top - b.y) / (top - bottom);
  const [rx, rz] = [0.116 + (0.162 - 0.116) * t, 0.088 + (0.148 - 0.088) * t];
  const z = -0.02 * t * t;
  return (Math.hypot(b.x / rx, (b.z - z) / rz) - 1) * Math.min(rx, rz);
}

// owner, 2026-11-12, of the held run keys' fist turned over (hand [0.7, π, 0]): "跑步時武器是不是拿反了"
describe.each(CLASSES)("the $name holds the weapon in a normal grip, never turned over in the hand (FS-JS7C8 R2)", ({ name, build, style, sheet }) => {
  const rig = rigOf(build);
  const clips = clipsFor(style, sheet.animations);

  it.each(["idle", "walk", "run"])("on every key of %s the fist keeps its thumb side where the forearm has it", (anim) => {
    clips[anim].forEach((p, i) => {
      posed(rig, p);
      // the knuckles' axis (the hand's +x, about which the wrist cocks) in the forearm's frame: a
      // fist rolled over on the forearm turns it about
      const x = new THREE.Vector3(1, 0, 0).transformDirection(rig.bones.handR.matrixWorld);
      const fore = new THREE.Matrix4().extractRotation(rig.bones.foreArmR.matrixWorld).invert();
      expect(x.applyMatrix4(fore).x, `${name} ${anim} @${i}`).toBeGreaterThan(0);
    });
  });
});

describe.each(CLASSES)("the $name's carry stays out of the body and the head (FS-JS7C8 R2, FS-2325V § Change: The class attacks move with weight and cut deep R6)", ({ name, build, style, sheet }) => {
  const rig = rigOf(build);
  const gear = GEAR[name](rig);
  const clips = clipsFor(style, sheet.animations);

  it.each(["idle", "walk", "run", "attack", "walk_attack", "backpedal_attack"])("on every key of %s", (anim) => {
    expect(clips[anim], anim).toBeDefined();
    const d = deepestCarry(rig, gear, clips[anim]);
    expect(d.torso, `${anim}: into the torso`).toBeLessThan(0);
    expect(d.head, `${anim}: into the head`).toBeLessThan(0);
  });
});

/**
 * How far the weapon turns between two poses (degrees): the angle between its line, pommel to tip
 * (`gear.weapon`), in one and in the other.
 */
function turnOf(rig, gear, a, b) {
  const line = (p) => (posed(rig, p), world(gear.weapon.at(-1)).sub(world(gear.weapon[0])));
  return line(a).angleTo(line(b)) * DEG;
}

// with the carry lowered (owner 2026-11-12: "站立時武器應該可以放下手微微下垂"), the blade turned
// about 150° from the idle into the attack's first key and 99° from its last key back
describe.each(CLASSES)("the $name's attack starts from the carry and settles back to it (FS-JS7C8 R2, FS-2325V § Change: The class attacks move with weight and cut deep)", ({ name, build, style, sheet }) => {
  const rig = rigOf(build);
  const gear = GEAR[name](rig);
  const clips = clipsFor(style, sheet.animations);
  const [carry, keys] = [clips.idle[0], clips.attack];

  it(`turns the weapon at most ATTACK_TURN_LIMIT (${ATTACK_TURN_LIMIT}°) a frame from the carry into the wind-up and from the follow-through back to the carry`, () => {
    const steps = [
      ["carry → key 0", carry, keys[0]],
      ["key 0 → key 1", keys[0], keys[1]],
      ["key 4 → key 5", keys[4], keys[5]],
      ["key 5 → key 6", keys[5], keys[6]],
      ["key 6 → carry", keys[6], carry],
    ];
    for (const [step, a, b] of steps) expect(turnOf(rig, gear, a, b), `${name} ${step}`).toBeLessThanOrEqual(ATTACK_TURN_LIMIT);
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

/**
 * A slash (FS-2325V § Change: The class attacks move with weight and cut deep R1–R3, R10): the
 * blade's point, keyed on the class's rig and style, cutting a full diagonal from above the
 * character's right shoulder to below its left hip (its left is +x), the strike in the middle.
 */
describe.each([
  ["knight", KNIGHT_BUILD, KNIGHT_STYLE, KNIGHT_SHEET],
  ["mercenary", MERCENARY_BUILD, MERCENARY_STYLE, MERCENARY_SHEET],
])("the %s's slash cuts deep, with weight (FS-2325V § Change: The class attacks move with weight and cut deep R1–R3, R10)", (name, build, style, sheet) => {
  const rig = rigOf(build);
  const gear = GEAR[name](rig);
  const point = gear.weapon.at(-1);
  const keys = clipsFor(style, sheet.animations).attack;
  const path = attackPath(rig, point, keys);
  const STRIKE = 3;
  const joints = keys.map((p) => (posed(rig, p), { shoulderR: at(rig, "upperArmR").divideScalar(rig.H), hipL: at(rig, "thighL").divideScalar(rig.H), hips: at(rig, "hips").divideScalar(rig.H) }));

  it("keeps 7 keys at 12 fps", () => {
    expect([sheet.animations.attack.frames, sheet.animations.attack.fps]).toEqual([7, 12]);
    expect(keys).toHaveLength(7);
  });

  it("winds the point up high on the right, above the shoulder, and cuts through to low on the left, below the hip, the strike between", () => {
    // the wind-up's height: its highest key before the strike (key 0 now rises from the low carry)
    const high = path.slice(0, STRIKE).reduce((h, s, i) => (s.tip.y > path[h].tip.y ? i : h), 0);
    expect(path[high].tip.y, "wound up above the right shoulder").toBeGreaterThan(joints[high].shoulderR.y);
    expect(path[high].tip.x, "wound up right of the right shoulder").toBeLessThan(joints[high].shoulderR.x);
    const low = path.findIndex((s, i) => i > STRIKE && s.tip.y < joints[i].hips.y && s.tip.x > joints[i].hipL.x);
    expect(low, "through to below and left of the left hip").toBeGreaterThan(STRIKE);
    // the strike crosses the front between them
    expect(path[STRIKE].tip.y).toBeLessThan(path[high].tip.y);
    expect(path[STRIKE].tip.y).toBeGreaterThan(path[low].tip.y);
    expect(path[STRIKE].tip.x).toBeGreaterThan(path[high].tip.x);
    expect(path[STRIKE].tip.x).toBeLessThan(path[low].tip.x);
  });

  it("winds up with the weight back and steps onto the front foot at the strike", () => {
    const wind = path.slice(0, STRIKE).reduce((a, b) => (b.z < a.z ? b : a));
    expect(wind.z).toBeLessThan(0);
    expect(path[STRIKE].z - wind.z).toBeGreaterThanOrEqual(0.03);
  });

  it("turns the pelvis into the cut before the chest", () => {
    const w = path.slice(0, STRIKE).reduce((a, b, i) => (b.chest < path[a].chest ? i : a), 0);
    const half = (part) => {
      const [from, to] = [path[w][part], path[STRIKE][part]];
      return path.findIndex((s, i) => i > w && (s[part] - from) / (to - from) >= 0.5);
    };
    expect(path[STRIKE].hips - path[w].hips, "the pelvis turns").toBeGreaterThanOrEqual(0.2);
    expect(half("hips")).toBeLessThan(half("chest"));
  });

  it("moves the point on a curve, eased at the ends, fastest through the strike", () => {
    const steps = path.slice(1).map((s, i) => s.tip.distanceTo(path[i].tip));
    const total = steps.reduce((a, b) => a + b, 0);
    expect(Math.max(...steps) / total).toBeLessThanOrEqual(0.4);
    const fast = Math.max(steps[STRIKE - 1], steps[STRIKE]);
    expect(fast).toBeGreaterThan(steps[0]);
    expect(fast).toBeGreaterThan(steps.at(-1));
  });
});

describe("the knight's shield guards through the cut (FS-2325V § Change: The class attacks move with weight and cut deep R3, R10)", () => {
  const rig = rigOf(KNIGHT_BUILD);
  const gear = GEAR.knight(rig);
  it("keeps the shield's centre before the chest and above the waist on every key of attack, walk_attack and backpedal_attack", () => {
    const clips = clipsFor(KNIGHT_STYLE, KNIGHT_SHEET.animations);
    for (const anim of ["attack", "walk_attack", "backpedal_attack"])
      clips[anim]?.forEach((p, i) => {
        posed(rig, p);
        const c = world(gear.other[0]).divideScalar(rig.H);
        const [chest, hips] = [at(rig, "chest").divideScalar(rig.H), at(rig, "hips").divideScalar(rig.H)];
        expect(c.y, `${anim} @${i}: above the waist`).toBeGreaterThan(hips.y + 0.05);
        expect(c.z, `${anim} @${i}: before the chest`).toBeGreaterThan(chest.z + 0.05);
      });
  });
});

describe("the mercenary cuts wider and lighter than the knight (FS-2325V § Change: The class attacks move with weight and cut deep R10)", () => {
  const paths = Object.fromEntries(
    [
      ["knight", KNIGHT_BUILD, KNIGHT_STYLE, KNIGHT_SHEET],
      ["mercenary", MERCENARY_BUILD, MERCENARY_STYLE, MERCENARY_SHEET],
    ].map(([name, build, style, sheet]) => {
      const rig = rigOf(build);
      return [name, { rig, keys: clipsFor(style, sheet.animations).attack, path: attackPath(rig, GEAR[name](rig).weapon.at(-1), clipsFor(style, sheet.animations).attack) }];
    }),
  );
  const length = (path) => path.slice(1).reduce((n, s, i) => n + s.tip.distanceTo(path[i].tip), 0);
  const turn = (path) => Math.max(...path.map((s) => s.chest)) - Math.min(...path.map((s) => s.chest));

  it("the knight's arcs shorter and lower, the mercenary's trunk turning further", () => {
    expect(length(paths.knight.path)).toBeLessThan(length(paths.mercenary.path));
    expect(Math.max(...paths.knight.path.map((s) => s.tip.y))).toBeLessThan(Math.max(...paths.mercenary.path.map((s) => s.tip.y)));
    expect(turn(paths.knight.path)).toBeLessThan(turn(paths.mercenary.path));
  });

  it("throws the mercenary's free hand out and back against the cut at the strike and through it", () => {
    const { rig, keys } = paths.mercenary;
    for (const k of [3, 4]) {
      posed(rig, keys[k]);
      const [hand, shoulder, chest] = [at(rig, "handL"), at(rig, "upperArmL"), at(rig, "chest")].map((v) => v.divideScalar(rig.H));
      expect(hand.x - shoulder.x, `key ${k}: out to his left`).toBeGreaterThanOrEqual(0.05);
      expect(chest.z - hand.z, `key ${k}: back behind the chest`).toBeGreaterThanOrEqual(0.03);
    }
  });

  it("keeps the mercenary's parry as it was: raised from his carry into his guard (FS-MAMHR §G.35)", () => {
    expect(MERCENARY_SHEET.animations.parry).toEqual(MERC_ANIMATIONS.parry);
    const frames = parryClip(MERCENARY_STYLE, MERC_ANIMATIONS.parry.frames);
    for (const [bone, want] of Object.entries({ upperArmR: [-0.81, -0.54, -0.03], handR: [-0.06, 1.01, -0.8], foreArmR: [-1.37, 0, 0] }))
      want.forEach((v, j) => expect(frames.at(-1).b[bone][j], bone).toBeCloseTo(v, 9));
  });
});
