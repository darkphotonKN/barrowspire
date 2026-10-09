/**
 * The words an item view prints under an item's name (FS-4R9M9 R59): its item level, the level
 * it requires, one line per affix and, for a unique, its effect.
 *
 * Phaser-free and wire-agnostic on purpose, so the run's views (satchel, loadout, coffer, worn
 * gear) and the Bazaar's listing detail read an item alike. Each caller maps its own wire shape
 * (snake_case world state, camelCase item summary) into {@link ItemLinesSource}.
 */

/** One rolled or fixed affix. Its tier (0 for a unique's fixed affix) does not change the words. */
export interface AffixSource {
  stat: string;
  tier?: number;
  value: number;
}

/** How each stat code of FS-4R9M9 R17 reads after its value; `%` stats take a percent sign. */
const AFFIX_WORDS: Record<string, { words: string; percent?: true }> = {
  strength: { words: "Strength" },
  agility: { words: "Agility" },
  intelligence: { words: "Intelligence" },
  max_health: { words: "maximum health" },
  max_mana: { words: "maximum mana" },
  attack_speed: { words: "attack speed", percent: true },
  move_speed: { words: "movement speed", percent: true },
  crit_chance: { words: "critical chance", percent: true },
  flat_damage: { words: "damage" },
  defense: { words: "defense" },
  magic_resistance: { words: "magic resistance" },
};

/** "+3 Strength", "+5% attack speed". Fixed (tier 0) affixes read the same as rolled ones. */
export function affixLine({ stat, value }: AffixSource): string {
  const known = AFFIX_WORDS[stat];
  if (!known) return `+${value} ${stat.replaceAll("_", " ")}`;
  return `+${value}${known.percent ? "%" : ""} ${known.words}`;
}

/** What a view reads off an item. Every field may be missing on an item from before item levels. */
export interface ItemLinesSource {
  itemLevel?: number;
  requiredLevel?: number;
  affixes?: readonly AffixSource[] | null;
  uniqueEffect?: string;
}

/** The lines an item view prints, in the order it prints them. */
export interface ItemLines {
  itemLevel: string;
  /** "Requires level N"; `tooHigh` when the character's known level is below it (FS-BDA7X R45). */
  requirement: { text: string; tooHigh: boolean };
  affixes: string[];
  /** A unique's effect text; undefined for any other item. */
  uniqueEffect: string | undefined;
}

/**
 * An item's level, requirement, affix and unique-effect lines. An item from before item levels
 * reads as level 1, requiring level 1, with no affixes (FS-4R9M9 R59, Edge States). Pass the
 * character's level where one is known so a requirement above it can be highlighted.
 */
export function itemLines(
  item: ItemLinesSource,
  characterLevel?: number,
): ItemLines {
  const required = item.requiredLevel ?? 1;
  return {
    itemLevel: `Item level ${item.itemLevel ?? 1}`,
    requirement: {
      text: `Requires level ${required}`,
      tooHigh: characterLevel !== undefined && required > characterLevel,
    },
    affixes: (item.affixes ?? []).map(affixLine),
    uniqueEffect: item.uniqueEffect?.trim() || undefined,
  };
}
