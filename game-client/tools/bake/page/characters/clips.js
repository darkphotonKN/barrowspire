// Hand-keyed clips on the shared rig (ADR-0021 §3, FS-2325V §E.1–E.2): idle, walk, a class
// attack and death, plus spring-lagged secondary motion for cloaks, robes and beards.
//
// A pose is { b: { bone: [rx, ry, rz] }, body: { rx, rz, x, z }, fx: { … } }. Bone angles are
// offsets on top of the rig's rest pose, in radians, Euler XYZ. Signs, for a limb hanging along
// -y in a model facing +z: +rx swings it BACK, -rx swings it forward; +rx on a shin folds the
// knee; +rx on a foot points the toes down. The character's left is +x.
//
// The walk is keyed the classical way: contact, down, passing, up for one step, mirrored for the
// other. Feet are planted by construction: after posing, the body is lowered until its lowest
// sole touches the ground (groundPose), so the hips drop at the down pose and rise at passing.

import * as THREE from "three";

/** Frame counts and rates. Idle and walk loop; attack and death play once and hold. */
export const ANIMATIONS = {
  idle: { frames: 6, fps: 5, loop: true },
  walk: { frames: 8, fps: 10, loop: true },
  attack: { frames: 7, fps: 12, loop: false },
  death: { frames: 7, fps: 9, loop: false },
};

// --- pose algebra --------------------------------------------------------------------------

const ZERO = [0, 0, 0];

export function pose(b = {}, body = {}, fx = {}) {
  return { b, body, fx };
}

/** Sum of poses: bone angles and body offsets add; later fx win. */
export function add(...ps) {
  const out = pose();
  for (const p of ps) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p.b ?? {})) {
      const o = out.b[k] ?? ZERO;
      out.b[k] = [o[0] + v[0], o[1] + v[1], o[2] + v[2]];
    }
    for (const [k, v] of Object.entries(p.body ?? {})) out.body[k] = (out.body[k] ?? 0) + v;
    Object.assign(out.fx, p.fx ?? {});
  }
  return out;
}

const swapSide = (name) => (name.endsWith("L") ? `${name.slice(0, -1)}R` : name.endsWith("R") ? `${name.slice(0, -1)}L` : name);

/** Left-right mirror: swap L/R bones, negate the y and z rotations and lateral offsets. */
export function mirror(p) {
  const out = pose({}, { ...p.body }, { ...p.fx });
  for (const [n, v] of Object.entries(p.b)) out.b[swapSide(n)] = [v[0], -v[1], -v[2]];
  if (out.body.rz) out.body.rz = -out.body.rz;
  if (out.body.x) out.body.x = -out.body.x;
  return out;
}

function lerp4(a, b, c, d, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

/** A pose between keyframes (Catmull-Rom), at fractional frame `f`. */
export function sample(frames, f, loop) {
  const n = frames.length;
  const idx = (i) => (loop ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  const i = Math.floor(f);
  const t = f - i;
  const [a, b, c, d] = [frames[idx(i - 1)], frames[idx(i)], frames[idx(i + 1)], frames[idx(i + 2)]];
  const out = pose({}, {}, { ...(t < 0.5 ? b.fx : c.fx) });
  const keys = new Set([a, b, c, d].flatMap((p) => Object.keys(p.b)));
  for (const k of keys) {
    const g = (p) => p.b[k] ?? ZERO;
    out.b[k] = [0, 1, 2].map((j) => lerp4(g(a)[j], g(b)[j], g(c)[j], g(d)[j], t));
  }
  const bodyKeys = new Set([a, b, c, d].flatMap((p) => Object.keys(p.body)));
  for (const k of bodyKeys) {
    const g = (p) => p.body[k] ?? 0;
    out.body[k] = lerp4(g(a), g(b), g(c), g(d), t);
  }
  for (const k of ["glow", "jaw", "draw", "ik"]) {
    const g = (p) => p.fx[k] ?? 0;
    if ([a, b, c, d].some((p) => k in p.fx)) out.fx[k] = lerp4(g(a), g(b), g(c), g(d), t);
  }
  return out;
}

// --- the walk ------------------------------------------------------------------------------

/**
 * One step, right foot leading: contact, down, passing, up. Feet angles here are LOCAL (they
 * include cancelling the leg above so the sole is flat, toe-up or heel-up in the world).
 */
const STEP = {
  thighR: [-0.46, -0.34, -0.02, 0.26],
  shinR: [0.06, 0.32, 0.14, 0.1],
  footR: [0.12, 0.02, -0.12, -0.16],
  thighL: [0.34, 0.2, -0.22, -0.42],
  shinL: [0.28, 0.78, 1.02, 0.35],
  footL: [-0.14, -0.52, -0.7, -0.12],
  upperArmR: [0.32, 0.2, 0.0, -0.18],
  foreArmR: [-0.12, -0.18, -0.26, -0.36],
  upperArmL: [-0.36, -0.22, 0.02, 0.2],
  foreArmL: [-0.42, -0.32, -0.22, -0.14],
  hipsY: [0.1, 0.06, 0, -0.06],
  chestY: [-0.16, -0.1, 0, 0.1],
  hipsZ: [-0.02, -0.06, -0.03, 0],
  chestZ: [0.01, 0.04, 0.02, 0],
};

/** The 8-frame walk for a style: stride, knee fold, arm swing per arm, lean, twist, holds. */
export function walkCycle(style) {
  const w = { stride: 1, knee: 1, arms: [1, 1], lean: 0.05, twist: 1, ...(style.walk ?? {}) };
  const half = [0, 1, 2, 3].map((i) => {
    const leg = (name, k = 1) => [STEP[name][i] * k, 0, 0];
    return pose({
      thighR: leg("thighR", w.stride),
      thighL: leg("thighL", w.stride),
      shinR: leg("shinR", w.knee),
      shinL: leg("shinL", w.knee),
      // keep each sole's world angle when the stride or knee fold is scaled
      footR: [STEP.footR[i] + STEP.thighR[i] * (1 - w.stride) + STEP.shinR[i] * (1 - w.knee), 0, 0],
      footL: [STEP.footL[i] + STEP.thighL[i] * (1 - w.stride) + STEP.shinL[i] * (1 - w.knee), 0, 0],
      upperArmR: [STEP.upperArmR[i] * w.arms[1], 0, 0],
      foreArmR: [STEP.foreArmR[i] * w.arms[1], 0, 0],
      upperArmL: [STEP.upperArmL[i] * w.arms[0], 0, 0],
      foreArmL: [STEP.foreArmL[i] * w.arms[0], 0, 0],
      hips: [0, STEP.hipsY[i] * w.twist, STEP.hipsZ[i]],
      spine: [w.lean * 0.5, STEP.chestY[i] * 0.4 * w.twist, STEP.chestZ[i] * 0.5],
      chest: [w.lean * 0.5, STEP.chestY[i] * 0.6 * w.twist, STEP.chestZ[i] * 0.5],
      neck: [0, -STEP.chestY[i] * 0.4 * w.twist, 0],
    });
  });
  const frames = [...half, ...half.map(mirror)];
  return frames.map((p, i) => add(p, style.hold, style.walkExtra?.(i)));
}

// --- idle ----------------------------------------------------------------------------------

/** Breathing and a slow weight shift over one loop. */
export function idleCycle(style, n) {
  const k = style.idle ?? {};
  return Array.from({ length: n }, (_, i) => {
    const ph = (i / n) * Math.PI * 2;
    const breathe = Math.sin(ph);
    const shift = Math.sin(ph + 0.7);
    return add(
      pose(
        {
          hips: [0, 0.02 * shift, 0.028 * shift],
          thighL: [-0.05, 0, 0.05 - 0.028 * shift],
          thighR: [0.02, 0, -0.05 - 0.028 * shift],
          shinL: [0.1 + 0.03 * Math.max(0, shift), 0, 0],
          shinR: [0.08 + 0.03 * Math.max(0, -shift), 0, 0],
          footL: [-0.05, 0, 0],
          footR: [-0.1, 0, 0],
          spine: [(k.lean ?? 0.03) - 0.012 * breathe, 0, -0.018 * shift],
          chest: [-0.022 * breathe, -0.01 * shift, -0.012 * shift],
          neck: [0.015 * breathe, 0.04 * Math.sin(ph * 0.5 + 1), 0.02 * shift],
          upperArmL: [0.02 * breathe, 0, 0.025 * breathe],
          upperArmR: [0.02 * breathe, 0, -0.025 * breathe],
          foreArmL: [-0.18 - 0.03 * breathe, 0, 0],
          foreArmR: [-0.18 - 0.03 * breathe, 0, 0],
        },
        { x: 0.006 * shift },
      ),
      style.hold,
      style.idleExtra?.(i, ph),
    );
  });
}

// --- attacks -------------------------------------------------------------------------------

/** A fighting stance: left foot forward, right hip back. */
const STANCE = pose({
  hips: [0, -0.28, 0],
  spine: [0.06, 0.1, 0],
  chest: [0.02, 0.1, 0],
  neck: [0, 0.08, 0],
  thighL: [-0.34, 0, 0.06],
  shinL: [0.3, 0, 0],
  footL: [0.02, 0, 0],
  thighR: [0.22, 0, -0.08],
  shinR: [0.26, 0, 0],
  footR: [-0.46, 0, 0],
});

const P = pose;

export const ATTACKS = {
  /** Knight: overhead diagonal slash behind the shield. */
  slash: () => [
    P({ upperArmR: [-0.5, 0, -0.1], foreArmR: [-0.9, 0, 0], handR: [0.2, 0, 0], upperArmL: [-0.6, -0.85, 0.12], foreArmL: [-1.25, 0, 0] }),
    P({ upperArmR: [-2.3, 0.2, -0.55], foreArmR: [-1.35, 0, 0], handR: [0.5, 0, 0], chest: [-0.1, -0.45, 0], spine: [-0.06, -0.2, 0], upperArmL: [-0.75, -0.8, 0.15], foreArmL: [-1.3, 0, 0] }),
    P({ upperArmR: [-2.4, 0.1, -0.3], foreArmR: [-0.7, 0, 0], handR: [0.2, 0, 0], chest: [-0.04, -0.2, 0], upperArmL: [-0.7, -0.8, 0.12], foreArmL: [-1.3, 0, 0] }),
    P({ upperArmR: [-1.25, 0.5, 0.25], foreArmR: [-0.2, 0, 0], handR: [-0.15, 0, 0], chest: [0.18, 0.4, 0], spine: [0.12, 0.2, 0], upperArmL: [-0.45, -0.9, 0.2], foreArmL: [-1.15, 0, 0] }, { z: 0.035 }),
    P({ upperArmR: [-0.55, 0.7, 0.5], foreArmR: [-0.35, 0, 0], handR: [-0.35, 0, 0], chest: [0.22, 0.55, 0], spine: [0.14, 0.25, 0], upperArmL: [-0.4, -0.9, 0.2], foreArmL: [-1.1, 0, 0] }, { z: 0.04 }),
    P({ upperArmR: [-0.55, 0.3, 0.2], foreArmR: [-0.7, 0, 0], handR: [0.0, 0, 0], chest: [0.1, 0.2, 0], upperArmL: [-0.5, -0.85, 0.15], foreArmL: [-1.2, 0, 0] }, { z: 0.02 }),
    P({ upperArmR: [-0.5, 0, -0.1], foreArmR: [-0.9, 0, 0], handR: [0.2, 0, 0], upperArmL: [-0.6, -0.85, 0.12], foreArmL: [-1.25, 0, 0] }),
  ].map((p) => add(STANCE, p)),

  /**
   * Archer: side-on stance, bow arm straight at the target, draw to the jaw, loose, recover.
   * `ik` pulls the right hand along the arrow line (0 at the bow, 1 at full draw; the archer's
   * hook solves the arm), `draw` makes the string follow it, `arrow` shows the nocked arrow.
   */
  shot: () => {
    // chest turned 1 rad right so the left shoulder leads; the bow arm swings 1 rad back left,
    // so it points straight along the facing. handL turns the grip so the bow stands upright.
    const bowStance = pose({
      hips: [0, -0.5, 0],
      spine: [0, -0.25, 0],
      chest: [0, -0.25, 0],
      neck: [0, 0.85, 0],
      thighL: [-0.18, 0, 0.12],
      shinL: [0.12, 0, 0],
      footL: [0.06, 0, 0],
      thighR: [0.12, 0, -0.12],
      shinR: [0.1, 0, 0],
      footR: [-0.22, 0, 0],
      foreArmL: [0, 0, 0],
      handL: [0, 1.57, 0],
    });
    const aim = (raise, ry = -0.57) => ({ upperArmL: [0, ry, raise] });
    return [
      P({ ...aim(0.95, -0.4), upperArmR: [-0.6, 0, -0.1], foreArmR: [-1.4, 0, 0] }, {}, { arrow: 1, ik: 0.1, draw: 0 }),
      P({ ...aim(1.47) }, {}, { arrow: 1, ik: 0.5, draw: 1 }),
      P({ ...aim(1.47) }, {}, { arrow: 1, ik: 1, draw: 1 }),
      P({ ...aim(1.47), chest: [-0.03, 0, 0] }, {}, { arrow: 1, ik: 1.02, draw: 1 }),
      P({ ...aim(1.47), chest: [-0.05, 0, 0] }, {}, { ik: 1.3, draw: 0 }),
      P({ ...aim(1.1, -0.45), upperArmR: [-0.3, -0.3, -0.3], foreArmR: [-0.9, 0, 0] }, {}, {}),
      P({ ...aim(0.55, -0.3), upperArmR: [-0.1, 0, -0.1], foreArmR: [-0.6, 0, 0] }, {}, {}),
    ].map((p) => add(bowStance, p));
  },

  /** Wizard: gather, raise the staff, thrust it forward with an open palm, the orb flaring. */
  cast: () => [
    P({ upperArmR: [-0.3, 0, -0.08], foreArmR: [-1.15, 0, 0], upperArmL: [0.15, 0, 0.15], foreArmL: [-0.8, 0, 0] }, {}, { glow: 1.2 }),
    P({ upperArmR: [-1.0, 0, -0.12], foreArmR: [-1.25, 0, 0], handR: [0.3, 0, 0], upperArmL: [0.35, 0, 0.35], foreArmL: [-1.4, 0, 0], chest: [-0.12, -0.15, 0], spine: [-0.06, 0, 0] }, {}, { glow: 2 }),
    P({ upperArmR: [-2.1, 0, -0.15], foreArmR: [-0.6, 0, 0], handR: [0.5, 0, 0], upperArmL: [0.2, 0, 0.5], foreArmL: [-1.6, 0, 0], chest: [-0.18, -0.2, 0], spine: [-0.08, 0, 0] }, {}, { glow: 3.2 }),
    P({ upperArmR: [-1.35, 0, -0.1], foreArmR: [-0.3, 0, 0], handR: [0.2, 0, 0], upperArmL: [-1.45, -0.2, 0.0], foreArmL: [-0.1, 0, 0], handL: [-0.9, 0, 0], chest: [0.15, 0.2, 0], spine: [0.1, 0, 0] }, { z: 0.03 }, { glow: 5 }),
    P({ upperArmR: [-1.25, 0, -0.1], foreArmR: [-0.35, 0, 0], handR: [0.2, 0, 0], upperArmL: [-1.35, -0.2, 0.0], foreArmL: [-0.2, 0, 0], handL: [-0.7, 0, 0], chest: [0.12, 0.15, 0], spine: [0.08, 0, 0] }, { z: 0.03 }, { glow: 3.5 }),
    P({ upperArmR: [-0.6, 0, -0.08], foreArmR: [-0.9, 0, 0], upperArmL: [-0.4, 0, 0.1], foreArmL: [-0.6, 0, 0] }, { z: 0.01 }, { glow: 1.8 }),
    P({ upperArmR: [-0.3, 0, -0.08], foreArmR: [-1.15, 0, 0], upperArmL: [0.15, 0, 0.15], foreArmL: [-0.8, 0, 0] }, {}, { glow: 1.2 }),
  ].map((p) =>
    add(
      pose({ thighL: [-0.25, 0, 0.05], shinL: [0.22, 0, 0], footL: [0.03, 0, 0], thighR: [0.15, 0, -0.06], shinR: [0.18, 0, 0], footR: [-0.33, 0, 0], hips: [0, -0.15, 0] }),
      p,
    ),
  ),

  /** Ghoul: a lunging overhead chop, jaw gaping. */
  chop: () => [
    P({ upperArmR: [-0.8, 0, -0.15], foreArmR: [-0.6, 0, 0], upperArmL: [-0.8, 0, 0.15], foreArmL: [-0.5, 0, 0] }, {}, { jaw: 0.1 }),
    P({ upperArmR: [-2.6, 0, -0.35], foreArmR: [-1.2, 0, 0], handR: [0.4, 0, 0], upperArmL: [-1.0, 0, 0.4], foreArmL: [-0.4, 0, 0], chest: [-0.25, -0.25, 0], neck: [-0.2, 0, 0] }, {}, { jaw: 0.6 }),
    P({ upperArmR: [-2.7, 0, -0.2], foreArmR: [-0.5, 0, 0], handR: [0.2, 0, 0], upperArmL: [-0.9, 0, 0.5], foreArmL: [-0.3, 0, 0], chest: [-0.2, -0.1, 0], neck: [-0.25, 0, 0] }, {}, { jaw: 0.75 }),
    P({ upperArmR: [-1.0, 0.2, 0.1], foreArmR: [-0.15, 0, 0], handR: [-0.3, 0, 0], upperArmL: [-0.2, 0, 0.5], foreArmL: [-0.3, 0, 0], chest: [0.35, 0.3, 0], spine: [0.15, 0, 0] }, { z: 0.06 }, { jaw: 0.5 }),
    P({ upperArmR: [-0.4, 0.3, 0.2], foreArmR: [-0.3, 0, 0], handR: [-0.4, 0, 0], upperArmL: [-0.2, 0, 0.4], foreArmL: [-0.4, 0, 0], chest: [0.4, 0.35, 0], spine: [0.15, 0, 0] }, { z: 0.06 }, { jaw: 0.3 }),
    P({ upperArmR: [-0.6, 0, 0], foreArmR: [-0.5, 0, 0], upperArmL: [-0.5, 0, 0.2], foreArmL: [-0.5, 0, 0], chest: [0.15, 0.1, 0] }, { z: 0.03 }, { jaw: 0.15 }),
    P({ upperArmR: [-0.8, 0, -0.15], foreArmR: [-0.6, 0, 0], upperArmL: [-0.8, 0, 0.15], foreArmL: [-0.5, 0, 0] }, {}, { jaw: 0.1 }),
  ].map((p) => add(STANCE, p)),

  /** Troll: a roaring overhead smash with the club. */
  smash: () => [
    P({ upperArmR: [-0.4, 0, -0.2], foreArmR: [-0.6, 0, 0] }, {}, { jaw: 0.1 }),
    P({ upperArmR: [-2.5, 0.2, -0.5], foreArmR: [-1.3, 0, 0], handR: [0.4, 0, 0], upperArmL: [-0.8, 0, 0.5], foreArmL: [-0.6, 0, 0], chest: [-0.3, -0.35, 0], spine: [-0.1, -0.1, 0], neck: [-0.3, 0, 0] }, {}, { jaw: 0.7 }),
    P({ upperArmR: [-2.8, 0.1, -0.3], foreArmR: [-0.9, 0, 0], handR: [0.3, 0, 0], upperArmL: [-0.9, 0, 0.6], foreArmL: [-0.5, 0, 0], chest: [-0.32, -0.2, 0], neck: [-0.35, 0, 0] }, {}, { jaw: 0.85 }),
    P({ upperArmR: [-1.1, 0.3, 0.1], foreArmR: [-0.1, 0, 0], handR: [-0.3, 0, 0], upperArmL: [-0.3, 0, 0.5], foreArmL: [-0.4, 0, 0], chest: [0.4, 0.3, 0], spine: [0.2, 0.1, 0], neck: [0.1, 0, 0] }, { z: 0.04 }, { jaw: 0.6 }),
    P({ upperArmR: [-0.5, 0.35, 0.2], foreArmR: [-0.2, 0, 0], handR: [-0.4, 0, 0], upperArmL: [-0.2, 0, 0.4], foreArmL: [-0.4, 0, 0], chest: [0.45, 0.35, 0], spine: [0.2, 0.1, 0] }, { z: 0.04 }, { jaw: 0.3 }),
    P({ upperArmR: [-0.4, 0.1, -0.1], foreArmR: [-0.5, 0, 0], upperArmL: [-0.3, 0, 0.3], foreArmL: [-0.4, 0, 0], chest: [0.2, 0.1, 0] }, { z: 0.02 }, { jaw: 0.15 }),
    P({ upperArmR: [-0.4, 0, -0.2], foreArmR: [-0.6, 0, 0] }, {}, { jaw: 0.1 }),
  ].map((p) => add(STANCE, p)),
};

// --- death ---------------------------------------------------------------------------------

/**
 * Struck, knees buckle, drop to the knees, topple forward and settle. The body slides back as it
 * falls so the corpse lies across the footprint rather than a body-length ahead of it.
 */
export function deathClip(style) {
  const frames = [
    P({ chest: [-0.28, 0.12, 0], neck: [-0.35, 0, 0], upperArmL: [-0.7, 0, 0.55], upperArmR: [-0.7, 0, -0.55], foreArmL: [-0.5, 0, 0], foreArmR: [-0.5, 0, 0], thighL: [-0.05, 0, 0.04], thighR: [0.12, 0, -0.04], shinL: [0.1, 0, 0], shinR: [0.15, 0, 0], footR: [-0.2, 0, 0] }, { z: -0.02 }),
    P({ spine: [0.1, 0, 0], chest: [0.12, -0.1, 0.05], neck: [0.3, 0, 0], upperArmL: [-0.2, 0, 0.25], upperArmR: [-0.1, 0, -0.2], foreArmL: [-0.3, 0, 0], foreArmR: [-0.3, 0, 0], thighL: [-0.55, 0, 0.05], thighR: [-0.4, 0, -0.05], shinL: [0.9, 0, 0], shinR: [0.8, 0, 0], footL: [-0.3, 0, 0], footR: [-0.35, 0, 0] }),
    P({ spine: [0.25, 0, 0], chest: [0.25, -0.1, 0.08], neck: [0.35, 0, 0], upperArmL: [-0.35, 0, 0.1], upperArmR: [-0.3, 0, -0.1], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0], thighL: [-1.25, 0, 0.08], thighR: [-1.15, 0, -0.08], shinL: [2.0, 0, 0], shinR: [1.9, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0] }, { z: -0.08 }),
    P({ spine: [0.3, 0, 0], chest: [0.3, -0.05, 0.1], neck: [0.2, 0, 0], upperArmL: [-0.9, 0, 0.2], upperArmR: [-0.8, 0, -0.2], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0], thighL: [-1.0, 0, 0.08], thighR: [-0.9, 0, -0.08], shinL: [1.6, 0, 0], shinR: [1.5, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0] }, { rx: 0.55, z: -0.22 }),
    P({ spine: [0.15, 0, 0], chest: [0.1, 0, 0.1], neck: [-0.1, 0, 0], upperArmL: [-1.3, 0, 0.25], upperArmR: [-1.2, 0, -0.25], foreArmL: [-0.5, 0, 0], foreArmR: [-0.5, 0, 0], thighL: [-0.5, 0, 0.08], thighR: [-0.45, 0, -0.1], shinL: [0.9, 0, 0], shinR: [0.8, 0, 0], footL: [0.3, 0, 0], footR: [0.3, 0, 0] }, { rx: 1.15, z: -0.36 }),
    P({ spine: [0.0, 0, 0], chest: [0.0, 0.1, 0.05], neck: [-0.3, 0.6, 0], upperArmL: [-1.1, 0, 0.45], upperArmR: [-0.35, 0, -0.35], foreArmL: [-0.9, 0, 0], foreArmR: [-0.3, 0, 0], thighL: [-0.12, 0, 0.05], thighR: [-0.3, 0, -0.06], shinL: [0.4, 0, 0], shinR: [0.25, 0, 0], footL: [0.5, 0, 0], footR: [0.45, 0, 0] }, { rx: 1.5, z: -0.44 }),
    P({ spine: [-0.03, 0, 0], chest: [-0.03, 0.12, 0.05], neck: [-0.35, 0.75, 0], upperArmL: [-1.2, 0, 0.5], upperArmR: [-0.3, 0, -0.3], foreArmL: [-1.0, 0, 0], foreArmR: [-0.25, 0, 0], thighL: [-0.08, 0, 0.05], thighR: [-0.32, 0, -0.06], shinL: [0.3, 0, 0], shinR: [0.7, 0, 0], footL: [0.6, 0, 0], footR: [0.55, 0, 0] }, { rx: 1.54, z: -0.46 }),
  ];
  return frames.map((p, i) => add(p, style.deathExtra?.(i)));
}

/** Every animation's key poses for a style, keyed by manifest animation name. */
export function clipsFor(style) {
  return {
    idle: idleCycle(style, ANIMATIONS.idle.frames),
    walk: walkCycle(style),
    attack: ATTACKS[style.attack]().map((p) => add(p, style.attackExtra)),
    death: deathClip(style),
  };
}

// --- applying a pose -----------------------------------------------------------------------

const _v = new THREE.Vector3();

/** Sets every bone from rest + pose (spring bones from `springAngles` when given). */
export function applyPose(rig, p, springAngles) {
  const H = rig.H;
  for (const [name, b] of Object.entries(rig.bones)) {
    const rest = rig.rest[name] ?? ZERO;
    const d = p.b[name] ?? ZERO;
    b.rotation.set(rest[0] + d[0], rest[1] + d[1], rest[2] + d[2]);
  }
  if (springAngles)
    for (const s of rig.springs) {
      const a = springAngles[s.bone];
      if (a) rig.bones[s.bone].rotation.set(a[0], a[1], a[2]);
    }
  if (rig.bones.jaw && p.fx.jaw !== undefined) rig.bones.jaw.rotation.x = (rig.rest.jaw?.[0] ?? 0) + p.fx.jaw * 0.6;
  rig.body.rotation.set(p.body.rx ?? 0, 0, p.body.rz ?? 0);
  rig.body.position.set((p.body.x ?? 0) * H, 0, (p.body.z ?? 0) * H);
}

/** Lowers or lifts the body so its lowest grounded vertex touches y = 0. */
export function groundPose(rig) {
  rig.root.updateMatrixWorld(true);
  let min = Infinity;
  for (const m of rig.groundMeshes) {
    const pos = m.geometry.attributes.position;
    const skinnedMesh = m.isSkinnedMesh;
    for (let i = 0; i < pos.count; i += 2) {
      if (skinnedMesh) m.getVertexPosition(i, _v);
      else _v.fromBufferAttribute(pos, i);
      _v.applyMatrix4(m.matrixWorld);
      if (_v.y < min) min = _v.y;
    }
  }
  rig.body.position.y -= min;
  rig.root.updateMatrixWorld(true);
}

/**
 * Two-bone IK for an arm: turns upperArm and foreArm so the hand's grip lands on `target`
 * (model space), the elbow bending toward `pole`. The hand keeps its pose-relative rotation.
 */
export function solveArm(rig, side, target, pole, gripLocal) {
  const up = rig.bones[`upperArm${side}`];
  const fore = rig.bones[`foreArm${side}`];
  const hand = rig.bones[`hand${side}`];
  const L1 = fore.position.length();
  const L2 = hand.position.length() + gripLocal.length();
  rig.root.updateMatrixWorld(true);
  const s = new THREE.Vector3().setFromMatrixPosition(up.matrixWorld);
  const toT = new THREE.Vector3().subVectors(target, s);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
  const dir = toT.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const r = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = new THREE.Vector3().subVectors(pole, s);
  p.addScaledVector(dir, -p.dot(dir)).normalize();
  const elbow = s.clone().addScaledVector(dir, a).addScaledVector(p, r);
  const hit = s.clone().addScaledVector(dir, d);
  const aimBone = (bone, from, to) => {
    const q = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(q);
    const want = new THREE.Vector3().subVectors(to, from).normalize().applyQuaternion(q.invert());
    bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), want);
    rig.root.updateMatrixWorld(true);
  };
  aimBone(up, s, elbow);
  aimBone(fore, elbow, hit);
}

// --- secondary motion ----------------------------------------------------------------------

const DT = 1 / 240;
const _q = new THREE.Quaternion();
const _down = new THREE.Vector3();
const _a = new THREE.Vector3();

/**
 * Integrates every spring bone through a clip and returns its angles at each key frame.
 * Loops run three cycles and sample the last, so the loop closes; one-shots start from rest.
 * `speed` is the forward speed the walk implies (H per second), which drags cloth back;
 * `settle` lets cloth drape along a falling body; `calm` scales how hard fast moves fling it.
 */
export function simulateSprings(rig, frames, { fps, loop, speed = 0, settle = false, calm = 1 }) {
  if (rig.springs.length === 0) return frames.map(() => null);
  const n = frames.length;
  const state = {};
  for (const s of rig.springs) state[s.bone] = { th: [...s.rest], om: [0, 0, 0], prev: null, vel: null };
  const out = new Array(n).fill(null);
  const cycles = loop ? 3 : 1;
  const total = (n / fps) * cycles + (loop ? 0 : 0.6);
  const pre = loop ? 0 : 0.6;
  const steps = Math.ceil(total / DT);
  let nextFrame = 0;
  const angles = () => Object.fromEntries(rig.springs.map((s) => [s.bone, [...state[s.bone].th]]));
  for (let k = 0; k <= steps; k++) {
    const t = k * DT;
    const ft = Math.max(0, t - pre) * fps;
    const f = loop ? ft % n : Math.min(n - 1, ft);
    applyPose(rig, sample(frames, f, loop), angles());
    rig.root.updateMatrixWorld(true);
    for (const s of rig.springs) {
      const bone = rig.bones[s.bone];
      const st = state[s.bone];
      // a falling body: cloth drapes along it instead of swinging free
      const gravity = settle ? s.gravity * 0.1 : s.gravity;
      const inertia = settle ? 0 : s.inertia * calm;
      // the anchor (this bone's origin) in model space, carried forward at walking speed
      bone.getWorldPosition(_a);
      _a.z += speed * rig.H * t;
      const p = _a.clone();
      if (st.prev) {
        const v = p.clone().sub(st.prev).divideScalar(DT);
        const acc = st.vel ? v.clone().sub(st.vel).divideScalar(DT) : new THREE.Vector3();
        st.vel = v;
        // into the parent's frame
        bone.parent.getWorldQuaternion(_q).invert();
        acc.applyQuaternion(_q);
        const vl = v.clone().applyQuaternion(_q);
        _down.set(0, -1, 0).applyQuaternion(_q);
        const gx = Math.atan2(-_down.z, -_down.y);
        const gz = Math.atan2(_down.x, -_down.y);
        const G = 9.8 * rig.H * 0.5;
        const target = [
          s.rest[0] + (gx - s.rest[0]) * gravity + s.drag * (vl.z / rig.H) + inertia * (acc.z / G) + (settle ? s.drape : 0),
          s.rest[1],
          s.rest[2] + (gz - s.rest[2]) * gravity - inertia * (acc.x / G) - s.drag * 0.3 * (vl.x / rig.H),
        ];
        for (const j of [0, 2]) {
          if (!s.axes.includes(j === 0 ? "x" : "z")) continue;
          const tg = Math.max(s.rest[j] - s.limit, Math.min(s.rest[j] + s.limit, target[j]));
          st.om[j] += (s.stiffness * (tg - st.th[j]) - s.damping * st.om[j]) * DT;
          st.th[j] += st.om[j] * DT;
          st.th[j] = Math.max(s.rest[j] - s.limit, Math.min(s.rest[j] + s.limit, st.th[j]));
        }
      }
      st.prev = p;
    }
    // capture: loops in their last cycle, one-shots on their own timeline
    const capStart = loop ? (n / fps) * (cycles - 1) : pre;
    while (nextFrame < n && t >= capStart + nextFrame / fps - 1e-9) {
      out[nextFrame] = angles();
      nextFrame++;
    }
  }
  while (nextFrame < n) out[nextFrame++] = angles();
  return out;
}
