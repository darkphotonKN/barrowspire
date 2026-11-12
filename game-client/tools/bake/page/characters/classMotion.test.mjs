// The playable classes' own motion on their own rigs and styles (classStyles.js): the run of
// FS-JS7C8 R2 as each class carries it, the weapon kept out of the body and the head, and the
// attack of FS-2325V § Change: The class attacks move with weight and cut deep.
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { ATTACKS, ATTACK_TURN_LIMIT, RUN_ANIMATIONS, add, applyPose, clipsFor, groundPose, pose, runCycle, walkCycle } from "./clips.js";
import { attach, createRig, gripAt, jointAt as J, mount, rigidTube } from "./rig.js";
import { boots, coif, hair, head, legs, shortBeard } from "./anatomy.js";
import { VIEW_DIR } from "../projection.js";
import { FACINGS, yawFor } from "../facing.js";
import { footing, measurePace } from "./pace.js";
import {
  KNIGHT_BUILD,
  KNIGHT_SHEET,
  KNIGHT_STYLE,
  MERCENARY_BUILD,
  MERCENARY_SHEET,
  MERCENARY_STYLE,
  RUN_BLADE_ELEV,
  RUN_CROSS_REACH,
  RUN_TIP_CEIL,
  SCEPTRE_RUN_PEAK,
  SCEPTRE_RUN_TILT,
  SCEPTRE_TILT,
  WIZARD_BUILD,
  WIZARD_SHEET,
  WIZARD_STYLE,
} from "./classStyles.js";
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
 * What a blade-carrying class wears on its head bone, the meshes a run blade must keep out of and
 * never pass behind: the head (anatomy.js `head`), and the knight's mail coif and conical nasal helm
 * (`coif`; gear.js `nasalHelm`, its cone and brow band rebuilt here from its own sizes, since gear.js
 * reads the theme only the bake page serves), the mercenary's tied-back hair and beard (`hair`,
 * `shortBeard`, as cast.js dresses him). Double-sided, so a ray from inside meets them too.
 */
function headMeshes(rig, name) {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const before = new Set(rig.bones.head.children);
  head(rig, mat);
  if (name === "knight") {
    coif(rig, mat);
    const [, hy, hz] = J(rig, "head");
    const r = rig.p.headR;
    const cone = [
      { p: [0, hy + 0.058, hz - 0.004], r: [r * 1.15, r * 1.2] },
      { p: [0, hy + 0.095, hz - 0.006], r: [r * 1.02, r * 1.07] },
      { p: [0, hy + 0.138, hz - 0.004], r: [r * 0.55, r * 0.58] },
      { p: [0, hy + 0.176, hz + 0.002], r: [r * 0.07, r * 0.07] },
    ];
    const band = [
      { p: [0, hy + 0.054, hz - 0.004], r: [r * 1.19, r * 1.24] },
      { p: [0, hy + 0.068, hz - 0.004], r: [r * 1.17, r * 1.22] },
    ];
    attach(rig, "head", rigidTube(rig.H, cone, { segs: 20, steps: 3 }), mat);
    attach(rig, "head", rigidTube(rig.H, band, { segs: 20, steps: 1 }), mat);
  } else {
    hair(rig, mat, { tail: true });
    shortBeard(rig, mat, { full: 0.8 });
  }
  return rig.bones.head.children.filter((c) => c.isMesh && !before.has(c));
}

/** The camera's direction in model space for each facing (the bake's view turned back by the facing's yaw, as clearance.test.mjs reads it). */
const VIEWS = FACINGS.map((facing) => {
  const yaw = -yawFor(facing);
  return [facing, new THREE.Vector3(VIEW_DIR[0] * Math.cos(yaw) + VIEW_DIR[2] * Math.sin(yaw), VIEW_DIR[1], -VIEW_DIR[0] * Math.sin(yaw) + VIEW_DIR[2] * Math.cos(yaw)).normalize()];
});

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
 * `low` names the arm that pumps only to the lower chest ({@link SCEPTRE_RUN_PEAK}): the wizard's
 * sceptre arm. `runBlade` is the band a blade keeps in the run on that class's rig, degrees from
 * level (+ up), inside {@link RUN_BLADE_ELEV} (owner 2026-11-12: "騎士跟傭兵跑步時劍的角度可以再提起10到20度",
 * the knight's 5° below to 12° above and the mercenary's 8° below to 10° above each raised about 15°,
 * then "戰士 傭兵 跑步時提劍的角度再提升15度": the knight's 9-26° and the mercenary's 7-24° raised about
 * 15° again).
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
    runBlade: [23, 42],
  },
  {
    name: "mercenary",
    build: MERCENARY_BUILD,
    style: MERCENARY_STYLE,
    sheet: MERCENARY_SHEET,
    pump: ["L", "R"],
    rest: "point",
    runBlade: [21, 40],
  },
  {
    name: "wizard",
    build: WIZARD_BUILD,
    style: WIZARD_STYLE,
    sheet: WIZARD_SHEET,
    pump: ["L", "R"],
    low: "R",
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

describe.each(CLASSES)("the $name's fast run on its own rig and style (FS-JS7C8 R2, R3)", ({ name, build, style, pump, low, rest, runBlade }) => {
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

  it(`pumps its arms with the elbows bent about 90°, each ${low ? "free " : ""}hand to chest height and back past the hip`, () => {
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
      // the wizard's sceptre arm pumps only to the lower chest (its own test below)
      if (s !== low) {
        expect(front.hand.y, `${s} front`).toBeGreaterThan(front.chest.y);
        expect(front.hand.y, `${s} front`).toBeLessThan(front.shoulder.y);
      }
      expect((back.hips.z - back.hand.z) / rig.H, `${s} back`).toBeGreaterThanOrEqual(0.06);
    }
  });

  // owner, 2026-11-12, of the sceptre in the run: "只是要合理的位置 但跑步時為什麼手會擺到肩膀"
  if (low)
    it(`pumps the sceptre hand only to the lower chest, peaking at SCEPTRE_RUN_PEAK (${SCEPTRE_RUN_PEAK} H)`, () => {
      expect(SCEPTRE_RUN_PEAK).toBeGreaterThanOrEqual(0.6);
      expect(SCEPTRE_RUN_PEAK).toBeLessThanOrEqual(0.62);
      const peak = Math.max(...SAMPLES.map((f) => (pose8(f), at(rig, `hand${low}`).y / rig.H)));
      expect(Math.abs(peak - SCEPTRE_RUN_PEAK), `the sceptre hand's peak ${peak.toFixed(3)} H`).toBeLessThanOrEqual(0.01);
    });

  // owner, 2026-11-12: "拿武器的動作有點怪 武器的位置似乎太高了 擺動的時候舉得太高", "跑步時也不用太高",
  // then, of the held keys' fist turned over: "跑步時武器是不是拿反了", then of the low carry baked:
  // "目前跑步時 武器擺動位置有點不自然 跑的時候可以高一點 有點過垂" and, of the sceptre,
  // "只是要合理的位置 但跑步時為什麼手會擺到肩膀", then "騎士跟傭兵跑步時劍的角度可以再提起10到20度", then
  // "戰士 傭兵 跑步時提劍的角度再提升15度"
  it(
    rest === "point"
      ? `carries the blade raised above level on every sample (RUN_BLADE_ELEV, ${RUN_BLADE_ELEV?.join(" to ")}° from level; the ${name}'s ${runBlade?.join(" to ")}°), its tip ahead of the hand and the body, under RUN_TIP_CEIL (${RUN_TIP_CEIL} H)`
      : `carries the sceptre reasonably upright on every sample (SCEPTRE_RUN_TILT, ${SCEPTRE_RUN_TILT?.join("–")}° off vertical), the orb above the hand and ahead of it, clear of the robe`,
    () => {
      const gear = GEAR[name](rig);
      const tip = gear.weapon.at(-1);
      if (rest === "point") {
        expect(RUN_BLADE_ELEV[0], "the band's foot, raised above level").toBeGreaterThanOrEqual(20);
        // never back up to the old near-upright carry (74-85° above level)
        expect(RUN_BLADE_ELEV[1], "the band's top, short of upright").toBeLessThanOrEqual(50);
      }
      for (const f of SAMPLES) {
        pose8(f);
        const [hand, t, hips, head] = [at(rig, "handR"), world(tip), at(rig, "hips"), at(rig, "head")];
        const d = t.clone().sub(hand);
        const elev = Math.atan2(d.y, Math.hypot(d.x, d.z)) * DEG;
        if (rest === "point") {
          expect(elev, `blade @${f}`).toBeGreaterThanOrEqual(RUN_BLADE_ELEV[0]);
          expect(elev, `blade @${f}`).toBeLessThanOrEqual(RUN_BLADE_ELEV[1]);
          expect(elev, `the ${name}'s blade @${f}`).toBeGreaterThanOrEqual(runBlade[0]);
          expect(elev, `the ${name}'s blade @${f}`).toBeLessThanOrEqual(runBlade[1]);
          expect(t.z - hips.z, `tip ahead of the body @${f}`).toBeGreaterThan(0);
          // raised, the point now rises past the crown (the top of the head as \`inside\` models it),
          // but never past a ceiling a little above it (the head kept clear: the test below)
          expect(t.y / rig.H, `tip under RUN_TIP_CEIL @${f}`).toBeLessThan(RUN_TIP_CEIL);
        } else {
          expect(90 - elev, `sceptre off vertical @${f}`).toBeGreaterThanOrEqual(SCEPTRE_RUN_TILT[0]);
          expect(90 - elev, `sceptre off vertical @${f}`).toBeLessThanOrEqual(SCEPTRE_RUN_TILT[1]);
          for (const m of gear.weapon) expect(outsideRobe(rig, world(m)), `@${f}: the sceptre into the robe`).toBeGreaterThan(0);
        }
        expect(d.z, `tip ahead of the hand @${f}`).toBeGreaterThan(0);
      }
    },
  );

  // owner, 2026-11-12: "戰士 傭兵 跑步時提劍的角度再提升15度": raised, the point rises past the crown
  if (rest === "point")
    it("never passes the blade through the head, nor behind it, in any of the 8 facings", () => {
      const hr = rigOf(build);
      const heads = headMeshes(hr, name);
      // the head's front, bind space (H): the most forward of its meshes
      hr.root.updateMatrixWorld(true);
      const front = Math.max(...heads.map((m) => new THREE.Box3().setFromObject(m).max.z)) / hr.H;
      // the blade, pommel to point, sampled at twice the carry's points
      const pts = GEAR[name](hr).weapon;
      const blade = pts.flatMap((m, i) => {
        if (i === 0) return [m];
        const mid = new THREE.Object3D();
        mid.position.copy(pts[i - 1].position).lerp(m.position, 0.5);
        m.parent.add(mid);
        return [mid, m];
      });
      const rc = new THREE.Raycaster();
      for (const f of SAMPLES) {
        footing(hr, run, f);
        hr.root.updateMatrixWorld(true);
        const w = blade.map(world);
        // through: no segment of the blade crosses a head mesh's surface
        for (let i = 1; i < w.length; i++) {
          const d = w[i].clone().sub(w[i - 1]);
          rc.set(w[i - 1], d.clone().normalize());
          rc.far = d.length();
          expect(rc.intersectObjects(heads, false).length, `@${f}: blade segment ${i} through the head`).toBe(0);
        }
        // behind: wherever the head stands between a blade point and the camera, the point is ahead
        // of the face, as a back view shows a blade held before it; never beside or behind the head
        rc.far = Infinity;
        for (const [facing, v] of VIEWS)
          w.forEach((p, i) => {
            rc.set(p, v);
            if (!rc.intersectObjects(heads, false).length) return;
            expect(inBind(hr, "head", p).z, `${facing} @${f}: blade point ${i} behind the head`).toBeGreaterThan(front);
            // and only with his back to the camera (the view from behind him: n, nw, w)
            expect(v.z, `${facing} @${f}: blade point ${i} hidden by the head, facing the camera`).toBeLessThan(-0.5);
          });
      }
    });

  // owner, 2026-11-12: "武器可以往內側擺動一些"
  it(`swings the weapon hand in toward the midline at the front of the pump (RUN_CROSS_REACH, ${RUN_CROSS_REACH?.join("–")} H), across the front of the torso, and back out to the side behind${rest === "point" ? ", the blade angled across the body" : ""}`, () => {
    const tip = GEAR[name](rig).weapon.at(-1);
    const samples = SAMPLES.map((f) => {
      pose8(f);
      const [hand, hips, t] = [at(rig, "handR"), at(rig, "hips"), world(tip)];
      const d = t.clone().sub(hand);
      // the right hand's distance out from the midline (the character's right is -x)
      return { lat: (hips.x - hand.x) / rig.H, fz: hand.z - hips.z, across: Math.atan2(d.x, d.z) * DEG };
    });
    const front = samples.reduce((a, b) => (b.fz > a.fz ? b : a));
    const back = samples.reduce((a, b) => (b.fz < a.fz ? b : a));
    expect(back.lat - front.lat, "the hand's reach in, front against back").toBeGreaterThanOrEqual(RUN_CROSS_REACH[0]);
    expect(back.lat - front.lat, "the hand's reach in, front against back").toBeLessThanOrEqual(RUN_CROSS_REACH[1]);
    // in front of the torso: inside the chest's half width (anatomy.js `torso`)
    expect(front.lat, "the hand before the torso").toBeLessThan(0.112 * rig.p.torsoW);
    if (rest === "point") {
      expect(front.across, "the blade across the body at the front").toBeGreaterThanOrEqual(5);
      expect(front.across, "the blade across the body at the front").toBeLessThanOrEqual(30);
    }
  });

  it("keeps the weapon clear of the free arm on every sample", () => {
    const gear = GEAR[name](rig);
    const reach = 0.06 * rig.p.armR;
    for (const f of SAMPLES) {
      pose8(f);
      const chain = ["upperArmL", "foreArmL", "handL"].map((b) => at(rig, b));
      const seg = chain.slice(1).map((p, i) => new THREE.Line3(chain[i], p));
      for (const m of gear.weapon) {
        const w = world(m);
        const near = Math.min(...seg.map((l) => l.closestPointToPoint(w, true, new THREE.Vector3()).distanceTo(w)));
        expect(near / rig.H, `@${f}: the weapon into the free arm`).toBeGreaterThan(reach);
      }
    }
  });

  if (name === "knight")
    it("keeps the blade off the shield on every sample: never through its face", () => {
      const gear = GEAR.knight(rig);
      const shield = gear.other[0].parent;
      const inv = new THREE.Matrix4();
      // the kite shield's outline in its own frame (H): width along y, its long axis along z, its face the x = 0 plane
      const within = (p) => Math.abs(p.y) <= 0.115 && p.z >= -0.27 && p.z <= 0.145;
      for (const f of SAMPLES) {
        pose8(f);
        inv.copy(shield.matrixWorld).invert();
        const pts = gear.weapon.map((m) => world(m).applyMatrix4(inv).divideScalar(rig.H));
        pts.forEach((p, i) => {
          if (within(p)) expect(Math.abs(p.x), `@${f}: blade point ${i} in the shield`).toBeGreaterThan(0.02);
          const q = pts[i + 1];
          if (q && Math.sign(p.x) !== Math.sign(q.x)) expect(within(p.clone().lerp(q, p.x / (p.x - q.x))), `@${f}: the blade through the shield`).toBe(false);
        });
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
