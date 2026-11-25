import { describe, expect, it } from "vitest";
import { itemView } from "@/items/itemView";
import {
  pairLinks,
  readItemSnapshot,
  readItemSnapshots,
  snapshotItemState,
  snapshotItemView,
  type ItemSnapshot,
} from "./itemLinks";

// FS-KBA4Q §Requirements B (R10), D (R31), § The item snapshot. I-KBA4Q-3: the snapshot a chat
// line carries, read tolerantly, and the rule that pairs each with its `[Name]` token.

const item = (name: string, extra: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
  name,
  item_type: "weapon",
  ...extra,
});

describe("pairLinks (R10: held links pair with the text left to right)", () => {
  it("should pair a snapshot with its token, at the token's place in the text", () => {
    const x = item("X");

    expect(pairLinks("a [X] b", [x])).toEqual([{ start: 2, end: 5, item: x }]);
  });

  it("should pair nothing in a text with no token, and nothing with no snapshots", () => {
    expect(pairLinks("a X b", [item("X")])).toEqual([]);
    expect(pairLinks("a [X] b", [])).toEqual([]);
  });

  it("should leave a token edited inside its brackets, or missing a bracket, as text", () => {
    expect(pairLinks("a [Xy] b", [item("X")])).toEqual([]);
    expect(pairLinks("a [X b", [item("X")])).toEqual([]);
    expect(pairLinks("a X] b", [item("X")])).toEqual([]);
  });

  it("should pair the same item linked twice with two tokens", () => {
    const x = item("X");

    expect(pairLinks("[X] and [X]", [x, x])).toEqual([
      { start: 0, end: 3, item: x },
      { start: 8, end: 11, item: x },
    ]);
  });

  it("should give two items of one name the next matching token each, in text order", () => {
    const a = item("Blade", { attack_power: 1 });
    const b = item("Blade", { attack_power: 9 });

    const pairs = pairLinks("[Blade] or [Blade]?", [a, b]);

    expect(pairs.map((p) => p.item)).toEqual([a, b]);
    expect(pairs.map((p) => p.start)).toEqual([0, 11]);
  });

  it("should let a hand-typed token standing first take the link, and leave the later one as text", () => {
    const x = item("X");

    expect(pairLinks("typed [X], linked [X]", [x])).toEqual([
      { start: 6, end: 9, item: x },
    ]);
  });

  it("should leave a hand-typed token no snapshot names as text", () => {
    const x = item("X");

    expect(pairLinks("[Other] then [X]", [x])).toEqual([
      { start: 13, end: 16, item: x },
    ]);
  });

  it("should skip a snapshot with no token and go on from the same place", () => {
    const gone = item("Gone");
    const x = item("X");

    expect(pairLinks("a [X] b", [gone, x])).toEqual([
      { start: 2, end: 5, item: x },
    ]);
  });

  it("should skip a snapshot whose token stands only before the previous pair", () => {
    const a = item("A");
    const b = item("B");

    // B was linked after A, but its token stands before A's: unpaired, drawn as text
    expect(pairLinks("[B] [A]", [a, b])).toEqual([{ start: 4, end: 7, item: a }]);
  });
});

describe("readItemSnapshot (R31: read tolerantly; § The item snapshot)", () => {
  it("should read every field of the snapshot", () => {
    const full = {
      name: "Rusty Blade",
      item_type: "weapon",
      rarity: "rare",
      weapon_type: "long_sword",
      armor_slot: "head",
      attack_power: 4,
      defense_rating: 1,
      magic_resistance: 2,
      healing_amount: 3,
      mana_amount: 5,
      critical_rate: 0.05,
      item_level: 7,
      required_level: 6,
      affixes: [{ stat: "max_hp", tier: 2, value: 12 }],
      unique_effect: "Burns.",
      description: "Old.",
    };

    expect(readItemSnapshot(full)).toEqual(full);
  });

  it("should read a snapshot of a name and a type alone", () => {
    expect(readItemSnapshot({ name: "Ring", item_type: "ring" })).toEqual({
      name: "Ring",
      item_type: "ring",
    });
  });

  it.each([
    ["not an object", "Rusty Blade"],
    ["null", null],
    ["an array", [{ name: "X", item_type: "weapon" }]],
    ["no name", { item_type: "weapon" }],
    ["an empty name", { name: "", item_type: "weapon" }],
    ["a name that is not a string", { name: 4, item_type: "weapon" }],
    ["a name holding a bracket", { name: "a]b", item_type: "weapon" }],
    ["no item type", { name: "X" }],
    ["an item type that is not a string", { name: "X", item_type: 1 }],
  ])("should not read %s", (_what, raw) => {
    expect(readItemSnapshot(raw)).toBeNull();
  });

  it("should carry nothing the snapshot does not name: no id, standing, quantity or durability", () => {
    const read = readItemSnapshot({
      name: "X",
      item_type: "weapon",
      item_id: "i",
      entity_id: "e",
      status: "LISTED",
      unsafe: true,
      quantity: 3,
      durability: 9,
    });

    expect(read).toEqual({ name: "X", item_type: "weapon" });
  });

  it("should leave out an optional field of the wrong type and keep the rest", () => {
    const read = readItemSnapshot({
      name: "X",
      item_type: "weapon",
      rarity: 3,
      attack_power: "4",
      critical_rate: Number.NaN,
      item_level: 2,
      affixes: [{ stat: "max_hp", tier: 1, value: 5 }, { stat: 1 }, "junk"],
      description: {},
    });

    expect(read).toEqual({
      name: "X",
      item_type: "weapon",
      item_level: 2,
      affixes: [{ stat: "max_hp", tier: 1, value: 5 }],
    });
  });
});

describe("readItemSnapshots (R31: a line is never dropped for its items)", () => {
  it("should read the snapshots it can, in order, and leave out the ones it cannot", () => {
    expect(
      readItemSnapshots([{ name: "A", item_type: "ring" }, 7, { name: "B", item_type: "armor" }]),
    ).toEqual([
      { name: "A", item_type: "ring" },
      { name: "B", item_type: "armor" },
    ]);
  });

  it.each([["nothing", undefined], ["null", null], ["an object", { name: "A" }], ["a string", "[A]"]])(
    "should read %s as no snapshots",
    (_what, raw) => {
      expect(readItemSnapshots(raw)).toEqual([]);
    },
  );
});

describe("snapshotItemState (the snapshot as the item view reads it, R38)", () => {
  it("should give the item view the snapshot's name, kind, rarity and lines", () => {
    const view = itemView(
      snapshotItemState(
        item("Rusty Blade", {
          rarity: "rare",
          attack_power: 4,
          required_level: 60,
          description: "Old.",
        }),
      ),
    );

    expect(view.name).toBe("Rusty Blade");
    expect(view.kind).toBe("weapon");
    expect(view.rarity).toEqual({ label: "Rare", token: "rare" });
    expect(view.lore).toBe("Old.");
  });

  it("should carry no standing and a quantity of one", () => {
    const state = snapshotItemState(item("X"));

    expect(state.status).toBeUndefined();
    expect(state.unsafe).toBeUndefined();
    expect(state.quantity).toBe(1);
    expect(itemView(state, undefined, "run").standing).toBeUndefined();
  });
});

// I-KBA4Q-4: the view a hovered link tag's tip is drawn from.
describe("snapshotItemView (what a link tag's tip shows, R38)", () => {
  it("should give the tip the snapshot's name, kind, rarity, stats, lines and lore", () => {
    const view = snapshotItemView(
      item("Rusty Blade", {
        rarity: "rare",
        attack_power: 4,
        item_level: 12,
        required_level: 10,
        affixes: [{ stat: "strength", tier: 2, value: 5 }],
        unique_effect: "Bleeds.",
        description: "Old.",
      }),
    );

    expect(view.name).toBe("Rusty Blade");
    expect(view.kind).toBe("weapon");
    expect(view.rarity).toEqual({ label: "Rare", token: "rare" });
    expect(view.stats.length).toBeGreaterThan(0);
    expect(view.lines.itemLevel).toBe("Item level 12");
    expect(view.lines.requirement.text).toBe("Requires level 10");
    expect(view.lines.affixes).toHaveLength(1);
    expect(view.lines.uniqueEffect).toBe("Bleeds.");
    expect(view.lore).toBe("Old.");
  });

  it.each([1, 60, 999])(
    "should never mark a requirement of level %i too high, and carry no standing",
    (required_level) => {
      const view = snapshotItemView(item("X", { required_level }));

      expect(view.lines.requirement.tooHigh).toBe(false);
      expect(view.standing).toBeUndefined();
    },
  );

  it("should carry no standing whatever a forged snapshot names", () => {
    const forged = { ...item("X"), status: "listed", unsafe: true } as ItemSnapshot;

    // the tolerant read drops what a snapshot does not name (R31), so a view is built from that
    const view = snapshotItemView(readItemSnapshot(forged)!);

    expect(view.standing).toBeUndefined();
  });
});
