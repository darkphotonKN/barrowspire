/**
 * Which baked clip a character plays (FS-2325V §E.4): the state a scene already knows (moving,
 * idle, attacking, dead) in, a manifest animation key and 8-way direction out. Pure, so both
 * scenes share one rule and it is testable without a canvas.
 *
 * Nothing here is new game state. `velocity` is the motion the scene already draws, `attacking`
 * is the window of an attack or skill effect the scene already fires, and `dead` is the health
 * the server already sends reaching zero.
 */

import { facingFrom, movesAwayFrom, type Facing8 } from "@/render/iso/facing";
import { directionIndex } from "./manifest";

/** The clips every character and creature sheet carries (FS-2325V §E.2). */
export const CHARACTER_ANIMATIONS = ["idle", "walk", "attack", "death"] as const;
/**
 * Those, the Mercenary's own guard (FS-MAMHR §G.35): the parry clip only his sheet carries,
 * raised into and then held on its last frame; and a class's attack on the move
 * (FS-HF0WW, FS-3V7GC): `walk_attack`, the attack from the waist up over the walk from the
 * waist down, lasting exactly as long as the attack, which the four classes' sheets carry; and
 * a demon's fire claw (FS-VHGE7 §D R31), which only the demons' sheets carry once baked; and
 * a class's `run` and `backpedal` (FS-JS7C8 §A, §B), which a class sheet carries once re-baked.
 */
export type CharacterAnimation =
  | (typeof CHARACTER_ANIMATIONS)[number]
  | "parry"
  | "walk_attack"
  | "claw"
  | "run"
  | "backpedal";

/**
 * World px per second the walk clip covers at 1x: the stride the bake keyed, over one cycle at
 * its authored fps. The server moves a player at `DefaultSpeed` (200 world px/s), so a walk
 * plays at about 2.7x to keep planted feet planted.
 */
export const WALK_PACE = 74;
/**
 * World px per second the run clip covers at 1x, measured as {@link WALK_PACE} is (FS-JS7C8 R3).
 * A placeholder inside the band the run is keyed to (180–220) until the bake measures the keyed
 * clip; inert while no sheet carries `run`.
 */
export const RUN_PACE = 200;
/**
 * World px per second the backpedal clip covers at 1x (FS-JS7C8 R10). A placeholder inside its
 * band (150–220) until the bake measures it; inert while no sheet carries `backpedal`.
 */
export const BACKPEDAL_PACE = 200;
/** Below this drawn speed (world px/s) a player is standing, not walking: easing residue. */
export const MOVING_SPEED = 20;
/**
 * The walk (and the run and backpedal) never plays faster than this, however fast a burst (a
 * dash) carries the body.
 */
export const MAX_WALK_SCALE = 4;

/** What a scene knows about one character this frame. */
export interface CharacterState {
  /** World velocity as drawn (the eased position's motion), in world px per second. */
  velocity: { vx: number; vy: number };
  /** The facing shown last frame; kept while standing, attacking without aim, or dead. */
  facing: Facing8;
  /** An attack or skill effect fired and its clip has not run out. */
  attacking: boolean;
  /** Health has reached zero. */
  dead: boolean;
  /** World vector from the character toward what the attack is aimed at, when known. */
  aim?: { x: number; y: number };
  /**
   * World vector toward a held aim (FS-JTNPR req 10): the character stands in its idle clip
   * turned to it, whatever motion is still being drawn. Attack and death play over it.
   */
  holding?: { x: number; y: number };
  /**
   * The Mercenary's parry stance is up (FS-MAMHR §G.35): he stands in his guard, the whole body,
   * walking or not. The stance never roots him (§C.13), so a guard drawn while he moves slides with
   * him for its quarter second rather than splitting legs from arms, which one baked sprite cannot.
   * A swing started inside the stance plays over it; death over both.
   */
  guarding?: boolean;
  /**
   * The sheet carries `walk_attack` (the four classes', FS-HF0WW, FS-3V7GC): an attack drawn
   * while the body moves keeps the legs walking instead of sliding the whole attack pose along.
   * Without it, or during a charge's held pose, the attack plays as before.
   */
  walkAttack?: boolean;
  /**
   * The facing the character is turned to while it may choose (FS-JS7C8 §D): the pointer facing
   * for the local player. Idle, run, backpedal and the guard turn to it; an attack still faces
   * its aim, death keeps its facing, a held aim turns to the hold. Absent (folk, monsters, menu
   * figures, a player before the pointer moves): today's facing rules exactly.
   */
  face?: Facing8;
  /** The sheet carries `run` (FS-JS7C8 §A): a moving class runs instead of walking. */
  run?: boolean;
  /** The sheet carries `backpedal` (FS-JS7C8 §B): moving away from `face` steps backward. */
  backpedal?: boolean;
}

export interface AnimationChoice {
  animation: CharacterAnimation;
  facing: Facing8;
  /** The frame-list index of `facing` on an 8-way sheet (`DIRECTION_ORDER`). */
  direction: number;
  /** Playback rate: the walk follows the speed drawn, every other clip plays as authored. */
  timeScale: number;
}

/**
 * Dead over attacking over guarding over holding an aim over moving over idle. Attacking while
 * moving on a sheet that carries `walk_attack` plays that, turned the way the attack would be (to
 * the aim when known): the legs walk toward the aim, whichever way the body is going.
 *
 * Moving on a sheet that carries `run` runs, turned to `face`; moving more than 90° away from
 * `face` backpedals, turned to it, or with no `backpedal` runs turned to the movement
 * (FS-JS7C8 R9, R11). A sheet without `run` walks turned to the movement, as before.
 */
export function selectAnimation(state: CharacterState): AnimationChoice {
  const { velocity, facing, attacking, dead, aim, holding, guarding, walkAttack, face, run, backpedal } =
    state;
  const speed = Math.hypot(velocity.vx, velocity.vy);
  const moving = speed >= MOVING_SPEED;

  const choose = (animation: CharacterAnimation, to: Facing8, timeScale = 1) => ({
    animation,
    facing: to,
    direction: directionIndex(to),
    timeScale,
  });

  if (dead) return choose("death", facing);

  const walking = moving ? facingFrom(velocity.vx, velocity.vy, facing) : facing;
  if (attacking)
    return choose(
      moving && walkAttack ? "walk_attack" : "attack",
      aim ? facingFrom(aim.x, aim.y, walking) : walking,
    );

  // not directional (§C.10): he guards whichever way he is going, or faces where he looks
  if (guarding) return choose("parry", face ?? walking);

  if (holding) return choose("idle", facingFrom(holding.x, holding.y, facing));

  const paced = (pace: number) => Math.min(speed / pace, MAX_WALK_SCALE);
  if (moving && run) {
    if (!face || !movesAwayFrom(face, velocity.vx, velocity.vy))
      return choose("run", face ?? walking, paced(RUN_PACE));
    // a sheet baked with the run alone runs the way it goes rather than moonwalk (R11)
    return backpedal
      ? choose("backpedal", face, paced(BACKPEDAL_PACE))
      : choose("run", walking, paced(RUN_PACE));
  }

  if (moving) return choose("walk", walking, paced(WALK_PACE));

  return choose("idle", face ?? facing);
}

/**
 * The sheet a server class draws from (today's `createKnight/Soldier/ArcherTextures`): warrior
 * is the knight, mage the wizard, the mercenary his own (FS-MAMHR §H.42). Unknown classes fall
 * back to the knight, as the placeholder textures fall back to the warrior. Rivals reuse their
 * class's sheet (FS-2325V §E.3).
 */
export function characterSheet(playerClass: string | undefined): string {
  switch ((playerClass ?? "").toLowerCase()) {
    case "mage":
      return "char_wizard_base";
    case "archer":
      return "char_archer_base";
    case "mercenary":
      return "char_mercenary_base";
    default:
      return "char_knight_base";
  }
}
