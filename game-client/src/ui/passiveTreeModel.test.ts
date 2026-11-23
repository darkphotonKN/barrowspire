import { describe, expect, it } from "vitest";
import type { PassiveNodeDef } from "@/data/passiveTree";
import { SPEND_IN_FLIGHT_MS, TreeSpend, treeView, type NodeView, type TreeSource } from "./passiveTreeModel";

// FS-8RZ51 §G R37, R42, §Change: Tree v2 V25, V26 (the reasons' words), V28 and §Edge States: the tree as
// the overlay draws it, from the golden, the character's ranks, unspent points and level.

const warrior = (ranks: Record<string, number> = {}, points = 5, level = 10): TreeSource => ({
  class: "warrior",
  level,
  passive_ranks: ranks,
  passive_points: points,
});

const nodesOf = (source: TreeSource, nodes?: readonly PassiveNodeDef[]) => treeView(source, nodes).nodes;

const node = (source: TreeSource, id: string, nodes?: readonly PassiveNodeDef[]): NodeView => {
  const found = nodesOf(source, nodes).find((n) => n.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

const tip = (source: TreeSource, id: string) => node(source, id).tip.map((l) => l.text);
const reason = (source: TreeSource, id: string, nodes?: readonly PassiveNodeDef[]) =>
  node(source, id, nodes).tip.filter((l) => l.tone === "reason").map((l) => l.text);

/** The trunk, one upper side, the middle and one lower side: the path to the specializations. */
const TO_M4 = ["r1", "r2", "ua1", "m1", "m2", "t3", "m3", "la1", "m4"];
const held = (cls: string, slots: string[]) => Object.fromEntries(slots.map((s) => [`${cls}.${s}`, 1]));

describe("the passive tree's locked sides (FS-8RZ51 V6, V25)", () => {
  it("should lock warrior.ub1 once warrior.ua1 is held", () => {
    expect(node(warrior(held("warrior", ["r1", "r2", "ua1"])), "warrior.ub1").state).toBe("locked");
  });

  it("should lock every upper:b node after ua1, naming the held side's kicker, and none of them spendable", () => {
    const source = warrior(held("warrior", ["r1", "r2", "ua1"]));
    for (const slot of ["ub1", "t2b", "ub2", "ub3", "ub4"]) {
      const n = node(source, `warrior.${slot}`);
      expect([n.state, n.spendable], slot).toEqual(["locked", false]);
      expect(reason(source, n.id), slot).toEqual(["Locked: you chose Heavy Hand."]);
    }
  });

  it("should lock the other specialization by the one held: Guardian locks Berserker", () => {
    const source = warrior({ ...held("warrior", TO_M4), "warrior.t6a": 1 }, 1, 20);
    expect(node(source, "warrior.t6a").state).toBe("max");
    expect(node(source, "warrior.t6b").state).toBe("locked");
    expect(reason(source, "warrior.t6b")).toEqual(["Locked: you chose Guardian."]);
  });

  it("should answer locked before not reachable, as the server's order does (V5)", () => {
    // t2b is both unlinked (ub1 unheld) and on the taken side's other side
    expect(node(warrior(held("warrior", ["r1", "r2", "ua1"])), "warrior.t2b").state).toBe("locked");
  });

  it("should lock nothing of the side taken, nor any node on no side", () => {
    const source = warrior(held("warrior", ["r1", "r2", "ua1"]));
    expect(node(source, "warrior.t2a").state).toBe("available");
    expect(node(source, "warrior.m1").state).toBe("available");
  });
});

describe("the passive tree's reachability (FS-8RZ51 V5, V25, V28)", () => {
  it("should open m1 from either side's first node", () => {
    expect(node(warrior(held("warrior", ["r1", "r2", "ua1"])), "warrior.m1").state).toBe("available");
    expect(node(warrior(held("warrior", ["r1", "r2", "ub1"])), "warrior.m1").state).toBe("available");
  });

  it("should close m1 with nothing held, naming its links joined by or", () => {
    const n = node(warrior(), "warrior.m1");
    expect([n.state, n.spendable]).toEqual(["closed", false]);
    expect(reason(warrior(), "warrior.m1")).toEqual(["Not reachable yet: take Haste or Fleetness first."]);
  });

  it("should close the ability at level 9 with m2 held, saying the level, and open it at 10", () => {
    const ranks = held("warrior", ["r1", "r2", "ua1", "m1", "m2"]);
    expect(node(warrior(ranks, 3, 9), "warrior.t3").state).toBe("closed");
    expect(reason(warrior(ranks, 3, 9), "warrior.t3")).toEqual(["Not reachable yet: reach level 10."]);
    expect(node(warrior(ranks, 3, 10), "warrior.t3").state).toBe("available");
  });

  it("should say both what a node needs: its link and its level (§Edge States: level 19)", () => {
    const ranks = held("warrior", ["r1", "r2", "ua1", "m1", "m2", "t3", "m3", "la1"]);
    expect(reason(warrior(ranks, 0, 19), "warrior.t6a")).toEqual(["Not reachable yet: take Vitality first.", "Not reachable yet: reach level 20."]);
    expect(reason(warrior({ ...ranks, "warrior.m4": 1 }, 0, 19), "warrior.t6a")).toEqual(["Not reachable yet: reach level 20."]);
  });

  it("should open the root at level 2 with nothing held", () => {
    const n = node(warrior({}, 1, 2), "warrior.r1");
    expect([n.state, n.spendable]).toEqual(["available", true]);
  });

  it("should open only by the class's own nodes", () => {
    expect(node(warrior(held("mage", ["r1", "r2", "ua1"])), "warrior.r2").state).toBe("closed");
    expect(node(warrior(held("mage", ["r1", "r2", "ua1"])), "warrior.ub1").state).toBe("closed");
  });
});

describe("the passive tree's held nodes and points (FS-8RZ51 V25, R9)", () => {
  it("should mark a node held while more ranks remain, and held at max at its last", () => {
    const ranks = held("warrior", ["r1", "r2", "ua1"]);
    expect(node(warrior({ ...ranks, "warrior.t2a": 1 }), "warrior.t2a").state).toBe("held");
    expect(node(warrior({ ...ranks, "warrior.t2a": 3 }), "warrior.t2a").state).toBe("max");
    expect(node(warrior(ranks), "warrior.ua1").state).toBe("max");
  });

  it("should call a node spendable only when available or held, with a point", () => {
    const ranks = { ...held("warrior", ["r1", "r2", "ua1"]), "warrior.t2a": 1 };
    const view = (points: number) => nodesOf(warrior(ranks, points));
    const spendable = (points: number) =>
      view(points)
        .filter((n) => n.spendable)
        .map((n) => [n.id, n.state]);
    expect(spendable(1)).toEqual([
      ["warrior.t2a", "held"],
      // a link is held at rank 1: the kicker opens the side's next step before it is full
      ["warrior.ua2", "available"],
      ["warrior.m1", "available"],
    ]);
    expect(spendable(0)).toEqual([]);
  });

  it("should read an available node as not to be spent with no points, greyed (§Edge States: no points)", () => {
    const n = node(warrior({}, 0), "warrior.r1");
    expect([n.state, n.spendable]).toEqual(["available", false]);
  });

  it("should carry the rank as r / max on every node", () => {
    const n = node(warrior({ ...held("warrior", ["r1", "r2", "ua1"]), "warrior.t2a": 1 }), "warrior.t2a");
    expect([n.rank, n.maxRank]).toEqual([1, 3]);
  });

  it("should give a node its hue whatever its state or rank (L2, L5)", () => {
    const hues = (source: TreeSource) => ["r1", "r2", "ua1", "ub1", "t2a", "t2b", "t6b"].map((s) => node(source, `warrior.${s}`).hue);
    const want = ["health", "power", "speed", "movement", "power", "defence", "health"];
    expect(hues(warrior())).toEqual(want);
    expect(hues(warrior({ "warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1, "warrior.t2a": 2 }, 0))).toEqual(want);
  });

  it("should change nothing in the view for a retired id in the ranks (R42, V21)", () => {
    const ranks = held("warrior", ["r1", "r2"]);
    expect(treeView(warrior({ ...ranks, "warrior.t1a": 2, "warrior.t4b": 1 }))).toEqual(treeView(warrior(ranks)));
  });
});

describe("the passive tree's depths, lanes and header (FS-8RZ51 V23)", () => {
  it("should give each node its depth, one more than its shallowest link, in the definition's order", () => {
    const byDepth = new Map<number, string[]>();
    for (const n of nodesOf(warrior())) byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n.id.replace("warrior.", "")]);
    expect([...byDepth.entries()].sort(([a], [b]) => a - b)).toEqual([
      [0, ["r1"]],
      [1, ["r2"]],
      [2, ["ua1", "ub1"]],
      [3, ["t2a", "t2b", "m1"]],
      [4, ["ua2", "ub2", "m2"]],
      [5, ["ua3", "ub3", "t3"]],
      [6, ["ua4", "ub4", "m3"]],
      [7, ["la1", "lb1"]],
      [8, ["t5a", "t5b", "m4"]],
      [9, ["la2", "lb2", "t6a", "t6b"]],
      [10, ["la3", "lb3"]],
      [11, ["la4", "lb4"]],
      [12, ["la5", "lb5"]],
    ]);
    expect(node(warrior(), "warrior.t6b").depth).toBe(9);
  });

  it("should give each node its lane: its side of a group, none on the trunk", () => {
    expect(node(warrior(), "warrior.ua3").lane).toEqual({ group: "upper", side: "a" });
    expect(node(warrior(), "warrior.lb5").lane).toEqual({ group: "lower", side: "b" });
    expect(node(warrior(), "warrior.t6b").lane).toEqual({ group: "spec", side: "b" });
    expect(node(warrior(), "warrior.m1").lane).toBeUndefined();
  });

  it("should head the tree with the class and the unspent points", () => {
    expect(treeView(warrior({}, 3)).header).toBe("Warrior · 3 points");
    expect(treeView(warrior({}, 1)).header).toBe("Warrior · 1 point");
    expect(treeView(warrior({}, 0)).header).toBe("Warrior · 0 points");
  });

  it("should read no points when the state carries none", () => {
    expect(treeView({ class: "mage" }).points).toBe(0);
  });
});

describe("the passive tree's links (FS-8RZ51 V24)", () => {
  const linkOf = (source: TreeSource, from: string, to: string) => treeView(source).links.find((l) => l.from === `warrior.${from}` && l.to === `warrior.${to}`);

  it("should hold one link per requires edge, from the link to the node that needs it", () => {
    const links = treeView(warrior()).links;
    expect(links).toHaveLength(nodesOf(warrior()).reduce((n, v) => n + (v.id === "warrior.r1" ? 0 : v.id === "warrior.m1" || v.id === "warrior.m4" ? 2 : 1), 0));
    expect(linkOf(warrior(), "ua1", "m1")).toBeDefined();
    expect(linkOf(warrior(), "ub1", "m1")).toBeDefined();
  });

  it("should light a link only when both its ends are held", () => {
    const source = warrior(held("warrior", ["r1", "r2", "ua1"]));
    expect(linkOf(source, "r1", "r2")?.lit).toBe(true);
    expect(linkOf(source, "r2", "ua1")?.lit).toBe(true);
    expect(linkOf(source, "ua1", "t2a")?.lit).toBe(false);
    expect(linkOf(source, "ua1", "m1")?.lit).toBe(false);
  });

  it("should dim a link whose far end is locked, and no other", () => {
    const source = warrior(held("warrior", ["r1", "r2", "ua1"]));
    expect(linkOf(source, "r2", "ub1")?.dim).toBe(true);
    expect(linkOf(source, "ub1", "t2b")?.dim).toBe(true);
    expect(linkOf(source, "ua1", "t2a")?.dim).toBe(false);
    expect(linkOf(source, "ub1", "m1")?.dim).toBe(false);
  });

  it("should draw no link to an id the tree lacks (§Edge States)", () => {
    const stray: PassiveNodeDef = { id: "warrior.x", class: "warrior", slot: "x", kind: "traversal", maxRank: 1, requires: ["warrior.gone"], minLevel: 0 };
    expect(treeView(warrior(), [stray]).links).toEqual([]);
  });
});

describe("the rule over a tree that is only data (FS-8RZ51 V11)", () => {
  const def = (slot: string, requires: string[], exclusive?: { group: string; side: string }, kind: PassiveNodeDef["kind"] = "traversal"): PassiveNodeDef => ({
    id: `warrior.${slot}`,
    class: "warrior",
    slot,
    kind,
    maxRank: 1,
    requires: requires.map((r) => `warrior.${r}`),
    minLevel: 0,
    exclusive,
  });
  // a three-sided group past a specialization, its sides with no kicker or specialization of their own
  const FIXTURE = [
    def("t6a", [], { group: "spec", side: "a" }, "specialization"),
    def("xa", ["t6a"], { group: "deep", side: "a" }),
    def("xb", ["t6a"], { group: "deep", side: "b" }),
    def("xc", ["t6a"], { group: "deep", side: "c" }),
    def("end", ["xa", "xb", "xc"]),
  ];

  it("should lock both other sides of a three-sided group, naming the other side", () => {
    const source = warrior({ "warrior.t6a": 1, "warrior.xb": 1 });
    expect(["xa", "xb", "xc", "end"].map((s) => node(source, `warrior.${s}`, FIXTURE).state)).toEqual(["locked", "max", "locked", "available"]);
    expect(reason(source, "warrior.xc", FIXTURE)).toEqual(["Locked: you chose the other side."]);
  });

  it("should give the fixture's nodes their depths and lanes", () => {
    expect(nodesOf(warrior(), FIXTURE).map((n) => [n.depth, n.lane?.group, n.lane?.side])).toEqual([
      [0, "spec", "a"],
      [1, "deep", "a"],
      [1, "deep", "b"],
      [1, "deep", "c"],
      [2, undefined, undefined],
    ]);
  });

  it("should carry each node's hue from its copy, and none for a node the copy lacks (L5, R42)", () => {
    expect(nodesOf(warrior(), FIXTURE).map((n) => [n.id, n.hue])).toEqual([
      ["warrior.t6a", "defence"],
      ["warrior.xa", undefined],
      ["warrior.xb", undefined],
      ["warrior.xc", undefined],
      ["warrior.end", undefined],
    ]);
  });

  it("should ask on a three-sided group's first node with no headline: the other sides go", () => {
    expect(node(warrior({ "warrior.t6a": 1 }), "warrior.xa", FIXTURE).ask).toBe("Take warrior.xa? The other sides are gone for good.");
  });
});

describe("the passive tree's tooltips (FS-8RZ51 R37, V26)", () => {
  const atLevel20 = (cls: string) => ({ class: cls, level: 20, passive_ranks: {}, passive_points: 0 }) satisfies TreeSource;
  const tones = (source: TreeSource, id: string) => node(source, id).tip.map((l) => [l.text, l.tone]);

  it("should say a traversal node's name, kind, rank and one line, <Name>: <effect>, held marked, with no tier line", () => {
    const n = node(warrior({ "warrior.r1": 1 }), "warrior.r1");
    expect(n.tip.map((l) => l.text)).toEqual(["Vitality", "Passive", "Rank 1 / 1", "Vitality: +5 max HP"]);
    expect(n.tip.slice(3).map((l) => [l.tone, l.held])).toEqual([["effect", true]]);
    expect(node(warrior(), "warrior.r1").tip[3].held).toBe(false);
  });

  it.each([
    ["warrior", "Might: +2 Strength"],
    ["mage", "Might: +2 Intelligence"],
    ["archer", "Might: +2 Agility"],
    ["mercenary", "Might: +2 Strength, +2 Agility"],
  ])("should name the %s's attributes on Might", (cls, line) => {
    expect(tip(atLevel20(cls), `${cls}.r2`)).toContain(line);
  });

  it("should read Haste and Fleetness from the golden too", () => {
    expect(tip(warrior(), "warrior.ua1")).toContain("Haste: +2% attack speed");
    expect(tip(warrior(), "warrior.ub1")).toContain("Fleetness: +2% move speed");
  });

  it("should show a Vitality retuned in the golden at its new number, with no copy edit", () => {
    const retuned: PassiveNodeDef[] = [
      { id: "warrior.r1", class: "warrior", slot: "r1", kind: "traversal", maxRank: 1, requires: [], minLevel: 0, perRank: { stat: "max_hp", amount: 7, unit: "flat" } },
    ];
    expect(node(warrior(), "warrior.r1", retuned).tip.map((l) => l.text)).toContain("Vitality: +7 max HP");
  });

  it("should label a kicker's R3 rule as the last rank's", () => {
    expect(tip(warrior(held("warrior", ["r1", "r2", "ua1"])), "warrior.t2a")).toEqual([
      "Heavy Hand",
      "Kicker",
      "Rank 0 / 3",
      "Rank 1: +6% slash damage",
      "Rank 2: +6% slash damage",
      "Rank 3: +6% slash damage",
      "Rank 3 kicker: A slash that hits 2 or more monsters refunds 5 stamina.",
    ]);
  });

  it.each([
    ["warrior", "Earthbreaker", "Slam the ground: hit and stun everything within 90 px for 1 s (0.5 s on a boss)."],
    ["mage", "Blink", "Teleport up to 180 px toward the cursor; walls stop you."],
    ["archer", "Arrow Rain", "Five volleys of arrows fall on a 70 px circle over 1.5 s."],
    ["mercenary", "Settle the Debt", "A flurry all round you that spends every parry charge, harder for each one."],
  ])("should name the %s's ability, say what it does and that it casts with 3", (cls, name, line) => {
    const ranks = held(cls, ["r1", "r2", "ua1", "m1", "m2"]);
    expect(tip({ class: cls, level: 10, passive_ranks: ranks, passive_points: 1 }, `${cls}.t3`)).toEqual([name, "Ability", "Rank 0 / 1", line, "Cast with 3."]);
  });

  it.each([
    ["warrior", "t6a", "Warrior · Guardian", "Last Stand: once per floor, a hit that would kill you leaves you at 1 HP and refills your stamina."],
    ["warrior", "t6b", "Warrior · Berserker", "Blood price: 33% less max HP for +25% attack speed and +10% damage; each slash that hits heals 1.5% of max HP."],
    ["mage", "t6a", "Mage · Spellwarden", "Arcane Ward: a quarter of each hit's damage comes off your mana first, and magic hits deal 10% less."],
    ["mage", "t6b", "Mage · Pyromancer", "Combustion: a fireball crit explodes for half its damage on every other monster within 60 px."],
    ["archer", "t6a", "Archer · Hunter", "Split Shot: an arrow crit splits off a 60% arrow at the nearest other monster within 220 px."],
    ["archer", "t6b", "Archer · Shadow Ranger", "Shadow Shot pierces every target in its line; each monster it hits refunds 8 stamina."],
    ["mercenary", "t6a", "Mercenary · Duelist", "Quick riposte: your cut ripostes at 2 parry charges and spends only 2."],
    ["mercenary", "t6b", "Mercenary · Sellsword", "Five parry charges and no riposte; each charge held gives +5% cut damage and +5% attack speed."],
  ])("should say what the %s's %s does after its title, the look a faint note last", (cls, slot, title, line) => {
    const source = { class: cls, level: 20, passive_ranks: held(cls, TO_M4), passive_points: 1 };
    const lines = tones(source, `${cls}.${slot}`);
    expect(lines.slice(3)).toEqual([
      [`Grants the title ${title}.`, "grant"],
      [line, "grant"],
      ["Your look changes.", "note"],
    ]);
  });

  it("should keep the look's note last, after a reason, and never on the main line", () => {
    const source = warrior(held("warrior", ["r1", "r2", "ua1", "m1", "m2", "t3", "m3", "la1"]), 0, 19);
    expect(tones(source, "warrior.t6a").slice(3)).toEqual([
      ["Grants the title Warrior · Guardian.", "grant"],
      ["Last Stand: once per floor, a hit that would kill you leaves you at 1 HP and refills your stamina.", "grant"],
      ["Not reachable yet: take Vitality first.", "reason"],
      ["Not reachable yet: reach level 20.", "reason"],
      ["Your look changes.", "note"],
    ]);
    for (const n of nodesOf(warrior())) expect(n.tip.filter((l) => l.text.includes("look")).map((l) => l.tone), n.id).toEqual(n.kind === "specialization" ? ["note"] : []);
  });

  it("should say no points are left on an open node with none, and at level 1 how to earn the first", () => {
    expect(reason(warrior({}, 0, 5), "warrior.r1")).toEqual(["No points to spend."]);
    expect(reason(warrior({}, 0, 1), "warrior.r1")).toEqual(["Reach level 2 for your first point."]);
  });

  it("should give a node at max no reason line", () => {
    expect(reason(warrior({ "warrior.r1": 1 }, 0), "warrior.r1")).toEqual([]);
  });
});

describe("the passive tree's unknown classes (FS-8RZ51 R42)", () => {
  it("should lay no nodes for a class the client does not know, never throwing", () => {
    const view = treeView({ class: "necromancer", passive_ranks: { "necromancer.r1": 1 }, passive_points: 2 });
    expect(view.known).toBe(false);
    expect(view.nodes).toEqual([]);
    expect(view.links).toEqual([]);
    expect(view.header).toBe("Necromancer · 2 points");
  });
});

// FS-8RZ51 §G R38 (I-8RZ51-8): a click on a node, in town; the tier-6 ask; a spend in flight; a refusal.
describe("the tree's spend (FS-8RZ51 R38)", () => {
  const mage = (ranks: Record<string, number> = {}, points = 3, level = 10): TreeSource => ({ class: "mage", level, passive_ranks: ranks, passive_points: points });
  const nodeIn = (view: ReturnType<typeof treeView>, id: string) => view.nodes.find((n) => n.id === id)!;
  const trunk = held("mage", ["r1", "r2", "ua1"]);

  function spending(start = 0) {
    const sent: [string, number][] = [];
    let now = start;
    const spend = new TreeSpend((id, rank) => (sent.push([id, rank]), true), () => now);
    return { sent, spend, tick: (ms: number) => void (now += ms) };
  }

  it("should send an available node's next rank once, and nothing on a second click before the state answers", () => {
    const { sent, spend } = spending();
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.t2a"));
    spend.press(nodeIn(view, "mage.t2a"));
    expect(sent).toEqual([["mage.t2a", 1]]);
  });

  it("should take a click again once the state shows the rank", () => {
    const { sent, spend } = spending();
    const before = treeView(mage(trunk));
    spend.press(nodeIn(before, "mage.t2a"));
    const after = treeView(mage({ ...trunk, "mage.t2a": 1 }, 2));
    spend.seen(after);
    spend.press(nodeIn(after, "mage.t2a"));
    expect(sent).toEqual([
      ["mage.t2a", 1],
      ["mage.t2a", 2],
    ]);
  });

  it("should take a click again after 5 s with no answer, the same target rank", () => {
    const { sent, spend, tick } = spending();
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.t2a"));
    tick(SPEND_IN_FLIGHT_MS - 1);
    spend.press(nodeIn(view, "mage.t2a"));
    tick(1);
    spend.press(nodeIn(view, "mage.t2a"));
    expect(sent).toEqual([
      ["mage.t2a", 1],
      ["mage.t2a", 1],
    ]);
  });

  it("should send nothing for a node the model does not call spendable: closed, locked, at max, no points", () => {
    const { sent, spend } = spending();
    const closed = treeView(mage());
    spend.press(nodeIn(closed, "mage.r2"));
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.ub1"));
    spend.press(nodeIn(view, "mage.ua1"));
    const none = treeView(mage(trunk, 0));
    spend.press(nodeIn(none, "mage.m1"));
    expect(sent).toEqual([]);
  });

  it("should show a refusal's reason until the next click, and take a click on the node again at once", () => {
    const { sent, spend } = spending();
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.t2a"));
    spend.refused("Leave the queue to spend points.");
    expect(spend.line()).toBe("Leave the queue to spend points.");
    spend.press(nodeIn(view, "mage.t2a"));
    expect(spend.line()).toBeUndefined();
    expect(sent).toHaveLength(2);
  });

  it("should forget the refusal and the ask as it clears, and keep the spend in flight", () => {
    const { sent, spend } = spending();
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.t2a"));
    spend.refused("No points to spend.");
    spend.clear();
    expect(spend.line()).toBeUndefined();
    spend.press(nodeIn(view, "mage.m1"));
    spend.press(nodeIn(view, "mage.m1"));
    expect(sent).toEqual([
      ["mage.t2a", 1],
      ["mage.m1", 1],
    ]);
  });

  describe("the specialization, one of two and for good", () => {
    const ready = held("mage", TO_M4);

    it("should ask once in the panel before sending, naming the other as gone for good", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(ready, 2, 20));
      spend.press(nodeIn(view, "mage.t6a"));
      expect(sent).toEqual([]);
      expect(spend.asking()).toBe("Choose Spellwarden? Pyromancer is gone for good.");
      spend.answer(true);
      expect(sent).toEqual([["mage.t6a", 1]]);
      expect(spend.asking()).toBeUndefined();
    });

    it("should send nothing on no", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(ready, 2, 20));
      spend.press(nodeIn(view, "mage.t6b"));
      expect(spend.asking()).toBe("Choose Pyromancer? Spellwarden is gone for good.");
      spend.answer(false);
      expect(sent).toEqual([]);
      expect(spend.asking()).toBeUndefined();
    });

    it("should drop the ask on a click on another node, or as the tree closes", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(ready, 2, 20));
      spend.press(nodeIn(view, "mage.t6a"));
      spend.press(nodeIn(view, "mage.t5a"));
      expect(spend.asking()).toBeUndefined();
      spend.press(nodeIn(view, "mage.t6a"));
      spend.clear();
      spend.answer(true);
      expect(sent).toEqual([["mage.t5a", 1]]);
    });
  });

  // §Change: Tree v2 V27 (I-8RZ51-17): every spend that locks a side asks once.
  describe("the first node of a side, which locks the other for good", () => {
    const toFork = held("mage", ["r1", "r2"]);

    it.each([
      ["mage.ua1", "Take Haste? Deep Well's side is gone for good."],
      ["mage.ub1", "Take Fleetness? Kindling's side is gone for good."],
    ])("should ask once on %s, naming the other side's kicker, and send it on yes", (id, words) => {
      const { sent, spend } = spending();
      const view = treeView(mage(toFork));
      spend.press(nodeIn(view, id));
      expect(sent).toEqual([]);
      expect(spend.asking()).toBe(words);
      spend.answer(true);
      expect(sent).toEqual([[id, 1]]);
    });

    it("should send nothing on no", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(toFork));
      spend.press(nodeIn(view, "mage.ua1"));
      spend.answer(false);
      expect(sent).toEqual([]);
    });

    it("should ask on the lower fork's first node, naming the other lower kicker", () => {
      const { spend } = spending();
      const view = treeView(mage(held("mage", ["r1", "r2", "ua1", "m1", "m2", "t3", "m3"])));
      spend.press(nodeIn(view, "mage.lb1"));
      expect(spend.asking()).toBe("Take Fleetness? Wide Volley's side is gone for good.");
    });

    it("should not ask on a side this character has already taken, nor on the trunk", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(held("mage", ["r1", "r2", "ua1"])));
      spend.press(nodeIn(view, "mage.t2a"));
      spend.press(nodeIn(view, "mage.m1"));
      expect(spend.asking()).toBeUndefined();
      expect(sent).toEqual([
        ["mage.t2a", 1],
        ["mage.m1", 1],
      ]);
    });
  });
});
