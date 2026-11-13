/**
 * Item icons: which baked icon an item is drawn with, and where that icon sits in its atlas.
 *
 * Phaser-free on purpose, so the canvas (the satchel, FS-2325V §D) and the DOM (the Bazaar,
 * FS-8EGFA req 32) draw an item with the same icon from one mapping. The canvas turns the
 * sheet name into a sprite; the DOM crops the atlas image with {@link iconCrop}.
 */

import type { ArtManifest } from "./manifest";

/** Gear: drawn in four tiers by item level, baked as `icon_<name>_t<tier>`. */
export const GEAR_ICONS = [
  "sword",
  "dagger",
  "axe",
  "mace",
  "spear",
  "bow",
  "staff",
  "helm",
  "cuirass",
  "gauntlets",
  "greaves",
  "boots",
  "ring",
] as const;
type GearIcon = (typeof GEAR_ICONS)[number];

export const GEAR_TIERS = [1, 2, 3, 4] as const;
export type GearTier = (typeof GEAR_TIERS)[number];

/** The lowest item level of tiers 2, 3 and 4: levels 1-9 are tier 1, 25 and up tier 4. */
const TIER_FLOORS = [10, 20, 25];

/** The tier an item level is drawn in. Fixed by the level, never rolled. */
export function gearTier(itemLevel?: number): GearTier {
  const above = TIER_FLOORS.filter((floor) => (itemLevel ?? 1) >= floor);
  return GEAR_TIERS[above.length];
}

/** Everything that is not gear has one look. */
const PLAIN_ICONS = [
  "potion_health",
  "potion_mana",
  "vial_tonic",
  "coins",
  "gem",
  "scroll",
  "skull",
  "generic",
] as const;
type PlainIcon = (typeof PLAIN_ICONS)[number];

export type ItemIconName = `${GearIcon}_t${GearTier}` | PlainIcon;

/** Every baked icon (`icon_<name>` in the sprite manifest). */
export const ITEM_ICONS: readonly ItemIconName[] = [
  ...GEAR_ICONS.flatMap((g) => GEAR_TIERS.map((t) => `${g}_t${t}` as const)),
  ...PLAIN_ICONS,
];

export const iconSheet = (icon: ItemIconName) => `icon_${icon}`;

const WEAPON_ICONS: Record<string, GearIcon> = {
  sword: "sword",
  blade: "sword",
  dagger: "dagger",
  knife: "dagger",
  axe: "axe",
  mace: "mace",
  hammer: "mace",
  club: "mace",
  spear: "spear",
  polearm: "spear",
  bow: "bow",
  crossbow: "bow",
  staff: "staff",
  wand: "staff",
};

const ARMOR_ICONS: Record<string, GearIcon> = {
  head: "helm",
  chest: "cuirass",
  body: "cuirass",
  gloves: "gauntlets",
  hands: "gauntlets",
  legs: "greaves",
  feet: "boots",
  boots: "boots",
  ring: "ring",
  ring_1: "ring",
  ring_2: "ring",
};

/** Words in an item's name that pick an icon when its stats do not. First match wins. */
const NAME_ICONS: [RegExp, GearIcon | PlainIcon][] = [
  [/\b(ring|signet|band)\b/i, "ring"],
  [/\bscroll\b/i, "scroll"],
  [/\b(gold|coins?)\b/i, "coins"],
  [/\b(gem|jewel|glass)\b/i, "gem"],
  [/\bskull\b/i, "skull"],
  [/\b(sword|blade)\b/i, "sword"],
  [/\b(dagger|knife)\b/i, "dagger"],
  [/\bbow\b/i, "bow"],
  [/\b(staff|wand)\b/i, "staff"],
  [/\baxe\b/i, "axe"],
  [/\b(mace|hammer)\b/i, "mace"],
  [/\bspear\b/i, "spear"],
  [/\bboots\b/i, "boots"],
];

const isGear = (icon: GearIcon | PlainIcon): icon is GearIcon =>
  (GEAR_ICONS as readonly string[]).includes(icon);

/**
 * What the resolver reads from an item. The canvas `ItemState` and the items `ItemInstance`
 * carry the snake_case fields; the marketplace `ItemSummary` carries the camelCase ones.
 */
export interface IconSubject {
  name?: string;
  item_type?: string;
  itemType?: string;
  weapon_type?: string;
  weaponType?: string;
  armor_slot?: string;
  armorSlot?: string;
  healing_amount?: number;
  healingAmount?: number;
  mana_amount?: number;
  manaAmount?: number;
  item_level?: number;
  itemLevel?: number;
}

/**
 * The icon an item is drawn with: its weapon type or armour slot when one is baked, then its
 * restorative stats, then a ring by its item type (FS-4R9M9 R60), then its name. Anything else
 * is `generic` (FS-2325V §D.4). Gear is drawn in the look of its item level's tier.
 */
export function itemIcon(item: IconSubject): ItemIconName {
  const icon = iconCategory(item);
  return isGear(icon)
    ? `${icon}_t${gearTier(item.item_level ?? item.itemLevel)}`
    : icon;
}

function iconCategory(item: IconSubject): GearIcon | PlainIcon {
  const weaponType = item.weapon_type ?? item.weaponType;
  const armorSlot = item.armor_slot ?? item.armorSlot;
  const healing = item.healing_amount ?? item.healingAmount;
  const mana = item.mana_amount ?? item.manaAmount;

  const weapon = weaponType && WEAPON_ICONS[weaponType.toLowerCase()];
  if (weapon) return weapon;
  const armor = armorSlot && ARMOR_ICONS[armorSlot.toLowerCase()];
  if (armor) return armor;
  if (healing && mana) return "vial_tonic";
  if (healing) return "potion_health";
  if (mana) return "potion_mana";
  if (weaponType || armorSlot) return "generic";
  if ((item.item_type ?? item.itemType)?.toLowerCase() === "ring")
    return "ring";
  const name = item.name ?? "";
  return NAME_ICONS.find(([word]) => word.test(name))?.[1] ?? "generic";
}

/** Where the baked art is served; the same base the canvas loads it from. */
const ART_URL = "/art/";

/** CSS for drawing one icon as a cropped background: every length already in px. */
export interface IconCrop {
  image: string;
  /** The square the icon is drawn in. */
  size: number;
  /** `background-position`. */
  position: string;
  /** `background-size`: the whole atlas, scaled with the icon. */
  sheetSize: string;
}

/**
 * The crop that shows an icon at `size` px: the atlas image, offset to the icon's frame and
 * scaled so the frame fills the square. An icon that was not baked falls back to the generic
 * one; null when there is no manifest (or not even the generic icon) to crop from.
 */
export function iconCrop(
  manifest: ArtManifest | null,
  icon: ItemIconName,
  size: number,
): IconCrop | null {
  const sheet =
    manifest?.sheets[iconSheet(icon)] ?? manifest?.sheets[iconSheet("generic")];
  const atlas = sheet && manifest?.atlases[sheet.atlas];
  const frame = sheet && Object.values(sheet.animations)[0]?.frames[0]?.[0];
  if (!sheet || !atlas || !frame) return null;

  const scale = size / Math.max(sheet.frameWidth, sheet.frameHeight);
  const px = (n: number) => `${n * scale}px`;
  return {
    image: `${ART_URL}${atlas.image}`,
    size,
    position: `${px(-frame.x)} ${px(-frame.y)}`,
    sheetSize: `${px(atlas.width)} ${px(atlas.height)}`,
  };
}
