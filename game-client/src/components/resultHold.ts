import type { WorldEnteredPayload } from "@/assets/types/client";

/**
 * Keeps the settlement record on screen until the player closes it (FS-GV8WN R23, reusing the
 * hold FS-QPDKN R15–R17 built for the retired result card). The run's end sends `end_game` and
 * `world_entered(hub)` in the same moment; applied at once, the hub would sweep the record away
 * before it can be read. So while the record is open the hub world is held here, and closing the
 * record (or pressing Leave) applies it. With the record closed, nothing is held.
 *
 * Client-only: the server already has the player in the hub. The switch itself stays with
 * the `world_entered` handler, which hands `hold` the continuation to run on release.
 */
export class ResultHold {
  private raised = false;
  private held?: {
    world: WorldEnteredPayload;
    apply: (world: WorldEnteredPayload) => void;
  };

  /** The record went up. */
  raise(): void {
    this.raised = true;
  }

  /**
   * Holds `world` behind the record, to be applied on release. Returns whether it was held:
   * only a hub world arriving while the record is up is; any other world (a run, a handoff
   * host's run) is the caller's to apply at once.
   */
  hold(
    world: WorldEnteredPayload,
    apply: (world: WorldEnteredPayload) => void,
  ): boolean {
    if (!this.raised || world.world_type !== "hub") return false;
    this.held = { world, apply };
    return true;
  }

  /** The record went down (closed, or Leave pressed): applies the held world, if one has arrived. */
  release(): void {
    const held = this.held;
    this.clear();
    held?.apply(held.world);
  }

  /** The record is gone without being closed (the scene stopped): forget it all. */
  clear(): void {
    this.raised = false;
    this.held = undefined;
  }
}
