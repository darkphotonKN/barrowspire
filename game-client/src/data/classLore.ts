export type ClassKey = "warrior" | "mage" | "archer";

export interface ClassStats {
  hp: number;
  mp: number;
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
      mp: 50,
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
      mp: 150,
      atk: 15,
      def: 3,
      range: 6,
      speed: 200,
    },
    randomNames: [
      "Ignis",
      "Cyrus",
      "Maelis",
      "Arcana",
      "Valence",
      "Zephyrus",
    ],
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
      mp: 100,
      atk: 10,
      def: 5,
      range: 8,
      speed: 220,
    },
    randomNames: [
      "Sylvan",
      "Fallon",
      "Astra",
      "Kaelen",
      "Orion",
      "Lothar",
    ],
  },
};
