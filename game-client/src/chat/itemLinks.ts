/**
 * Item links in chat (FS-KBA4Q): the item snapshot a chat line carries, read tolerantly off the
 * wire (R31), the rule that pairs each snapshot with its `[Name]` token in the line's text (R10),
 * and the snapshot as the item view reads it (R38). Phaser-free. Vocabulary:
 * game-client/CONTEXT.md § Chat terms.
 */

import { itemView, type ItemView } from "@/items/itemView";
import { getItemType, type AffixState, type ItemState } from "@/types/gameState";

/**
 * An item as it stood when its line was sent (FS-KBA4Q § The item snapshot): the world state's
 * `ItemState` names and meanings, and nothing that says whose it is or where it stands: no id, no
 * status, no unsafe-find mark, no quantity, no durability (R17).
 */
export interface ItemSnapshot {
  name: string;
  item_type: string;
  /** The rarity tier's code: normal, uncommon, rare, runed or fabled. */
  rarity?: string;
  weapon_type?: string;
  armor_slot?: string;
  attack_power?: number;
  defense_rating?: number;
  magic_resistance?: number;
  healing_amount?: number;
  mana_amount?: number;
  /** A fraction, 0–1, as the world state sends it. */
  critical_rate?: number;
  item_level?: number;
  required_level?: number;
  affixes?: AffixState[];
  unique_effect?: string;
  description?: string;
}

const TEXT_FIELDS = [
  "rarity",
  "weapon_type",
  "armor_slot",
  "unique_effect",
  "description",
] as const satisfies readonly (keyof ItemSnapshot)[];

const NUMBER_FIELDS = [
  "attack_power",
  "defense_rating",
  "magic_resistance",
  "healing_amount",
  "mana_amount",
  "critical_rate",
  "item_level",
  "required_level",
] as const satisfies readonly (keyof ItemSnapshot)[];

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw);

const isText = (raw: unknown): raw is string =>
  typeof raw === "string" && raw !== "";

const isNumber = (raw: unknown): raw is number =>
  typeof raw === "number" && Number.isFinite(raw);

/** Whether a name can stand in a `[Name]` token: it has words and no bracket of its own (R13). */
const isLinkName = (raw: unknown): raw is string =>
  isText(raw) && !raw.includes("[") && !raw.includes("]");

function readAffixes(raw: unknown): AffixState[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((affix: unknown) =>
    isRecord(affix) &&
    isText(affix.stat) &&
    isNumber(affix.tier) &&
    isNumber(affix.value)
      ? [{ stat: affix.stat, tier: affix.tier, value: affix.value }]
      : [],
  );
}

/**
 * A snapshot off the wire, rebuilt key by key from what it names, or null when it cannot be read:
 * not an object, or without a name a token can carry and an item type. The pod validated it
 * (R27), so this is tolerance, not a second gate: an optional field of the wrong type is left
 * out, and nothing the snapshot does not name is carried (R31).
 */
export function readItemSnapshot(raw: unknown): ItemSnapshot | null {
  if (!isRecord(raw) || !isLinkName(raw.name) || !isText(raw.item_type))
    return null;
  const snapshot: ItemSnapshot = { name: raw.name, item_type: raw.item_type };
  for (const field of TEXT_FIELDS) {
    const value = raw[field];
    if (isText(value)) snapshot[field] = value;
  }
  for (const field of NUMBER_FIELDS) {
    const value = raw[field];
    if (isNumber(value)) snapshot[field] = value;
  }
  const affixes = readAffixes(raw.affixes);
  if (affixes.length > 0) snapshot.affixes = affixes;
  return snapshot;
}

/**
 * A line's `items` off the wire: the snapshots that can be read, in order. Anything else (no
 * `items`, not an array, an entry that cannot be read) gives no snapshot and never an error, so a
 * line is never dropped for its items (R31).
 */
export function readItemSnapshots(raw: unknown): ItemSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown) => {
    const snapshot = readItemSnapshot(entry);
    return snapshot ? [snapshot] : [];
  });
}

/** An item link in a text: where its `[Name]` token stands, and the item it shows. */
export interface ItemLink<T> {
  /** The token's `[`, as an index into the text. */
  start: number;
  /** Just past the token's `]`. */
  end: number;
  item: T;
}

/** The token an item's name is written as in a line's text (R3). */
export const linkToken = (name: string): string => `[${name}]`;

/**
 * The item links in `text` (R10): each of `items`, in order, takes the first occurrence of
 * exactly `[` + its name + `]` after the end of the pair before it. One with no such occurrence
 * is unpaired and skipped, and the search for the next goes on from the same place. Worked out
 * from the text alone, for a received line's snapshots and a draft's held links alike.
 */
export function pairLinks<T extends { name: string }>(
  text: string,
  items: readonly T[],
): ItemLink<T>[] {
  const links: ItemLink<T>[] = [];
  let from = 0;
  for (const item of items) {
    const token = linkToken(item.name);
    const start = text.indexOf(token, from);
    if (start < 0) continue;
    from = start + token.length;
    links.push({ start, end: from, item });
  }
  return links;
}

/**
 * The snapshot as the item view and the item tip read an item (R38). It names no instance and
 * no standing, so the view marks none; given no character level, it marks no requirement too
 * high either.
 */
export function snapshotItemState(snapshot: ItemSnapshot): ItemState {
  return { ...snapshot, item_id: "", entity_id: "", quantity: 1 };
}

/**
 * The snapshot as the item tip draws it for a hovered link tag (R38): the view every item view
 * shares, built with no character level and no world, so the requirement is never marked too
 * high, for the sender or the viewer, and no standing is noted.
 */
export function snapshotItemView(snapshot: ItemSnapshot): ItemView {
  return itemView(snapshotItemState(snapshot));
}

/**
 * The snapshot a link press takes (FS-KBA4Q R17), built to the pod's rule for one (§ The item
 * snapshot, R27): the pod refuses a whole line for one key it does not know or one value out of
 * its set, so every bound below is the pod's, and an optional field that fails its bound is left
 * out, never sent empty.
 */

const NAME_MAX = 100;
const UNIQUE_EFFECT_MAX = 200;
const DESCRIPTION_MAX = 300;
const STAT_MAX = 999999;
const LEVEL_MAX = 999;
const AFFIX_TIER_MAX = 9;
const AFFIXES_MAX = 6;

const ITEM_TYPES: readonly string[] = ["weapon", "armor", "ring", "consumable"];
const RARITIES: readonly string[] = ["normal", "uncommon", "rare", "runed", "fabled"];
const ARMOR_SLOTS: readonly string[] = ["head", "chest", "legs", "gloves"];
/** The affix stat codes game-service knows (FS-4R9M9 R17). */
const AFFIX_STATS: readonly string[] = [
  "strength",
  "agility",
  "intelligence",
  "max_health",
  "max_mana",
  "attack_speed",
  "move_speed",
  "crit_chance",
  "flat_damage",
  "defense",
  "magic_resistance",
];
const WEAPON_TYPE = /^[a-z_]{1,32}$/;

const WHOLE_FIELDS = [
  ["attack_power", 0, STAT_MAX],
  ["defense_rating", 0, STAT_MAX],
  ["magic_resistance", 0, STAT_MAX],
  ["healing_amount", 0, STAT_MAX],
  ["mana_amount", 0, STAT_MAX],
  ["item_level", 1, LEVEL_MAX],
  ["required_level", 1, LEVEL_MAX],
] as const;

/**
 * The most bytes one snapshot may take as the pod encodes it, so that three of them, the most a
 * line carries, stay within the pod's 4096 for a line's `items` (R27).
 */
export const ITEM_SNAPSHOT_BYTES_MAX = 1360;

const UNSEEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const FORMAT = /\p{Cf}/u;

/**
 * Whether the character `c` is one the pod refuses in an item's name and words: a control (Unicode
 * Cc), a format character (Cf: zero-width, bidi override), or a line or paragraph separator (Zl,
 * Zp). The pod's `chatItemUnseen`; the two are one definition.
 */
export const isUnseen = (c: string): boolean => UNSEEN.test(c);

const hasUnseen = (text: string): boolean => UNSEEN.test(text);

/**
 * `text` as one line the pod takes: format characters gone, each run of controls and line or
 * paragraph separators (line breaks, tabs) one space, the ends trimmed.
 */
function oneLine(text: string): string {
  let line = "";
  let inBreak = false;
  for (const c of text) {
    if (FORMAT.test(c)) continue;
    const isBreak = isUnseen(c);
    if (!isBreak) line += c;
    else if (!inBreak) line += " ";
    inBreak = isBreak;
  }
  return line.trim();
}

/** `text` cut to `max` code points, the end trimmed again. */
const cut = (text: string, max: number): string =>
  Array.from(text).slice(0, max).join("").trimEnd();

/** An item's words as the pod takes them: one line of at most `max` code points, or none. */
function prose(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  return cut(oneLine(raw), max) || undefined;
}

const isWhole = (raw: unknown, min: number, max: number): raw is number =>
  typeof raw === "number" && Number.isInteger(raw) && raw >= min && raw <= max;

const oneOf = (raw: unknown, set: readonly string[]): string | undefined =>
  typeof raw === "string" && set.includes(raw) ? raw : undefined;

/**
 * A code as the pod's closed sets write one. The run's world state sends codes; the hub's REST
 * read may not (its rarity is the rarity list's display name, "Rare"), so a code is read as the
 * rest of the client reads one (`rarityOf`, `getItemType`, `itemIcon`): trimmed, in lower case.
 */
const code = (raw: unknown): string | undefined =>
  typeof raw === "string" ? raw.trim().toLowerCase() : undefined;

/** The armour slots under the client's own names for them, as the item icons also read them. */
const ARMOR_SLOT_CODES: Readonly<Record<string, string>> = {
  body: "chest",
  hands: "gloves",
  feet: "legs",
};

/**
 * The bytes `value` takes as the pod encodes it: JSON in UTF-8, where Go also writes `<`, `>`,
 * `&` and the two Unicode line separators as six-byte escapes.
 */
export function wireBytes(value: unknown): number {
  const json = JSON.stringify(value) ?? "";
  let bytes = new TextEncoder().encode(json).length;
  for (const c of json) {
    if (c === "<" || c === ">" || c === "&") bytes += 5;
    else if (c === "\u2028" || c === "\u2029") bytes += 3;
  }
  return bytes;
}

/** Cuts the snapshot's lore, then its effect's words, until it is within its bytes. */
function fitBytes(snapshot: ItemSnapshot): void {
  for (const field of ["description", "unique_effect"] as const) {
    for (;;) {
      const over = wireBytes(snapshot) - ITEM_SNAPSHOT_BYTES_MAX;
      const words = snapshot[field];
      if (over <= 0) return;
      if (words === undefined) break;
      // a code point is one byte at least, so `over` of them gone is always enough
      const kept = cut(words, Math.max(0, Array.from(words).length - over));
      if (kept) snapshot[field] = kept;
      else delete snapshot[field];
    }
  }
}

/**
 * The item's snapshot as a link press takes it, or null when the item cannot be linked: its name
 * is empty or over 100 code points, or holds a bracket or a character the pod counts unseen (R13), or its type
 * is none of the four. It carries only the snapshot's own fields: no id, no instance, no status,
 * no unsafe-find mark, no quantity, no durability (R17). A copy, so a later change to the item
 * changes no draft and no sent line.
 */
export function itemSnapshot(item: ItemState): ItemSnapshot | null {
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!isLinkName(name) || hasUnseen(name)) return null;
  if (Array.from(name).length > NAME_MAX) return null;
  const itemType = oneOf(getItemType(item), ITEM_TYPES);
  if (!itemType) return null;

  const snapshot: ItemSnapshot = { name, item_type: itemType };
  const rarity = oneOf(code(item.rarity), RARITIES);
  if (rarity) snapshot.rarity = rarity;
  const weaponType = code(item.weapon_type);
  if (weaponType && WEAPON_TYPE.test(weaponType)) snapshot.weapon_type = weaponType;
  const slot = code(item.armor_slot) ?? "";
  const armorSlot = oneOf(ARMOR_SLOT_CODES[slot] ?? slot, ARMOR_SLOTS);
  if (armorSlot) snapshot.armor_slot = armorSlot;
  for (const [field, min, max] of WHOLE_FIELDS) {
    const value = item[field];
    if (isWhole(value, min, max)) snapshot[field] = value;
  }
  const rate = item.critical_rate;
  if (typeof rate === "number" && rate >= 0 && rate <= 1)
    snapshot.critical_rate = rate;
  const affixes = (Array.isArray(item.affixes) ? item.affixes : [])
    .filter(
      (affix) =>
        isRecord(affix) &&
        AFFIX_STATS.includes(affix.stat) &&
        isWhole(affix.tier, 0, AFFIX_TIER_MAX) &&
        isWhole(affix.value, 0, STAT_MAX),
    )
    .slice(0, AFFIXES_MAX)
    .map(({ stat, tier, value }) => ({ stat, tier, value }));
  if (affixes.length > 0) snapshot.affixes = affixes;
  const uniqueEffect = prose(item.unique_effect, UNIQUE_EFFECT_MAX);
  if (uniqueEffect) snapshot.unique_effect = uniqueEffect;
  const description = prose(item.description, DESCRIPTION_MAX);
  if (description) snapshot.description = description;
  fitBytes(snapshot);
  return snapshot;
}
