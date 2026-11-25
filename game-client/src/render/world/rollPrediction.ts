/**
 * The predicted roll (FS-7P736 §B R14): the press that the client judges allowed moves its own body at
 * once, with the client's copy of the roll's numbers (R3: 200 px in 0.4 s, a straight line at a constant
 * 500 px/s, never scaled by the pace or any speed), swept against what the client knows stops a body
 * (R4: the floor's rock, the world's edge, a shut door); other bodies never stop it.
 *
 * Reconciled as the client's walking is: the run draws its own body easing toward the server's position,
 * and the prediction only stands in for that position while the roll is the client's to draw. Once it has
 * run its course it holds its end while the server's own roll still runs (no pull back for the latency),
 * then hands the body back to the server's position, which the ease then follows. A roll the server
 * refused never shows `roll` or `roll_cooldown`: past a short grace the prediction lets go, and the body
 * eases back, as any mispredicted move does. The cooldown is never the client's (R14).
 *
 * Pure, no Phaser: the scene asks it where its body stands each frame.
 */

import { PLAYER_RADIUS, type Point } from "@/render/iso/projection";
import type { PlayerState } from "@/types/gameState";

/** The roll's length, world px (R3: 2.5 cells at 80 px). Not scaled by the pace. */
export const ROLL_DISTANCE = 200;
/** The roll's time, ms (R3). */
export const ROLL_DURATION_MS = 400;
/** World px per ms, constant along the roll. */
const ROLL_SPEED = ROLL_DISTANCE / ROLL_DURATION_MS;
/** Half a delver's body side, world px: the server's `PlayerRadius`, its swept box. */
export const BODY_HALF = PLAYER_RADIUS;
/** How far past its end a roll the server has not answered is held, ms, before it is taken as refused. */
export const CONFIRM_GRACE_MS = 300;
/** The sweep's step, world px: a body never stops more than this short of what stops it. */
const LEG = 2;

/** The floor's cells as the sweep reads them: a `RegionGrid`, whose cells off the grid are never walkable. */
export interface RollGround {
  readonly cell: number;
  walkable(cx: number, cy: number): boolean;
}

/** Something the sweep stops at, its top-left and size: a shut door. */
export interface RollBlocker {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Whether a body standing at (x, y) overlaps rock or a blocker; touching an edge is not overlapping. */
function blocked(x: number, y: number, ground: RollGround | undefined, blockers: readonly RollBlocker[]): boolean {
  const [left, right, top, bottom] = [x - BODY_HALF, x + BODY_HALF, y - BODY_HALF, y + BODY_HALF];
  if (ground) {
    const c = ground.cell;
    for (let cx = Math.floor(left / c); cx <= Math.ceil(right / c) - 1; cx++)
      for (let cy = Math.floor(top / c); cy <= Math.ceil(bottom / c) - 1; cy++) if (!ground.walkable(cx, cy)) return true;
  }
  return blockers.some((b) => left < b.x + b.width && right > b.x && top < b.y + b.height && bottom > b.y);
}

/**
 * Where a roll from `from` along the unit vector `dir` ends (R4): the whole `ROLL_DISTANCE`, or where the
 * body first touches rock, the world's edge or a blocker. Swept in short legs, X then Y as walking is;
 * touching on either axis ends the roll on its line, never sliding along what stopped it.
 */
export function rollReach(
  from: Point,
  dir: Point,
  ground: RollGround | undefined,
  blockers: readonly RollBlocker[],
): Point {
  const legs = Math.ceil(ROLL_DISTANCE / LEG);
  const [lx, ly] = [(dir.x * ROLL_DISTANCE) / legs, (dir.y * ROLL_DISTANCE) / legs];
  let { x, y } = from;
  for (let i = 0; i < legs; i++) {
    if (blocked(x + lx, y, ground, blockers) || blocked(x + lx, y + ly, ground, blockers)) break;
    x += lx;
    y += ly;
  }
  return { x, y };
}

/** A predicted roll in flight. */
interface Flight {
  from: Point;
  dir: Point;
  length: number;
  startedAt: number;
  endsAt: number;
  /** A state since the press showed the server's roll (`roll` or `roll_cooldown`). */
  confirmed: boolean;
  /** The latest state still shows the server rolling. */
  serverRolling: boolean;
}

export class RollPrediction {
  private flight?: Flight;

  /** A roll from `from` along the unit vector `dir`, `length` px before the sweep stopped it, from `now` (ms). */
  start(from: Point, dir: Point, length: number, now: number): void {
    this.flight = {
      from: { ...from },
      dir: { ...dir },
      length,
      startedAt: now,
      endsAt: now + length / ROLL_SPEED,
      confirmed: false,
      serverRolling: false,
    };
  }

  /** Each state's own player: whether the server has answered the roll, and whether its roll still runs. */
  hear(me: Pick<PlayerState, "roll" | "roll_cooldown"> | null | undefined): void {
    const f = this.flight;
    if (!f) return;
    const rolling = me?.roll !== undefined;
    if (rolling || me?.roll_cooldown !== undefined) f.confirmed = true;
    f.serverRolling = rolling;
  }

  /**
   * Where the body stands at `now` (ms) while the roll is the client's to draw, or none: the server's
   * position is the body's again.
   *
   * Not a pure read: the first call that finds the roll let go also forgets the flight, so from then on
   * every call answers none, an earlier `now` included. Ask it with the clock running forward.
   */
  at(now: number): Point | null {
    const f = this.flight;
    if (!f) return null;
    const over = now - f.endsAt;
    if (over < 0) return this.along(f, Math.max(0, now - f.startedAt) * ROLL_SPEED);
    const held = f.confirmed ? f.serverRolling && over < ROLL_DURATION_MS : over < CONFIRM_GRACE_MS;
    if (held) return this.along(f, f.length);
    this.flight = undefined;
    return null;
  }

  /**
   * Whether a predicted roll still stands in for the server's position at `now`: Space waits it out (R14).
   * Read through {@link at}, so it forgets a flight it finds let go, as that does.
   */
  inFlight(now: number): boolean {
    return this.at(now) !== null;
  }

  /** Dropped at once: a floor change ends the roll with the floor (R11), and the run's end. */
  clear(): void {
    this.flight = undefined;
  }

  private along(f: Flight, distance: number): Point {
    const d = Math.min(distance, f.length);
    return { x: f.from.x + f.dir.x * d, y: f.from.y + f.dir.y * d };
  }
}
