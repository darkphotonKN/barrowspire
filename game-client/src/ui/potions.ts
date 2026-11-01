/**
 * The run HUD's potion cell (FS-P9G8R §C): how many health potions the player carries, and the
 * key that drinks one. Pure, so the count, the dimming and when the cell shows at all are tested
 * without a canvas; `PotionHud` draws what this returns.
 */

import type { ClientGameState, EquipmentState } from "@/types/gameState";
import { RUN_ACTIONS } from "@/scenes/runActions";
import { hudBars } from "./resources";

/** The slots a potion is drunk from, in the order the server tries them (R5). */
const CONSUMABLE_SLOTS = [
  "consumable_1",
  "consumable_2",
  "consumable_3",
] as const;

/** The cell as drawn: the count, the drink key's label, and whether it is dimmed (count 0). */
export interface PotionCellView {
  count: number;
  /** `[<key>]`, read from the `drinkPotion` mapping (R26). */
  keyLabel: string;
  dimmed: boolean;
}

/**
 * The health potions worn in the consumable slots, 0 to 3 (R23): an item that heals (R1), so a
 * mana-only potion is not one. Nothing worn, or no equipment on the wire, is 0.
 */
export function healthPotionCount(
  equipment: EquipmentState | null | undefined,
): number {
  if (!equipment) return 0;
  return CONSUMABLE_SLOTS.filter(
    (slot) => (equipment[slot]?.healing_amount ?? 0) > 0,
  ).length;
}

/**
 * The cell, or null when it is down (R24, R25): up exactly when the Health / resource bars are,
 * dimmed and reading 0 when no health potion is worn. The player's own equipment only.
 */
export function potionCell(
  state: Pick<ClientGameState, "world_type" | "current_player">,
): PotionCellView | null {
  if (hudBars(state).length === 0) return null;
  const count = healthPotionCount(state.current_player?.equipment);
  return {
    count,
    keyLabel: `[${RUN_ACTIONS.drinkPotion.label}]`,
    dimmed: count === 0,
  };
}
