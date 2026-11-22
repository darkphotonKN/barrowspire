import { describe, expect, it } from "vitest";
import { ABILITY_ICONS } from "@/ui/abilityIcons";
import { treeAbilityCopy } from "@/ui/abilityCopy";
import { PASSIVE_ICONS, nodeIcon } from "@/ui/passiveIcons";
import { PASSIVE_COPY, PASSIVE_NODES, classNodes, nodeCopy, primaryAttributes, rankEffect, rankStats } from "./passiveTree";
import { SPECIALIZATIONS } from "./specializations";

// FS-8RZ51 R6, R39, R42 and §Change: Tree v2 (V1, V12, V13): the client reads the tree's structure and
// numbers from the server's golden and keeps only presentation, by node id; the two sides hold one id set.

describe("the passive tree's copy against the golden (FS-8RZ51 R6, R39)", () => {
  it("should hold a copy for every node the golden has, and none the golden lacks", () => {
    const golden = PASSIVE_NODES.map((n) => n.id).sort();
    const copy = Object.keys(PASSIVE_COPY).sort();
    expect(copy.filter((id) => !golden.includes(id))).toEqual([]);
    expect(golden.filter((id) => !copy.includes(id))).toEqual([]);
  });

  it("should give each kicker its R3 words, and no other kind any", () => {
    for (const node of PASSIVE_NODES) {
      expect(!!PASSIVE_COPY[node.id].kicker, node.id).toBe(node.kind === "kicker");
    }
  });

  it("should draw each ability node's tree-ability picture from the ability bar's icons (R40)", () => {
    const abilities = PASSIVE_NODES.filter((n) => n.kind === "ability");
    expect(abilities.map((n) => PASSIVE_COPY[n.id].icon)).toEqual(["earthbreaker", "blink", "arrow_rain", "settle_the_debt"]);
    // the ability bar's own picture, not a copy of it
    for (const node of abilities) {
      const key = PASSIVE_COPY[node.id].icon as keyof typeof ABILITY_ICONS;
      expect(nodeIcon(key)).toBe(ABILITY_ICONS[key]);
    }
  });

  it("should name every class's traversal nodes by what each raises, each with its own picture (V13, V29)", () => {
    const byStat: Record<string, [string, string]> = {
      max_hp: ["Vitality", "vitality"],
      primary_attribute: ["Might", "might"],
      attack_speed: ["Haste", "haste"],
      move_speed: ["Fleetness", "fleetness"],
    };
    const traversal = PASSIVE_NODES.filter((n) => n.kind === "traversal");
    expect(traversal).toHaveLength(4 * 24);
    for (const node of traversal) {
      const { name, icon } = PASSIVE_COPY[node.id];
      expect([name, icon], node.id).toEqual(byStat[node.perRank!.stat]);
    }
  });

  it("should carry no filler, and none of the retired ids (V3)", () => {
    expect(PASSIVE_NODES.some((n) => (n.kind as string) === "filler")).toBe(false);
    for (const cls of ["warrior", "mage", "archer", "mercenary"])
      for (const slot of ["t1a", "t1b", "t4a", "t4b"]) expect(nodeCopy(`${cls}.${slot}`)).toBeUndefined();
  });

  it.each(["warrior", "mage", "archer", "mercenary"])("should give each of the %s's kickers and specializations a picture of its own (R40)", (cls) => {
    const own = PASSIVE_NODES.filter((n) => n.class === cls && (n.kind === "kicker" || n.kind === "specialization"));
    const icons = own.map((n) => PASSIVE_COPY[n.id].icon);
    expect(icons).toHaveLength(6);
    expect(new Set(icons).size).toBe(6);
    for (const icon of icons) expect(Object.hasOwn(PASSIVE_ICONS, icon!), `${icon}`).toBe(true);
  });

  it("should name each specialization node for its class's specialization, t6a side a (R31)", () => {
    for (const node of PASSIVE_NODES.filter((n) => n.kind === "specialization")) {
      const spec = PASSIVE_COPY[node.id].specialization!;
      expect(SPECIALIZATIONS[spec].class, node.id).toBe(node.class);
      expect(PASSIVE_COPY[node.id].name).toBe(SPECIALIZATIONS[spec].name);
    }
    expect(PASSIVE_COPY["warrior.t6a"].specialization).toBe("guardian");
    expect(PASSIVE_COPY["mercenary.t6b"].specialization).toBe("sellsword");
  });

  it("should say what each ability and specialization does, in V26's words, and give no other kind a line", () => {
    const lines = Object.fromEntries(PASSIVE_NODES.filter((n) => PASSIVE_COPY[n.id].effect).map((n) => [n.id, PASSIVE_COPY[n.id].effect]));
    expect(lines).toEqual({
      "warrior.t3": "Slam the ground: hit and stun everything within 90 px for 1 s (0.5 s on a boss).",
      "warrior.t6a": "Last Stand: once per floor, a hit that would kill you leaves you at 1 HP and refills your stamina.",
      "warrior.t6b": "Blood price: 33% less max HP for +25% attack speed and +10% damage; each slash that hits heals 1.5% of max HP.",
      "mage.t3": "Teleport up to 180 px toward the cursor; walls stop you.",
      "mage.t6a": "Arcane Ward: a quarter of each hit's damage comes off your mana first, and magic hits deal 10% less.",
      "mage.t6b": "Combustion: a fireball crit explodes for half its damage on every other monster within 60 px.",
      "archer.t3": "Five volleys of arrows fall on a 70 px circle over 1.5 s.",
      "archer.t6a": "Split Shot: an arrow crit splits off a 60% arrow at the nearest other monster within 220 px.",
      "archer.t6b": "Shadow Shot pierces every target in its line; each monster it hits refunds 8 stamina.",
      "mercenary.t3": "A flurry all round you that spends every parry charge, harder for each one.",
      "mercenary.t6a": "Quick riposte: your cut ripostes at 2 parry charges and spends only 2.",
      "mercenary.t6b": "Five parry charges and no riposte; each charge held gives +5% cut damage and +5% attack speed.",
    });
    for (const node of PASSIVE_NODES) expect(!!PASSIVE_COPY[node.id].effect, node.id).toBe(node.kind === "ability" || node.kind === "specialization");
  });

  it("should name each ability node as the ability bar names its class's tree ability (FS-04EEA R50)", () => {
    for (const node of PASSIVE_NODES.filter((n) => n.kind === "ability")) expect(PASSIVE_COPY[node.id].name, node.id).toBe(treeAbilityCopy(node.class)?.name);
  });

  it("should have no copy for an id it does not know (R42)", () => {
    expect(nodeCopy("warrior.t9z")).toBeUndefined();
    expect(nodeCopy("toString")).toBeUndefined();
  });
});

describe("classNodes (FS-8RZ51 V1)", () => {
  it("should give a class's 31 nodes in the definition's order, trunk to the specializations", () => {
    expect(classNodes("warrior").map((n) => n.slot)).toEqual([
      "r1", "r2",
      "ua1", "t2a", "ua2", "ua3", "ua4",
      "ub1", "t2b", "ub2", "ub3", "ub4",
      "m1", "m2", "t3", "m3",
      "la1", "t5a", "la2", "la3", "la4", "la5",
      "lb1", "t5b", "lb2", "lb3", "lb4", "lb5",
      "m4", "t6a", "t6b",
    ]);
  });

  it("should carry each node's links, level gate and side as the golden writes them", () => {
    const [m1, t3, t6b] = ["warrior.m1", "warrior.t3", "warrior.t6b"].map((id) => PASSIVE_NODES.find((n) => n.id === id)!);
    expect(m1.requires).toEqual(["warrior.ua1", "warrior.ub1"]);
    expect(m1.exclusive).toBeUndefined();
    expect(t3.minLevel).toBe(10);
    expect(t6b.exclusive).toEqual({ group: "spec", side: "b" });
    expect(classNodes("warrior")[0].requires).toEqual([]);
  });

  it("should have no nodes for a class the golden lacks", () => {
    expect(classNodes("necromancer")).toEqual([]);
  });
});

describe("primaryAttributes (FS-8RZ51 V14)", () => {
  it.each([
    ["warrior", ["strength"]],
    ["mage", ["intelligence"]],
    ["archer", ["agility"]],
    ["mercenary", ["strength", "agility"]],
  ])("should read the %s's from the golden", (cls, attributes) => {
    expect(primaryAttributes(cls)).toEqual(attributes);
  });

  it("should read none for a class the golden lacks, or a name off the object", () => {
    expect(primaryAttributes("necromancer")).toEqual([]);
    expect(primaryAttributes("toString")).toEqual([]);
  });
});

describe("rankEffect (FS-8RZ51 R37, R39)", () => {
  it.each([
    [{ stat: "max_hp", amount: 4, unit: "percent" }, "+4% max HP"],
    [{ stat: "max_hp", amount: 5, unit: "flat" }, "+5 max HP"],
    [{ stat: "max_mana", amount: 15, unit: "flat" }, "+15 max mana"],
    [{ stat: "dash_cost", amount: -3, unit: "flat" }, "dash costs 3 less stamina"],
    [{ stat: "cut_cooldown", amount: -4, unit: "percent" }, "cut cooldown 4% shorter"],
    [{ stat: "parry_window", amount: 0.02, unit: "seconds" }, "+0.02 s parry window"],
    [{ stat: "crit", amount: 3, unit: "flat" }, "+3 crit points"],
  ])("should write %o as %s", (perRank, words) => {
    expect(rankEffect(perRank)).toBe(words);
  });

  it.each([
    ["warrior", "+2 Strength"],
    ["mage", "+2 Intelligence"],
    ["archer", "+2 Agility"],
    ["mercenary", "+2 Strength, +2 Agility"],
  ])("should write Might's primary attribute as the %s's own attributes (V14, V26)", (cls, words) => {
    expect(rankEffect({ stat: "primary_attribute", amount: 2, unit: "flat" }, cls)).toBe(words);
  });

  it("should spread Might over the class's attributes, each by the full amount, and keep any other stat whole (V14)", () => {
    const might = { stat: "primary_attribute", amount: 3, unit: "flat" };
    expect(rankStats(might, "mercenary")).toEqual([
      { stat: "strength", amount: 3, unit: "flat" },
      { stat: "agility", amount: 3, unit: "flat" },
    ]);
    expect(rankStats(might, "necromancer")).toEqual([might]);
    const hp = { stat: "max_hp", amount: 5, unit: "flat" };
    expect(rankStats(hp, "mercenary")).toEqual([hp]);
  });

  it("should write a stat it has no words for from its own name", () => {
    expect(rankEffect({ stat: "bone_dust", amount: 5, unit: "percent" })).toBe("+5% bone dust");
  });

  it("should have words for every stat the golden carries", () => {
    for (const node of PASSIVE_NODES) {
      if (!node.perRank) continue;
      expect(rankEffect(node.perRank, node.class), node.id).not.toContain("_");
    }
  });
});
