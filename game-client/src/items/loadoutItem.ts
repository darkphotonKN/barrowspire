/**
 * The loadout's item instances (`list-item-instances`) in the run's item shape, so the loadout
 * and the run read an item through one presenter (FS-4R9M9 R59). The instances name their rarity
 * by id; `list-item-rarities` turns that id into the tier name the badge shows.
 */

import type { components } from "@/api/generated/schema";
import type { ItemState } from "@/types/gameState";

export type ItemInstance = components["schemas"]["ItemInstance"];
type ItemRarity = components["schemas"]["ItemRarity"];

/** The rarity list as an id → tier name index. */
export function rarityNames(
  rarities: readonly ItemRarity[] | null | undefined,
): Map<string, string> {
  return new Map(
    (rarities ?? []).flatMap((r) => (r.id && r.name ? [[r.id, r.name]] : [])),
  );
}

/**
 * One owned instance as an item view reads it. Zero and empty fields are left out, as the run's
 * world state leaves them off the wire, so a legacy instance reads as level 1 with no affixes.
 */
export function instanceItem(
  instance: ItemInstance,
  rarities: ReadonlyMap<string, string>,
): ItemState {
  const item: ItemState = {
    item_id: instance.template_id ?? "",
    entity_id: instance.id ?? "",
    name: instance.name ?? "",
    quantity: 1,
  };
  const optional: Partial<ItemState> = {
    item_type: instance.item_type,
    rarity: instance.rarity_id ? rarities.get(instance.rarity_id) : undefined,
    item_level: instance.item_level,
    required_level: instance.required_level,
    affixes: instance.affixes?.length ? instance.affixes : undefined,
    unique_effect: instance.unique_effect,
    attack_power: instance.attack_power,
    critical_rate: instance.critical_rate,
    weapon_type: instance.weapon_type,
    defense_rating: instance.defense_rating,
    magic_resistance: instance.magic_resistance,
    armor_slot: instance.armor_slot,
    healing_amount: instance.healing_amount,
    mana_amount: instance.mana_amount,
    description: instance.description,
  };
  for (const [key, value] of Object.entries(optional))
    if (value) Object.assign(item, { [key]: value });
  return item;
}
