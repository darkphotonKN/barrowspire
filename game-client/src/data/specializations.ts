import type { ClassKey } from "@/data/classLore";

/** The server's spec ids (FS-E1ZDG §A.1). character-service derives them; the client names them. */
export type SpecializationId =
  | "guardian"
  | "berserker"
  | "spellwarden"
  | "pyromancer"
  | "hunter"
  | "shadow_ranger"
  | "duelist"
  | "sellsword";

export interface Specialization {
  class: ClassKey;
  name: string;
}

/** Each spec's class and display name, §A.1's table. */
export const SPECIALIZATIONS: Record<SpecializationId, Specialization> = {
  guardian: { class: "warrior", name: "Guardian" },
  berserker: { class: "warrior", name: "Berserker" },
  spellwarden: { class: "mage", name: "Spellwarden" },
  pyromancer: { class: "mage", name: "Pyromancer" },
  hunter: { class: "archer", name: "Hunter" },
  shadow_ranger: { class: "archer", name: "Shadow Ranger" },
  duelist: { class: "mercenary", name: "Duelist" },
  sellsword: { class: "mercenary", name: "Sellsword" },
};

const CLASS_NAMES: Record<ClassKey, string> = {
  warrior: "Warrior",
  mage: "Mage",
  archer: "Archer",
  mercenary: "Mercenary",
};

/**
 * The specialization a character of `className` holding `specialization` is: none before the pick,
 * and none for an id the client does not know or one of another class (FS-E1ZDG §Edge States).
 */
export function specializationOf(
  className: string,
  specialization: string | undefined,
): SpecializationId | undefined {
  if (!specialization || !Object.hasOwn(SPECIALIZATIONS, specialization)) return undefined;
  const id = specialization as SpecializationId;
  return SPECIALIZATIONS[id].class === className.toLowerCase() ? id : undefined;
}

/** A class's display name ("Warrior"), or a class the client does not know by its key in title case ("Bard"). */
function classDisplayName(className: string): string {
  const key = className.toLowerCase();
  if (Object.hasOwn(CLASS_NAMES, key)) return CLASS_NAMES[key as ClassKey];
  return className.charAt(0).toUpperCase() + className.slice(1);
}

/**
 * The one name a character's role is shown by: its specialization's name ("Berserker") once it holds
 * a known specialization of its own class, else its class's ("Warrior"). Every surface that names the
 * role reads this (FS-E1ZDG §Change: The specialization name replaces the class name, N1). Display
 * only: the class still drives mechanics, art and copy.
 */
export function roleName(className: string, specialization: string | undefined): string {
  const id = specializationOf(className, specialization);
  return id ? SPECIALIZATIONS[id].name : classDisplayName(className);
}

/**
 * The character's title: its specialization's name alone, "Berserker" (N2; retires §K.37's
 * "Warrior · Berserker"). None before the pick, and none for an id the client does not know or one
 * of another class: such a character's role is shown by its class name.
 */
export function characterTitle(
  className: string,
  specialization: string | undefined,
): string | undefined {
  return specializationOf(className, specialization) ? roleName(className, specialization) : undefined;
}

/**
 * The title line a world draws under a player's name over their figure, their own and others'
 * (FS-E1ZDG §K.41, N3), from the player's entry in the world state: none, no line. The town, the
 * fields and the runs all draw this one rule.
 */
export function nameplateTitle(
  player: { class: string; specialization?: string },
): string | undefined {
  return characterTitle(player.class, player.specialization);
}

/**
 * The line the main menu hero and the character list set beside the level, in capitals: the role
 * name ("BERSERKER • LV.20", "WARRIOR • LV.5"; FS-E1ZDG §K.40, N3).
 */
export function classLevelLine(
  className: string,
  specialization: string | undefined,
  level: number,
): string {
  return `${roleName(className, specialization).toUpperCase()} • LV.${level}`;
}
