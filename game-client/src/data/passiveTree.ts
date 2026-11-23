/**
 * The passive tree as the client knows it (FS-8RZ51 R6, R39; §Change: Tree v2 V1, V12): its structure
 * and numbers read from the golden, and only the presentation kept here, by node id.
 *
 * `passiveTree.golden.json` is written by the Go test that holds `game-server/common/passivetree` to
 * it (`-update` to rewrite) and is never hand-edited, so a node added or retuned on the server fails
 * `passiveTree.test.ts` until this copy agrees (R6, user story 28). The tree is a graph (V1): each node
 * names the nodes it links from (`requires`, any of), its level gate (`minLevel`) and its side of an
 * exclusive group (`exclusive`). The copy holds each node's name, its R3 kicker's words, and what it
 * draws (R40): a traversal node one of four interim pictures until slice 19 (V29), a kicker or a
 * specialization its own (`passiveIcons.ts`), the ability its tree ability's picture from the ability
 * bar; a specialization's pick (FS-E1ZDG); and an ability's or a specialization's line of what it does
 * (V26), the ability named as the ability bar names it (FS-04EEA R50). Stat lines are written from the
 * golden's per-rank values (`STAT_WORDS`, `rankStats`), so a retuned number shows without a copy edit.
 *
 * Every name here is a placeholder (FS-8RZ51 R29 "All numbers are placeholders"; the ability and
 * specialization words are FS-04EEA's and FS-E1ZDG's). Pure data, no Phaser.
 */

import { TREE_ABILITY_COPY } from "@/ui/abilityCopy";
import type { NodeIconKey } from "@/ui/passiveIcons";
import type { TreeHue } from "@/utils/canvasPalette";
import type { SpecializationId } from "./specializations";
import golden from "./passiveTree.golden.json";

/** What a node is (V1, V13): a one-rank traversal step, a three-rank kicker, the ability, a specialization. */
export type PassiveNodeKind = "traversal" | "kicker" | "ability" | "specialization";

/** A node's side of an exclusive group (V6): taking any node of one side locks every other side. */
export interface PassiveExclusive {
  group: string;
  side: string;
}

/** What each rank adds, as the golden writes it (R29, V14). */
export interface PassivePerRank {
  stat: string;
  amount: number;
  unit: "percent" | "flat" | "seconds" | string;
}

/** One node as the golden carries it (V1). */
export interface PassiveNodeDef {
  id: string;
  class: string;
  slot: string;
  kind: PassiveNodeKind;
  maxRank: number;
  /** The nodes it links from, any one held opening it; empty for the root. */
  requires: string[];
  /** The level it waits for; 0 when none. */
  minLevel: number;
  /** Its side, absent for a node on no side. */
  exclusive?: PassiveExclusive;
  perRank?: PassivePerRank;
  /** A kicker's R3 rule, by the server's name for it. */
  kicker?: string;
}

/** Every node of every class, as the server defines them (R1, R6). */
export const PASSIVE_NODES: readonly PassiveNodeDef[] = golden.nodes as PassiveNodeDef[];

/** A class's nodes in the definition's order (V1); none for a class the golden lacks (R42). */
export function classNodes(className: string): PassiveNodeDef[] {
  return PASSIVE_NODES.filter((n) => n.class === className);
}

const PRIMARY_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = golden.primaryAttributes;

/** The attributes a class's Might raises, each by the full amount (V14); none for a class the golden lacks. */
export function primaryAttributes(className: string): readonly string[] {
  return Object.hasOwn(PRIMARY_ATTRIBUTES, className) ? PRIMARY_ATTRIBUTES[className] : [];
}

/** A node's presentation (R39): its name and, by kind, its kicker's words, its picture, its pick. */
export interface PassiveNodeCopy {
  name: string;
  /** A kicker's R3 rule in words (R29), shown as the last rank's. */
  kicker?: string;
  /**
   * The picture the node draws (R40): a traversal node one of the four interim ones by what it raises,
   * a kicker or a specialization its own (`PASSIVE_ICONS`), the ability its tree ability's from the
   * ability bar (`ABILITY_ICONS`). Every node has one; a node id the copy lacks has no copy at all (R42).
   */
  icon: NodeIconKey;
  /**
   * The hue its picture wears while lit (§Change: A lit node glows in its own colour, L4, L5): by what the
   * node gives, a key of `palette.treeHue`. Every node has one; a node id the copy lacks has none (R42).
   */
  hue: TreeHue;
  /** A specialization node's pick (FS-E1ZDG): its title's name. */
  specialization?: SpecializationId;
  /**
   * What an ability or a specialization does, in one plain line with its numbers (V26): FS-04EEA's and
   * FS-E1ZDG's, copied into the words, so a retune there is an edit here. No other kind has one.
   */
  effect?: string;
}

/**
 * The four traversal nodes, the same in every class (V13), each with its own picture (V29): Vitality
 * the heart and its pulse, Might the flexed arm, Haste the gust, Fleetness the bare foot in stride;
 * and each its hue (L5), so every class's slots share it.
 */
const TRAVERSAL = {
  vitality: { name: "Vitality", icon: "vitality", hue: "health" },
  might: { name: "Might", icon: "might", hue: "power" },
  haste: { name: "Haste", icon: "haste", hue: "speed" },
  fleetness: { name: "Fleetness", icon: "fleetness", hue: "movement" },
} as const satisfies Record<string, PassiveNodeCopy>;

/** Which traversal node stands in each slot, the same for every class (V2's table). */
const TRAVERSAL_SLOTS: Readonly<Record<string, PassiveNodeCopy>> = {
  r1: TRAVERSAL.vitality,
  r2: TRAVERSAL.might,
  ua1: TRAVERSAL.haste,
  ua2: TRAVERSAL.vitality,
  ua3: TRAVERSAL.might,
  ua4: TRAVERSAL.haste,
  ub1: TRAVERSAL.fleetness,
  ub2: TRAVERSAL.vitality,
  ub3: TRAVERSAL.might,
  ub4: TRAVERSAL.fleetness,
  m1: TRAVERSAL.vitality,
  m2: TRAVERSAL.might,
  m3: TRAVERSAL.vitality,
  la1: TRAVERSAL.haste,
  la2: TRAVERSAL.vitality,
  la3: TRAVERSAL.might,
  la4: TRAVERSAL.haste,
  la5: TRAVERSAL.vitality,
  lb1: TRAVERSAL.fleetness,
  lb2: TRAVERSAL.vitality,
  lb3: TRAVERSAL.might,
  lb4: TRAVERSAL.fleetness,
  lb5: TRAVERSAL.vitality,
  m4: TRAVERSAL.vitality,
};

/** A class's traversal copy, by node id. */
const traversal = (cls: string) => Object.fromEntries(Object.entries(TRAVERSAL_SLOTS).map(([slot, copy]) => [`${cls}.${slot}`, copy]));

/** Every node's presentation, by node id (R39). The golden's ids and these keys are one set (R6). */
export const PASSIVE_COPY: Readonly<Record<string, PassiveNodeCopy>> = {
  ...traversal("warrior"),
  "warrior.t2a": { name: "Heavy Hand", icon: "heavy_hand", hue: "power", kicker: "A slash that hits 2 or more monsters refunds 5 stamina." },
  "warrior.t2b": { name: "Thick Skin", icon: "thick_skin", hue: "defence", kicker: "While below half max HP, damage taken is 10% less." },
  "warrior.t3": { name: TREE_ABILITY_COPY.warrior.name, icon: "earthbreaker", hue: "power", effect: "Slam the ground: hit and stun everything within 90 px for 1 s (0.5 s on a boss)." },
  "warrior.t5a": { name: "Long Wind", icon: "long_wind", hue: "refund", kicker: "A kill refunds 15 stamina." },
  "warrior.t5b": { name: "Bull Rush", icon: "bull_rush", hue: "crit", kicker: "Your first hit within 3 s of a dash ending is a sure crit." },
  "warrior.t6a": {
    name: "Guardian",
    icon: "guardian",
    hue: "defence",
    specialization: "guardian",
    effect: "Last Stand: once per floor, a hit that would kill you leaves you at 1 HP and refills your stamina.",
  },
  "warrior.t6b": {
    name: "Berserker",
    icon: "berserker",
    hue: "health",
    specialization: "berserker",
    effect: "Blood price: 33% less max HP for +25% attack speed and +10% damage; each slash that hits heals 1.5% of max HP.",
  },

  ...traversal("mage"),
  "mage.t2a": { name: "Kindling", icon: "kindling", hue: "fire", kicker: "A fireball crit refunds 5 mana." },
  "mage.t2b": { name: "Deep Well", icon: "deep_well", hue: "mana", kicker: "+25% mana regen." },
  "mage.t3": { name: TREE_ABILITY_COPY.mage.name, icon: "blink", hue: "mana", effect: "Teleport up to 180 px toward the cursor; walls stop you." },
  "mage.t5a": { name: "Wide Volley", icon: "wide_volley", hue: "fire", kicker: "The volley throws 5 fireballs, not 3." },
  "mage.t5b": { name: "Searing", icon: "searing", hue: "fire", kicker: "Fireballs pierce one more monster." },
  "mage.t6a": {
    name: "Spellwarden",
    icon: "spellwarden",
    hue: "mana",
    specialization: "spellwarden",
    effect: "Arcane Ward: a quarter of each hit's damage comes off your mana first, and magic hits deal 10% less.",
  },
  "mage.t6b": {
    name: "Pyromancer",
    icon: "pyromancer",
    hue: "fire",
    specialization: "pyromancer",
    effect: "Combustion: a fireball crit explodes for half its damage on every other monster within 60 px.",
  },

  ...traversal("archer"),
  "archer.t2a": { name: "Quick Draw", icon: "quick_draw", hue: "speed", kicker: "Every 4th arrow pierces one more monster." },
  "archer.t2b": { name: "Fleet Foot", icon: "fleet_foot", hue: "movement", kicker: "Sidestep: 10% of monster strikes on you miss." },
  "archer.t3": { name: TREE_ABILITY_COPY.archer.name, icon: "arrow_rain", hue: "speed", effect: "Five volleys of arrows fall on a 70 px circle over 1.5 s." },
  "archer.t5a": { name: "Eagle Eye", icon: "eagle_eye", hue: "crit", kicker: "Every Shadow Shot is a sure crit." },
  "archer.t5b": { name: "Hunter's Breath", icon: "hunters_breath", hue: "refund", kicker: "A kill refunds Shadow Shot's cost." },
  "archer.t6a": {
    name: "Hunter",
    icon: "hunter",
    hue: "movement",
    specialization: "hunter",
    effect: "Split Shot: an arrow crit splits off a 60% arrow at the nearest other monster within 220 px.",
  },
  "archer.t6b": {
    name: "Shadow Ranger",
    icon: "shadow_ranger",
    hue: "crit",
    specialization: "shadow_ranger",
    effect: "Shadow Shot pierces every target in its line; each monster it hits refunds 8 stamina.",
  },

  ...traversal("mercenary"),
  "mercenary.t2a": { name: "Keen Edge", icon: "keen_edge", hue: "crit", kicker: "A cut on a monster in its wind-up is a sure crit." },
  "mercenary.t2b": { name: "Practiced Guard", icon: "practiced_guard", hue: "defence", kicker: "A strike parried in the first half of the window grants 2 parry charges." },
  "mercenary.t3": {
    name: TREE_ABILITY_COPY.mercenary.name,
    icon: "settle_the_debt",
    hue: "steel",
    effect: "A flurry all round you that spends every parry charge, harder for each one.",
  },
  "mercenary.t5a": { name: "Bloodied Riposte", icon: "bloodied_riposte", hue: "health", kicker: "A riposte that hits heals 5% of max HP, once per riposte." },
  "mercenary.t5b": { name: "Steady Hand", icon: "steady_hand", hue: "refund", kicker: "A cut that kills grants 1 parry charge." },
  "mercenary.t6a": {
    name: "Duelist",
    icon: "duelist",
    hue: "steel",
    specialization: "duelist",
    effect: "Quick riposte: your cut ripostes at 2 parry charges and spends only 2.",
  },
  "mercenary.t6b": {
    name: "Sellsword",
    icon: "sellsword",
    hue: "refund",
    specialization: "sellsword",
    effect: "Five parry charges and no riposte; each charge held gives +5% cut damage and +5% attack speed.",
  },
};

/** A node's copy, where the client has it (R42: a node id it lacks draws with its id as its name). */
export function nodeCopy(id: string): PassiveNodeCopy | undefined {
  return Object.hasOwn(PASSIVE_COPY, id) ? PASSIVE_COPY[id] : undefined;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * Each stat's effect line from one rank's amount (R39), so a retuned number in the golden shows here
 * without an edit. A stat with no words here reads from its own name.
 */
export const STAT_WORDS: Readonly<Record<string, (amount: number, unit: string) => string>> = {
  max_hp: (a, unit) => `${signed(a)}${unit === "flat" ? "" : "%"} max HP`,
  max_mana: (a) => `${signed(a)} max mana`,
  strength: (a) => `${signed(a)} Strength`,
  intelligence: (a) => `${signed(a)} Intelligence`,
  agility: (a) => `${signed(a)} Agility`,
  stamina_regen: (a) => `${signed(a)}% stamina regen`,
  slash_damage: (a) => `${signed(a)}% slash damage`,
  fireball_damage: (a) => `${signed(a)}% fireball damage`,
  fireball_speed: (a) => `${signed(a)}% fireball flight speed`,
  attack_speed: (a) => `${signed(a)}% attack speed`,
  move_speed: (a) => `${signed(a)}% move speed`,
  crit: (a) => `${signed(a)} crit points`,
  cut_damage: (a) => `${signed(a)}% cut damage`,
  riposte_damage: (a) => `${signed(a)}% riposte damage`,
  cut_cooldown: (a) => `cut cooldown ${Math.abs(a)}% ${a < 0 ? "shorter" : "longer"}`,
  dash_cost: (a) => `dash costs ${Math.abs(a)} ${a < 0 ? "less" : "more"} stamina`,
  triple_fireball_cost: (a) => `triple fireball costs ${Math.abs(a)} ${a < 0 ? "less" : "more"} mana`,
  parry_window: (a) => `${signed(a)} s parry window`,
};

/**
 * What one rank of a `cls` node raises (V14): Might's `primary_attribute` is each attribute the class
 * names, each by the full amount; any other stat, or Might in a class the golden lacks, is itself.
 */
export function rankStats(perRank: PassivePerRank, cls: string): PassivePerRank[] {
  const attributes = perRank.stat === "primary_attribute" ? primaryAttributes(cls) : [];
  return attributes.length ? attributes.map((stat) => ({ ...perRank, stat })) : [perRank];
}

/** One stat's effect in words: its own words, else its name and amount. */
function statWords({ stat, amount, unit }: PassivePerRank): string {
  if (Object.hasOwn(STAT_WORDS, stat)) return STAT_WORDS[stat](amount, unit);
  const suffix = unit === "percent" ? "%" : unit === "seconds" ? " s" : "";
  return `${signed(amount)}${suffix} ${stat.replace(/_/g, " ")}`;
}

/** One rank's effect in words for a `cls` node (R37, R39, V26): Might names the class's attributes. */
export function rankEffect(perRank: PassivePerRank, cls = ""): string {
  return rankStats(perRank, cls).map(statWords).join(", ");
}
