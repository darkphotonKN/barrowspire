/**
 * When the local player drank a health potion (FS-KZC92 §G), read off the game state alone: the
 * server empties the slot and heals in the same tick and sends both in the next broadcast
 * (FS-P9G8R R7–R8), so one state showing both fewer health potions worn and more health than the
 * state before it is a drink. Either alone misfires: unequipping drops the count, and other
 * healing raises health.
 *
 *   const drinks = new PotionDrinkWatcher();
 *   if (drinks.see(state.current_player)) shimmers.playGranted(HEAL_LOOK, crown);
 *   drinks.forget(); // resetRun
 *
 * Pure, so the rule is tested without a scene. The scene feeds it `current_player` only, never
 * `other_players`: a teammate's drink draws nothing (R33).
 */

import type { PlayerState } from "@/types/gameState";
import { healthPotionCount } from "./potions";

/** What the previous state showed. */
interface Baseline {
  potions: number;
  health?: number;
}

export class PotionDrinkWatcher {
  /** The previous state's reading; undefined until the first state, and after a clear. */
  private last?: Baseline;

  /**
   * Takes the next state's `current_player` and answers whether it shows a drink (R34). The
   * first state after a forget, or after one with no `current_player`, is only the baseline
   * (R35).
   */
  see(me: PlayerState | null | undefined): boolean {
    if (!me) {
      this.last = undefined;
      return false;
    }
    const now: Baseline = {
      potions: healthPotionCount(me.equipment),
      health: me.current_health,
    };
    const prev = this.last;
    this.last = now;
    if (!prev) return false;
    return (
      now.potions < prev.potions &&
      now.health !== undefined &&
      prev.health !== undefined &&
      now.health > prev.health
    );
  }

  /** The run is torn down: the next state is a fresh baseline. */
  forget(): void {
    this.last = undefined;
  }
}
