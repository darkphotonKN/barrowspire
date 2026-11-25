/**
 * How many health potions the player carries (FS-P9G8R R23), which the ability bar's potion square
 * counts (FS-Q18Q3 R24; the potion cell it replaced is gone, R35). Pure, so the count is tested
 * without a canvas.
 */

import { itemIcon } from "@/render/art/itemIcons";
import { getItemType, type EquipmentState, type ItemState } from "@/types/gameState";

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

/**
 * Whether a bag item is drunk from the bag (FS-9JV5K §F R24): the antidote, which the bag offers
 * Drink for in place of equip. Known by the icon resolver's own rule for the `ANTIDOTE` template (its
 * name: the template code is not on the wire, R25), so the icon and the action never disagree.
 */
export function drinksFromBag(item: ItemState): boolean {
  return itemIcon({ ...item, item_type: getItemType(item) }) === "antidote";
}

/** The server's `use_item` reply (game-service `use_item.go`): `reason` on a refusal. */
export interface UseItemReply {
  success: boolean;
  reason?: string;
  message?: string;
}

/** Each refusal's line (R24); nothing was drunk, so the antidote stays in the bag. */
const USE_REFUSALS: Readonly<Record<string, string>> = {
  not_poisoned: "You are not poisoned.",
  not_in_bag: "That is no longer in your bag.",
  not_usable: "That cannot be drunk.",
};

/** A refused drink's line, or none on a success: the client's words, else the server's, else its own. */
export function drinkRefusal(reply: UseItemReply): string | null {
  if (reply.success) return null;
  const known = reply.reason !== undefined && Object.hasOwn(USE_REFUSALS, reply.reason) ? USE_REFUSALS[reply.reason] : undefined;
  if (known) return known;
  const words = reply.message?.trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}${/[.!?]$/.test(words) ? "" : "."}` : USE_REFUSALS.not_usable;
}
