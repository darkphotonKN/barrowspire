// The playable classes' builds and motion styles (FS-2325V §E, FS-3V7GC, FS-JS7C8), kept apart
// from their dress in cast.js so the clip tests can pose the real rig and style in Node, without
// the bake page's canvases and theme.

import { RUNNING_CLASS_ANIMATIONS, RUNNING_MERC_ANIMATIONS, pose } from "./clips.js";

/**
 * How the playable classes carry their weapon (FS-JS7C8 R2, owner 2026-11-12: "拿武器的動作有點怪
 * 武器的位置似乎太高了 擺動的時候舉得太高", "站立時武器應該可以放下手微微下垂 跑步時也不用太高",
 * "跑步時應該會在胸口附近擺動", then "跑步時武器是不是拿反了" and "法師走路時武器可以垂一點 現在手垂下來了
 * 但是武器卻還是拿得很直"): low, never standing up past the head, always in a normal grip (the
 * weapon out of the thumb side of the fist, the hand never turned over on the forearm).
 *
 * At rest (`hold`, the idle and the walk) the weapon arm hangs at the side, a little forward and
 * out from the hip, the elbow a little bent ({@link REST_ELBOW}), the hand a little below the
 * waist; the wrist tips a blade down and forward, its point toward the ground
 * ({@link REST_BLADE}), or lets the sceptre lean with the relaxed hand, {@link SCEPTRE_TILT} off
 * vertical, the orb forward and a little out, the foot of the shaft back by the heel
 * ({@link REST_SCEPTRE}); in the walk her wrist takes back most of the arm's swing
 * ({@link WALK_WRIST}), so the sceptre sways a little with the step instead of swinging upright.
 *
 * In the run the weapon arm pumps about the chest like a free arm (RUN_ARM, RUN_ELBOW). The wrist
 * cocks a blade forward along the forearm and a little down ({@link RUN_BLADE}), taking back most
 * of the arm's pump ({@link RUN_WRIST}): the point ahead of the hand, 11–34° below level, lowest
 * as the arm swings back, never up and never behind the body. The sceptre stands up from the fist
 * ({@link RUN_SCEPTRE}), the wrist taking back more than the pump ({@link RUN_SCEPTRE_WRIST}) so it
 * leans forward as the hand rises to the chest and stands up as it falls: the orb above the hand
 * and under the shoulder all through (5–36° above level; a sceptre stood any straighter would
 * bring its head over the shoulder at the top of the pump).
 */
const REST_ARM = [-0.05, 0, 0];
const REST_ELBOW = [-0.12, 0, 0];
const REST_BLADE = [0.95, 0, 0];
/** The sceptre's lean at rest, off vertical (degrees; the owner's "可以垂一點"): measured on the rig, the idle 37–41°, the walk 33–44°. */
export const SCEPTRE_TILT = 40;
const REST_SCEPTRE = [-0.68, -0.25, 0];
const WALK_WRIST = [0, 0.7];
const RUN_BLADE = [1.65, 0, 0];
const RUN_WRIST = [0, 0.8];
const RUN_SCEPTRE = [0.85, 0, 0];
const RUN_SCEPTRE_WRIST = [0, 1.3];

/**
 * A build is `createRig`'s height and proportions; a style feeds clips.js (`attack` names the
 * attack, `hold` is the carry added to idle, walk and run, `walk` and `run` scale those gaits); a
 * sheet is the clips the class's sheet carries and the scale it is baked at (cast.js `CAST`).
 */
export const KNIGHT_BUILD = [2.0, { shoulderW: 1.1, torsoW: 1.06 }];

/**
 * The knight re-baked with the run and the backward step at 1.5x (FS-JS7C8 slice 6, FS-HF0WW
 * § Change: Class sheets at 1.5x R35).
 */
export const KNIGHT_SHEET = { animations: RUNNING_CLASS_ANIMATIONS, scale: 1.5 };

export const KNIGHT_STYLE = {
  attack: "slash",
  speed: 1,
  hold: pose({
    upperArmL: [-0.38, -0.85, 0.12],
    foreArmL: [-1.25, 0, 0],
    // the sword arm down at the side, the point toward the ground
    upperArmR: [REST_ARM[0], 0, -0.12],
    foreArmR: REST_ELBOW,
    handR: REST_BLADE,
  }),
  walk: { arms: [0.2, 0.55], lean: 0.05 },
  // the run's carry (FS-JS7C8 R2): the sword arm pumps free from the shoulder, a little out from
  // the hip, the blade held forward and a little down; the shield arm keeps the shield up before
  // the chest, bent about 90° and swinging short
  run: {
    arms: [0.3, 1],
    elbow: [0.2, 1],
    wrist: RUN_WRIST,
    hold: pose({ upperArmL: [-0.38, -0.85, 0.12], foreArmL: [-1.25, 0, 0], upperArmR: [0, 0, -0.06], handR: RUN_BLADE }),
  },
};

export const WIZARD_BUILD = [1.92, { shoulderW: 0.8, torsoW: 0.82, torsoD: 0.88, hipW: 1.1, armR: 0.78, limbR: 0.84, headR: 0.059 }];

/**
 * The wizard re-baked with the run and the backward step at 1.5x (FS-JS7C8 slice 7, FS-HF0WW
 * § Change: Class sheets at 1.5x R35).
 */
export const WIZARD_SHEET = { animations: RUNNING_CLASS_ANIMATIONS, scale: 1.5 };

export const WIZARD_STYLE = {
  attack: "cast",
  speed: 0.9,
  // the sceptre arm down at the side, the sceptre leaning up beside the leg
  hold: pose({
    upperArmR: [REST_ARM[0], 0, -0.1],
    foreArmR: REST_ELBOW,
    handR: REST_SCEPTRE,
    foreArmL: [-0.15, 0, 0],
  }),
  walk: { arms: [0.8, 0.4], lean: 0.05, stride: 0.95, wrist: WALK_WRIST },
  // the run's carry (FS-JS7C8 R2): both arms pump from the shoulder, a little out from the body so
  // the sceptre and the tome swing clear of the hips; the sceptre up from the fist, its head ahead
  run: { wrist: RUN_SCEPTRE_WRIST, hold: pose({ upperArmL: [0, 0, 0.14], upperArmR: [0, 0, -0.06], handR: RUN_SCEPTRE }) },
  idleExtra: () => pose({}, {}, { glow: 1 }),
};

export const MERCENARY_BUILD = [1.98, { shoulderW: 1.14, torsoW: 1.07, torsoD: 1.04, hipW: 0.95, armR: 1.16, limbR: 1.1 }];

/**
 * The mercenary re-baked with the run and the backward step at 1.5x, his parry kept (FS-JS7C8
 * slice 8, FS-HF0WW § Change: Class sheets at 1.5x R35).
 */
export const MERCENARY_SHEET = { animations: RUNNING_MERC_ANIMATIONS, scale: 1.5 };

export const MERCENARY_STYLE = {
  attack: "cut",
  speed: 1.08,
  // at rest the sword arm down at the side, the point toward the ground, the free hand loose at the belt
  hold: pose({
    upperArmL: [-0.08, 0, 0.06],
    foreArmL: [-0.42, 0, 0],
    upperArmR: [REST_ARM[0], 0, -0.14],
    foreArmR: REST_ELBOW,
    handR: REST_BLADE,
  }),
  walk: { stride: 1.05, arms: [0.75, 0.45], lean: 0.07 },
  // the run's carry (FS-JS7C8 R2): both arms pump free from the shoulder, the sword arm a little
  // out from the hip, the blade held forward and a little down
  run: { wrist: RUN_WRIST, hold: pose({ upperArmR: [0, 0, -0.1], handR: RUN_BLADE }) },
  // the parry (FS-MAMHR §G.35): the blade raised up and across before him, feet set square, a
  // little lean back from the blow
  guard: pose(
    {
      hips: [0, 0.12, 0],
      spine: [-0.08, 0.08, 0],
      chest: [-0.06, 0.12, 0],
      neck: [0.06, -0.2, 0],
      thighL: [-0.24, 0, 0.1],
      shinL: [0.28, 0, 0],
      footL: [-0.04, 0, 0],
      thighR: [0.16, 0, -0.1],
      shinR: [0.26, 0, 0],
      footR: [-0.42, 0, 0],
      upperArmR: [-0.81, -0.54, -0.03],
      foreArmR: [-1.37, 0, 0],
      handR: [-0.06, 1.01, -0.8],
      upperArmL: [-0.4, 0, 0.2],
      foreArmL: [-0.9, 0, 0],
    },
    { z: -0.01 },
  ),
};
