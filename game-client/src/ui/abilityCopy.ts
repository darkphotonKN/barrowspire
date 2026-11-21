/**
 * What each class's ability says (FS-8AY7S req 30; the ability bar's tooltips, FS-Q18Q3 R28): its
 * name and one line on how it works, keyed by `current_player.class`, and where a specialization
 * changes them, by its id (FS-E1ZDG §L.43, §L.46). Data only: a class or a spec gains, loses or
 * changes its words here without touching the bar's code (FS-MAMHR adds the mercenary's Parry). A
 * class with no row has no tooltip (R27).
 */

import { specializationOf } from "@/data/specializations";

export interface AbilityCopy {
  name: string;
  line: string;
}

export const ABILITY_COPY: Readonly<Record<string, AbilityCopy>> = {
  warrior: { name: "Dash", line: "Charge a short way toward the cursor." },
  mage: {
    name: "Triple Fireball",
    line: "Hurl three fireballs in a spread toward the cursor.",
  },
  // every archer's but a Shadow Ranger's (FS-E1ZDG §L.43); the skill id stays shadow_shot
  archer: {
    name: "Heavy Shot",
    line: "Hold to aim, release to loose one slow, heavy bolt.",
  },
  // FS-MAMHR req 37; the line stays short
  mercenary: {
    name: "Parry",
    line: "Turn a blow as it lands for a parry charge. At three, the cut ripostes.",
  },
};

/** Where a specialization changes its class's row (FS-E1ZDG §L.43, §L.46), keyed by spec id; every other spec keeps it. */
export const SPECIALIZATION_ABILITY_COPY: Readonly<Record<string, AbilityCopy>> = {
  shadow_ranger: { name: "Shadow Shot", line: ABILITY_COPY.archer.line },
  // the riposte arms at 2 for a Duelist (FS-E1ZDG §I R32)
  duelist: {
    name: ABILITY_COPY.mercenary.name,
    line: "Turn a blow as it lands for a parry charge. At two, the cut ripostes.",
  },
};

/**
 * The right-click copy of a `cls` character holding `specialization`, or null for a class with none
 * (FS-8AY7S req 30): the spec's row where it has one, else the class's. A spec of another class, or an
 * id the client does not know, keeps the class's row. The one lookup the bar's tooltip and the run's
 * controls panel read.
 */
export function abilityCopy(cls: string | undefined, specialization?: string): AbilityCopy | null {
  if (!cls) return null;
  const spec = specializationOf(cls, specialization);
  if (spec && Object.hasOwn(SPECIALIZATION_ABILITY_COPY, spec)) return SPECIALIZATION_ABILITY_COPY[spec];
  const key = cls.toLowerCase();
  return Object.hasOwn(ABILITY_COPY, key) ? ABILITY_COPY[key] : null;
}

/**
 * Each class's tree ability, cast on key 3 (FS-04EEA R50), keyed by `current_player.class` as the right-click's
 * rows are: its name and one line, for FS-Q18Q3's tooltip on the key-3 square (R28).
 */
export const TREE_ABILITY_COPY: Readonly<Record<string, AbilityCopy>> = {
  warrior: { name: "Earthbreaker", line: "Slam the ground: strike and stun all around you." },
  mage: { name: "Blink", line: "Step through the dark toward where you point, never past a wall." },
  archer: { name: "Arrow Rain", line: "Hold to mark the ground, release to rain arrows on it." },
  mercenary: {
    name: "Settle the Debt",
    line: "Spend every parry charge on a flurry around you; each one cuts deeper.",
  },
};

/** The tree-ability copy of a `cls` character, or null for a class with none (FS-04EEA R50). */
export function treeAbilityCopy(cls: string | undefined): AbilityCopy | null {
  const key = cls?.toLowerCase();
  return key && Object.hasOwn(TREE_ABILITY_COPY, key) ? TREE_ABILITY_COPY[key] : null;
}

/** The level at which the skill tree's third tier, and its ability, can first be taken (FS-Q18Q3 R25; FS-8RZ51). */
export const TREE_ABILITY_LEVEL = 10;

/**
 * The 3 square's third line while it stands locked (FS-Q18Q3 R28), under the class's tree ability's name and
 * line from `TREE_ABILITY_COPY` (FS-04EEA R50); alone for a class with none.
 */
export const TREE_LOCKED_NOTE = `Learned at the skill tree's third tier, from level ${TREE_ABILITY_LEVEL}.`;

/** The potion square's copy (FS-Q18Q3 R28), and its third line with none worn or in a field. */
export const POTION_COPY: AbilityCopy = {
  name: "Health Potion",
  line: "Drink to heal at once, from your first potion slot.",
};
export const POTION_NONE_NOTE = "No health potion worn.";
export const POTION_FIELD_NOTE = "Potions are drunk only in the Spire.";
