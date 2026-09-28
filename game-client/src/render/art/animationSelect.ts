/**
 * Which baked clip a character plays (FS-2325V §E.4): the state a scene already knows (moving,
 * idle, attacking, dead) in, a manifest animation key and 8-way direction out. Pure, so both
 * scenes share one rule and it is testable without a canvas.
 *
 * Nothing here is new game state. `velocity` is the motion the scene already draws, `attacking`
 * is the window of an attack or skill effect the scene already fires, and `dead` is the health
 * the server already sends reaching zero.
 */

import { facingFrom, type Facing8 } from "@/render/iso/facing";
import { directionIndex } from "./manifest";

/** The clips every character and creature sheet carries (FS-2325V §E.2). */
export const CHARACTER_ANIMATIONS = ["idle", "walk", "attack", "death"] as const;
export type CharacterAnimation = (typeof CHARACTER_ANIMATIONS)[number];

/**
 * World px per second the walk clip covers at 1x: the stride the bake keyed, over one cycle at
 * its authored fps. The server moves a delver at `DefaultSpeed` (200 world px/s), so a walk
 * plays at about 2.7x to keep planted feet planted.
 */
export const WALK_PACE = 74;
/** Below this drawn speed (world px/s) a delver is standing, not walking: easing residue. */
export const MOVING_SPEED = 20;
/** The walk never plays faster than this, however fast a burst (a dash) carries the body. */
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
}

export interface AnimationChoice {
  animation: CharacterAnimation;
  facing: Facing8;
  /** The frame-list index of `facing` on an 8-way sheet (`DIRECTION_ORDER`). */
  direction: number;
  /** Playback rate: the walk follows the speed drawn, every other clip plays as authored. */
  timeScale: number;
}

/** Dead over attacking over moving over idle. */
export function selectAnimation(state: CharacterState): AnimationChoice {
  const { velocity, facing, attacking, dead, aim } = state;
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
    return choose("attack", aim ? facingFrom(aim.x, aim.y, walking) : walking);

  if (moving)
    return choose("walk", walking, Math.min(speed / WALK_PACE, MAX_WALK_SCALE));

  return choose("idle", facing);
}

/**
 * The sheet a server class draws from (today's `createKnight/Soldier/ArcherTextures`): warrior
 * is the knight, mage the wizard. Unknown classes fall back to the knight, as the placeholder
 * textures fall back to the warrior. Rivals reuse their class's sheet (FS-2325V §E.3).
 */
export function characterSheet(playerClass: string | undefined): string {
  switch ((playerClass ?? "").toLowerCase()) {
    case "mage":
      return "char_wizard_base";
    case "archer":
      return "char_archer_base";
    default:
      return "char_knight_base";
  }
}
