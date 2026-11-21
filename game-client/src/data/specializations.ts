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
 * The character's title, "Warrior · Berserker" (FS-E1ZDG §K.37). None before the pick, and none
 * for an id the client does not know or one of another class: such a character shows its class
 * name alone.
 */
export function characterTitle(
  className: string,
  specialization: string | undefined,
): string | undefined {
  if (!specialization || !Object.hasOwn(SPECIALIZATIONS, specialization)) return undefined;
  const spec = SPECIALIZATIONS[specialization as SpecializationId];
  if (spec.class !== className) return undefined;
  return `${CLASS_NAMES[spec.class]} · ${spec.name}`;
}

/**
 * The class line the main menu hero and the character list set beside the level, in capitals:
 * the title where the character has one, else the class name ("WARRIOR · BERSERKER • LV.20",
 * "WARRIOR • LV.5"; FS-E1ZDG §K.40).
 */
export function classLevelLine(
  className: string,
  specialization: string | undefined,
  level: number,
): string {
  const name = Object.hasOwn(CLASS_NAMES, className)
    ? CLASS_NAMES[className as ClassKey]
    : className;
  const label = characterTitle(className, specialization) ?? name;
  return `${label.toUpperCase()} • LV.${level}`;
}
