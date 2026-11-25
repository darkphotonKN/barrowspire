// The playable classes' builds and motion styles (FS-2325V §E, FS-3V7GC, FS-JS7C8), kept apart
// from their dress in cast.js so the clip tests can pose the real rig and style in Node, without
// the bake page's canvases and theme.

import * as THREE from "three";
import { ANIMATIONS, CLEAVE_CARRY, MERC_ANIMATIONS, RUN_ANIMATIONS, pose, withOffhand } from "./clips.js";

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
 * then "戰士 傭兵 跑步時提劍的角度再提升15度") the knight's sword arm pumps about the chest like a
 * free arm (RUN_ARM, RUN_ELBOW). The wrist holds the blade forward along the forearm, raised above
 * level ({@link RUN_BLADE}), taking back most of the arm's pump ({@link RUN_WRIST}): the point ahead
 * of the hand, 23–42° above level ({@link RUN_BLADE_ELEV}; raised about 15° twice, the last time
 * from 9–26°), lowest as the arm swings back. Raised so, the point rises past the crown, under
 * {@link RUN_TIP_CEIL}, and the blade never passes through the head or behind it. At the front of
 * the pump the upper arm turns in ({@link RUN_CROSS}, clips.js `run.cross`), so the hand crosses in
 * toward the midline before the torso, about 0.07 H ({@link RUN_CROSS_REACH}), the blade angled
 * about 27° across the body, and goes back out to the side behind. His run carries it under the
 * sprint's 20° lean (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips
 * retired R144–R147), with the least change that keeps his band: the lean dropped the blade to
 * 10.4–28.7° above level, so the wrist holds it back ({@link RUN_BLADE} x 0.68 → 0.45: 23.4–41.7°),
 * and it lowers his chest, so the sword hand's front comes about 0.02 H under the chest bone
 * (0.04 H over it on the 10° lean), recorded, not tuned away. The mercenary no longer runs
 * this carry: in his sprint his sword trails behind him, its point down
 * ({@link MERC_TRAILING_SWORD}; FS-JS7C8 § Change: The mercenary's sprint and trailing sword).
 *
 * The wizard's sceptre arm pumps smaller ({@link SCEPTRE_RUN_ARM}) about a centre drawn back
 * ({@link SCEPTRE_RUN_BACK}), so her hand peaks at the lower chest, not by the shoulder (the shared
 * pump's chest height, 0.70 H, sits just under this rig's shoulder at 0.74); her tome arm keeps the
 * full pump. The sceptre stands up from the fist ({@link RUN_SCEPTRE}), the wrist taking back a
 * little more than the pump ({@link RUN_SCEPTRE_WRIST}), so it leans forward a little as the hand
 * rises and stands up as it falls, the orb ahead of the hand and of her face, at most about her
 * chin, and her hand crossing in at the front as the swords' do. Her run carries it under the
 * sprint's 20° lean (FS-JS7C8 § Change: The wizard's sprint and pointed cast R122, R123), with the
 * least change to the carry that keeps her look: the lean lowers her chest, so the sceptre hand peaks at
 * 0.56–0.59 H, under the chest bone ({@link WIZARD_SPRINT_PEAK}; 0.61 H on the 10° lean), and her
 * tome hand's front comes about 0.02 H under the chest bone; the lean would have tipped the sceptre
 * to 48.5° off vertical and set the shaft's foot against her robe, so the wrist holds it back
 * ({@link RUN_SCEPTRE}: 26.0–37.3°, {@link WIZARD_SPRINT_TILT}) and the arm stands a little further
 * out ({@link SCEPTRE_RUN_OUT}).
 */
export const REST_ARM = [-0.05, 0, 0];
export const REST_ELBOW = [-0.12, 0, 0];
export const REST_BLADE = [0.95, 0, 0];
/** The sceptre's lean at rest, off vertical (degrees; the owner's "可以垂一點"): measured on the rig, the idle 37–41°, the walk 33–44°. */
export const SCEPTRE_TILT = 40;
const REST_SCEPTRE = [-0.68, -0.25, 0];
const WALK_WRIST = [0, 0.7];
/**
 * The knight's wrist in his run (rad, about x): the blade held forward along the forearm and raised
 * against the sprint's lean (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move
 * clips retired R144, R146; K2: the lean dropped the kept wrist's blade, 0.68, to 10.4–28.7° above
 * level, under his band). 0.45 is the largest that keeps the whole of his 23–42°: measured
 * 23.4–41.7° (24.1–40.5° on the 10° lean), the tip at most 0.946 H. The knight's alone.
 */
const RUN_BLADE = [0.45, 0, 0];
const RUN_WRIST = [0, 0.85];
/** The band a blade keeps in the run, degrees from level (+ up): raised, never back up to the old upright carry's 74–85° (was 5 to 35, and −10 to 20 before). */
export const RUN_BLADE_ELEV = [20, 50];
/** How high a blade's point may rise in the run (H, model space): a little over the crown, which the run's bob carries from 0.90 to 0.95 H. */
export const RUN_TIP_CEIL = 1.03;
/** The weapon arm's turn in at the front of the run's pump (rad, the upper arm's twist; 0 at the back of the pump). */
const RUN_CROSS = 0.3;
/** How far in toward the midline the weapon hand comes at the front of the pump against the back (H). */
export const RUN_CROSS_REACH = [0.05, 0.08];
/**
 * The wizard's wrist in her run (rad, about x): the sceptre held back against the sprint's lean, so
 * it leans in the world as it did on the shared run's 10° lean (FS-JS7C8 § Change: The wizard's
 * sprint and pointed cast R122, W2: the lean tipped the kept carry's sceptre to 36.7–48.5° off
 * vertical, past its band; it was −0.1, and the extra −0.2 takes back about the 10° the trunk now
 * leans further: 26.0–37.3°, against 23.4–37.8° on the 10° lean). Held back so far it also keeps the
 * Pyromancer's cage clear of her skull (1.31 skull radii at the nearest; −0.28 read 1.29, −0.2 1.27,
 * under the 1.3 the focus guard asks, mageLooks.test.mjs).
 */
const RUN_SCEPTRE = [-0.3, 0, 0];
const RUN_SCEPTRE_WRIST = [0, 1.2];
/** The wizard's sceptre arm's share of the shared pump (RUN_ARM), and how far its centre is drawn back (rad). */
const SCEPTRE_RUN_ARM = 0.76;
const SCEPTRE_RUN_BACK = 0.25;
/**
 * How far her sceptre arm stands out from the body in the run (rad, the upper arm about z; − is
 * out): under the sprint's lean the shaft's foot came against her robe on the run's key 1 (0.0006 H
 * in; W2: the lean broke a guard), so the arm stands 0.02 rad further out than it did (−0.12), the
 * foot 0.0028 H clear.
 */
const SCEPTRE_RUN_OUT = -0.14;
/**
 * Where the wizard's sceptre hand peaks in her run (H): the lower chest, under the chest bone, which
 * the sprint's lean lowers (FS-JS7C8 § Change: The wizard's sprint and pointed cast R123 (i);
 * measured 0.574; was 0.61 ± 0.01 on the shared run's 10° lean).
 */
export const WIZARD_SPRINT_PEAK = [0.56, 0.59];
/**
 * The sceptre's band off vertical through her run's pump (degrees): reasonably upright, as on the
 * shared run's 10° lean, the wrist taking back the sprint's (R123 (ii); measured 26.0–37.3°, inside
 * the owner-approved 15–45; 23.4–37.8° on the 10° lean).
 */
export const WIZARD_SPRINT_TILT = [24, 40];

/**
 * The sprint, one run the archer and the mercenary share (FS-JS7C8 § Change: The mercenary's sprint
 * and trailing sword M1, R93, the owner: "移動時也要像弓箭手跑的感覺"): its lean ({@link SPRINT_LEAN}),
 * its legs ({@link SPRINT_STEP}) and its clip at 16 fps ({@link SPRINT_RUN}), first keyed for the
 * archer (§ Change: The archer's sprint and low-ready bow) and defined here once, so each class's
 * `run` reads the same keys under its own arms. The wizard and the knight take the sprint's lean
 * and clip over the shared fast run's legs (clips.js RUN_STEP) at a shorter stride each
 * ({@link WIZARD_SPRINT_STRIDE}, {@link KNIGHT_SPRINT_STRIDE}), so no class runs the shared fast
 * run's lean and cadence (RUN_LEAN, RUN_ANIMATIONS) now. Defined ahead of the knight's style, which
 * reads it.
 *
 * The sprint's forward lean (§ Change: The archer's sprint and low-ready bow R67, D1, the owner:
 * "跑更快的話身體可能會更加前傾"): twice the shared RUN_LEAN, tilting the hips-to-neck line about 20°
 * (20.2–20.5° measured on her rig and on his; the shared run's is about 10°). The neck takes it
 * back out (clips.js steadyNeck), so the head still looks ahead.
 */
export const SPRINT_LEAN = 0.48;

/**
 * The sprint's legs (R68, R69; D2, D3), the rows of clips.js RUN_STEP it keys its own
 * (`run.legs`), right foot planted: contact, down, push, flight. Played at 16 fps, not the shared 14,
 * over a stride about 12% shorter, so the archer's measured pace stays at RUN_PACE (194.09 world px/s
 * at 16 fps against the shared keys' 221.39 there; the mercenary's, his legs a little longer, reads
 * 196.58, held within 3 px/s of it: § Change: The mercenary's sprint and trailing sword R95): the stance thigh lands less far ahead (−0.39, was
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
export const SPRINT_STEP = {
  thighR: [-0.39, -0.12, 0.275, 0.3],
  shinR: [0.3, 0.72, 0.35, 1],
  footR: [-0.06, -0.6, -0.025, -0.4],
  thighL: [0.24, -0.4, -0.85, -0.62],
  shinL: [1.4, 1.8, 1.5, 0.7],
  footL: [-0.94, -0.91, -0.45, -0.18],
  lift: [0, 0, 0, 0.06],
};

/** The sprint's clip (R68): the shared run's 8 looping frames and its cloth speed 2.5, at 16 fps. */
export const SPRINT_RUN = { ...RUN_ANIMATIONS.run, fps: 16 };

/**
 * The knight's stride in his run (FS-JS7C8 § Change: The knight's sprint, and the
 * attack-on-the-move clips retired R139; E1 (a)), the Berserker's too: the shared fast run's legs
 * (clips.js RUN_STEP, every thigh key) at 0.84, 16% shorter, so at the sprint's 16 fps his measured
 * pace stays at RUN_PACE (193.61 world px/s; his legs are longer than the others', so he takes 4%
 * more off than the sprint's 12%). Not the sprint's own legs ({@link SPRINT_STEP}): their heel kick
 * folded his calf up behind and out through the hauberk's back panel by 4.86 px at 1x, on all
 * three looks, and the Duelist-style carry that cleared it would swing that panel further in his
 * walk, his attack and his death. On these legs the leg guard, the cloak guard and the camera check
 * read 0 on all three looks. He gives up the sprint's higher knee and heel kick, which the hauberk
 * to the knee and the cloak to the calf partly hide.
 */
export const KNIGHT_SPRINT_STRIDE = 0.84;

/** His sprint's gait, shared by both his styles' runs: the sprint's lean at his stride. */
const KNIGHT_SPRINT_GAIT = { lean: SPRINT_LEAN, stride: KNIGHT_SPRINT_STRIDE };

/**
 * A build is `createRig`'s height and proportions; a style feeds clips.js (`attack` names the
 * attack, `hold` is the carry added to idle, walk and run, `walk` and `run` scale those gaits); a
 * sheet is the clips the class's sheet carries and the scale it is baked at (cast.js `CAST`).
 */
export const KNIGHT_BUILD = [2.0, { shoulderW: 1.1, torsoW: 1.06 }];

/**
 * How the knight's standing attack carries his cloak (simulateSprings, rig heights per second,
 * in walks): out behind as by half a walk. The slash's stance sets his right foot
 * back under the cloak as the cut settles, and hanging still the cloak let his calf and boot through
 * it by 7.6 px on the last key (clearance.js `cloakClearance`); half a walk holds it off the heel.
 */
export const KNIGHT_ATTACK_CLOTH = 0.5;

/**
 * The knight's sheet at 1.5x (FS-HF0WW § Change: Class sheets at 1.5x R35), a clip set of his own
 * (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips retired R149): the
 * four, his attack's cloth carried by KNIGHT_ATTACK_CLOTH, and his run, the sprint's clip at 16 fps
 * ({@link SPRINT_RUN}, R138). No attack on the move: attacking no longer moves him (the pin), and
 * the client plays his `attack` moving or not (R150). He was the last class to carry
 * `walk_attack` and `backpedal_attack`, and their code was retired after his bake (R155). The
 * Guardian takes it through cast.js `specRow`, the Berserker through {@link BERSERKER_SHEET}.
 */
export const KNIGHT_SHEET = {
  animations: { ...ANIMATIONS, attack: { ...ANIMATIONS.attack, speed: KNIGHT_ATTACK_CLOTH }, run: SPRINT_RUN },
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
  // his run (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move clips retired
  // R138, R139): the trunk about 20° forward ({@link SPRINT_LEAN}) over the shared fast run's legs
  // at a shorter stride ({@link KNIGHT_SPRINT_STRIDE}). The carry (FS-JS7C8 R2), kept but for the
  // wrist the lean asked for (K2, {@link RUN_BLADE}): the sword arm pumps free from the shoulder, a
  // little out from the hip, crossing in at the front, the blade held forward and raised; the
  // shield arm keeps the shield up before the chest, bent about 90° and swinging short
  run: {
    arms: [0.3, 1],
    elbow: [0.2, 1],
    wrist: RUN_WRIST,
    cross: [0, RUN_CROSS],
    hold: pose({ upperArmL: [-0.38, -0.85, 0.12], foreArmL: [-1.25, 0, 0], upperArmR: [0, 0, -0.06], handR: RUN_BLADE }),
    ...KNIGHT_SPRINT_GAIT,
  },
};

/**
 * The Berserker's sheet (FS-1J1CB R9, R28): the knight's clips, and the off-hand twin of each
 * attack (clips.js `withOffhand`), at the knight's 1.5x. His one attack is `attack`, so its one
 * twin is `attack_offhand` (FS-JS7C8 § Change: The knight's sprint, and the attack-on-the-move
 * clips retired R149).
 */
export const BERSERKER_SHEET = { animations: withOffhand(KNIGHT_SHEET.animations), scale: 1.5 };

/**
 * The Berserker's carry and cut (FS-1J1CB R2), his own beside {@link KNIGHT_STYLE}: a heavy
 * bearded axe in each hand (warriorKit.js `heavyAxe`), no shield. At rest both arms hang low and a
 * little out, the wrists tipping each haft down and forward of the fist ({@link CLEAVE_CARRY}), so
 * the heads hang forward of the legs with the edge facing forward and a little down
 * (axe.test.mjs). In the walk both wrists take back most of the arms' swing, so the axes sway
 * without swinging up. In the run both arms pump, shorter than a sword arm and bent less, the
 * wrists holding the hafts forward and down so the edges keep facing forward, never up. The cut is
 * `cleave` (clips.js): wide, the free arm swung back against it. His run is the knight's, the
 * sprint's lean over the shared legs at {@link KNIGHT_SPRINT_STRIDE}, its carry unchanged (FS-JS7C8
 * § Change: The knight's sprint, and the attack-on-the-move clips retired R148).
 */
/**
 * How much less the Berserker's wrists tip each haft down in his run than at rest (rad, off
 * {@link CLEAVE_CARRY}; integrated with Looks v2 2026-11-23, FS-JS7C8 § Change: The knight's
 * sprint R148 and FS-1J1CB § Change: Looks v2 R55): Looks v2's heavy axes (warriorKit.js
 * `heavyAxe`, the haft 0.47 H against the old 0.36) hung under the sprint's lean dipped their
 * lowest point to −0.003 H, through the ground, on run keys 1 and 5 (0.028 H on 2 and 6), where
 * the old axes read 0.081 H and Looks v2's own run, without the lean, 0.041 H. Taking 0.32 rad off
 * the run's carry alone lifts it to 0.062 H, over the axe floor (axe.test.mjs `AXE_FLOOR`, 0.06 H),
 * the edges still forward and never up past 30°. The rest, the walk and the cleave are Looks v2's.
 */
export const BERSERKER_RUN_LIFT = 0.32;
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
    hold: pose({
      upperArmR: [0, 0, -0.12],
      upperArmL: [0, 0, 0.12],
      handR: [CLEAVE_CARRY - BERSERKER_RUN_LIFT, 0, 0],
      handL: [CLEAVE_CARRY - BERSERKER_RUN_LIFT, 0, 0],
    }),
    ...KNIGHT_SPRINT_GAIT,
  },
};

/**
 * The Guardian's cut (FS-1J1CB §Change: Looks v2 R54, R62), his own beside {@link KNIGHT_STYLE}: the
 * knight's compact slash behind the raised shield, his shield arm carried a little higher and out
 * through every key ({@link GUARDIAN_SHIELD_LIFT}), so the flanged mace, swung on through to low
 * past the left hip, passes under and before the shield's bigger face and never through it
 * (warriorLooks.test.mjs). The carry, the walk and the run are the knight's.
 */
export const GUARDIAN_SHIELD_LIFT = pose({ upperArmL: [-0.1, 0, 0.08] });
export const GUARDIAN_STYLE = { ...KNIGHT_STYLE, attackExtra: GUARDIAN_SHIELD_LIFT };

export const ARCHER_BUILD = [1.96, { shoulderW: 1.0, torsoW: 0.98 }];

/**
 * The archer's carry in her sprint, the two-handed low-ready bow (FS-JS7C8 § Change: The archer's
 * sprint and low-ready bow R72, R73, R77, R87–R90; D4–D6, the owner: "拿弓的動作要有一種隨時備戰的感覺
 * 要雙手拿著弓放在身體前方 但不用抬太高", and on 2026-11-23 "左手拿弓 右手拿箭的預備動作 放在身前 弓傾斜在身前",
 * "左高右低", "預備動作最好可以看到一根弓箭在上面預備", "輕輕靠在上面", "箭尾右手輕輕扣著就好"): her run's
 * `hold`, the whole of her arms there (her run's pump is off), so each hand stays put in the chest's
 * frame and only rides the trunk's turn, lean and bob. The left fist holds the grip in front of her
 * belly, a little right of her centre; the bow lies canted across the front of her, its upper limb
 * out on her own left and high, its lower limb across toward her right leg and low, clear of it.
 * One arrow is nocked (`fx.arrow`, gear.js `longbow`: on the braced, undrawn string, through the
 * grip, lying on the bow by the fist), pointing forward and down at the ground ahead; the right
 * hand lightly hooks its nock end, no draw. Measured on the baked run (the bow rocks with the
 * chest's counter-turn): the stave 61–74° off vertical (about 68° on average), the arrow 23–24°
 * below level and within 11° of the facing; the hands 0.53–0.62 H, 0.055–0.072 H over the hips
 * bone and under the chest bone, inside the shoulders; the tip under the head on screen in every
 * facing on the base and, with Looks v2's shorter recurve, the Hunter; over the Shadow Ranger's
 * deeper Looks v2 cowl by up to 0.030 H in n and ne (escalated, R90; integrated 2026-11-23). Each
 * look's own bow (Looks v2 R58, R59) hangs in the same grip. The bands are archerLooks.test.mjs's. Solved once (a two-bone arm onto the grip with the bow's
 * frame set by the wrist, and the right arm onto the nock, at the sprint's mid-stride trunk) and
 * kept as keys, so the bake poses it like any other carry.
 */
export const ARCHER_LOW_READY = pose(
  {
    upperArmL: [-0.71, 0.2, -0.62],
    foreArmL: [-0.55, 0.21, -0.72],
    handL: [-0.6, 0.05, 0.75],
    upperArmR: [-0.32, 0.07, -0.31],
    foreArmR: [-1.75, -0.69, 0.58],
  },
  {},
  { arrow: 1 },
);

/**
 * The archer's sheet at 1.5x (ADR-0076), a clip set of her own (FS-JS7C8 § Change: The archer's
 * sprint and low-ready bow R79, D7, D8): the four, and her run, her own sprint (R68): 16 fps over a
 * shorter stride, so its measured pace stays at RUN_PACE, the cloth carried at the shared run's
 * speed ({@link SPRINT_RUN}). No attack on the move: attacking no longer moves her (the pin), and
 * the client plays her `attack` moving or not. The Hunter and the Shadow Ranger take it through cast.js `specRow`.
 */
export const ARCHER_SHEET = { animations: { ...ANIMATIONS, run: SPRINT_RUN }, scale: 1.5 };

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
  // forward ({@link SPRINT_LEAN}) over the sprint's legs ({@link SPRINT_STEP}), the bow
  // carried two-handed at the low ready ({@link ARCHER_LOW_READY}): no pump, no elbow swing
  run: { arms: [0, 0], elbow: [0, 0], hold: ARCHER_LOW_READY, lean: SPRINT_LEAN, legs: SPRINT_STEP },
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
 * The wizard's stride in her run (FS-JS7C8 § Change: The wizard's sprint and pointed cast R117; E1
 * (a)): the shared fast run's legs (clips.js RUN_STEP, every thigh key) at 0.88, 12% shorter as the
 * sprint's stride is, so at the sprint's 16 fps her measured pace stays at RUN_PACE (194.21 world
 * px/s). Not the sprint's own legs ({@link SPRINT_STEP}): their knee drive came out through her
 * gown's front by 3.2 px at 1.5x, and no robe setting cleared it; on these legs her robe's guards
 * read 0 px on all three looks. She gives up the sprint's higher knee and heel kick, which her
 * ankle-length gown mostly hides.
 */
export const WIZARD_SPRINT_STRIDE = 0.88;

/**
 * The wizard's sheet at 1.5x (FS-HF0WW § Change: Class sheets at 1.5x R35), a clip set of her own
 * (FS-JS7C8 § Change: The wizard's sprint and pointed cast R131): the four and her run, the
 * sprint's clip at 16 fps ({@link SPRINT_RUN}, R116). No attack on the move: attacking no longer
 * moves her (the pin), and the client plays her cast moving or not (R132). The Spellwarden and the Pyromancer take it
 * through cast.js `specRow`.
 */
export const WIZARD_SHEET = { animations: { ...ANIMATIONS, run: SPRINT_RUN }, scale: 1.5 };

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
  // her run (FS-JS7C8 § Change: The wizard's sprint and pointed cast R116, R117): the trunk about
  // 20° forward ({@link SPRINT_LEAN}) over the shared fast run's legs at a shorter stride
  // ({@link WIZARD_SPRINT_STRIDE}). The carry (FS-JS7C8 R2), kept but for two values the lean asked
  // for (W2, R122: the sceptre arm further out, {@link SCEPTRE_RUN_OUT}, and the wrist held back,
  // {@link RUN_SCEPTRE}): both arms pump from the shoulder, a little out from the body so the
  // sceptre and the tome swing clear of the hips, the sceptre arm smaller and drawn back so its hand
  // peaks at the lower chest, crossing in at the front; the sceptre up from the fist, its head ahead
  run: {
    arms: [1, SCEPTRE_RUN_ARM],
    wrist: RUN_SCEPTRE_WRIST,
    cross: [0, RUN_CROSS],
    hold: pose({ upperArmL: [0, 0, 0.14], upperArmR: [SCEPTRE_RUN_BACK, 0, SCEPTRE_RUN_OUT], handR: RUN_SCEPTRE }),
    lean: SPRINT_LEAN,
    stride: WIZARD_SPRINT_STRIDE,
  },
  idleExtra: () => pose({}, {}, { glow: 1 }),
};

/**
 * The Spellwarden's carry (FS-1J1CB §Change: Looks v2 R56, R62), her own beside
 * {@link WIZARD_STYLE}: the iron-shod warding staff (mageKit.js `wardingStaff`) stood upright
 * beside her, the forearm out and forward of her right hip, the wrist turned in so the staff
 * stands plumb, the fist round it a little under its middle, so the shoe is carried clear over the
 * ground and the cage stands over her crown. This is her walk's carry; her idle plants the staff
 * on the ground instead ({@link WARD_PLANT}).
 * The walk swings that arm short, the wrist keeping the staff upright; in the run the forearm pumps
 * level, out from the hip and never crossing in, the wrist holding the staff up. Her cast is her
 * own heavy cast, the long staff pushed forward with the elbow bent (clips.js `wardCast`); in the
 * death the fist lets the staff fall level, clear of the ground ({@link WARD_DEATH}).
 * Integrated with FS-JS7C8 on 2026-11-23, the owner: 「如果有改武器就套用main的」: her carry, walk and
 * run carry stay Looks v2's, under the sprint's lean, stride and 16 fps; the pointed cast is the
 * base wizard's alone. FS-1J1CB § Change: The Spellwarden's long staff planted and swung heavy
 * (R74–R81) then gave her the planted idle and her own cast's keys 3–5 in place of Looks v2's.
 */
export const WARD_HOLD = pose({ upperArmR: [-0.2, 0, -0.3], foreArmR: [-0.95, 0, 0], handR: [-0.2, -0.45, 0], foreArmL: [-0.15, 0, 0] });
export const WARD_RUN_HOLD = pose({ upperArmL: [0, 0, 0.14], upperArmR: [-0.1, 0, -0.3], handR: [0.12, -0.45, 0] });
/**
 * The fist's give as she falls, by death key: none while she buckles, then the wrist turns the
 * long staff out from under her and lays it level beside her as she goes down, its shoe and its
 * cage both off the floor. The hand's own angles are zero in the death clip, so these are its
 * whole turn.
 */
export const WARD_DEATH = [null, null, null, [0, -0.4, 0], [0.6, -0.8, -1.2], [0, -1.6, -0.8], [0.2, -1.6, -0.4]];
/**
 * The planted staff in her idle (FS-1J1CB § Change: The Spellwarden's long staff planted and swung
 * heavy R74–R77; the owner, 2026-11-23: 「站立不動時應該把長杖垂直頂在地面上不用拿在空中 但也不用到垂直
 * 可以往外有一點點角度」): the shoe's point on the ground at `shoe` (model space [x, z], H: ahead of
 * and to the right of her right foot, just outside the bell's hem, `height` over the ground), the
 * staff `tilt` degrees off vertical, its top leaning straight out to her right (−x, in the frontal
 * plane). The fist holds the leather grip where it is mounted, so 0.46 H up the staff: about
 * 0.45 H over the ground. {@link WARD_PLANT_ARM} is solved from it (the solve is in
 * mageLooks.test.mjs, which re-derives the keys and holds every baked idle frame to it).
 */
export const WARD_PLANT = { shoe: [-0.1, 0.16], height: 0.0012, tilt: 10 };
/**
 * Her right arm on each idle frame, on top of the idle's breathing, so the hand follows the staff
 * where {@link WARD_PLANT} stands it and the breath never lifts or sinks the shoe: the shoulder
 * dropped and brought a touch forward (the clavicle), the arm hanging out and forward with the
 * elbow a little bent (21–24°), the wrist cocked back 0.88 rad and turned in so the staff stands
 * up out of the fist. Solved on her rig (the fist's grip on the staff's line, the staff along it),
 * to the thousandth, by mageLooks.test.mjs `solvePlantArm`: change {@link WARD_PLANT}, the idle or
 * her rig and that test gives the new keys. One key per idle frame, so the shared idle's 6.
 */
export const WARD_PLANT_ARM = [
  { clavicleR: [-0.005, 0.03, 0.095], upperArmR: [-0.273, -0.124, -0.221], foreArmR: [-0.216, -0.091, 0], handR: [-0.883, -0.303, -0.143] },
  { clavicleR: [-0.005, 0.034, 0.11], upperArmR: [-0.286, -0.126, -0.218], foreArmR: [-0.162, -0.099, 0], handR: [-0.886, -0.298, -0.157] },
  { clavicleR: [-0.005, 0.032, 0.103], upperArmR: [-0.275, -0.117, -0.203], foreArmR: [-0.183, -0.088, 0], handR: [-0.878, -0.3, -0.146] },
  { clavicleR: [-0.004, 0.031, 0.095], upperArmR: [-0.27, -0.11, -0.205], foreArmR: [-0.222, -0.08, 0], handR: [-0.885, -0.296, -0.136] },
  { clavicleR: [-0.004, 0.029, 0.087], upperArmR: [-0.265, -0.109, -0.214], foreArmR: [-0.263, -0.075, 0], handR: [-0.888, -0.296, -0.127] },
  { clavicleR: [-0.004, 0.027, 0.083], upperArmR: [-0.261, -0.115, -0.219], foreArmR: [-0.27, -0.078, 0], handR: [-0.883, -0.303, -0.127] },
];
export const SPELLWARDEN_STYLE = {
  ...WIZARD_STYLE,
  // her heavy cast, the long staff pushed forward (clips.js `wardCast`)
  attack: "wardCast",
  hold: WARD_HOLD,
  // the idle plants the staff ({@link WARD_PLANT}); the left arm as WARD_HOLD carries it
  idle: { hold: pose({ foreArmL: [-0.15, 0, 0] }) },
  idleExtra: (i) => pose(WARD_PLANT_ARM[i], {}, { glow: 1 }),
  walk: { ...WIZARD_STYLE.walk, arms: [0.8, 0.3] },
  run: { ...WIZARD_STYLE.run, arms: [1, 0.4], wrist: [0, 1], cross: [0, 0], hold: WARD_RUN_HOLD },
  deathExtra: (i) => WARD_DEATH[i] && pose({ handR: WARD_DEATH[i] }),
};

/**
 * The Pyromancer's carry (FS-1J1CB §Change: Looks v2 R57, R62), her own beside
 * {@link WIZARD_STYLE}: the brazier rod (mageKit.js `brazierRod`) held up out from her right
 * side like a torch, the arm lifted out, the forearm level and the wrist turned in so the rod
 * stands upright, the fire riding high and out from her, never against her face or the gown. The walk swings that arm short; the run pumps it level, out
 * from the hip. The cast is the wizard's thrust, the cage turned out from her head as she draws
 * it back ({@link PYRE_CAST}); in the death the fist lays the brazier down clear of the ground
 * ({@link PYRE_DEATH}). *
 * Integrated with FS-JS7C8 on 2026-11-23, the owner: 「如果有改武器就套用main的」: her carry, walk, run
 * carry and cast stay Looks v2's, the cast the wizard's thrust as it was before the pointed cast
 * (clips.js `staffCast`), under the sprint's lean, stride and 16 fps; the pointed cast is the base
 * wizard's alone.
 */
export const PYRE_HOLD = pose({ upperArmR: [-0.1, 0, -0.6], foreArmR: [-1.2, 0, 0], handR: [-0.05, -0.7, 0], foreArmL: [-0.15, 0, 0] });
export const PYRE_RUN_HOLD = pose({ upperArmL: [0, 0, 0.14], upperArmR: [-0.15, 0, -0.45], handR: [0.12, -0.6, 0] });
/**
 * The fist's own turn on each cast key (rad, added to the wizard's): as she draws the brazier back
 * by her shoulder (key 1) the wrist turns its cage out from her head.
 */
export const PYRE_CAST = [null, [0, 0.25, 0], null, null, null, null, null];
/**
 * The fist's give as she falls, by death key: none while she buckles, then the wrist lays the
 * brazier on its side out from under her, its cage off the floor.
 */
export const PYRE_DEATH = [null, null, null, null, [0.2, -0.4, -1.2], [0.4, -1.6, 0], [0.4, -1.6, -0.8]];
export const PYROMANCER_STYLE = {
  ...WIZARD_STYLE,
  attack: "staffCast",
  hold: PYRE_HOLD,
  walk: { ...WIZARD_STYLE.walk, arms: [0.8, 0.3] },
  run: { ...WIZARD_STYLE.run, arms: [1, 0.4], wrist: [0, 1], cross: [0, 0], hold: PYRE_RUN_HOLD },
  attackExtra: (i) => PYRE_CAST[i] && pose({ handR: PYRE_CAST[i] }),
  deathExtra: (i) => PYRE_DEATH[i] && pose({ handR: PYRE_DEATH[i] }),
};

/** How far the upper arms spread out at rest (rad; rig.js `rig.rest.upperArmL`/`upperArmR`, about z). */
const ARM_SPREAD = 0.1;

/**
 * The right upper arm's pose offset for three turns in the chest's frame, made in order: swung
 * `back` about x, out `out` past the rest's spread about z, then `twist` about its own length (y).
 * The bones take one Euler triple (XYZ) over the rest, so it is the triple those three make, less
 * the rest, to the thousandth as keys are written.
 */
function rightArmTurned({ back, out, twist }) {
  const turn = (x, y, z, a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), a);
  const q = turn(1, 0, 0, back)
    .multiply(turn(0, 0, 1, -(ARM_SPREAD + out)))
    .multiply(turn(0, 1, 0, twist));
  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return [e.x, e.y, e.z + ARM_SPREAD].map((v) => Math.round(v * 1000) / 1000);
}

/**
 * The trailing sword arm's three turns (rad; {@link MERC_TRAILING_SWORD}): a tune round edits these,
 * never the triple they make. The twist is negative: the upper arm turned out about its length.
 */
export const MERC_TRAILING_TURNS = { back: 0.46, out: 0.22, twist: -0.6 };

/**
 * The mercenary's trailing sword in his sprint (FS-JS7C8 § Change: The mercenary's sprint and
 * trailing sword M2, M3, R97–R102; the owner: "右手拿劍時把劍往身體後擺 像常見的rpg比較酷的動作", then
 * "不用抬高 可以往下垂 但不要拖地", then "拖劍時我感覺劍體應該會往伸外 目前你是做成往內好像不太合理" and
 * "手的虎口是朝外的所以自然的話劍尖會偏外", R158): his run's `hold`, the sword arm's whole carry there.
 * The arm swings back behind the leaning trunk nearly straight, out a little from the hip, the
 * hand at about the hips bone's height; the curved blade lies behind him and out to his right,
 * its point hanging down and its edge down, well off the ground. Keyed as three turns of the
 * upper arm in the chest's frame: swung back 0.46 rad, out 0.22 rad past the rest's 0.1, then
 * turned 0.6 rad out about its own length (the shoulder's outward turn)
 * ({@link MERC_TRAILING_TURNS}), held as the one Euler triple those make, the bones' XYZ order,
 * less the rest ({@link rightArmTurned}); the elbow a little bent (0.1 rad) and the forearm
 * supinated 1.6 rad, so the arm's 2.2 rad of turn faces the thumb-web out and brings the edge
 * down while the fist stays square on the forearm (the normal grip); the wrist cocks the blade
 * back down past the vertical (1.55 rad), only in the swing, so the blade leaves the fist outward
 * and never by a sideways bend of the wrist. The same 2.2 rad turned in (the shoulder in, the
 * forearm pronated) angled the blade in, 13.7–19.0° toward his left. Out 0.22 keeps the
 * Duelist's wide right sleeve clear of his half-cloak's right hem, which the sprint carries out
 * behind (at 0.15 or less it crossed it on the run's last key); the arm swung back a little less
 * and swaying less ({@link MERC_TRAILING_SWAY}) keep the hand, which the outward turn lifts, at
 * the hip (mercLooks.test.mjs). Measured on the rig over the cycle: seen from above the blade
 * 25.4–34.2° out to his right of straight back through the hand (30.0° on average), its point
 * 0.41–0.47 H right of the hips bone; the upper arm 26.1–39.8° behind the trunk (33.2° on
 * average), the elbow bent 5.3–6.2°, the hand 0.03 H under to 0.058 H over the hips bone and
 * 0.12–0.21 H behind it; the blade 28.9–42.7° below level, its point 0.43–0.61 H behind the hips
 * bone; the edge 32.1–46.5° below level; the blade's centre line at least 0.118 H off the ground.
 */
const MERC_TRAILING_SWORD = pose({ upperArmR: rightArmTurned(MERC_TRAILING_TURNS), foreArmR: [-0.1, -1.6, 0], handR: [1.55, 0, 0] });

/**
 * The trailing arm's share of the shared pump (clips.js `runCycle`, RUN_ARM): with the chest's
 * counter-turn it sways the arm 13.7° peak to peak in his sagittal plane (M3's "about ±10°", R100's
 * 12–26°), furthest back as the free arm swings furthest forward and his right knee leads. A tenth
 * of the pump (17.2°) lifted the hand past R97's 0.06 H over the hips bone once the arm turned out
 * (R158).
 */
const MERC_TRAILING_SWAY = 0.08;

export const MERCENARY_BUILD = [1.98, { shoulderW: 1.14, torsoW: 1.07, torsoD: 1.04, hipW: 0.95, armR: 1.16, limbR: 1.1 }];

/**
 * The mercenary's sheet at 1.5x (FS-HF0WW § Change: Class sheets at 1.5x R35), a clip set of his
 * own (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R107): the four, his parry
 * (FS-MAMHR §H) and his run, the sprint's clip at 16 fps ({@link SPRINT_RUN}, R94). No attack on
 * the move: attacking no longer moves him (the pin), and the client plays his `attack` moving or
 * not (R108). The Duelist
 * and the Sellsword take it through cast.js `specRow`.
 */
export const MERCENARY_SHEET = { animations: { ...ANIMATIONS, parry: MERC_ANIMATIONS.parry, run: SPRINT_RUN }, scale: 1.5 };

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
  // the sprint (FS-JS7C8 § Change: The mercenary's sprint and trailing sword R94): the trunk about
  // 20° forward ({@link SPRINT_LEAN}) over the sprint's legs ({@link SPRINT_STEP}); the sword trails
  // behind him ({@link MERC_TRAILING_SWORD}), the arm swaying a tenth of the shared pump
  // ({@link MERC_TRAILING_SWAY}) and never bending with it; the free arm pumps as the shared run's
  run: { arms: [1, MERC_TRAILING_SWAY], elbow: [1, 0], hold: MERC_TRAILING_SWORD, lean: SPRINT_LEAN, legs: SPRINT_STEP },
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

/**
 * The Duelist's trailing sword arm (rad; {@link MERC_TRAILING_TURNS}, {@link MERC_TRAILING_SWORD}),
 * his own under Looks v2's gear (integrated 2026-11-23): swung out 0.08 past the rest's spread,
 * where the mercenary's is 0.22, the back swing, the twist and the forearm his; the wrist cocked
 * 1.32 ({@link DUELIST_TRAILING_COCK}), where the mercenary's is 1.55. His long hilt (Looks v2
 * R60, mercLooks.test.mjs: the butt more than 0.052 H off the forearm) sat 0.037 H off it at the
 * mercenary's 1.55 cock (1.40: 0.048); 1.32 holds it at 0.052. Less cocked, the long blade turns
 * further out, so the arm stands in a little closer: seen from above the blade runs 23.7–32.8° out
 * from straight back through the hand, inside R158's 20–35° (the base's 25.5–33.9°; at out 0.22,
 * 31.7–42.2°). In the run his half-cloak is carried off the shoulder (mercLooks.js `HALF_CLOAK_RUN`),
 * so the arm no longer needs to stand out past it (at 0.35 it once did). The long blade's other
 * guards (the legs, boots, robe, half-cloak, body, the pieces at the hips, the ground at 0.06 H)
 * hold; 16.8–36.1° below level.
 */
export const DUELIST_TRAILING_TURNS = { ...MERC_TRAILING_TURNS, out: 0.08 };
export const DUELIST_TRAILING_COCK = 1.32;
const DUELIST_TRAILING_SWORD = pose({ upperArmR: rightArmTurned(DUELIST_TRAILING_TURNS), foreArmR: MERC_TRAILING_SWORD.b.foreArmR, handR: [DUELIST_TRAILING_COCK, 0, 0] });
/**
 * The Duelist's run (FS-1J1CB §Change: Looks v2 R60, R62), his own beside {@link MERCENARY_STYLE}.
 * Looks v2 carried the long-hilted blade (mercKit.js `longBlade`) as the mercenary then carried
 * his, raised forward on the pumping arm, its wrist re-keyed ([0, 0.55], under the old pump's 0.85)
 * so the long hilt kept off his forearm. Integrated with FS-JS7C8 on 2026-11-23, the owner:
 * 「Duelist 也改拖劍」: he trails the sword as the base and the Sellsword do (the sprint's lean, legs
 * and 16 fps), so that re-key, written for the raised-blade pump, is dropped; the hilt keeps clear
 * of the forearm without it (mercLooks.test.mjs, the butt over 0.052 H off it on every pose). His
 * own in the run is the trailing arm swung out further and the wrist cocked less
 * ({@link DUELIST_TRAILING_TURNS}, {@link DUELIST_TRAILING_COCK}). The carry, the walk, the cut and
 * the parry are the mercenary's.
 */
export const DUELIST_STYLE = { ...MERCENARY_STYLE, run: { ...MERCENARY_STYLE.run, hold: DUELIST_TRAILING_SWORD } };
