/** How long a run snapshot's floor goes without its map before the client asks, and between asks. */
export const FLOOR_MAP_ASK_MS = 1000;

/**
 * When to send `request_floor_map` (FS-KE075 §H.41, from §F.33): a floor's map can be dropped on
 * the server's full queue like any message, so while a run snapshot's floor has had no map for a
 * second the client asks, then again every second until it comes. Fed every snapshot.
 */
export class FloorMapWait {
  private floor?: number;
  private since?: number;
  private asked?: number;

  /** Whether to ask now, for a snapshot of `floor` at `now` whose map is `held` or not. */
  due(floor: number | undefined, held: boolean, now: number): boolean {
    if (held || floor === undefined || !Number.isFinite(now)) {
      if (held || floor === undefined) this.reset();
      return false;
    }
    if (floor !== this.floor || this.since === undefined) {
      this.floor = floor;
      this.since = now;
      this.asked = undefined;
    }
    if (now - this.since < FLOOR_MAP_ASK_MS) return false;
    if (this.asked !== undefined && now - this.asked < FLOOR_MAP_ASK_MS) return false;
    this.asked = now;
    return true;
  }

  /** Nothing waited on: the next missing map starts its second afresh. */
  reset(): void {
    this.floor = undefined;
    this.since = undefined;
    this.asked = undefined;
  }
}
