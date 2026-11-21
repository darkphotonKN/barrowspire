import { describe, expect, it } from "vitest";
import { SPEND_IN_FLIGHT_MS, TreeSpend, treeView, type NodeView, type TreeSource } from "./passiveTreeModel";

// FS-8RZ51 §G R35, R37, R42 and §Edge States: the tree as the overlay draws it, from the golden, the
// character's ranks, unspent points and level.

const warrior = (ranks: Record<string, number> = {}, points = 5, level = 10): TreeSource => ({
  class: "warrior",
  level,
  passive_ranks: ranks,
  passive_points: points,
});

const node = (source: TreeSource, id: string): NodeView => {
  const found = treeView(source).tiers.flatMap((t) => t.nodes).find((n) => n.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

const tip = (source: TreeSource, id: string) => node(source, id).tip.map((l) => l.text);

describe("the passive tree's node states (FS-8RZ51 R35)", () => {
  it("should mark warrior.t2a locked at 3 spent above and available at 4", () => {
    expect(node(warrior({ "warrior.t1a": 2, "warrior.t1b": 1 }), "warrior.t2a").state).toBe("locked");
    const open = node(warrior({ "warrior.t1a": 2, "warrior.t1b": 2 }), "warrior.t2a");
    expect(open.state).toBe("available");
    expect(open.spendable).toBe(true);
  });

  it("should mark a node held while more ranks remain, and held at max at its last", () => {
    expect(node(warrior({ "warrior.t1a": 1 }), "warrior.t1a").state).toBe("held");
    expect(node(warrior({ "warrior.t1a": 2 }), "warrior.t1a").state).toBe("max");
    expect(node(warrior({ "warrior.t1a": 2 }), "warrior.t1a").spendable).toBe(false);
  });

  it("should open tier 4 on the tier-3 node alone", () => {
    const nine = { "warrior.t1a": 2, "warrior.t1b": 2, "warrior.t2a": 3, "warrior.t2b": 2 };
    expect(node(warrior(nine), "warrior.t4a").state).toBe("locked");
    expect(node(warrior({ ...nine, "warrior.t3": 1 }), "warrior.t4a").state).toBe("available");
  });

  it("should close the other tier-6 node once one is held", () => {
    const full = {
      "warrior.t1a": 2,
      "warrior.t1b": 2,
      "warrior.t2a": 3,
      "warrior.t2b": 3,
      "warrior.t3": 1,
      "warrior.t4a": 2,
      "warrior.t4b": 2,
      "warrior.t5a": 3,
      "warrior.t6a": 1,
    };
    expect(node(warrior(full, 1, 20), "warrior.t6a").state).toBe("max");
    const other = node(warrior(full, 1, 20), "warrior.t6b");
    expect(other.state).toBe("closed");
    expect(other.spendable).toBe(false);
  });

  it("should read an available node as not to be spent with no points, greyed (§Edge States: no points)", () => {
    const n = node(warrior({}, 0), "warrior.t1a");
    expect(n.state).toBe("available");
    expect(n.spendable).toBe(false);
  });

  it("should carry the rank as r / max on every node", () => {
    const n = node(warrior({ "warrior.t2a": 1, "warrior.t1a": 2, "warrior.t1b": 2 }), "warrior.t2a");
    expect([n.rank, n.maxRank]).toEqual([1, 3]);
  });
});

describe("the passive tree's tiers and header (FS-8RZ51 R35)", () => {
  it("should lay six tiers top to bottom, each with its gate stated", () => {
    const view = treeView(warrior());
    expect(view.tiers.map((t) => [t.tier, t.gate, t.nodes.length])).toEqual([
      [1, "Open", 2],
      [2, "4 spent", 2],
      [3, "8 spent", 1],
      [4, "Needs Earthbreaker", 2],
      [5, "13 spent", 2],
      [6, "18 spent", 2],
    ]);
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

describe("the passive tree's tooltips (FS-8RZ51 R37)", () => {
  it("should say a filler's name, kind, rank and every rank's effect with the held ones marked", () => {
    const n = node(warrior({ "warrior.t1a": 1 }), "warrior.t1a");
    expect(n.tip.map((l) => l.text)).toEqual(["Hardened Frame", "Passive · tier 1", "Rank 1 / 2", "Rank 1: +4% max HP", "Rank 2: +4% max HP"]);
    expect(n.tip.slice(3).map((l) => l.held)).toEqual([true, false]);
  });

  it("should label a kicker's R3 rule as the last rank's", () => {
    expect(tip(warrior({ "warrior.t1a": 2, "warrior.t1b": 2 }), "warrior.t2a")).toEqual([
      "Heavy Hand",
      "Kicker · tier 2",
      "Rank 0 / 3",
      "Rank 1: +6% slash damage",
      "Rank 2: +6% slash damage",
      "Rank 3: +6% slash damage",
      "Rank 3 kicker: A slash that hits 2 or more monsters refunds 5 stamina.",
    ]);
  });

  it("should say why a node is locked: the points still to spend above, or the ability to take first", () => {
    expect(tip(warrior({ "warrior.t1a": 2, "warrior.t1b": 1 }), "warrior.t2a").at(-1)).toBe("Spend 1 more point above to open this tier.");
    expect(tip(warrior({}), "warrior.t2a").at(-1)).toBe("Spend 4 more points above to open this tier.");
    expect(tip(warrior({}), "warrior.t4a").at(-1)).toBe("Take Earthbreaker first.");
  });

  it("should say a closed node's pick is the other one (§Edge States)", () => {
    expect(tip(warrior({ "warrior.t6b": 1 }, 0, 20), "warrior.t6a").at(-1)).toBe("You chose Berserker.");
  });

  it("should name the tier-3 node's ability and its key", () => {
    expect(tip(warrior(), "warrior.t3")).toContain("Grants Earthbreaker, cast with 3.");
  });

  it("should name the title a tier-6 node grants and say the look changes", () => {
    expect(tip(warrior(), "warrior.t6a")).toContain("Grants the title Warrior · Guardian. Your look changes.");
  });

  it("should say no points are left on an open node with none, and at level 1 how to earn the first", () => {
    expect(tip(warrior({}, 0, 5), "warrior.t1a").at(-1)).toBe("No points to spend.");
    expect(tip(warrior({}, 0, 1), "warrior.t1a").at(-1)).toBe("Reach level 2 for your first point.");
  });

  it("should give a node at max no reason line", () => {
    expect(tip(warrior({ "warrior.t1a": 2 }), "warrior.t1a").at(-1)).toBe("Rank 2: +4% max HP");
  });
});

describe("the passive tree's unknown classes (FS-8RZ51 R42)", () => {
  it("should lay no nodes for a class the client does not know, never throwing", () => {
    const view = treeView({ class: "necromancer", passive_ranks: { "necromancer.t1a": 1 }, passive_points: 2 });
    expect(view.known).toBe(false);
    expect(view.tiers).toEqual([]);
    expect(view.header).toBe("Necromancer · 2 points");
  });

  it("should count only the class's own nodes as spent above", () => {
    expect(node(warrior({ "mage.t1a": 2, "mage.t1b": 2 }), "warrior.t2a").state).toBe("locked");
  });
});

// FS-8RZ51 §G R38 (I-8RZ51-8): a click on a node, in town; the tier-6 ask; a spend in flight; a refusal.
describe("the tree's spend (FS-8RZ51 R38)", () => {
  const mage = (ranks: Record<string, number> = {}, points = 3): TreeSource => ({ class: "mage", level: 10, passive_ranks: ranks, passive_points: points });
  const nodeIn = (view: ReturnType<typeof treeView>, id: string) => view.tiers.flatMap((t) => t.nodes).find((n) => n.id === id)!;

  function spending(start = 0) {
    const sent: [string, number][] = [];
    let now = start;
    const spend = new TreeSpend((id, rank) => (sent.push([id, rank]), true), () => now);
    return { sent, spend, tick: (ms: number) => void (now += ms) };
  }

  it("should send an available node's next rank once, and nothing on a second click before the state answers", () => {
    const { sent, spend } = spending();
    const view = treeView(mage());
    spend.press(nodeIn(view, "mage.t1a"), view);
    spend.press(nodeIn(view, "mage.t1a"), view);
    expect(sent).toEqual([["mage.t1a", 1]]);
  });

  it("should take a click again once the state shows the rank", () => {
    const { sent, spend } = spending();
    const before = treeView(mage());
    spend.press(nodeIn(before, "mage.t1a"), before);
    const after = treeView(mage({ "mage.t1a": 1 }, 2));
    spend.seen(after);
    spend.press(nodeIn(after, "mage.t1a"), after);
    expect(sent).toEqual([
      ["mage.t1a", 1],
      ["mage.t1a", 2],
    ]);
  });

  it("should take a click again after 5 s with no answer, the same target rank", () => {
    const { sent, spend, tick } = spending();
    const view = treeView(mage());
    spend.press(nodeIn(view, "mage.t1a"), view);
    tick(SPEND_IN_FLIGHT_MS - 1);
    spend.press(nodeIn(view, "mage.t1a"), view);
    tick(1);
    spend.press(nodeIn(view, "mage.t1a"), view);
    expect(sent).toEqual([
      ["mage.t1a", 1],
      ["mage.t1a", 1],
    ]);
  });

  it("should send nothing for a node the model does not call spendable: locked, at max, no points", () => {
    const { sent, spend } = spending();
    const locked = treeView(mage());
    spend.press(nodeIn(locked, "mage.t2a"), locked);
    const max = treeView(mage({ "mage.t1a": 2 }));
    spend.press(nodeIn(max, "mage.t1a"), max);
    const none = treeView(mage({}, 0));
    spend.press(nodeIn(none, "mage.t1b"), none);
    expect(sent).toEqual([]);
  });

  it("should show a refusal's reason until the next click, and take a click on the node again at once", () => {
    const { sent, spend } = spending();
    const view = treeView(mage());
    spend.press(nodeIn(view, "mage.t1a"), view);
    spend.refused("Leave the queue to spend points.");
    expect(spend.line()).toBe("Leave the queue to spend points.");
    spend.press(nodeIn(view, "mage.t1a"), view);
    expect(spend.line()).toBeUndefined();
    expect(sent).toHaveLength(2);
  });

  it("should forget the refusal and the ask as it clears, and keep the spend in flight", () => {
    const { sent, spend } = spending();
    const view = treeView(mage());
    spend.press(nodeIn(view, "mage.t1a"), view);
    spend.refused("No points to spend.");
    spend.clear();
    expect(spend.line()).toBeUndefined();
    spend.press(nodeIn(view, "mage.t1b"), view);
    spend.press(nodeIn(view, "mage.t1b"), view);
    expect(sent).toEqual([
      ["mage.t1a", 1],
      ["mage.t1b", 1],
    ]);
  });

  describe("tier 6, one of two and for good", () => {
    const ready = { "mage.t1a": 2, "mage.t1b": 2, "mage.t2a": 3, "mage.t2b": 3, "mage.t3": 1, "mage.t4a": 2, "mage.t4b": 2, "mage.t5a": 3 };

    it("should ask once in the panel before sending, naming the other as gone for good", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(ready, 2));
      spend.press(nodeIn(view, "mage.t6a"), view);
      expect(sent).toEqual([]);
      expect(spend.asking()).toBe("Choose Spellwarden? Pyromancer is gone for good.");
      spend.answer(true);
      expect(sent).toEqual([["mage.t6a", 1]]);
      expect(spend.asking()).toBeUndefined();
    });

    it("should send nothing on no", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(ready, 2));
      spend.press(nodeIn(view, "mage.t6b"), view);
      expect(spend.asking()).toBe("Choose Pyromancer? Spellwarden is gone for good.");
      spend.answer(false);
      expect(sent).toEqual([]);
      expect(spend.asking()).toBeUndefined();
    });

    it("should drop the ask on a click on another node, or as the tree closes", () => {
      const { sent, spend } = spending();
      const view = treeView(mage(ready, 2));
      spend.press(nodeIn(view, "mage.t6a"), view);
      spend.press(nodeIn(view, "mage.t5b"), view);
      expect(spend.asking()).toBeUndefined();
      spend.press(nodeIn(view, "mage.t6a"), view);
      spend.clear();
      spend.answer(true);
      expect(sent).toEqual([["mage.t5b", 1]]);
    });
  });
});
