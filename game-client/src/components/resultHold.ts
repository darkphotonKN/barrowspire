import type { WorldEnteredPayload } from "@/assets/types/client";

/**
 * Keeps the result card on screen until the player dismisses it (FS-QPDKN §Requirements
 * 15–17). The run's end sends `end_game` and `world_entered(hub)` in the same moment; applied
 * at once, the hub would sweep the card away before it can be read. So while the card is up
 * the hub world is held here, and *Return to the hub* applies it.
 *
 * Client-only: the server already has the player in the hub. The switch itself stays with
 * the `world_entered` handler, which hands `hold` the continuation to run on release.
 */
export class ResultHold {
  private cardUp = false;
  private held?: { world: WorldEnteredPayload; apply: (world: WorldEnteredPayload) => void };

  /** The result card went up. */
  raise(): void {
    this.cardUp = true;
  }

  /**
   * Holds `world` behind the card, to be applied on release. Returns whether it was held:
   * only a hub world arriving while the card is up is; any other world (a run, a handoff
   * host's run) is the caller's to apply at once (R16).
   */
  hold(world: WorldEnteredPayload, apply: (world: WorldEnteredPayload) => void): boolean {
    if (!this.cardUp || world.world_type !== "hub") return false;
    this.held = { world, apply };
    return true;
  }

  /** The player dismissed the card: applies the held world, if one has arrived. */
  release(): void {
    const held = this.held;
    this.clear();
    held?.apply(held.world);
  }

  /** The card is gone without being dismissed (the scene stopped): forget it all. */
  clear(): void {
    this.cardUp = false;
    this.held = undefined;
  }
}
