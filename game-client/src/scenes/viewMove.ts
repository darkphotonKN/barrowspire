/**
 * Where the local player stood when a container view opened, and whether a later state has moved
 * them past it (FS-1D6BX §Change: The container view closes when its player moves, R26–R29, A1,
 * M2–M4). Positions are a state's own `current_player.position`, never the drawn, eased body
 * (M1). Pure, no Phaser: runs and field worlds close by this one rule (R32).
 */

import type { Point } from "@/render/iso";

/** Strictly more than this, straight line in world px, from the baseline is a move (A1, R29). */
const MOVE_PX = 4;

export class ViewBaseline {
  private at?: Point;

  /**
   * A view opened, the player last seen at `at` (M2). With `at` unknown, no position seen yet,
   * the baseline is awaited: the next position {@link observe}d becomes it (M4).
   */
  open(at: Point | undefined): void {
    this.at = at && { x: at.x, y: at.y };
  }

  /**
   * A state observed with the player at `at`: whether that has them more than 4 px from the
   * baseline, measured from the baseline and never from the state before (R29, M3). A state with
   * no position judges nothing and keeps the baseline (M4). Not a pure query: while the baseline
   * is awaited, `at` becomes it and judges nothing (M4).
   */
  observe(at: Point | undefined): boolean {
    if (!at) return false;
    if (!this.at) {
      this.at = { x: at.x, y: at.y };
      return false;
    }
    const dx = at.x - this.at.x;
    const dy = at.y - this.at.y;
    return dx * dx + dy * dy > MOVE_PX * MOVE_PX;
  }
}
