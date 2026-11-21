/**
 * How many health potions the player carries (FS-P9G8R R23), which the ability bar's potion square
 * counts (FS-Q18Q3 R24; the potion cell it replaced is gone, R35). Pure, so the count is tested
 * without a canvas.
 */

import type { EquipmentState } from "@/types/gameState";

/** The slots a potion is drunk from, in the order the server tries them (R5). */
const CONSUMABLE_SLOTS = [
  "consumable_1",
  "consumable_2",
  "consumable_3",
] as const;

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
