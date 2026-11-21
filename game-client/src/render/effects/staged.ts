/**
 * Steps of one effect laid out in time on the scene clock, every one still pending cancelled
 * together: a shock ring opening out ring by ring, a flurry of slashes one after another, a rain's
 * volleys (FS-04EEA §H). The table holds what each step plays; this holds when. It plays nothing
 * of its own: a helper beside the effects, like the runtime.
 *
 *   const steps = new Staged(scene.time);
 *   steps.at(120, () => fx.play(owner, "earthbreakerShock", point));
 *   steps.cancel(); // a floor change, a teardown: nothing more plays
 */

import type { EffectsScene } from "./runtime";

/** The scene clock's slice a step is timed on. */
export type StageClock = EffectsScene["time"];

export class Staged {
  private readonly pending = new Set<{ remove(dispatchCallback?: boolean): void }>();

  constructor(private readonly time: StageClock) {}

  /** Whether a step is still to come. */
  get busy(): boolean {
    return this.pending.size > 0;
  }

  /** Runs `fn` `ms` from now on the scene clock; at once when `ms` is not past zero. */
  at(ms: number, fn: () => void): void {
    if (ms <= 0) {
      fn();
      return;
    }
    const timer = this.time.delayedCall(ms, () => {
      this.pending.delete(timer);
      fn();
    });
    this.pending.add(timer);
  }

  /** Every step still to come is dropped. Harmless to repeat. */
  cancel(): void {
    for (const timer of this.pending) timer.remove(false);
    this.pending.clear();
  }
}
