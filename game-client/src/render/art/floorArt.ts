/**
 * A Spire floor's variant art (FS-C8VM7 §G R42-R43, ADR-0081): fetched with the floor whose pool
 * names it, evicted with the next floor whose pool does not.
 *
 * A floor map that names a pool (`enemy_pool`) for a floor not seen yet queues its groups at once,
 * while the arrival card plays and before any of its monsters is in sight (Decision 3). The groups
 * held that the pool does not name go only once the scene stands on that floor: a climb's map comes
 * before its first snapshot, while the old floor's monsters are still drawn, and a texture evicted
 * from under a drawn sprite would throw on its next render (ADR-0059 Decision 5). A group a listed
 * monster is drawn from is never evicted: a champion met before a late map (Edge States). A map
 * without `enemy_pool`, from an older server, changes nothing: monsters fetch their art on sight.
 */

import type { FloorMap } from "@/types/gameState";
import type { OnDemandArt } from "./phaser";
import { FLOOR_SCOPED_GROUPS, poolGroups } from "./sceneArt";

export class FloorPoolArt {
  /** The floor whose pool was applied last. */
  private floor?: number;
  /** The groups that pool names. */
  private named: readonly string[] = [];
  /** Whether that floor's evictions are still to run, once the scene stands on it. */
  private pending = false;

  constructor(
    private readonly art: Pick<OnDemandArt, "prefetch" | "release" | "holding">,
    /** A group is in: the roster re-dresses the monsters drawn as its stand-in. */
    private readonly landed: (group: string) => void,
  ) {}

  /**
   * Where the scene stands: the floor map it holds, the floor of its latest snapshot and the
   * archetypes that snapshot lists. Call it on each snapshot, after the old floor is cleared and
   * before the monsters are drawn, and whenever the held map changes.
   */
  see(
    map: Pick<FloorMap, "floor" | "enemy_pool"> | undefined,
    standing: number | undefined,
    listed: readonly string[],
  ): void {
    if (map && Array.isArray(map.enemy_pool) && map.floor !== this.floor) {
      this.floor = map.floor;
      this.named = poolGroups(map.enemy_pool);
      this.pending = true;
      this.art.prefetch(this.named, this.landed);
    }
    if (!this.pending || standing !== this.floor) return;
    this.pending = false;
    const kept = new Set([...this.named, ...poolGroups(listed)]);
    const dropped = this.art.holding().filter((group) => FLOOR_SCOPED_GROUPS.has(group) && !kept.has(group));
    if (dropped.length > 0) this.art.release(dropped);
  }
}
