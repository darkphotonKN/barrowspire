/**
 * What every run and loadout item view shows of an item (FS-4R9M9 R59): its name, its rarity
 * badge, its base stats, "Item level N", "Requires level N" (marked when above the character's
 * level, FS-BDA7X R45), one line per affix and, for a unique, its effect and lore.
 *
 * Phaser-free, so the words are tested without a canvas; the satchel (container view) and the
 * gear and bag overlay draw what this returns. It reads the run's snake_case `ItemState`; the
 * hub maps its REST item instances into the same shape first.
 *
 * Given the world it is drawn in, it also says where the item stands (FS-18Z5F §H): an unsafe
 * find in a run. An owned item's status alone, in any world, says when it is still in a delve,
 * listed on the Bazaar or its sale settling (FS-GTNP8 §A); only the hub's items carry one. A view
 * given no world (the container view: what it holds is not the player's yet) marks no unsafe find.
 */

import { itemStats, type StatLine } from "@/marketplace/detail";
import { rarityOf, type RarityToken } from "@/marketplace/rarity";
import type { WorldType } from "@/assets/types/client";
import { getItemType, type ItemState, type ItemType } from "@/types/gameState";
import { itemLines, type ItemLines } from "./itemLines";

export interface ItemView {
  name: string;
  kind: ItemType;
  /** The rarity badge: its label and colour token. Null on an item that names no rarity. */
  rarity: { label: string; token: RarityToken } | null;
  /** The short stat line a row or slot prints beside the name. */
  summary: string;
  /** The full base stats, in the Bazaar's order and words. */
  stats: StatLine[];
  lines: ItemLines;
  /** The item's description: a unique's lore. */
  lore: string | undefined;
  /** Where the item stands, when the view marks it (FS-18Z5F §H); absent otherwise. */
  standing: ItemStanding | undefined;
}

/** The tip note on an unsafe find in a run (FS-18Z5F R36). */
export const UNSAFE_FIND_NOTE =
  "Found this run: lost if you die before you escape.";
/** The tip note on an item still in a delve, in the hub (FS-18Z5F R38). */
export const IN_RUN_NOTE = "Still in a delve.";
/** The tip note on an item listed on the Bazaar (FS-GTNP8 R1). */
export const LISTED_NOTE = "Listed on the Bazaar.";
/** The tip note on an item whose sale is settling (FS-GTNP8 R1). */
export const SETTLING_NOTE = "Sale settling…";

/**
 * The standings an owned item's status alone gives it, each locking it in the hub: still in a
 * delve (FS-18Z5F R38), listed on the Bazaar, or its sale settling (FS-GTNP8 §A).
 */
export type LockedKind = "inRun" | "listed" | "settling";

/**
 * Where an item stands, when a view marks it (FS-18Z5F §H): an unsafe find, edged and noted in a
 * run (R36); or locked by its status, dimmed, noted and refused in the hub: in a delve (R38),
 * listed, or settling, these two also marked on the slot (FS-GTNP8).
 */
export interface ItemStanding {
  kind: "unsafeFind" | LockedKind;
  /** The line the item tip adds. */
  note: string;
}

/**
 * Each status that locks an item, by its standing. `IN_RUN` is checked out into a live run or
 * field world: in the hub it cannot be equipped, unequipped or moved (FS-18Z5F R38). The server
 * stays the authority.
 */
const LOCKED_BY_STATUS: Readonly<
  Record<string, { kind: LockedKind; note: string }>
> = {
  IN_RUN: { kind: "inRun", note: IN_RUN_NOTE },
  LISTED: { kind: "listed", note: LISTED_NOTE },
  PENDING_SETTLEMENT: { kind: "settling", note: SETTLING_NOTE },
};

/**
 * The standing an item's status alone gives it, in any world: in a delve, listed or settling
 * (FS-GTNP8 R2: the one place a status locks an item); none for any other status.
 */
export function statusStanding(
  item: ItemState,
): (ItemStanding & { kind: LockedKind }) | undefined {
  const locked =
    item.status !== undefined && Object.hasOwn(LOCKED_BY_STATUS, item.status)
      ? LOCKED_BY_STATUS[item.status]
      : undefined;
  return locked && { ...locked };
}

/** An item's standing in `world`: its status first, then only a run marks unsafe finds (R36–37). */
function standingOf(
  item: ItemState,
  world: WorldType | undefined,
): ItemStanding | undefined {
  const locked = statusStanding(item);
  if (locked) return locked;
  if (world === "run" && item.unsafe)
    return { kind: "unsafeFind", note: UNSAFE_FIND_NOTE };
  return undefined;
}

/**
 * An item as every item view reads it. Pass the character's level, where known, for R45, and
 * the world the view is drawn in, for the item's standing (FS-18Z5F §H).
 */
export function itemView(
  item: ItemState,
  characterLevel?: number,
  world?: WorldType,
): ItemView {
  const rarity = item.rarity?.trim() ? rarityOf(item.rarity) : null;
  return {
    name: item.name,
    kind: getItemType(item),
    rarity: rarity && { label: rarity.label, token: rarity.token },
    summary: itemDetail(item),
    stats: itemStats({
      weaponType: item.weapon_type,
      armorSlot: item.armor_slot,
      attackPower: item.attack_power,
      criticalRate: item.critical_rate,
      defenseRating: item.defense_rating,
      magicResistance: item.magic_resistance,
      healingAmount: item.healing_amount,
      manaAmount: item.mana_amount,
    }),
    lines: itemLines(
      {
        itemLevel: item.item_level,
        requiredLevel: item.required_level,
        affixes: item.affixes,
        uniqueEffect: item.unique_effect,
      },
      characterLevel,
    ),
    lore: item.description?.trim() || undefined,
    standing: standingOf(item, world),
  };
}

/** The stat line under an item's name: what the old item row printed beside it. */
export function itemDetail(item: ItemState): string {
  if (item.attack_power) return `ATK ${item.attack_power}`;
  if (item.defense_rating) return `DEF ${item.defense_rating}`;
  if (item.healing_amount) return `+${item.healing_amount} HP`;
  if (item.mana_amount) return `+${item.mana_amount} MP`;
  return item.quantity > 1 ? `x${item.quantity}` : "";
}
