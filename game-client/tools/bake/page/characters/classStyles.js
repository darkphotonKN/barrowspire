// The playable classes' builds and motion styles (FS-2325V §E, FS-3V7GC, FS-JS7C8), kept apart
// from their dress in cast.js so the clip tests can pose the real rig and style in Node, without
// the bake page's canvases and theme.

import { RUNNING_CLASS_ANIMATIONS, RUNNING_MERC_ANIMATIONS, pose } from "./clips.js";

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
    upperArmR: [-0.12, 0, -0.04],
    foreArmR: [-0.62, 0, 0],
    handR: [-0.55, 0, 0],
  }),
  walk: { arms: [0.2, 0.55], lean: 0.05 },
  // the run's carry (FS-JS7C8 R2): the sword arm pumps free from the shoulder, a little out from
  // the hip, the wrist keeping the blade's angle; the shield arm keeps the shield up before the
  // chest, bent about 90° and swinging short
  run: {
    arms: [0.3, 1],
    elbow: [0.2, 1],
    hold: pose({ upperArmL: [-0.38, -0.85, 0.12], foreArmL: [-1.25, 0, 0], upperArmR: [0, 0, -0.06], handR: [-0.55, 0, 0] }),
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
  hold: pose({
    upperArmR: [-0.28, 0, -0.08],
    foreArmR: [-1.15, 0, 0],
    handR: [-0.1, 0, 0],
    foreArmL: [-0.15, 0, 0],
  }),
  walk: { arms: [0.8, 0.4], lean: 0.05, stride: 0.95 },
  // the run's carry (FS-JS7C8 R2): both arms pump free from the shoulder, a little out from the
  // body so the sceptre and the tome swing clear of the hips; the wrist alone tilts the sceptre
  // forward, so it never stands up into the face at the front of the swing
  run: { hold: pose({ upperArmL: [0, 0, 0.14], upperArmR: [0, 0, -0.06], handR: [-0.6, 0, 0] }) },
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
  // a low guard: the blade forward and up, the free hand loose at the belt
  hold: pose({
    upperArmL: [-0.08, 0, 0.06],
    foreArmL: [-0.42, 0, 0],
    upperArmR: [-0.18, 0, -0.2],
    foreArmR: [-0.7, 0, 0],
    handR: [-0.4, -0.4, 0],
  }),
  walk: { stride: 1.05, arms: [0.75, 0.45], lean: 0.07 },
  // the run's carry (FS-JS7C8 R2): both arms pump free from the shoulder, the sword arm a little
  // out from the hip, the wrist keeping the blade forward and up
  run: { hold: pose({ upperArmR: [0, 0, -0.1], handR: [-0.4, -0.4, 0] }) },
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
