/**
 * Chimney smoke (FS-KYPQ9 §A.6): one continuous stream of soft grey puffs from a chimney top,
 * the table's `chimneySmoke` (slate and vellumFaint, alpha ≤ 0.35, 4000 ms life, growing to at
 * most 1.6×, at most 10 alive, one fixed wind for the whole hub). It sorts on the chimney's
 * footprint in the world band, so it draws under the light-map and darkens with dusk; it stamps
 * no light.
 *
 * Signal: the first hub state that carries walls, which builds the roofs once. The smoke rides
 * with its roof: it is one of the roof's parts, so hiding the roof over the delver stops it
 * (its last puffs burn out) and showing the roof plays it again. The runtime's `clearAll()`, on
 * scene SHUTDOWN/DESTROY, takes it away with everything else. Without `fx_smoke` the runtime
 * plays nothing and says so once.
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";

/** Over the chimney sprite on the same footprint, so a puff leaves the pot rather than behind it. */
export const SMOKE_LAYER = 4;

export class ChimneySmoke {
  private shown = false;

  /**
   * Starts the smoke shown, as the roof is. `at` is the chimney's footprint; `lift` the screen px
   * from the ground up to its pot.
   */
  constructor(
    private readonly fx: Pick<EffectsRuntime, "play" | "release">,
    private readonly owner: OwnerKey,
    private readonly at: Point,
    private readonly lift: number,
  ) {
    this.setVisible(true);
  }

  /** Plays or stops the smoke; showing shown smoke, or hiding hidden smoke, does nothing. */
  setVisible(visible: boolean): this {
    if (visible === this.shown) return this;
    this.shown = visible;
    if (visible)
      this.fx.play(this.owner, "chimneySmoke", this.at, {
        lift: this.lift,
        layer: SMOKE_LAYER,
      });
    else this.fx.release(this.owner);
    return this;
  }
}
