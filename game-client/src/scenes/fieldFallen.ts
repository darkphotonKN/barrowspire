/**
 * A field's fallen state (FS-X2F2H §Requirements 22, 23, 58): death in a field costs nothing, so
 * the player is shown a short wait and where they will rise, never a result card or loss copy.
 * The server stands them at the entrance 3 s after the fall; the count here is the client's own,
 * started from the state that first reported them fallen, and only ever a picture of that wait.
 */

/** How long the server keeps a fallen field player down, ms (the server's FieldPlayerRespawnDelay). */
export const FIELD_RISE_MS = 3000;

/** A player the state reports at 0 HP has fallen; one with no health reported has not. */
export function isFallen(player?: { current_health?: number } | null): boolean {
  return player?.current_health !== undefined && player.current_health <= 0;
}

/** The fallen state's line: where they rise and in how long. */
export function fallenCopy(count: number): string {
  return `You have fallen. You rise at the road home in ${count}.`;
}

/** The fallen state's 3-2-1, fed each state's fallen-or-not and read each frame. */
export class FallenCountdown {
  private since?: number;

  /** One state: "fell" or "rose" on the state that changes it, nothing otherwise. */
  observe(fallen: boolean, now: number): "fell" | "rose" | undefined {
    if (fallen && this.since === undefined) {
      this.since = now;
      return "fell";
    }
    if (!fallen && this.since !== undefined) {
      this.since = undefined;
      return "rose";
    }
    return undefined;
  }

  /** The number to show now, 3 down to 1 and held there if the rise is late; none while standing. */
  count(now: number): number | undefined {
    if (this.since === undefined) return undefined;
    const left = FIELD_RISE_MS - (now - this.since);
    return Math.max(1, Math.ceil(left / 1000));
  }

  /** Whether the player is down now, by the last state observed. */
  isDown(): boolean {
    return this.since !== undefined;
  }

  /** Forgets any fall: the next visit starts standing. */
  reset(): void {
    this.since = undefined;
  }
}
