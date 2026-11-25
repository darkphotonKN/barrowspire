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
 * What is drunk from the bag, in place of an equip: the antidote (FS-9JV5K §F R24) and the Restoring
 * Draught (§Change: The Restoring Draught D6).
 */
export type BagDrink = "antidote" | "restoring_draught";

const BAG_DRINKS: readonly string[] = ["antidote", "restoring_draught"] satisfies BagDrink[];

/**
 * What a bag item is drunk as, or null for one the bag wears. Known by the icon resolver's own rule for
 * each template (its name: the template code is not on the wire, R25), so the icon and the action
 * never disagree.
 */
export function bagDrink(item: ItemState): BagDrink | null {
  const icon = itemIcon({ ...item, item_type: getItemType(item) });
  return BAG_DRINKS.includes(icon) ? (icon as BagDrink) : null;
}

/** Whether a bag item is drunk from the bag, which offers Drink for it in place of equip (R24, D6). */
export function drinksFromBag(item: ItemState): boolean {
  return bagDrink(item) !== null;
}

/** The server's `use_item` reply (game-service `use_item.go`): `reason` on a refusal. */
export interface UseItemReply {
  success: boolean;
  reason?: string;
  message?: string;
}

/** Each refusal's line (R24); nothing was drunk, so the antidote or the draught stays in the bag. */
const USE_REFUSALS: Readonly<Record<string, string>> = {
  not_poisoned: "You are not poisoned.",
  // a draught on a full pool (§Change: The Restoring Draught D4, D6): stamina, mana and parry charges alike
  resource_full: "You are already full.",
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

/**
 * The one drink in flight (FS-9JV5K §F R24): the antidote or draught whose `use_item` is sent and not
 * yet answered, so Drink pressed again sends nothing. It ends as a state's bag drops that item (it was
 * drunk) or a refusal answers (it is still there, to be drunk again). What was last sent outlives it:
 * the success reply names no item, and may come after the state that dropped it (D6).
 */
export class DrinkInFlight {
  private pending?: string;
  private last?: BagDrink;

  /** Drink pressed on `item`, drunk as `drink`: whether to send its `use_item`; never while one is still to be answered. */
  press(item: string, drink: BagDrink): boolean {
    if (this.pending !== undefined) return false;
    this.pending = item;
    this.last = drink;
    return true;
  }

  /** What the last drink sent was drunk as, which a success reply answers; none before the first. */
  drunk(): BagDrink | undefined {
    return this.last;
  }

  /** A state's bag: the drink is over once its antidote is gone from it. */
  see(bag: readonly Pick<ItemState, "entity_id">[]): void {
    if (this.pending !== undefined && !bag.some((item) => item.entity_id === this.pending)) this.pending = undefined;
  }

  /** The drink refused: nothing was spent, so it may be pressed again. */
  refused(): void {
    this.pending = undefined;
  }

  /** A new run: nothing in flight. */
  reset(): void {
    this.pending = undefined;
    this.last = undefined;
  }
}
