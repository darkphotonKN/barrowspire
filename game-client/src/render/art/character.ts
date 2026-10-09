/**
 * A character's baked sheet on a scene sprite (FS-2325V §E.4, §E.5): what it is doing, from state
 * the scene already has, played in its 8-way facing and stood on its footprint by the sheet's
 * anchor.
 *
 * Scenes own the sprite and the world position; this owns the clip. Each frame a scene hands it
 * the eased world position it just drew, and whether the character is dead; attacks arrive as
 * {@link CharacterAnimator.attack} from the effect trigger the scene already fires.
 *
 *   const anim = new CharacterAnimator(art, player.class);   // or a look: { sheet, variant }
 *   if (anim.baked) anim.dress(sprite);
 *   ...
 *   const choice = anim.step(pos, time, delta, dead);
 *   if (anim.baked) anim.show(sprite, choice); else  // today's placeholder texture and legs
 */

import type { Facing8, Point } from "@/render/iso";
import type { ArtLibrary } from "./library";
import { directionIndex } from "./manifest";
import {
  characterSheet,
  selectAnimation,
  type AnimationChoice,
  type CharacterAnimation,
} from "./animationSelect";

/**
 * How quickly the measured speed follows the drawn motion, in ms. Positions ease toward server
 * ticks that land every other frame, so the raw per-frame speed stutters; smoothed over about
 * six frames it reads as the pace the body is actually covering.
 */
const SPEED_SMOOTHING_MS = 100;
/** An attack window when there is no sheet to time it by: the placeholder turns for this long. */
const PLACEHOLDER_ATTACK_MS = 400;

/**
 * A sheet to draw a character from directly, rather than by class: a hub resident or function
 * NPC (`hubFolk.ts`). `variant` names a palette the sheet carries as `<clip>_<variant>` clips.
 */
export interface CharacterLook {
  sheet: string;
  variant?: string;
}

/** The slice of a Phaser sprite {@link CharacterAnimator} drives. */
export interface AnimatedSprite {
  setTexture(key: string, frame?: string | number): unknown;
  setOrigin(x: number, y: number): unknown;
  play(
    key: string | { key: string; startFrame?: number },
    ignoreIfPlaying?: boolean,
  ): unknown;
  anims: {
    currentAnim: { key: string; frames: unknown[] } | null;
    currentFrame: unknown;
    timeScale: number;
  };
}

/**
 * The motion half, Phaser-free: measures the drawn velocity, keeps the facing, and times the
 * attack window, then asks {@link selectAnimation} for the clip.
 */
export class CharacterMotion {
  private velocity = { vx: 0, vy: 0 };
  private last?: Point;
  private attackEnds = -Infinity;
  private aim?: Point;

  constructor(
    public facing: Facing8 = "se",
    private readonly attackMs = PLACEHOLDER_ATTACK_MS,
  ) {}

  /**
   * Starts the attack clip, facing `aim` (a world vector toward the target) when given. A new
   * attack restarts the window: skill cooldowns are shorter than the clip, and every cast the
   * server receives should show a swing.
   *
   * `holdMs` keeps the attack pose for longer than the clip, its last frame held: a charge the
   * server carries for longer than the swing lasts. A hold shorter than the clip changes nothing.
   */
  attack(now: number, aim?: Point, holdMs = 0): void {
    this.attackEnds = now + Math.max(this.attackMs, holdMs);
    this.aim = aim && (aim.x !== 0 || aim.y !== 0) ? { ...aim } : undefined;
  }

  /** One frame: `pos` is the world position just drawn, `deltaMs` the frame's length. */
  step(pos: Point, now: number, deltaMs: number, dead: boolean): AnimationChoice {
    if (this.last && deltaMs > 0) {
      const k = 1 - Math.exp(-deltaMs / SPEED_SMOOTHING_MS);
      const vx = ((pos.x - this.last.x) * 1000) / deltaMs;
      const vy = ((pos.y - this.last.y) * 1000) / deltaMs;
      this.velocity = {
        vx: this.velocity.vx + (vx - this.velocity.vx) * k,
        vy: this.velocity.vy + (vy - this.velocity.vy) * k,
      };
    }
    this.last = { x: pos.x, y: pos.y };

    const attacking = now < this.attackEnds;
    const choice = selectAnimation({
      velocity: this.velocity,
      facing: this.facing,
      attacking,
      dead,
      aim: attacking ? this.aim : undefined,
    });
    this.facing = choice.facing;
    return choice;
  }
}

/** A character's clip on its sprite: {@link CharacterMotion} plus the sheet it plays from. */
export class CharacterAnimator {
  readonly sheet: string;
  /** False when the sheet is missing or its atlas failed: the scene keeps its placeholder. */
  readonly baked: boolean;
  private readonly motion: CharacterMotion;
  /** Set by {@link attack}: the next attack frame replays from the start, even on the same key. */
  private swingPending = false;

  private readonly variant?: string;

  /** `who` is a server class (`characterSheet`), or the {@link CharacterLook} to draw. */
  constructor(
    private readonly art: ArtLibrary,
    who: string | undefined | CharacterLook,
    facing: Facing8 = "se",
  ) {
    const look = typeof who === "object" ? who : { sheet: characterSheet(who) };
    this.sheet = look.sheet;
    this.variant = look.variant;
    const attack = art.sheet(this.sheet)?.animations.attack;
    this.baked = art.animationKey(this.sheet, this.clip("idle")) !== undefined;
    this.motion = new CharacterMotion(
      facing,
      attack && attack.fps > 0
        ? (attack.frames[0].length / attack.fps) * 1000
        : PLACEHOLDER_ATTACK_MS,
    );
  }

  get facing(): Facing8 {
    return this.motion.facing;
  }

  /**
   * The sheet's head height, px above the anchor (manifest `crown`), where name plates and HP
   * bars sit; undefined when there is no baked sheet, or it records none.
   */
  get crown(): number | undefined {
    return this.baked ? this.art.sheet(this.sheet)?.crown : undefined;
  }

  /** Starts a swing from its first frame; `holdMs` as {@link CharacterMotion.attack}. */
  attack(now: number, aim?: Point, holdMs?: number): void {
    this.motion.attack(now, aim, holdMs);
    this.swingPending = true;
  }

  step(pos: Point, now: number, deltaMs: number, dead: boolean): AnimationChoice {
    return this.motion.step(pos, now, deltaMs, dead);
  }

  /**
   * Puts the sheet on a sprite, standing on its footprint: the anchor is where the feet meet
   * the ground, so the sprite's position is the projection of the world position (FS-2325V §E.5).
   */
  dress(sprite: AnimatedSprite): void {
    const frame = this.art.resolve(this.sheet, {
      animation: this.clip("idle"),
      direction: directionIndex(this.motion.facing),
    });
    if (frame.placeholder) sprite.setTexture(frame.texture);
    else sprite.setTexture(frame.texture, frame.frame);
    sprite.setOrigin(frame.anchor.x, frame.anchor.y);
  }

  /**
   * Plays the chosen clip. The same clip carries on (a finished attack or death holds its last
   * frame rather than replaying) unless a new attack was started; a looping clip turning to a new facing keeps its place in the
   * cycle, so a stride does not restart at every turn.
   */
  show(sprite: AnimatedSprite, choice: AnimationChoice): void {
    const clip = this.clip(choice.animation);
    const key = this.art.animationKey(this.sheet, clip, choice.direction);
    if (!key) return;
    const anims = sprite.anims;
    const current = anims.currentAnim;
    if (choice.animation === "attack" && this.swingPending) {
      this.swingPending = false;
      sprite.play({ key, startFrame: 0 });
    } else if (current?.key !== key) {
      const startFrame =
        current && this.loops(clip) && animationOf(current.key) === clip
          ? Math.max(0, current.frames.indexOf(anims.currentFrame))
          : 0;
      sprite.play({ key, startFrame });
    }
    anims.timeScale = choice.timeScale;
  }

  private loops(clip: string): boolean {
    return this.art.sheet(this.sheet)?.animations[clip]?.loop ?? false;
  }

  /** The manifest animation a clip plays under this look's palette variant. */
  private clip(animation: CharacterAnimation): string {
    return this.variant ? `${animation}_${this.variant}` : animation;
  }
}

/** `sheet/animation/direction` (library.ts `animationName`) → `animation`. */
const animationOf = (key: string) => key.split("/")[1];
