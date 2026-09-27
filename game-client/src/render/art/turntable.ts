/**
 * The menu turntable (FS-2325V §F.2): a baked character shown idle, slowly turning through the
 * 8 facings, which plays its attack once when it is picked. Pure, so every menu turns the same
 * way and the timing is testable without a canvas.
 *
 * The clip and facing come out as the same {@link AnimationChoice} the world scenes use, so a
 * menu plays a sheet through `CharacterAnimator.show` exactly as a run does.
 */

import type { Facing8 } from "@/render/iso/facing";
import type { AnimationChoice } from "./animationSelect";
import { DIRECTION_ORDER, directionIndex } from "./manifest";

/** How long the turntable rests on each facing: a full turn takes about ten seconds. */
export const TURNTABLE_STEP_MS = 1250;

/**
 * The facing `elapsedMs` into a turn that began on `start`, stepping clockwise once every
 * `stepMs`. A `stepMs` of 0 or less holds `start`.
 */
export function turntableFacing(
  elapsedMs: number,
  stepMs = TURNTABLE_STEP_MS,
  start: Facing8 = "se",
): Facing8 {
  if (!(stepMs > 0) || !Number.isFinite(elapsedMs)) return start;
  const steps = Math.floor(Math.max(0, elapsedMs) / stepMs);
  return DIRECTION_ORDER[
    (directionIndex(start) + steps) % DIRECTION_ORDER.length
  ];
}

/** One figure's turntable: turning while idle, paused while its attack plays. */
export class Turntable {
  /** Time spent attacking, which the turn does not count, so it resumes where it paused. */
  private pausedMs = 0;
  private attackEnds = -Infinity;
  private held: Facing8;

  /** @param origin the time the turn began, in the clock later passed to {@link pose}. */
  constructor(
    private readonly origin: number,
    private readonly stepMs = TURNTABLE_STEP_MS,
    private readonly start: Facing8 = "se",
  ) {
    this.held = start;
  }

  /**
   * Plays the attack once, from `now`, for `durationMs` (the sheet's attack clip), holding the
   * facing it was picked in. Picking again mid-swing restarts it.
   */
  flourish(now: number, durationMs: number): void {
    if (!(durationMs > 0)) return;
    if (now >= this.attackEnds) this.held = this.facingAt(now);
    const ends = now + durationMs;
    this.pausedMs += ends - Math.max(this.attackEnds, now);
    this.attackEnds = ends;
  }

  pose(now: number): AnimationChoice {
    const attacking = now < this.attackEnds;
    const facing = attacking ? this.held : this.facingAt(now);
    return {
      animation: attacking ? "attack" : "idle",
      facing,
      direction: directionIndex(facing),
      timeScale: 1,
    };
  }

  private facingAt(now: number): Facing8 {
    return turntableFacing(
      now - this.origin - this.pausedMs,
      this.stepMs,
      this.start,
    );
  }
}
