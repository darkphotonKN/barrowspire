/**
 * What the screen says of the player's own statuses (FS-5FZ4J §J R53): HUD notices in their tones,
 * the words the client's, read off `current_player` against the previous broadcast (§I R48). A
 * first broadcast is the baseline and says nothing (a connect, a reconnect), as `SealWatch` does.
 * Pure, so the copy is tested without a canvas; the run scene shows what this returns.
 */

import type { PublicPlayerState } from "@/types/gameState";
import type { SealNotice } from "./sealLines";

/** The player's statuses as the watch reads them. */
type Statuses = Pick<PublicPlayerState, "poisoned_for" | "blessed">;

export class StatusWatch {
  /** The last broadcast's player, or `undefined` before the first: the baseline. */
  private last?: { poisoned: boolean; blessed: boolean } | null;

  /** This broadcast's lines, in order. A missing player says nothing, and the next broadcast after it is a first. */
  see(me: Statuses | null | undefined): SealNotice[] {
    const before = this.last;
    this.last = me ? { poisoned: me.poisoned_for !== undefined, blessed: me.blessed === true } : null;
    if (before === undefined || !before || !me) return [];
    const lines: SealNotice[] = [];
    if (!before.poisoned && me.poisoned_for !== undefined) lines.push({ text: "Poisoned.", tone: "refused" });
    // the hallowed altar's Blessing gained (FS-5FZ4J §G R43)
    if (!before.blessed && me.blessed === true) lines.push({ text: "Blessed.", tone: "done" });
    return lines;
  }

  /** Forget the last broadcast: the next one is a first. */
  reset(): void {
    this.last = undefined;
  }
}
