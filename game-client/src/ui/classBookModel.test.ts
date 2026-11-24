import { describe, expect, it } from "vitest";
import type { BookPageState, ResourceState } from "@/types/gameState";
import { bookView, bookKey, type BookSource } from "./classBookModel";

// FS-X2CMM §G R37, R38 (I-X2CMM-10): the book as the panel draws it, from the owner's state: titled by
// class, the pages the server sent in its order, each page's state from the wire, and its hover tip.

const page = (id: string, unlock_level: number, cost: number, over: Partial<BookPageState> = {}): BookPageState => ({
  id,
  unlock_level,
  cost,
  cooldown: { remaining: 0, total: 0 },
  spent: false,
  ...over,
});
const mana = (current: number): ResourceState => ({ kind: "mana", current, max: 100, ability_cost: 10 });
const mage = (pages: BookPageState[], level = 20, resource: ResourceState | undefined = mana(100)): BookSource => ({
  class: "mage",
  level,
  resource,
  book: { pages },
});

describe("the class book's view (FS-X2CMM R37)", () => {
  it("should title the book by class, and draw only the pages the server sent, in its order", () => {
    const view = bookView(mage([page("witchlight", 2, 20), page("levitate", 9, 35)]));
    expect(view.title).toBe("Spellbook");
    expect(view.pages.map((p) => p.id)).toEqual(["witchlight", "levitate"]);
    expect(view.empty).toBeUndefined();
  });

  it("should skip a page the client has no picture or words for", () => {
    const view = bookView(mage([page("turncoat", 1, 0), page("witchlight", 2, 20)]));
    expect(view.pages.map((p) => p.id)).toEqual(["witchlight"]);
  });

  it("should read an empty Ledger as the spec words it, and an absent book as empty", () => {
    const ledger = bookView({ class: "mercenary", level: 20, book: { pages: [] } });
    expect(ledger.title).toBe("The Ledger");
    expect(ledger.pages).toEqual([]);
    expect(ledger.empty).toBe("The Ledger is not yet written.");
    expect(bookView({ class: "warrior" }).empty).toBe("No scar is yet written.");
    expect(bookView(undefined).title).toBe("Book");
  });
});

describe("a page's state (FS-X2CMM R38)", () => {
  const stateOf = (p: BookPageState, source: Partial<BookSource> = {}) => bookView({ ...mage([p]), ...source }).pages[0];

  it("should be locked below its unlock level, captioned with the level", () => {
    const p = stateOf(page("levitate", 9, 35), { level: 8 });
    expect(p.state).toBe("locked");
    expect(p.caption).toBe("Lv 9");
  });

  it("should be ready at its unlock level, with the resource over its cost and no cooldown", () => {
    const p = stateOf(page("levitate", 9, 35), { level: 9 });
    expect(p.state).toBe("ready");
    expect(p.caption).toBeUndefined();
  });

  it("should be recovering while its cooldown runs, carrying the cooldown for the sweep", () => {
    const p = stateOf(page("witchlight", 2, 20, { cooldown: { remaining: 12, total: 45 } }));
    expect(p.state).toBe("recovering");
    expect(p.cooldown).toEqual({ remaining: 12, total: 45 });
  });

  it("should be greyed and captioned 'spent' while a once-per-floor use is spent", () => {
    const p = stateOf(page("recall", 17, 50, { spent: true }));
    expect(p.state).toBe("dim");
    expect(p.spent).toBe(true);
    expect(p.caption).toBe("spent");
  });

  it("should be dim while the class resource is under its cost, and ready at the cost", () => {
    expect(stateOf(page("witchlight", 2, 20), { resource: mana(19) }).state).toBe("dim");
    expect(stateOf(page("witchlight", 2, 20), { resource: mana(20) }).state).toBe("ready");
    // a mercenary's page costs nothing, so no pool dims it
    expect(bookView({ class: "mercenary", level: 9, book: { pages: [page("pick_the_lock", 3, 0)] } }).pages[0].state).toBe("ready");
  });

  it("should take locked over spent, spent over recovering, recovering over dim", () => {
    const all = { spent: true, cooldown: { remaining: 5, total: 45 } };
    expect(stateOf(page("recall", 17, 50, all), { level: 3, resource: mana(0) }).state).toBe("locked");
    expect(stateOf(page("recall", 17, 50, all), { resource: mana(0) }).caption).toBe("spent");
    expect(stateOf(page("witchlight", 2, 20, { cooldown: { remaining: 5, total: 45 } }), { resource: mana(0) }).state).toBe("recovering");
  });
});

describe("a page's hover tip (FS-X2CMM R37)", () => {
  const tipOf = (source: BookSource) => bookView(source).pages[0].tip.map((l) => l.text);

  it("should name the page, give its one line, its cost in the class resource and its cooldown", () => {
    expect(tipOf(mage([page("witchlight", 2, 20)]))).toEqual([
      "Witchlight",
      "A pale flame hung where you point. The dark gives back what it hid.",
      "Cost: 20 mana",
      "Cooldown: 45 s",
    ]);
  });

  it("should give a Scar its scar's name and the line of where it was earned", () => {
    const tip = tipOf({ class: "warrior", level: 20, resource: { kind: "stamina", current: 100, max: 100, ability_cost: 10 }, book: { pages: [page("hardened", 9, 30)] } });
    expect(tip[0]).toBe("Hardened");
    expect(tip[1]).toBe("Scar of the Pit");
    expect(tip).toContain("Got in the stake pit under Low Cairn. The stakes broke first.");
    expect(tip).toContain("Cost: 30 stamina");
  });

  it("should say a page costs nothing where it does, and a once-a-floor page's limit", () => {
    expect(tipOf({ class: "mercenary", level: 20, book: { pages: [page("take_a_contract", 15, 0)] } })).toContain("No cost");
    expect(tipOf(mage([page("recall", 17, 50)]))).toContain("Cooldown: Once a floor");
  });

  it("should end with why the page cannot be cast now", () => {
    expect(tipOf(mage([page("levitate", 9, 35)], 4)).at(-1)).toBe("Unlocks at level 9");
    expect(tipOf(mage([page("witchlight", 2, 20, { cooldown: { remaining: 11.2, total: 45 } })])).at(-1)).toBe("Recovers in 12 s");
    expect(tipOf(mage([page("recall", 17, 50, { spent: true })])).at(-1)).toBe("Spent until the next floor");
    expect(tipOf(mage([page("witchlight", 2, 20)], 20, mana(3))).at(-1)).toBe("Not enough mana");
  });
});

describe("the book's key (FS-X2CMM R38)", () => {
  it("should change with a page's state, and not with a running cooldown's seconds", () => {
    const at = (remaining: number) => bookKey(bookView(mage([page("witchlight", 2, 20, { cooldown: { remaining, total: 45 } })])));
    expect(at(12)).toBe(at(11));
    expect(at(12)).not.toBe(at(0));
  });
});
