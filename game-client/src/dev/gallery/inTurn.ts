/** The slice of a Phaser clock a sequence is timed with. */
export interface Clock {
  delayedCall(ms: number, fn: () => void): { remove(dispatchCallback?: boolean): void };
}

/**
 * Plays items one after another, `stepMs` apart (FS-1819Q R11, "play all in turn"). Starting
 * again cancels the sequence in progress and begins from the first item, so two never run at once.
 */
export class InTurn {
  private pending: { remove(dispatchCallback?: boolean): void }[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly stepMs: number,
  ) {}

  start<T>(items: readonly T[], play: (item: T) => void): void {
    for (const timer of this.pending) timer.remove(false);
    this.pending = items.map((item, i) =>
      this.clock.delayedCall(i * this.stepMs, () => play(item)),
    );
  }
}
