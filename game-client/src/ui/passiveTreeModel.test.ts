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

const nodesOf = (source: TreeSource, nodes?: readonly PassiveNodeDef[]) => treeView(source, nodes).rows.flatMap((r) => r.nodes);

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
      ["warrior.m1", "available"],
      // a link is held at rank 1: the kicker opens the side's next step before it is full
      ["warrior.ua2", "available"],
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

  it("should change nothing in the view for a retired id in the ranks (R42, V21)", () => {
    const ranks = held("warrior", ["r1", "r2"]);
    expect(treeView(warrior({ ...ranks, "warrior.t1a": 2, "warrior.t4b": 1 }))).toEqual(treeView(warrior(ranks)));
  });
});

describe("the passive tree's depth rows and header (FS-8RZ51 V23, the interim rows)", () => {
  it("should give each node its depth, one more than its shallowest link, and lay one row per depth", () => {
    const rows = treeView(warrior()).rows.map((r) => [r.depth, r.nodes.map((n) => n.id.replace("warrior.", ""))]);
    expect(rows).toEqual([
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

  it("should head the tree with the class and the unspent points", () => {
    expect(treeView(warrior({}, 3)).header).toBe("Warrior · 3 points");
    expect(treeView(warrior({}, 1)).header).toBe("Warrior · 1 point");
    expect(treeView(warrior({}, 0)).header).toBe("Warrior · 0 points");
  });

  it("should read no points when the state carries none", () => {
    expect(treeView({ class: "mage" }).points).toBe(0);
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

  it("should lay the fixture out by depth", () => {
    expect(treeView(warrior(), FIXTURE).rows.map((r) => [r.depth, r.nodes.length])).toEqual([
      [0, 1],
      [1, 3],
      [2, 1],
    ]);
  });
});

describe("the passive tree's tooltips (FS-8RZ51 R37, V26)", () => {
  it("should say a traversal node's name, kind, rank and its rank's effect, held marked, with no tier line", () => {
    const n = node(warrior({ "warrior.r1": 1 }), "warrior.r1");
    expect(n.tip.map((l) => l.text)).toEqual(["Vitality", "Passive", "Rank 1 / 1", "Rank 1: +5 max HP"]);
    expect(n.tip.slice(3).map((l) => l.held)).toEqual([true]);
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

  it("should name the ability and its key", () => {
    expect(tip(warrior(), "warrior.t3")).toContain("Grants Earthbreaker, cast with 3.");
  });

  it("should name the title a specialization grants and say the look changes", () => {
    expect(tip(warrior(), "warrior.t6a")).toContain("Grants the title Warrior · Guardian. Your look changes.");
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
    expect(view.rows).toEqual([]);
    expect(view.header).toBe("Necromancer · 2 points");
  });
});

// FS-8RZ51 §G R38 (I-8RZ51-8): a click on a node, in town; the tier-6 ask; a spend in flight; a refusal.
describe("the tree's spend (FS-8RZ51 R38)", () => {
  const mage = (ranks: Record<string, number> = {}, points = 3, level = 10): TreeSource => ({ class: "mage", level, passive_ranks: ranks, passive_points: points });
  const nodeIn = (view: ReturnType<typeof treeView>, id: string) => view.rows.flatMap((r) => r.nodes).find((n) => n.id === id)!;
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
    spend.press(nodeIn(view, "mage.t2a"), view);
    spend.press(nodeIn(view, "mage.t2a"), view);
    expect(sent).toEqual([["mage.t2a", 1]]);
  });

  it("should take a click again once the state shows the rank", () => {
    const { sent, spend } = spending();
    const before = treeView(mage(trunk));
    spend.press(nodeIn(before, "mage.t2a"), before);
    const after = treeView(mage({ ...trunk, "mage.t2a": 1 }, 2));
    spend.seen(after);
    spend.press(nodeIn(after, "mage.t2a"), after);
    expect(sent).toEqual([
      ["mage.t2a", 1],
      ["mage.t2a", 2],
    ]);
  });

  it("should take a click again after 5 s with no answer, the same target rank", () => {
    const { sent, spend, tick } = spending();
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.t2a"), view);
    tick(SPEND_IN_FLIGHT_MS - 1);
    spend.press(nodeIn(view, "mage.t2a"), view);
    tick(1);
    spend.press(nodeIn(view, "mage.t2a"), view);
    expect(sent).toEqual([
      ["mage.t2a", 1],
      ["mage.t2a", 1],
    ]);
  });

  it("should send nothing for a node the model does not call spendable: closed, locked, at max, no points", () => {
    const { sent, spend } = spending();
    const closed = treeView(mage());
    spend.press(nodeIn(closed, "mage.r2"), closed);
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.ub1"), view);
    spend.press(nodeIn(view, "mage.ua1"), view);
    const none = treeView(mage(trunk, 0));
    spend.press(nodeIn(none, "mage.m1"), none);
    expect(sent).toEqual([]);
  });

  it("should show a refusal's reason until the next click, and take a click on the node again at once", () => {
    const { sent, spend } = spending();
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.t2a"), view);
    spend.refused("Leave the queue to spend points.");
    expect(spend.line()).toBe("Leave the queue to spend points.");
    spend.press(nodeIn(view, "mage.t2a"), view);
    expect(spend.line()).toBeUndefined();
    expect(sent).toHaveLength(2);
  });

  it("should forget the refusal and the ask as it clears, and keep the spend in flight", () => {
    const { sent, spend } = spending();
    const view = treeView(mage(trunk));
    spend.press(nodeIn(view, "mage.t2a"), view);
    spend.refused("No points to spend.");
    spend.clear();
    expect(spend.line()).toBeUndefined();
    spend.press(nodeIn(view, "mage.m1"), view);
    spend.press(nodeIn(view, "mage.m1"), view);
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
      spend.press(nodeIn(view, "mage.t6a"), view);
      expect(sent).toEqual([]);
      expect(spend.asking()).toBe("Choose Spellwarden? Pyromancer is gone for good.");
      spend.answer(true);
      expect(sent).toEqual([["mage.t6a", 1]]);
      expect(spend.asking()).toBeUndefined();
    });

    it("should send nothing on no", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(ready, 2, 20));
      spend.press(nodeIn(view, "mage.t6b"), view);
      expect(spend.asking()).toBe("Choose Pyromancer? Spellwarden is gone for good.");
      spend.answer(false);
      expect(sent).toEqual([]);
      expect(spend.asking()).toBeUndefined();
    });

    it("should drop the ask on a click on another node, or as the tree closes", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(ready, 2, 20));
      spend.press(nodeIn(view, "mage.t6a"), view);
      spend.press(nodeIn(view, "mage.t5a"), view);
      expect(spend.asking()).toBeUndefined();
      spend.press(nodeIn(view, "mage.t6a"), view);
      spend.clear();
      spend.answer(true);
      expect(sent).toEqual([["mage.t5a", 1]]);
    });
  });
});
