// The playable classes' builds and motion styles (FS-2325V §E, FS-3V7GC, FS-JS7C8), kept apart
// from their dress in cast.js so the clip tests can pose the real rig and style in Node, without
// the bake page's canvases and theme.

import { CLEAVE_CARRY, RUNNING_CLASS_ANIMATIONS, RUNNING_MERC_ANIMATIONS, pose, withOffhand } from "./clips.js";

/**
 * How the playable classes carry their weapon (FS-JS7C8 R2, owner 2026-11-12: "拿武器的動作有點怪
 * 武器的位置似乎太高了 擺動的時候舉得太高", "站立時武器應該可以放下手微微下垂 跑步時也不用太高",
 * "跑步時應該會在胸口附近擺動", then "跑步時武器是不是拿反了" and "法師走路時武器可以垂一點 現在手垂下來了
 * 但是武器卻還是拿得很直"): low at rest, never standing up past the head, always in a normal grip (the
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
 * In the run (then "目前跑步時 武器擺動位置有點不自然 跑的時候可以高一點 有點過垂 武器可以往內側擺動一些"
 * and, of the sceptre, "只是要合理的位置 但跑步時為什麼手會擺到肩膀", then "騎士跟傭兵跑步時劍的角度可以再提起10到20度",
 * then "戰士 傭兵 跑步時提劍的角度再提升15度") the knight's and the mercenary's sword arm pumps about
 * the chest like a free arm (RUN_ARM, RUN_ELBOW). The wrist holds a blade forward along the forearm,
 * raised above level ({@link RUN_BLADE}, {@link MERC_RUN_BLADE}), taking back most of the arm's pump
 * ({@link RUN_WRIST}): the point ahead of the hand, the knight's 24–41° above level, the
 * mercenary's 22–39° ({@link RUN_BLADE_ELEV}; raised about 15° twice, from 5–8° below to 10–12°
 * above, then from 9–26° and 7–24°), lowest as the arm swings back. Raised so, the point rises past
 * the crown, under {@link RUN_TIP_CEIL}, and the blade never passes through the head or behind it.
 * At the front of the pump the upper arm turns in ({@link RUN_CROSS}, clips.js `run.cross`), so the
 * hand crosses in toward the midline before the torso, about 0.07 H ({@link RUN_CROSS_REACH}), the
 * blade angled about 28° across the body, and goes back out to the side behind.
 *
 * The wizard's sceptre arm pumps smaller ({@link SCEPTRE_RUN_ARM}) about a centre drawn back
 * ({@link SCEPTRE_RUN_BACK}), so her hand peaks at the lower chest ({@link SCEPTRE_RUN_PEAK}), not by
 * the shoulder (the shared pump's chest height, 0.70 H, sits just under this rig's shoulder at
 * 0.74); her tome arm keeps the full pump. The sceptre stands up from the fist ({@link RUN_SCEPTRE}),
 * the wrist taking back a little more than the pump ({@link RUN_SCEPTRE_WRIST}), so it leans
 * forward a little as the hand rises and stands up as it falls: 23–38° off vertical
 * ({@link SCEPTRE_RUN_TILT}), the orb ahead of the hand and of her face, at most about her chin, and
 * her hand crossing in at the front as the swords' do.
 */
const REST_ARM = [-0.05, 0, 0];
const REST_ELBOW = [-0.12, 0, 0];
const REST_BLADE = [0.95, 0, 0];
/** The sceptre's lean at rest, off vertical (degrees; the owner's "可以垂一點"): measured on the rig, the idle 37–41°, the walk 33–44°. */
export const SCEPTRE_TILT = 40;
const REST_SCEPTRE = [-0.68, -0.25, 0];
const WALK_WRIST = [0, 0.7];
const RUN_BLADE = [0.68, 0, 0];
/** The mercenary's: his curved blade's point rises about 6° off its line, so his wrist sets it a little lower. */
const MERC_RUN_BLADE = [0.82, 0, 0];
const RUN_WRIST = [0, 0.85];
/** The band a blade keeps in the run, degrees from level (+ up): raised, never back up to the old upright carry's 74–85° (was 5 to 35, and −10 to 20 before). */
export const RUN_BLADE_ELEV = [20, 50];
/** How high a blade's point may rise in the run (H, model space): a little over the crown, which the run's bob carries from 0.90 to 0.95 H. */
export const RUN_TIP_CEIL = 1.03;
/** The weapon arm's turn in at the front of the run's pump (rad, the upper arm's twist; 0 at the back of the pump). */
const RUN_CROSS = 0.3;
/** How far in toward the midline the weapon hand comes at the front of the pump against the back (H). */
export const RUN_CROSS_REACH = [0.05, 0.08];
const RUN_SCEPTRE = [-0.1, 0, 0];
const RUN_SCEPTRE_WRIST = [0, 1.2];
/** The wizard's sceptre arm's share of the shared pump (RUN_ARM), and how far its centre is drawn back (rad). */
const SCEPTRE_RUN_ARM = 0.76;
const SCEPTRE_RUN_BACK = 0.25;
/** Where the wizard's sceptre hand peaks in the run (H): the lower chest, under the chest bone. */
export const SCEPTRE_RUN_PEAK = 0.61;
/** The sceptre's band off vertical through the run's pump (degrees): reasonably upright. */
export const SCEPTRE_RUN_TILT = [15, 40];

/**
 * A build is `createRig`'s height and proportions; a style feeds clips.js (`attack` names the
 * attack, `hold` is the carry added to idle, walk and run, `walk` and `run` scale those gaits); a
 * sheet is the clips the class's sheet carries and the scale it is baked at (cast.js `CAST`).
 */
export const KNIGHT_BUILD = [2.0, { shoulderW: 1.1, torsoW: 1.06 }];

/**
 * How the knight's standing attack carries his cloak (simulateSprings, in walks, as
 * BACKPEDAL_ATTACK_SPEED): out behind as by half a walk. The slash's stance sets his right foot
 * back under the cloak as the cut settles, and hanging still the cloak let his calf and boot through
 * it by 7.6 px on the last key (clearance.js `cloakClearance`); half a walk holds it off the heel.
 */
export const KNIGHT_ATTACK_CLOTH = 0.5;

/**
 * The knight re-baked with the run and the backward step at 1.5x (FS-JS7C8 slice 6, FS-HF0WW
 * § Change: Class sheets at 1.5x R35), his attack's cloth carried by KNIGHT_ATTACK_CLOTH.
 */
export const KNIGHT_SHEET = {
  animations: { ...RUNNING_CLASS_ANIMATIONS, attack: { ...RUNNING_CLASS_ANIMATIONS.attack, speed: KNIGHT_ATTACK_CLOTH } },
  scale: 1.5,
};

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
  // the hip, crossing in at the front, the blade held forward about level; the shield arm keeps
  // the shield up before the chest, bent about 90° and swinging short
  run: {
    arms: [0.3, 1],
    elbow: [0.2, 1],
    wrist: RUN_WRIST,
    cross: [0, RUN_CROSS],
    hold: pose({ upperArmL: [-0.38, -0.85, 0.12], foreArmL: [-1.25, 0, 0], upperArmR: [0, 0, -0.06], handR: RUN_BLADE }),
  },
};

/**
 * The Berserker's sheet (FS-1J1CB R9, R28): the knight's clips, and the off-hand twin of each
 * attack (clips.js `withOffhand`), at the knight's 1.5x.
 */
export const BERSERKER_SHEET = { animations: withOffhand(KNIGHT_SHEET.animations), scale: 1.5 };

/**
 * The Berserker's carry and cut (FS-1J1CB R2), his own beside {@link KNIGHT_STYLE}: a bearded axe
 * in each hand (gear.js `beardedAxe`), no shield. At rest both arms hang low and a little out, the
 * wrists tipping each haft down and forward of the fist ({@link CLEAVE_CARRY}), so the heads hang
 * forward of the legs with the edge facing forward and a little down (axe.test.mjs). In the walk
 * both wrists take back most of the arms' swing, so the axes sway without swinging up. In the run
 * both arms pump, shorter than a sword arm and bent less, the wrists holding the hafts forward and
 * down so the edges keep facing forward, never up. The cut is `cleave` (clips.js): wide, the free
 * arm swung back against it.
 */
export const BERSERKER_STYLE = {
  attack: "cleave",
  speed: 1,
  hold: pose({
    upperArmR: [0.04, 0, -0.14],
    foreArmR: [-0.04, 0, 0],
    handR: [CLEAVE_CARRY, 0, 0],
    upperArmL: [0.04, 0, 0.14],
    foreArmL: [-0.04, 0, 0],
    handL: [CLEAVE_CARRY, 0, 0],
  }),
  walk: { arms: [0.5, 0.5], wrist: [0.7, 0.7], lean: 0.05 },
  run: {
    arms: [0.6, 0.6],
    elbow: [0.45, 0.45],
    wrist: [0.6, 0.6],
    hold: pose({ upperArmR: [0, 0, -0.12], upperArmL: [0, 0, 0.12], handR: [CLEAVE_CARRY, 0, 0], handL: [CLEAVE_CARRY, 0, 0] }),
  },
};

export const ARCHER_BUILD = [1.96, { shoulderW: 1.0, torsoW: 0.98 }];

/**
 * The archer's sprint's forward lean (FS-JS7C8 § Change: The archer's sprint and low-ready bow
 * R67, D1, the owner: "跑更快的話身體可能會更加前傾"): twice the shared RUN_LEAN, tilting her
 * hips-to-neck line about 20° (20.2–20.5° measured on her rig; the shared run's is about 10°). The
 * neck takes it back out (clips.js steadyNeck), so her head still looks ahead.
 */
export const ARCHER_SPRINT_LEAN = 0.48;

/**
 * The archer's sprint's legs (R68, R69; D2, D3), the rows of clips.js RUN_STEP she keys her own
 * (`run.legs`), right foot planted: contact, down, push, flight. Played at 16 fps, not the shared 14,
 * over a stride about 12% shorter, so her measured pace stays at RUN_PACE (194.09 world px/s at 16
 * fps against the shared keys' 221.39 there): the stance thigh lands less far ahead (−0.39, was
 * −0.46) and pushes off less far behind (0.275, was 0.33). The swing leg drives its knee higher
 * (the thigh to −0.85 as it passes, was −0.52; the knee peaks at 0.335 H, was 0.311) and kicks its
 * heel further up behind (the shin folds to 1.8 under the seat, was 1.45; just off the toe only
 * 1.4, since 1.45 there kicks the heel out through the cloak's hem), then paws back down to land.
 * The stance knee gives a little more in the down (0.72, was 0.65) and the flight lifts higher
 * (0.06 H, was 0.045), so the bob is never softer than the shared run's (0.062 H, was 0.055; a
 * softer bob was reverted 2026-11-12, "像浮在上面"). Each foot angle keeps the world sole angle the
 * shared step gives it (thigh + shin + foot), so the stance foot still lands on its heel and pushes
 * off its toes.
 */
export const ARCHER_SPRINT_STEP = {
  thighR: [-0.39, -0.12, 0.275, 0.3],
  shinR: [0.3, 0.72, 0.35, 1],
  footR: [-0.06, -0.6, -0.025, -0.4],
  thighL: [0.24, -0.4, -0.85, -0.62],
  shinL: [1.4, 1.8, 1.5, 0.7],
  footL: [-0.94, -0.91, -0.45, -0.18],
  lift: [0, 0, 0, 0.06],
};

/**
 * The archer's carry in her sprint, the two-handed low-ready bow (FS-JS7C8 § Change: The archer's
 * sprint and low-ready bow R72–R77; D4–D6, the owner: "拿弓的動作要有一種隨時備戰的感覺 要雙手拿著弓放在
 * 身體前方 但不用抬太高"): her run's `hold`, the whole of her arms there (her run's pump is off), so
 * each hand stays put in the chest's frame and only rides the trunk's turn, lean and bob. The left
 * fist holds the grip in front of her belly on her centre line; the right hand holds the braced
 * string at its middle, just behind the fist and a little over it, where the string lies (toward
 * the bow wrist, gear.js `longbow`): no draw, no arrow. Measured on her rig over the cycle, the
 * hands stand 0.55–0.63 H (the hips bone 0.48–0.54, the chest bone 0.60–0.66) and 0.17–0.20 H ahead
 * of the chest bone. The stave stands 44–53° off vertical as the chest turns, its upper limb forward
 * and up, swung 40° off the facing toward her right shoulder and under the crown, its lower limb
 * back and down out to her left, past the left leg at about knee height (its tip 0.21–0.26 H left of
 * her centre line), clear of the swinging knee, the boot and the tunic. The left side: the string
 * lies toward the bow wrist, so with the lower limb out past the bow hand's own leg the wrist bends
 * little (about 61° flexed, 10° turned) and the right hand reaches only to her centre; canted the
 * other way, the lower limb would have to cross the right leg from a grip left of centre.
 * Elbows bent about 90° at her sides. Solved once (a two-bone arm with a hinged elbow onto that grip
 * and that string, at the sprint's mean trunk) and kept as keys, so the bake poses it like any
 * other carry; the arm tests hold the measures (archerLooks.test.mjs).
 */
export const ARCHER_LOW_READY = pose({
  upperArmL: [-0.76, -0.71, -0.07],
  foreArmL: [-1.57, 0.27, 0],
  handL: [1.06, 0, -0.17],
  upperArmR: [-0.87, 0.75, 0.41],
  foreArmR: [-1.61, 0, 0],
});

/**
 * The archer's sheet at 1.5x (ADR-0076): the running class's clips (FS-JS7C8), her run her own
 * sprint (§ Change: The archer's sprint and low-ready bow R68): 16 fps over a shorter stride, so its
 * measured pace stays at RUN_PACE, the cloth carried at the shared run's speed. A clip set of her
 * own: RUNNING_CLASS_ANIMATIONS, the wizard's, is not changed.
 */
export const ARCHER_SHEET = { animations: { ...RUNNING_CLASS_ANIMATIONS, run: { ...RUNNING_CLASS_ANIMATIONS.run, fps: 16 } }, scale: 1.5 };

export const ARCHER_STYLE = {
  attack: "shot",
  speed: 1.05,
  hold: pose({
    upperArmL: [0.02, 0, 0.04],
    foreArmL: [-0.3, 0, 0],
    handL: [-0.9, 0, 0],
    foreArmR: [-0.1, 0, 0],
  }),
  walk: { arms: [0.7, 1], lean: 0.06 },
  // her sprint (FS-JS7C8 § Change: The archer's sprint and low-ready bow): the trunk about 20°
  // forward ({@link ARCHER_SPRINT_LEAN}) over her own legs ({@link ARCHER_SPRINT_STEP}), the bow
  // carried two-handed at the low ready ({@link ARCHER_LOW_READY}): no pump, no elbow swing
  run: { arms: [0, 0], elbow: [0, 0], hold: ARCHER_LOW_READY, lean: ARCHER_SPRINT_LEAN, legs: ARCHER_SPRINT_STEP },
};

/**
 * The archer's quiver on her back, over her cloak (gear.js `quiver`; owner 2026-11-12: "弓箭手背後的
 * 箭袋 底部會吃進斗篷裏 可以擺正一點", "目前我知道跑步跟平常站立時都會吃進斗篷"): `tilt` degrees off the
 * spine (QUIVER_TILT; was 29, a diagonal whose foot sank into the cloak's flare), its mouth toward
 * the right shoulder, the fletching over it; seated at `at` (H: right of the spine, over the chest
 * bone, behind it by that much of the torso's depth; was 0.1, the case half inside the cloak), its
 * foot tipped out `rx` rad with the cloak's flare. `strap` is how much of the cloak's top the
 * quiver's strap holds to her back (anatomy.js `cloakBones`: cloak0's and cloak1's drag and
 * fling scaled by it): free, the run's drag swung the cloak out past the case's foot by 21 px.
 */
export const QUIVER_TILT = 17;
export const ARCHER_QUIVER = { tilt: QUIVER_TILT, at: [-0.045, 0.03, -0.15], rx: 0.12, strap: [0.2, 0.4] };

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
  // the sceptre and the tome swing clear of the hips, the sceptre arm smaller and drawn back so its
  // hand peaks at the lower chest, crossing in at the front; the sceptre up from the fist, its head ahead
  run: {
    arms: [1, SCEPTRE_RUN_ARM],
    wrist: RUN_SCEPTRE_WRIST,
    cross: [0, RUN_CROSS],
    hold: pose({ upperArmL: [0, 0, 0.14], upperArmR: [SCEPTRE_RUN_BACK, 0, -0.12], handR: RUN_SCEPTRE }),
  },
  idleExtra: () => pose({}, {}, { glow: 1 }),
};

/**
 * The fist's give as a mage specialization falls (FS-1J1CB R3, R4), by death key: none while she
 * buckles, then the wrist lets the focus fall level as she goes down, lying a little off the floor
 * at the fist. The focus runs 0.2 H back past the fist and its head 0.3 H on, so the sceptre's
 * death (no wrist at all) drives its head and its butt through the ground; this levels it,
 * heading kept, turned a little on the haft so the ring or cage lies more flat than upright. The
 * hand's own angles are zero in the death clip, so these are its whole turn.
 */
export const FOCUS_DEATH = [null, null, null, [-0.1, 0, -0.3], [0.21, 0.07, -0.8], [-0.89, -0.1, -0.85], [-0.97, -0.04, -0.85]];

/**
 * A mage specialization's carry and cast (FS-1J1CB R3, R4): the wizard's own, the focus held and
 * thrust as the sceptre is ({@link WIZARD_STYLE}); in the death the wrist lays the longer focus
 * level ({@link FOCUS_DEATH}).
 */
export const FOCUS_STYLE = { ...WIZARD_STYLE, deathExtra: (i) => FOCUS_DEATH[i] && pose({ handR: FOCUS_DEATH[i] }) };

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
  // out from the hip, crossing in at the front, the blade held forward about level
  run: { wrist: RUN_WRIST, cross: [0, RUN_CROSS], hold: pose({ upperArmR: [0, 0, -0.1], handR: MERC_RUN_BLADE }) },
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
