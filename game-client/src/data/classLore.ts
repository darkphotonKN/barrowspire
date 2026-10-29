import type { ResourceKind } from "@/types/gameState";

export type ClassKey = "warrior" | "mage" | "archer" | "mercenary";

/**
 * The class's own resource as the lore card shows it (FS-8AY7S req 3): its kind and the most it
 * holds when seated. There is no shared mana pool; each class names its own.
 */
export interface ClassResource {
  kind: ResourceKind;
  max: number;
}

export interface ClassStats {
  hp: number;
  resource: ClassResource;
  atk: number;
  def: number;
  range: number;
  speed: number;
}

export interface ClassLoreData {
  key: ClassKey;
  name: string;
  englishTitle: string;
  title: string;
  description: string;
  primaryStat: string;
  weaponType: string;
  playstyle: string;
  stats: ClassStats;
  randomNames: string[];
}

export const CLASS_LORE: Record<ClassKey, ClassLoreData> = {
  warrior: {
    key: "warrior",
    name: "WARRIOR",
    englishTitle: "THE WARRIOR",
    title: "IRON GUARDIAN",
    description:
      "Steadfast defender hailing from the Mountain Iron Halls. Clad in heavy plate armor, wielding a forged greatsword and kite shield to stand as an impenetrable bulwark against the darkness.",
    primaryStat: "Strength 8 / Vitality 9",
    weaponType: "Iron Greatsword & Kite Shield",
    playstyle: "Heavy Melee, High Armor, Frontline Crusher",
    stats: {
      hp: 150,
      resource: { kind: "stamina", max: 100 },
      atk: 12,
      def: 10,
      range: 1,
      speed: 200,
    },
    randomNames: [
      "Valerius",
      "Gragas",
      "Gareth",
      "Ironhelm",
      "Reinbark",
      "Tharon",
    ],
  },
  mage: {
    key: "mage",
    name: "MAGE",
    englishTitle: "THE MAGE",
    title: "ARCANE MASTER",
    description:
      "Master scholar of the elemental arcanum. Commands raw primordial fire to launch explosive Fireballs from afar, backed by vast mana reserves to incinerate horrors in the deep.",
    primaryStat: "Intelligence 9 / Agility 3",
    weaponType: "Fire Conduit Staff",
    playstyle: "Ranged Fireball, High Burst Spell Damage",
    stats: {
      hp: 100,
      resource: { kind: "mana", max: 150 },
      atk: 15,
      def: 3,
      range: 6,
      speed: 200,
    },
    randomNames: ["Ignis", "Cyrus", "Maelis", "Arcana", "Valence", "Zephyrus"],
  },
  archer: {
    key: "archer",
    name: "ARCHER",
    englishTitle: "THE ARCHER",
    title: "SHADOW RANGER",
    description:
      "Swift ranger navigating the mist and shadows of the deep timberland. Moves with deadly speed through the cold dark, releasing precision arrows to pierce foes from afar.",
    primaryStat: "Agility 8 / Strength 4",
    weaponType: "Rosewood Longbow",
    playstyle: "Swift Kiting, Precision Snipe, Long Range",
    stats: {
      hp: 100,
      resource: { kind: "stamina", max: 100 },
      atk: 10,
      def: 5,
      range: 8,
      speed: 220,
    },
    randomNames: ["Sylvan", "Fallon", "Astra", "Kaelen", "Orion", "Lothar"],
  },
  mercenary: {
    key: "mercenary",
    name: "MERCENARY",
    englishTitle: "THE MERCENARY",
    title: "OATHLESS BLADE",
    description:
      "Sworn to no banner, bound by no oath but the coin. He turns the barrow's blows aside on a notched blade, and when the dead have spent their strength, answers every one of them at once.",
    primaryStat: "Strength 7 / Agility 7",
    weaponType: "Notched Arming Sword",
    playstyle: "Parry, Riposte, Close Steel",
    stats: {
      hp: 130,
      resource: { kind: "parry_charges", max: 3 },
      atk: 12,
      def: 7,
      range: 1,
      speed: 200,
    },
    randomNames: ["Corvane", "Hask", "Ulric", "Brannoch", "Vesh", "Mordaunt"],
  },
};
