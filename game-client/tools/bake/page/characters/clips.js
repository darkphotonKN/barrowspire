// Hand-keyed clips on the shared rig (ADR-0021 §3, FS-2325V §E.1–E.2): idle, walk, a class
// attack and death, a class's run and backpedal (FS-JS7C8), plus spring-lagged secondary motion
// for cloaks, robes and beards.
//
// A pose is { b: { bone: [rx, ry, rz] }, body: { rx, rz, x, y, z }, fx: { … } }. Bone angles are
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


/**
 * How many walk cycles the legs of `walk_attack` take while the upper body shoots once, on a
 * sheet without `run`. Such a class walks at about 2.7x (WALK_PACE in
 * src/render/art/animationSelect.ts: the server's 200 world px/s over the 74 px/s the 1x stride
 * covers), so one 8-frame cycle takes about 0.3 s, and the shot lasts 7 frames at 12 fps, 0.58 s:
 * two cycles fit it, so the feet stay nearly planted.
 */
export const WALK_ATTACK_CYCLES = 2;

/**
 * The same on a sheet that carries `run` (FS-JS7C8 R21, tuning FS-HF0WW): its class runs, and
 * attacking slows it to about 90 world px/s (the server's attack slow, 0.45 × 200), over which
 * one walk cycle (about 59 px) fits the 0.58 s swing, so the legs walk near their own pace.
 */
export const RUN_WALK_ATTACK_CYCLES = 1;

/**
 * `specs` with `walk_attack` added (FS-HF0WW, FS-3V7GC): the attack from the waist up over the
 * walk from the waist down, played while a class attacks on the move. It lasts exactly as long as
 * `specs.attack` (twice its frames at twice its fps: 14 at 24 for the 7 at 12), so the client's
 * attack window times it unchanged. The upper body steps through the attack's own keys, each held
 * two frames, just as the attack plays them; the legs walk `cycles` walk cycles across it (one on
 * a sheet that runs, else two). It is `boxed`: drawn in the frame the other clips set, never
 * widening it, so the sheet keeps its frame box (the bake fails if it would clip).
 */
export function withWalkAttack(specs) {
  const cycles = specs.run ? RUN_WALK_ATTACK_CYCLES : WALK_ATTACK_CYCLES;
  return { ...specs, walk_attack: { frames: specs.attack.frames * 2, fps: specs.attack.fps * 2, loop: false, boxed: true, cycles } };
}

/**
 * A playable class's run and backpedal (FS-JS7C8 §A, §B), each 8 frames looping, at the fps that
 * puts its measured pace (pace.js) in its band: the run's 180–220 world px/s, the backpedal's
 * 150–220. `speed` is how fast the clip carries the body, in rig heights per second (the walk is
 * 1), for the cloth's drag (simulateSprings). The backpedal's is backward, and held to a
 * quarter of its pace: at its full pace the drag swings a cloak forward through the legs, while a
 * cloak on a back that moves backward presses against it and hangs.
 */
export const RUN_ANIMATIONS = {
  run: { frames: 8, fps: 14, loop: true, speed: 2.5 },
  backpedal: { frames: 8, fps: 18, loop: true, speed: -0.5 },
};

/**
 * The playable classes' clips (FS-3V7GC): the four, and `walk_attack`. The knight, the archer
 * and the wizard; the mercenary's are {@link MERC_ANIMATIONS}.
 */
export const CLASS_ANIMATIONS = withWalkAttack(ANIMATIONS);

/**
 * A class sheet re-baked with the run and the backpedal (FS-JS7C8 R36: one class at a time, the
 * archer first): a class's clips, those two, and `walk_attack` walking its legs over one cycle.
 */
export const RUNNING_CLASS_ANIMATIONS = withWalkAttack({ ...ANIMATIONS, ...RUN_ANIMATIONS });

/**
 * The Mercenary's clips (FS-MAMHR §H): a class's, and the parry, which raises into the guard fast
 * enough to land inside the server's 0.25 s window (§C.11) and then holds its last frame for as
 * long as the stance is up. There is no parry on the move: the guard is whole-body (FS-3V7GC R7).
 */
export const MERC_ANIMATIONS = withWalkAttack({
  ...ANIMATIONS,
  parry: { frames: 4, fps: 24, loop: false },
});

/**
 * Hub folk (FS-2325V §G.1) only idle and walk: they never fight or fall. Their idle is a shorter
 * loop, the breath of someone standing about, which keeps their sheets small.
 */
export const FOLK_ANIMATIONS = {
  idle: { frames: 4, fps: 3, loop: true },
  walk: ANIMATIONS.walk,
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

// --- the run and the backpedal ---------------------------------------------------------------

/** cos over one 8-frame cycle, peaking at frame 7.5: the right arm furthest back (frame i). */
const swing = (i) => Math.cos(((i + 0.5) / 8) * Math.PI * 2);

/**
 * One step of the run, right foot planted: contact (the foot strikes a little ahead, the knee
 * soft), down (the knee takes the weight, the pelvis lowest), push (the leg extends behind, the
 * heel up) and flight (both feet off, the pelvis highest). The left leg is in its swing: folding
 * heel to seat, passing high, then reaching to land. Feet angles are LOCAL, keyed from the world
 * angle each sole should hold (thigh + shin + foot; + is toes down), so the stance foot lands on
 * its heel, flattens and pushes off its toes.
 */
const RUN_STEP = {
  thighR: [-0.46, -0.13, 0.33, 0.32],
  shinR: [0.3, 0.65, 0.35, 0.9],
  footR: [0.01, -0.52, -0.08, -0.32],
  thighL: [0.22, -0.28, -0.52, -0.48],
  shinL: [1.35, 1.45, 1, 0.5],
  footL: [-0.87, -0.68, -0.28, -0.12],
  hipsZ: [-0.02, -0.05, -0.02, 0],
  chestZ: [0.01, 0.04, 0.02, 0],
  /** The body lifted off the ground after grounding (H): the flight. */
  lift: [0, 0, 0, 0.045],
};

/**
 * The 8-frame run for a style (FS-JS7C8 R2): a jog. The arms, bent at the elbow, swing against
 * the legs (the right arm forward with the left leg); the pelvis turns with the stride and the
 * chest against it, with the arms; the centre of mass rises and falls once per step and leaves
 * the ground in each step's flight; the neck takes up every turn, roll and lean of the chest, so
 * the head stays steady. `style.run` scales it as `style.walk` scales the walk (stride, knee
 * fold, arm swing per arm, elbow bend per arm, lean, twist, flight): a longbow hand keeps its arm
 * near straight so the bow hangs along the side as in the walk. `style.runExtra(i)` adds a
 * class's own.
 */
export function runCycle(style) {
  const r = { stride: 1, knee: 1, arms: [1, 1], elbow: [1, 1], lean: 0.12, twist: 1, lift: 1, ...(style.run ?? {}) };
  const ARM = 0.5;
  const ELBOW = -1.35;
  const half = [0, 1, 2, 3].map((i) => {
    const c = swing(i);
    const hipsY = 0.12 * c * r.twist;
    // the chest turns back past square, with the arms: its world turn is -0.08·c
    const upperY = -(0.12 + 0.08) * c * r.twist;
    const leg = (name, k) => [RUN_STEP[name][i] * k, 0, 0];
    return pose(
      {
        thighR: leg("thighR", r.stride),
        thighL: leg("thighL", r.stride),
        shinR: leg("shinR", r.knee),
        shinL: leg("shinL", r.knee),
        footR: [RUN_STEP.footR[i] + RUN_STEP.thighR[i] * (1 - r.stride) + RUN_STEP.shinR[i] * (1 - r.knee), 0, 0],
        footL: [RUN_STEP.footL[i] + RUN_STEP.thighL[i] * (1 - r.stride) + RUN_STEP.shinL[i] * (1 - r.knee), 0, 0],
        hips: [0, hipsY, RUN_STEP.hipsZ[i]],
        spine: [r.lean * 0.5, upperY * 0.4, RUN_STEP.chestZ[i] * 0.5],
        chest: [r.lean * 0.5, upperY * 0.6, RUN_STEP.chestZ[i] * 0.5],
        neck: [-r.lean * 0.85, -(hipsY + upperY), -(RUN_STEP.hipsZ[i] + RUN_STEP.chestZ[i])],
      },
      { y: RUN_STEP.lift[i] * r.lift },
    );
  });
  // the arms over the whole cycle, after the mirror, so each arm keeps its own swing and bend
  const arms = (i) => {
    const c = swing(i);
    return pose({
      upperArmR: [ARM * c * r.arms[1], 0, 0],
      foreArmR: [ELBOW * r.elbow[1] + 0.15 * c * r.arms[1], 0, 0],
      upperArmL: [-ARM * c * r.arms[0], 0, 0],
      foreArmL: [ELBOW * r.elbow[0] - 0.15 * c * r.arms[0], 0, 0],
    });
  };
  const frames = [...half, ...half.map(mirror)];
  return frames.map((p, i) => add(p, arms(i), style.hold, style.runExtra?.(i)));
}

/**
 * One step of the backpedal, right foot planted: it lands behind the body on its toes, rolls
 * under it, and leaves the ground in front, toes last; then a short flight. The left leg swings
 * back beneath, the knee folded, and reaches back to land toes down. A short stride at a quick
 * cadence.
 */
const BACK_STEP = {
  thighR: [0.25, -0.08, -0.32, -0.3],
  shinR: [0.3, 0.45, 0.25, 0.45],
  footR: [-0.2, -0.22, 0.37, 0.35],
  thighL: [-0.15, 0.05, 0.22, 0.32],
  shinL: [0.9, 1, 0.75, 0.4],
  footL: [-0.15, -0.35, -0.37, -0.27],
  lift: [0, 0, 0.012, 0.03],
};

/**
 * The 8-frame backpedal for a style (FS-JS7C8 R8): the upper body held to the facing, leaning a
 * little into it, the feet stepping backward. The arms swing short against the legs; the pelvis
 * barely turns and the chest takes that turn back, so the shoulders stay square to the facing.
 * `style.backpedal` scales it (stride, knee, arms, elbow bend per arm, lean);
 * `style.backpedalExtra(i)` adds a class's own.
 */
export function backpedalCycle(style) {
  const r = { stride: 1, knee: 1, arms: [1, 1], elbow: [1, 1], lean: 0.08, ...(style.backpedal ?? {}) };
  const ARM = 0.2;
  const ELBOW = -1.1;
  const half = [0, 1, 2, 3].map((i) => {
    // the right leg is behind at contact here, the right arm forward: the swing runs the other way
    const c = -swing(i);
    const hipsY = 0.05 * c;
    const leg = (name, k) => [BACK_STEP[name][i] * k, 0, 0];
    return pose(
      {
        thighR: leg("thighR", r.stride),
        thighL: leg("thighL", r.stride),
        shinR: leg("shinR", r.knee),
        shinL: leg("shinL", r.knee),
        footR: [BACK_STEP.footR[i] + BACK_STEP.thighR[i] * (1 - r.stride) + BACK_STEP.shinR[i] * (1 - r.knee), 0, 0],
        footL: [BACK_STEP.footL[i] + BACK_STEP.thighL[i] * (1 - r.stride) + BACK_STEP.shinL[i] * (1 - r.knee), 0, 0],
        hips: [0, hipsY, 0],
        spine: [r.lean * 0.5, -hipsY * 0.5, 0],
        chest: [r.lean * 0.5, -hipsY * 0.5, 0],
        neck: [-r.lean * 0.85, 0, 0],
      },
      { y: BACK_STEP.lift[i] },
    );
  });
  // the arms after the mirror, so each keeps its own swing and bend
  const arms = (i) => {
    const c = -swing(i);
    return pose({
      upperArmR: [ARM * c * r.arms[1], 0, 0],
      foreArmR: [ELBOW * r.elbow[1], 0, 0],
      upperArmL: [-ARM * c * r.arms[0], 0, 0],
      foreArmL: [ELBOW * r.elbow[0], 0, 0],
    });
  };
  const frames = [...half, ...half.map(mirror)];
  return frames.map((p, i) => add(p, arms(i), style.hold, style.backpedalExtra?.(i)));
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

/**
 * An archer's stance, side-on: the chest turned 1 rad right so the left shoulder leads; the bow
 * arm ({@link bowArm}) swings 1 rad back left, so it points straight along the facing. handL
 * turns the grip so the bow stands upright.
 */
const BOW_STANCE = pose({
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

/** The bow arm in {@link BOW_STANCE}, lifted `raise` rad out from the side (1.47 is level). */
const bowArm = (raise, ry = -0.57) => ({ upperArmL: [0, ry, raise] });

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
    const aim = bowArm;
    return [
      P({ ...aim(0.95, -0.4), upperArmR: [-0.6, 0, -0.1], foreArmR: [-1.4, 0, 0] }, {}, { arrow: 1, ik: 0.1, draw: 0 }),
      P({ ...aim(1.47) }, {}, { arrow: 1, ik: 0.5, draw: 1 }),
      P({ ...aim(1.47) }, {}, { arrow: 1, ik: 1, draw: 1 }),
      P({ ...aim(1.47), chest: [-0.03, 0, 0] }, {}, { arrow: 1, ik: 1.02, draw: 1 }),
      P({ ...aim(1.47), chest: [-0.05, 0, 0] }, {}, { ik: 1.3, draw: 0 }),
      P({ ...aim(1.1, -0.45), upperArmR: [-0.3, -0.3, -0.3], foreArmR: [-0.9, 0, 0] }, {}, {}),
      P({ ...aim(0.55, -0.3), upperArmR: [-0.1, 0, -0.1], foreArmR: [-0.6, 0, 0] }, {}, {}),
    ].map((p) => add(BOW_STANCE, p));
  },

  /**
   * Bone Archer (FS-B4SG9 §E R26): the delver's shot on the hunched rig, retimed into a
   * telegraph. The whole clip is the wind-up: the bow comes up with nothing on the string, an
   * arrow is nocked, the string is pulled to the hand over three frames and held at the full
   * draw, and only the last frame looses, the moment the server's arrow leaves. The knees stay
   * bent and the jaw drops as it draws, so it never stands like a delver.
   */
  boneShot: () => {
    const aim = bowArm;
    const crouch = pose({ hunch: [-0.2, 0, 0], thighL: [-0.2, 0, 0], shinL: [0.34, 0, 0], footL: [-0.14, 0, 0], thighR: [-0.12, 0, 0], shinR: [0.34, 0, 0], footR: [-0.2, 0, 0] });
    return [
      P({ ...aim(0.6, -0.3), upperArmR: [-0.75, 0, -0.1], foreArmR: [-1.2, 0, 0] }, {}, { jaw: 0.1 }),
      P({ ...aim(1.3, -0.48), upperArmR: [-0.6, 0, -0.1], foreArmR: [-1.4, 0, 0] }, {}, { arrow: 1, ik: 0.1, draw: 0, jaw: 0.15 }),
      P({ ...aim(1.72) }, {}, { arrow: 1, ik: 0.4, draw: 1, jaw: 0.25 }),
      P({ ...aim(1.72) }, {}, { arrow: 1, ik: 0.75, draw: 1, jaw: 0.4 }),
      P({ ...aim(1.72), chest: [-0.03, 0, 0] }, {}, { arrow: 1, ik: 1, draw: 1, jaw: 0.55 }),
      P({ ...aim(1.72), chest: [-0.05, 0, 0] }, {}, { arrow: 1, ik: 1.03, draw: 1, jaw: 0.6 }),
      P({ ...aim(1.72), chest: [-0.02, 0, 0] }, {}, { ik: 1.3, draw: 0, jaw: 0.75 }),
    ].map((p) => add(BOW_STANCE, crouch, p));
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

// --- attacking on the move -----------------------------------------------------------------

/**
 * The bones the walk keeps when an attack is layered over it: the pelvis and the legs. Every
 * other bone, and every fx (the bow's draw, the arrow), is the attack's.
 */
export const LOWER_BODY = new Set(["hips", "thighL", "thighR", "shinL", "shinR", "metatarsalL", "metatarsalR", "footL", "footR"]);

const quatOf = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ"));

/**
 * `upper` from the waist up over `lower` from the waist down (a layered blend with a bone mask:
 * the per-bone override game engines use for "run and shoot"). The legs and pelvis are the
 * lower pose's, the rest and the fx the upper's. The spine then takes up the difference between
 * the two pelvises, so the chest keeps the upper pose's own orientation in the model, its aim
 * never swinging with the stride: a mesh-space rather than a local-space blend. That holds
 * because hips and spine rest at zero on every humanoid rig (rig.js), so their offsets compose as
 * plain rotations. The body's offsets are the lower pose's: an attack's lunge would slide the
 * planted feet.
 */
export function layerPoses(upper, lower) {
  const out = pose({}, { ...lower.body }, { ...upper.fx });
  for (const [k, v] of Object.entries(upper.b)) if (!LOWER_BODY.has(k)) out.b[k] = [...v];
  for (const [k, v] of Object.entries(lower.b)) if (LOWER_BODY.has(k)) out.b[k] = [...v];
  const spine = quatOf(lower.b.hips ?? ZERO)
    .invert()
    .multiply(quatOf(upper.b.hips ?? ZERO))
    .multiply(quatOf(upper.b.spine ?? ZERO));
  const e = new THREE.Euler().setFromQuaternion(spine, "XYZ");
  out.b.spine = [e.x, e.y, e.z];
  return out;
}

/**
 * The attack over the walk (`walk_attack`): `spec`'s frames span exactly the attack clip's
 * duration (`attackSpec`). The upper body is the attack key showing at that moment, as the
 * attack clip itself would show it (an in-between would be a pose the attack never draws, and
 * its bow sweeps wider than the frame); the legs walk `spec.cycles` cycles over the same span
 * ({@link WALK_ATTACK_CYCLES} when the spec names none), sampled between the walk's keys.
 */
export function walkAttackClip(style, spec, attackSpec = ANIMATIONS.attack) {
  const attack = ATTACKS[style.attack]().map((p) => add(p, style.attackExtra));
  const walk = walkCycle(style);
  const duration = spec.frames / spec.fps;
  if (Math.abs(duration - attackSpec.frames / attackSpec.fps) > 1e-9)
    throw new Error(`clips: walk_attack lasts ${duration}s, not the attack's ${attackSpec.frames / attackSpec.fps}s`);
  const stride = ((spec.cycles ?? WALK_ATTACK_CYCLES) * walk.length) / spec.frames;
  return Array.from({ length: spec.frames }, (_, i) =>
    layerPoses(
      attack[Math.min(attack.length - 1, Math.floor((i * attackSpec.fps) / spec.fps + 1e-9))],
      sample(walk, (i * stride) % walk.length, true),
    ),
  );
}

// --- parry ---------------------------------------------------------------------------------

/** Where the raise has got to at each key frame: most of the way at once, then settling in. */
const RAISE = [0.45, 0.8, 0.96, 1];

/**
 * From the carry (the idle's first frame) up into `style.guard`, the last frame the guard held.
 * Both feet are set: the legs take the guard's own keys, never the walk's.
 */
export function parryClip(style, n) {
  const from = idleCycle(style, 1)[0];
  const to = add(style.guard);
  const keys = new Set([...Object.keys(from.b), ...Object.keys(to.b)]);
  const bodyKeys = new Set([...Object.keys(from.body), ...Object.keys(to.body)]);
  return Array.from({ length: n }, (_, i) => {
    const t = RAISE[Math.min(i, RAISE.length - 1)];
    const p = pose();
    for (const k of keys) {
      const a = from.b[k] ?? ZERO;
      const b = to.b[k] ?? ZERO;
      p.b[k] = [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * t);
    }
    for (const k of bodyKeys) p.body[k] = (from.body[k] ?? 0) + ((to.body[k] ?? 0) - (from.body[k] ?? 0)) * t;
    return p;
  });
}

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

/**
 * Each animation in `specs`, as key poses for a style, keyed by manifest animation name. A
 * creature whose body the human clips do not fit (a digitigrade, winged boss: FS-Q14EV §B.6)
 * keys its own in `style.clips[anim](spec)`.
 */
export function clipsFor(style, specs = ANIMATIONS) {
  const make = {
    idle: () => idleCycle(style, specs.idle.frames),
    walk: () => walkCycle(style),
    run: () => runCycle(style),
    backpedal: () => backpedalCycle(style),
    attack: () => ATTACKS[style.attack]().map((p) => add(p, style.attackExtra)),
    death: () => deathClip(style),
    parry: () => parryClip(style, specs.parry.frames),
    walk_attack: () => walkAttackClip(style, specs.walk_attack, specs.attack),
  };
  const own = style.clips ?? {};
  return Object.fromEntries(Object.keys(specs).map((anim) => [anim, own[anim] ? own[anim](specs[anim]) : make[anim]()]));
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
  // a spring that may not swing in through a leg (a skirt's panels, anatomy.js pushPanels)
  for (const s of rig.springs) if (s.push) rig.bones[s.bone].rotation.x = s.push(rig.bones[s.bone].rotation.x, p);
  if (rig.bones.jaw && p.fx.jaw !== undefined) rig.bones.jaw.rotation.x = (rig.rest.jaw?.[0] ?? 0) + p.fx.jaw * 0.6;
  rig.body.rotation.set(p.body.rx ?? 0, 0, p.body.rz ?? 0);
  rig.body.position.set((p.body.x ?? 0) * H, 0, (p.body.z ?? 0) * H);
  // a flight (the run's): the body held this far off the ground once grounded, never below it
  rig.lift = Math.max(0, p.body.y ?? 0) * H;
}

/**
 * Lowers or lifts the body so its lowest grounded vertex touches y = 0, or stands `rig.lift`
 * above it (a pose's `body.y`, applyPose: a run's flight, both feet off the ground).
 */
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
  rig.body.position.y -= min - (rig.lift ?? 0);
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
