/**
 * A rolling delver drawn rolling (FS-7P736 R15): who is rolling and how far through, and the in-code
 * tumble drawn over a sprite whose sheet has no baked roll yet, so the roll never waits on art.
 *
 * Who rolls: the own body from the client's prediction (its press starts the drawing at once), every
 * other delver from `other_players[].roll`, from the first state that shows it. A drawn roll runs the
 * roll's own time (R3's 0.4 s) from its start and is never restarted by the states that go on showing
 * it; the next is drawn once a state has shown the last one over. Pure, no Phaser.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import type { RollState } from "@/types/gameState";
import { ROLL_DURATION_MS } from "./rollPrediction";

/** How long a roll is drawn, ms: the roll's own time (R3), a wall that stops it early included. */
export const DRAWN_ROLL_MS = ROLL_DURATION_MS;

/** A roll being drawn: its world way (a unit vector) and how far through it is, 0 to 1. */
export interface DrawnRoll {
  dir: Point;
  t: number;
}

/** A roll that started being drawn this state, for the dust scuff where it starts. */
export interface RollStarted {
  id: string;
  dir: Point;
}

export class RollBodies {
  private readonly rolls = new Map<string, { dir: Point; startedAt: number }>();
  /** The bodies the last state showed rolling. */
  private readonly shown = new Set<string>();

  /** Starts drawing `id`'s roll its way (a unit vector) from `now` (ms), unless one is still drawn. */
  start(id: string, dir: Point, now: number): boolean {
    if (this.at(id, now)) return false;
    this.rolls.set(id, { dir: { ...dir }, startedAt: now });
    return true;
  }

  /**
   * Each body the state carries and its `roll`, from `now` (ms): a body the state first shows rolling
   * starts being drawn (unless a press already started it), and a body gone from the state is forgotten.
   * The rolls this started.
   */
  sync(bodies: readonly (readonly [string, RollState | undefined])[], now: number): RollStarted[] {
    const started: RollStarted[] = [];
    const ids = new Set<string>();
    for (const [id, roll] of bodies) {
      ids.add(id);
      if (!roll) {
        this.shown.delete(id);
        continue;
      }
      const length = Math.hypot(roll.dir_x, roll.dir_y);
      const dir = length > 0 ? { x: roll.dir_x / length, y: roll.dir_y / length } : { x: 0, y: 1 };
      if (!this.shown.has(id) && this.start(id, dir, now)) started.push({ id, dir });
      this.shown.add(id);
    }
    for (const id of [...this.rolls.keys(), ...this.shown]) {
      if (ids.has(id)) continue;
      this.rolls.delete(id);
      this.shown.delete(id);
    }
    return started;
  }

  /**
   * `id`'s roll being drawn at `now` (ms), or none.
   *
   * Not a pure read: a call that finds the roll's time run out (or `now` before its start) forgets it, so
   * from then on every call for `id` answers none, an earlier `now` included, and a {@link start} is free
   * to draw the next. Ask it with the clock running forward.
   */
  at(id: string, now: number): DrawnRoll | null {
    const roll = this.rolls.get(id);
    if (!roll) return null;
    const t = (now - roll.startedAt) / DRAWN_ROLL_MS;
    if (t >= 1 || t < 0) {
      this.rolls.delete(id);
      return null;
    }
    return { dir: roll.dir, t };
  }

  /** Every roll dropped, and what the states showed: a floor change, the run's end (R11). */
  clear(): void {
    this.rolls.clear();
    this.shown.clear();
  }
}

/** The tumble's squash before it turns, and its getting up after, as shares of the roll. */
const SQUASH = 0.15;
/** How low the body goes, balled, and how wide (shares of its own size). */
const BALL_Y = 0.78;
const BALL_X = 1.12;

/** 0 to 1, eased in and out (a cubic smoothstep: no overshoot, no Back or Elastic). */
const ease = (k: number) => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};

/** The in-code tumble at one moment: the drawing's turn and squash, and how far it is carried to turn about its middle. */
export interface TumblePose {
  /** Radians, clockwise on screen. */
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** Screen px the drawing is carried off where it stands; never the sprite's own place ({@link RollTumble}). */
  dx: number;
  dy: number;
}

/**
 * The in-code tumble (R15) `t` (0 to 1) through a roll: a squash, low and wide, then one whole quick
 * turn the way `spin` says (1 clockwise), balled, then up again. The sprite stands on its feet, so its
 * drawing is carried to turn about its middle, `middle` screen px over the feet (squashed with it).
 */
export function tumblePose(t: number, spin: 1 | -1, middle: number): TumblePose {
  const down = ease(t / SQUASH);
  const up = ease((t - (1 - SQUASH)) / SQUASH);
  const ball = down - up;
  const scaleX = 1 + (BALL_X - 1) * ball;
  const scaleY = 1 + (BALL_Y - 1) * ball;
  const turn = ease((t - SQUASH) / (1 - 2 * SQUASH));
  const rotation = spin * turn * Math.PI * 2;
  const a = middle * scaleY;
  return { rotation, scaleX, scaleY, dx: -a * Math.sin(rotation), dy: -a * (1 - Math.cos(rotation)) };
}

/** A baked figure's height, screen px over its feet, when its sheet records no `crown`. */
const FIGURE_HEIGHT = 80;

/**
 * Where a body turns in the tumble, screen px over the sprite's origin: half a baked figure's height
 * (its `crown`), whose origin is its feet; none for the placeholder texture, whose origin is its middle.
 */
export function tumbleMiddle(baked: boolean, crown: number | undefined): number {
  return baked ? (crown ?? FIGURE_HEIGHT) / 2 : 0;
}

/** Which way a roll along the world unit vector `dir` turns on screen: clockwise going right. */
export function tumbleSpin(dir: Point): 1 | -1 {
  return worldToScreen(dir.x, dir.y).x < 0 ? -1 : 1;
}

/** The slice of a sprite the tumble drives: its turn, its scale and its origin, never its place. */
export interface TumbledSprite {
  readonly scaleX: number;
  readonly scaleY: number;
  /** The origin as a share of the frame (Phaser's), that origin in the frame's px, and the frame's size. */
  readonly originX: number;
  readonly originY: number;
  readonly displayOriginY: number;
  readonly width: number;
  readonly height: number;
  setRotation(radians: number): unknown;
  setScale(x: number, y?: number): unknown;
  setOrigin(x: number, y?: number): unknown;
}

/** A sprite as it stands, for what is placed over it (`markerBase`'s `StandingSprite`, and its x). */
export interface StoodSprite {
  x: number;
  y: number;
  displayOriginY: number;
  scaleY: number;
}

/** A tumbling sprite as it stood: its own scale (a sheet's art scale), its origin, and that origin's px. */
interface Stood {
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
  displayOriginY: number;
}

/**
 * Draws the tumble over sprites, each frame after the scene stands them: on the sprite's own scale and
 * origin, which it gives back, unturned, once the roll ends.
 *
 * It never moves the sprite. A sprite turns about its origin, which sits at its place, so to turn the
 * drawing about its middle the tumble moves the origin within the drawing instead: by the pose's carry,
 * turned back and unscaled into the frame's own px. The drawing lands where a carried sprite's would,
 * and the sprite's x and y stay where it stands, for the camera that follows it and every other reader.
 */
export class RollTumble {
  private readonly tumbling = new WeakMap<object, Stood>();

  /** `roll` being drawn on `sprite` this frame, or none; `middle` as {@link tumblePose}. */
  apply(sprite: TumbledSprite, roll: DrawnRoll | null, middle: number): void {
    const own = this.tumbling.get(sprite);
    if (!roll) {
      if (!own) return;
      sprite.setRotation(0);
      sprite.setScale(own.scaleX, own.scaleY);
      sprite.setOrigin(own.originX, own.originY);
      this.tumbling.delete(sprite);
      return;
    }
    const stood: Stood = own ?? {
      scaleX: sprite.scaleX,
      scaleY: sprite.scaleY,
      originX: sprite.originX,
      originY: sprite.originY,
      displayOriginY: sprite.displayOriginY,
    };
    this.tumbling.set(sprite, stood);
    const p = tumblePose(roll.t, tumbleSpin(roll.dir), middle);
    const [sx, sy] = [stood.scaleX * p.scaleX, stood.scaleY * p.scaleY];
    sprite.setRotation(p.rotation);
    sprite.setScale(sx, sy);
    // the carry in the drawing's own frame: turned back, then unscaled to the frame's px
    const [cos, sin] = [Math.cos(p.rotation), Math.sin(p.rotation)];
    const across = (cos * p.dx + sin * p.dy) / sx;
    const down = (cos * p.dy - sin * p.dx) / sy;
    sprite.setOrigin(
      sprite.width > 0 ? stood.originX - across / sprite.width : stood.originX,
      sprite.height > 0 ? stood.originY - down / sprite.height : stood.originY,
    );
  }

  /**
   * `sprite` as it stands, the tumble taken off: where its name and bars go, so they hold still over
   * a tumbling body. Its own place, which the tumble never moves, with the origin and scale it stood on.
   * The sprite itself when it is not tumbling.
   */
  standing<S extends StoodSprite>(sprite: S): StoodSprite {
    const t = this.tumbling.get(sprite);
    if (!t) return sprite;
    return { x: sprite.x, y: sprite.y, displayOriginY: t.displayOriginY, scaleY: t.scaleY };
  }
}
