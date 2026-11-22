/**
 * The passive tree as the client knows it (FS-8RZ51 R6, R39): its structure and numbers read from
 * the golden, and only the presentation kept here, by node id.
 *
 * `passiveTree.golden.json` is written by the Go test that holds `game-server/common/passivetree` to
 * it (`-update` to rewrite) and is never hand-edited, so a node added or retuned on the server fails
 * `passiveTree.test.ts` until this copy agrees (R6, user story 28). The copy holds each node's name,
 * its R3 kicker's words, and what it draws (R40): a filler one of the four shared pictures, a kicker
 * or a tier-6 node its own (`passiveIcons.ts`), the tier-3 node its tree ability's picture from the
 * ability bar; and the tier-6 node its specialization (FS-E1ZDG). Effect lines are written from the
 * golden's per-rank values (`STAT_WORDS`), so a retuned number shows without a copy edit.
 *
 * Every name here is a placeholder (FS-8RZ51 R29 "All numbers are placeholders"; the tier-3 and
 * tier-6 words are FS-04EEA's and FS-E1ZDG's). Pure data, no Phaser.
 */

import type { NodeIconKey } from "@/ui/passiveIcons";
import type { SpecializationId } from "./specializations";
import golden from "./passiveTree.golden.json";

/** What a node is (R2): a two-rank filler, a three-rank kicker, the tier-3 ability, a tier-6 pick. */
export type PassiveNodeKind = "filler" | "kicker" | "ability" | "specialization";

/** A tier's gate as the golden writes it (R2): ranks spent in the tiers above, or one node held. */
export interface PassiveGate {
  spentAbove?: number;
  requires?: string;
}

/** What each rank adds, as the golden writes it (R28, R29). */
export interface PassivePerRank {
  stat: string;
  amount: number;
  unit: "percent" | "flat" | "seconds" | string;
}

/** One node as the golden carries it (R6). */
export interface PassiveNodeDef {
  id: string;
  class: string;
  tier: number;
  slot: string;
  kind: PassiveNodeKind;
  maxRank: number;
  gate: PassiveGate;
  perRank?: PassivePerRank;
  /** A kicker's R3 rule, by the server's name for it. */
  kicker?: string;
}

/** Every node of every class, as the server defines them (R1, R6). */
export const PASSIVE_NODES: readonly PassiveNodeDef[] = golden.nodes as PassiveNodeDef[];

/** A class's nodes, tier 1 first and in slot order within a tier; none for a class the golden lacks (R42). */
export function classNodes(className: string): PassiveNodeDef[] {
  return PASSIVE_NODES.filter((n) => n.class === className).sort((a, b) => a.tier - b.tier || a.slot.localeCompare(b.slot));
}

/** A node's presentation (R39): its name and, by kind, its kicker's words, its picture, its pick. */
export interface PassiveNodeCopy {
  name: string;
  /** A kicker's R3 rule in words (R29), shown as the last rank's. */
  kicker?: string;
  /**
   * The picture the node draws (R40): a filler one of the four shared by what it raises, a kicker or
   * a tier-6 node its own (`PASSIVE_ICONS`), the tier-3 node its tree ability's from the ability bar
   * (`ABILITY_ICONS`). Every node has one; a node id the copy lacks has no copy at all (R42).
   */
  icon: NodeIconKey;
  /** The tier-6 node's specialization (FS-E1ZDG): its title's name. */
  specialization?: SpecializationId;
}

/**
 * The fillers by what they raise (R28): shared words, placeholder, and one of the four shared
 * pictures (R40): max HP the heart, a resource's max the urn, an attribute the standing stone, a
 * resource's regen the circling arrows.
 */
const FILLER = {
  hp: { name: "Hardened Frame", icon: "health" },
  stamina: { name: "Deep Lungs", icon: "reserve" },
  mana: { name: "Brimming Vessel", icon: "reserve" },
  strength: { name: "Barrow Brawn", icon: "attribute" },
  intelligence: { name: "Grave Lore", icon: "attribute" },
  agility: { name: "Light Step", icon: "attribute" },
  staminaRegen: { name: "Second Wind", icon: "regen" },
  manaRegen: { name: "Still Waters", icon: "regen" },
} as const satisfies Record<string, PassiveNodeCopy>;

/** Every node's presentation, by node id (R39). The golden's ids and these keys are one set (R6). */
export const PASSIVE_COPY: Readonly<Record<string, PassiveNodeCopy>> = {
  "warrior.t1a": FILLER.hp,
  "warrior.t1b": FILLER.stamina,
  "warrior.t2a": { name: "Heavy Hand", icon: "heavy_hand", kicker: "A slash that hits 2 or more monsters refunds 5 stamina." },
  "warrior.t2b": { name: "Thick Skin", icon: "thick_skin", kicker: "While below half max HP, damage taken is 10% less." },
  "warrior.t3": { name: "Earthbreaker", icon: "earthbreaker" },
  "warrior.t4a": FILLER.strength,
  "warrior.t4b": FILLER.staminaRegen,
  "warrior.t5a": { name: "Long Wind", icon: "long_wind", kicker: "A kill refunds 15 stamina." },
  "warrior.t5b": { name: "Bull Rush", icon: "bull_rush", kicker: "Your first hit within 3 s of a dash ending is a sure crit." },
  "warrior.t6a": { name: "Guardian", icon: "guardian", specialization: "guardian" },
  "warrior.t6b": { name: "Berserker", icon: "berserker", specialization: "berserker" },

  "mage.t1a": FILLER.hp,
  "mage.t1b": FILLER.mana,
  "mage.t2a": { name: "Kindling", icon: "kindling", kicker: "A fireball crit refunds 5 mana." },
  "mage.t2b": { name: "Deep Well", icon: "deep_well", kicker: "+25% mana regen." },
  "mage.t3": { name: "Blink", icon: "blink" },
  "mage.t4a": FILLER.intelligence,
  "mage.t4b": FILLER.manaRegen,
  "mage.t5a": { name: "Wide Volley", icon: "wide_volley", kicker: "The volley throws 5 fireballs, not 3." },
  "mage.t5b": { name: "Searing", icon: "searing", kicker: "Fireballs pierce one more monster." },
  "mage.t6a": { name: "Spellwarden", icon: "spellwarden", specialization: "spellwarden" },
  "mage.t6b": { name: "Pyromancer", icon: "pyromancer", specialization: "pyromancer" },

  "archer.t1a": FILLER.hp,
  "archer.t1b": FILLER.stamina,
  "archer.t2a": { name: "Quick Draw", icon: "quick_draw", kicker: "Every 4th arrow pierces one more monster." },
  "archer.t2b": { name: "Fleet Foot", icon: "fleet_foot", kicker: "Sidestep: 10% of monster strikes on you miss." },
  "archer.t3": { name: "Arrow Rain", icon: "arrow_rain" },
  "archer.t4a": FILLER.agility,
  "archer.t4b": FILLER.staminaRegen,
  "archer.t5a": { name: "Eagle Eye", icon: "eagle_eye", kicker: "Every Shadow Shot is a sure crit." },
  "archer.t5b": { name: "Hunter's Breath", icon: "hunters_breath", kicker: "A kill refunds Shadow Shot's cost." },
  "archer.t6a": { name: "Hunter", icon: "hunter", specialization: "hunter" },
  "archer.t6b": { name: "Shadow Ranger", icon: "shadow_ranger", specialization: "shadow_ranger" },

  "mercenary.t1a": FILLER.hp,
  "mercenary.t1b": FILLER.strength,
  "mercenary.t2a": { name: "Keen Edge", icon: "keen_edge", kicker: "A cut on a monster in its wind-up is a sure crit." },
  "mercenary.t2b": { name: "Practiced Guard", icon: "practiced_guard", kicker: "A strike parried in the first half of the window grants 2 parry charges." },
  "mercenary.t3": { name: "Settle the Debt", icon: "settle_the_debt" },
  "mercenary.t4a": FILLER.agility,
  "mercenary.t4b": FILLER.hp,
  "mercenary.t5a": { name: "Bloodied Riposte", icon: "bloodied_riposte", kicker: "A riposte that hits heals 5% of max HP, once per riposte." },
  "mercenary.t5b": { name: "Steady Hand", icon: "steady_hand", kicker: "A cut that kills grants 1 parry charge." },
  "mercenary.t6a": { name: "Duelist", icon: "duelist", specialization: "duelist" },
  "mercenary.t6b": { name: "Sellsword", icon: "sellsword", specialization: "sellsword" },
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
export const STAT_WORDS: Readonly<Record<string, (amount: number) => string>> = {
  max_hp: (a) => `${signed(a)}% max HP`,
  max_stamina: (a) => `${signed(a)} max stamina`,
  max_mana: (a) => `${signed(a)} max mana`,
  strength: (a) => `${signed(a)} Strength`,
  intelligence: (a) => `${signed(a)} Intelligence`,
  agility: (a) => `${signed(a)} Agility`,
  stamina_regen: (a) => `${signed(a)}% stamina regen`,
  mana_regen: (a) => `${signed(a)}% mana regen`,
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

/** One rank's effect in words (R37, R39): the stat's own words, else its name and amount. */
export function rankEffect(perRank: PassivePerRank): string {
  const words = Object.hasOwn(STAT_WORDS, perRank.stat) ? STAT_WORDS[perRank.stat] : undefined;
  if (words) return words(perRank.amount);
  const unit = perRank.unit === "percent" ? "%" : perRank.unit === "seconds" ? " s" : "";
  return `${signed(perRank.amount)}${unit} ${perRank.stat.replace(/_/g, " ")}`;
}
