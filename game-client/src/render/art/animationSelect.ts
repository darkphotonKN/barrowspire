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
import { specializationOf } from "@/data/specializations";
import { directionIndex } from "./manifest";

/** The clips every character and creature sheet carries (FS-2325V §E.2). */
export const CHARACTER_ANIMATIONS = ["idle", "walk", "attack", "death"] as const;
/**
 * Those, the Mercenary's own guard (FS-MAMHR §G.35): the parry clip only his sheet carries,
 * raised into and then held on its last frame; a demon's fire claw (FS-VHGE7 §D R31), which only
 * the demons' sheets carry once baked; a class's `run` (FS-JS7C8 §A), which every class sheet
 * carries, played while it moves and is not attacking; and the Berserker's `attack_offhand`
 * (FS-1J1CB §D R28), the attack swung with the left hand, which only his sheet carries. No sheet's
 * standalone `backpedal` is ever chosen (FS-JS7C8 R45), and no class attacks on the move: the
 * `walk_attack` and `backpedal_attack` clips were retired (FS-JS7C8 § Change: The knight's
 * sprint, and the attack-on-the-move clips retired, R155). A class's `roll` (FS-7P736 R15) plays
 * once while the body rolls, on a sheet whose bake carries it.
 */
export type CharacterAnimation =
  | (typeof CHARACTER_ANIMATIONS)[number]
  | "parry"
  | "claw"
  | "run"
  | "attack_offhand"
  | "roll";

/**
 * World px per second the walk clip covers at 1x: the stride the bake keyed, over one cycle at
 * its authored fps. A fact of the baked clip, not a speed: the walk plays at the speed drawn over
 * it, so planted feet stay planted at any pace. At the server's paced `DefaultSpeed`
 * (`BASE_MOVE_SPEED`, 100 world px/s at the pace's 0.5, FS-TAGWA R11) a walk plays at about 1.35x.
 */
export const WALK_PACE = 74;
/**
 * World px per second the run clip covers at 1x (FS-JS7C8 R3), measured on the rig, not guessed:
 * the speed the planted foot slides back under the body, averaged over the time a foot is down,
 * with the clip at its authored 14 fps on the archer's legs (tools/bake/page/characters/pace.js,
 * which reads the walk at about 80 against WALK_PACE's 74). 193.7 measured; clips.test.mjs holds
 * this to it. At the paced base walk (100 px/s at the pace's 0.5) the run plays at about 0.52x,
 * its feet planted (FS-TAGWA R11).
 */
export const RUN_PACE = 194;
/** Below this drawn speed (world px/s) a player is standing, not walking: easing residue. */
export const MOVING_SPEED = 20;
/**
 * The walk (and the run) never plays faster than this, however fast a burst (a dash) carries the
 * body.
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
  /** The sheet carries `run` (FS-JS7C8 §A): a moving class runs instead of walking. */
  run?: boolean;
  /**
   * The swing running is on the off hand (FS-1J1CB §D R29): the sheet carries the off-hand clips
   * (only the Berserker's) and this swing is the left's: the attack plays `attack_offhand`.
   */
  offhand?: boolean;
  /**
   * The body is rolling (FS-7P736 R15), this world way: it plays its roll turned to the roll, over
   * an attack, a guard, a held aim and its movement; death over it.
   */
  rolling?: { x: number; y: number };
  /**
   * The sheet carries `roll`: a rolling body plays it. Without it the body strides its `walk` turned
   * to the roll at its authored rate, under the in-code tumble the scene draws over the sprite.
   */
  roll?: boolean;
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
 * Dead over rolling over attacking over guarding over holding an aim over moving over idle. A character faces
 * its drawn movement (FS-JS7C8 §D R22); an attack faces its aim, death the facing it fell in, a
 * held aim the hold.
 *
 * An attack plays `attack`, moving or not, turned to the aim when known (FS-JS7C8 R155); an
 * off-hand swing plays `attack_offhand` (FS-1J1CB R29). Moving and not attacking runs on a sheet
 * that carries `run`, walks on one that does not, turned to the movement either way: never a
 * backward step (R4, R45).
 */
export function selectAnimation(state: CharacterState): AnimationChoice {
  const { velocity, facing, attacking, dead, aim, holding, guarding, run, offhand, rolling, roll } = state;
  const speed = Math.hypot(velocity.vx, velocity.vy);
  const moving = speed >= MOVING_SPEED;

  const choose = (animation: CharacterAnimation, to: Facing8, timeScale = 1) => ({
    animation,
    facing: to,
    direction: directionIndex(to),
    timeScale,
  });

  if (dead) return choose("death", facing);

  // a roll faces its own way, whatever the eased motion or an aim says (FS-7P736 R15)
  if (rolling) return choose(roll ? "roll" : "walk", facingFrom(rolling.x, rolling.y, facing));

  const walking = moving ? facingFrom(velocity.vx, velocity.vy, facing) : facing;
  if (attacking) {
    const aimed = aim ? facingFrom(aim.x, aim.y, walking) : walking;
    return choose(offhand ? "attack_offhand" : "attack", aimed);
  }

  // not directional (§C.10): he guards whichever way he is going
  if (guarding) return choose("parry", walking);

  if (holding) return choose("idle", facingFrom(holding.x, holding.y, facing));

  if (moving)
    return run
      ? choose("run", walking, Math.min(speed / RUN_PACE, MAX_WALK_SCALE))
      : choose("walk", walking, Math.min(speed / WALK_PACE, MAX_WALK_SCALE));

  return choose("idle", facing);
}

/** A class's sheet stem (FS-1J1CB R15): the word its sheets and groups are named by. */
export type ClassStem = "knight" | "wizard" | "archer" | "mercenary";

/**
 * The stem a server class draws from (today's `createKnight/Soldier/ArcherTextures`): warrior
 * is the knight, mage the wizard, the mercenary his own (FS-MAMHR §H.42). Unknown classes fall
 * back to the knight, as the placeholder textures fall back to the warrior.
 */
export function classStem(playerClass: string | undefined): ClassStem {
  switch ((playerClass ?? "").toLowerCase()) {
    case "mage":
      return "wizard";
    case "archer":
      return "archer";
    case "mercenary":
      return "mercenary";
    default:
      return "knight";
  }
}

/**
 * The sheet a server class draws from: its base sheet, `char_<stem>_base`. Rivals reuse their
 * class's sheet (FS-2325V §E.3).
 *
 * Given a specialization (FS-1J1CB R16-R17), its spec look's sheet, `char_<stem>_<spec>` (R15),
 * when the spec is one of the class's two (`specializationOf`) and `baked` says the manifest has
 * that sheet; else the base. `baked` omitted: nothing is baked, so the base. Menus, character
 * creation and the party busts call it with the class alone (R25).
 */
export function characterSheet(
  playerClass: string | undefined,
  specialization?: string,
  baked: (sheet: string) => boolean = () => false,
): string {
  const stem = classStem(playerClass);
  const spec = specializationOf(playerClass ?? "", specialization);
  const look = spec && `char_${stem}_${spec}`;
  return look && baked(look) ? look : `char_${stem}_base`;
}
