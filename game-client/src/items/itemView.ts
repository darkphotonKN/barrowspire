/**
 * What every run and loadout item view shows of an item (FS-4R9M9 R59): its name, its rarity
 * badge, its base stats, "Item level N", "Requires level N" (marked when above the character's
 * level, FS-BDA7X R45), one line per affix and, for a unique, its effect and lore.
 *
 * Phaser-free, so the words are tested without a canvas; the satchel (container view), the
 * equipment panel and the loadout draw what this returns. It reads the run's snake_case
 * `ItemState`; the loadout maps its item instances into the same shape first.
 */

import { itemStats, type StatLine } from "@/marketplace/detail";
import { rarityOf, type RarityToken } from "@/marketplace/rarity";
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
}

/** An item as every item view reads it. Pass the character's level, where known, for R45. */
export function itemView(item: ItemState, characterLevel?: number): ItemView {
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
