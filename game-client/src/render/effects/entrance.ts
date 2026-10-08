/**
 * Entrance marker (FS-KYPQ9 §H.1): a soft amber glow laid on the ground at a building's
 * threshold, breathing slowly and shallowly on alpha alone (the table's `entranceBreath`). No
 * arrow, no outline, no scale change. It stays amber: an entrance leads to a door the delver can
 * act on.
 *
 * Signal, unchanged: built once per building in `updateWalls`, hidden in `enterBuilding` and
 * shown in `exitBuilding`. Hiding ends the glow and showing plays it again, so a hidden marker
 * holds nothing; the runtime's `clearAll()` takes it away with everything else.
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";

export class EntranceMarker {
  private shown = false;

  /** Builds the marker shown, as the old one was. */
  constructor(
    private readonly fx: Pick<EffectsRuntime, "play" | "release">,
    private readonly owner: OwnerKey,
    private readonly at: Point,
  ) {
    this.setVisible(true);
  }

  /** Shows or hides the glow; showing a shown marker, or hiding a hidden one, does nothing. */
  setVisible(visible: boolean): this {
    if (visible === this.shown) return this;
    this.shown = visible;
    if (visible) this.fx.play(this.owner, "entranceBreath", this.at);
    else this.fx.release(this.owner);
    return this;
  }
}
