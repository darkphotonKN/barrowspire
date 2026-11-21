import { describe, expect, it } from "vitest";
import { ABILITY_ICONS } from "@/ui/abilityIcons";
import { PASSIVE_ICONS, nodeIcon } from "@/ui/passiveIcons";
import { PASSIVE_COPY, PASSIVE_NODES, classNodes, nodeCopy, rankEffect } from "./passiveTree";
import { SPECIALIZATIONS } from "./specializations";

// FS-8RZ51 R6, R39, R42: the client reads the tree's structure and numbers from the server's golden and
// keeps only presentation, by node id; the two sides hold one id set.

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

  it("should draw each tier-3 node's tree-ability picture from the ability bar's icons (R40)", () => {
    const abilities = PASSIVE_NODES.filter((n) => n.kind === "ability");
    expect(abilities.map((n) => PASSIVE_COPY[n.id].icon)).toEqual(["earthbreaker", "blink", "arrow_rain", "settle_the_debt"]);
    // the ability bar's own picture, not a copy of it
    for (const node of abilities) {
      const key = PASSIVE_COPY[node.id].icon as keyof typeof ABILITY_ICONS;
      expect(nodeIcon(key)).toBe(ABILITY_ICONS[key]);
    }
  });

  it("should draw every class's fillers with the four shared pictures, by what each raises (R40)", () => {
    const byStat: Record<string, string> = {
      max_hp: "health",
      max_stamina: "reserve",
      max_mana: "reserve",
      strength: "attribute",
      intelligence: "attribute",
      agility: "attribute",
      stamina_regen: "regen",
      mana_regen: "regen",
    };
    const fillers = PASSIVE_NODES.filter((n) => n.kind === "filler");
    expect(fillers.length).toBeGreaterThan(0);
    for (const node of fillers) expect(PASSIVE_COPY[node.id].icon, node.id).toBe(byStat[node.perRank!.stat]);
  });

  it.each(["warrior", "mage", "archer", "mercenary"])("should give each of the %s's kickers and specializations a picture of its own (R40)", (cls) => {
    const own = PASSIVE_NODES.filter((n) => n.class === cls && (n.kind === "kicker" || n.kind === "specialization"));
    const icons = own.map((n) => PASSIVE_COPY[n.id].icon);
    expect(icons).toHaveLength(6);
    expect(new Set(icons).size).toBe(6);
    for (const icon of icons) expect(Object.hasOwn(PASSIVE_ICONS, icon!), `${icon}`).toBe(true);
  });

  it("should name each tier-6 node for its class's specialization, t6a the first row (R31)", () => {
    for (const node of PASSIVE_NODES.filter((n) => n.kind === "specialization")) {
      const spec = PASSIVE_COPY[node.id].specialization!;
      expect(SPECIALIZATIONS[spec].class, node.id).toBe(node.class);
      expect(PASSIVE_COPY[node.id].name).toBe(SPECIALIZATIONS[spec].name);
    }
    expect(PASSIVE_COPY["warrior.t6a"].specialization).toBe("guardian");
    expect(PASSIVE_COPY["mercenary.t6b"].specialization).toBe("sellsword");
  });

  it("should have no copy for an id it does not know (R42)", () => {
    expect(nodeCopy("warrior.t9z")).toBeUndefined();
    expect(nodeCopy("toString")).toBeUndefined();
  });
});

describe("classNodes (FS-8RZ51 R2)", () => {
  it("should lay a class's 11 nodes out tier 1 first, slot order within a tier", () => {
    expect(classNodes("warrior").map((n) => n.slot)).toEqual(["t1a", "t1b", "t2a", "t2b", "t3", "t4a", "t4b", "t5a", "t5b", "t6a", "t6b"]);
  });

  it("should have no nodes for a class the golden lacks", () => {
    expect(classNodes("necromancer")).toEqual([]);
  });
});

describe("rankEffect (FS-8RZ51 R37, R39)", () => {
  it.each([
    [{ stat: "max_hp", amount: 4, unit: "percent" }, "+4% max HP"],
    [{ stat: "max_mana", amount: 15, unit: "flat" }, "+15 max mana"],
    [{ stat: "dash_cost", amount: -3, unit: "flat" }, "dash costs 3 less stamina"],
    [{ stat: "cut_cooldown", amount: -4, unit: "percent" }, "cut cooldown 4% shorter"],
    [{ stat: "parry_window", amount: 0.02, unit: "seconds" }, "+0.02 s parry window"],
    [{ stat: "crit", amount: 3, unit: "flat" }, "+3 crit points"],
  ])("should write %o as %s", (perRank, words) => {
    expect(rankEffect(perRank)).toBe(words);
  });

  it("should write a stat it has no words for from its own name", () => {
    expect(rankEffect({ stat: "bone_dust", amount: 5, unit: "percent" })).toBe("+5% bone dust");
  });

  it("should have words for every stat the golden carries", () => {
    for (const node of PASSIVE_NODES) {
      if (!node.perRank) continue;
      expect(rankEffect(node.perRank), node.id).not.toContain("_");
    }
  });
});
