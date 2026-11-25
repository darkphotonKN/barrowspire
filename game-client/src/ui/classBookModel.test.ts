import { describe, expect, it } from "vitest";
import type { BookPageState, ResourceState } from "@/types/gameState";
import { bookView, bookKey, bookShape, shownPage, type BookSource } from "./classBookModel";

// FS-X2CMM §G R37, R38 (I-X2CMM-10, I-X2CMM-23) and §Change: Illuminated pages and the open tome C4, C5,
// C7 (I-X2CMM-25): the book as the panel draws it, from the owner's state: titled by class, the pages the
// server sent in the book's order, each page's state from the wire, its row's mark, and its right page,
// its cooldown words from the wire.

const page = (id: string, unlock_level: number, cost: number, over: Partial<BookPageState> = {}): BookPageState => ({
  id,
  unlock_level,
  cost,
  cooldown: { remaining: 0, total: 0 },
  spent: false,
  cooldown_length: 0,
  cast_time: 0,
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
  it("should title the book by class, and draw only the pages the server sent", () => {
    const view = bookView(mage([page("witchlight", 2, 20), page("levitate", 9, 35)]));
    expect(view.title).toBe("Spellbook");
    expect(view.pages.map((p) => p.id)).toEqual(["witchlight", "levitate"]);
    expect(view.empty).toBeUndefined();
  });

  it("should draw the pages in the client's book order, whatever order they arrive in (Reconciled at review)", () => {
    const view = bookView(mage([page("recall", 17, 50), page("witchlight", 2, 20), page("levitate", 9, 35)]));
    expect(view.pages.map((p) => p.id)).toEqual(["witchlight", "levitate", "recall"]);
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

  it("should read a Ledger with Take a Contract sent as written: one page, no empty line (FS-X2CMM §J R57)", () => {
    const ledger = bookView({ class: "mercenary", level: 15, book: { pages: [page("take_a_contract", 15, 0, { limit: "delve" as const })] } });
    expect(ledger.pages.map((p) => [p.id, p.state])).toEqual([["take_a_contract", "ready"]]);
    expect(ledger.empty).toBeUndefined();
  });
});

describe("a page's state (FS-X2CMM R38)", () => {
  const stateOf = (p: BookPageState, source: Partial<BookSource> = {}) => bookView({ ...mage([p]), ...source }).pages[0];

  it("should be locked below its unlock level, its row faint and marked with the level (C4)", () => {
    const p = stateOf(page("levitate", 9, 35), { level: 8 });
    expect(p.state).toBe("locked");
    expect(p.mark).toBe("Lv 9");
    expect(p.faint).toBe(true);
  });

  it("should be ready at its unlock level, with the resource over its cost and no cooldown, its row marked with its cost", () => {
    const p = stateOf(page("levitate", 9, 35), { level: 9 });
    expect(p.state).toBe("ready");
    expect(p.mark).toBe("35 mana");
    expect(p.faint).toBe(false);
  });

  it("should be recovering while its cooldown runs, carrying the cooldown for the sweep", () => {
    const p = stateOf(page("witchlight", 2, 20, { cooldown: { remaining: 12, total: 45 } }));
    expect(p.state).toBe("recovering");
    expect(p.cooldown).toEqual({ remaining: 12, total: 45 });
  });

  it("should be drawn dim, never greyed, and marked 'spent' while a once-per-floor use is spent", () => {
    const p = stateOf(page("recall", 17, 50, { spent: true }));
    expect(p.state).toBe("dim");
    expect(p.spent).toBe(true);
    expect(p.mark).toBe("spent");
    expect(p.faint).toBe(false);
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
    expect(stateOf(page("recall", 17, 50, all), { resource: mana(0) }).mark).toBe("spent");
    expect(stateOf(page("witchlight", 2, 20, { cooldown: { remaining: 5, total: 45 } }), { resource: mana(0) }).state).toBe("recovering");
  });
});

describe("a page's right page (FS-X2CMM §Change: the open tome, C5)", () => {
  const leafOf = (source: BookSource) => bookView(source).pages[0].leaf;

  it("should name the page, give its one line, and its cost and cooldown from the wire", () => {
    expect(leafOf(mage([page("witchlight", 2, 20, { cooldown_length: 45 })]))).toEqual({
      name: "Witchlight",
      scar: undefined,
      line: "A pale flame hung where you point. The dark gives back what it hid.",
      earned: undefined,
      terms: "20 mana · instant · 45 s cooldown",
      hint: "Click to arm, then pick the ground.",
    });
  });

  it("should give a Scar its scar's name and the line of where it was earned", () => {
    const leaf = leafOf({ class: "warrior", level: 20, resource: { kind: "stamina", current: 100, max: 100, ability_cost: 10 }, book: { pages: [page("hardened", 9, 30)] } });
    expect(leaf.name).toBe("Hardened");
    expect(leaf.scar).toBe("Scar of the Pit");
    expect(leaf.earned).toBe("Got in the stake pit under Low Cairn. The stakes broke first.");
    expect(leaf.terms).toBe("30 stamina · instant · no cooldown");
  });

  it("should say a page costs nothing where it does, and a once-a-floor or once-a-delve page's limit", () => {
    const contract = { class: "mercenary", level: 20, book: { pages: [page("take_a_contract", 15, 0, { limit: "delve" as const })] } };
    expect(leafOf(contract).terms).toBe("No cost · instant · once a delve");
    expect(bookView(contract).pages[0].mark).toBe("no cost");
    expect(leafOf(mage([page("recall", 17, 50, { limit: "floor" })])).terms).toBe("50 mana · instant · once a floor");
  });

  it("should word the cooldown from the wire, so a retune needs no client change (Reconciled at review)", () => {
    expect(leafOf(mage([page("witchlight", 2, 20, { cooldown_length: 50 })])).terms).toBe("20 mana · instant · 50 s cooldown");
    expect(leafOf(mage([page("levitate", 9, 35, { cooldown_length: 90 })])).terms).toBe("35 mana · instant · 90 s cooldown");
  });

  it("should give the cast time from the wire between the cost and the cooldown (C5)", () => {
    expect(leafOf(mage([page("witchlight", 2, 20, { cooldown_length: 45, cast_time: 1 })])).terms).toBe("20 mana · 1 s cast · 45 s cooldown");
    expect(leafOf(mage([page("levitate", 9, 35, { cooldown_length: 90, cast_time: 1.5 })])).terms).toBe("35 mana · 1.5 s cast · 90 s cooldown");
    expect(leafOf(mage([page("recall", 17, 50, { limit: "floor", cast_time: 3 })])).terms).toBe("50 mana · 3 s cast · once a floor");
  });

  it("should hint how a ready page is cast, by its target kind", () => {
    const hint = (id: string) => leafOf(mage([page(id, 1, 10)])).hint;
    expect(hint("witchlight")).toBe("Click to arm, then pick the ground.");
    expect(hint("levitate")).toBe("Click to arm, then pick an ally or yourself.");
    expect(hint("far_hand")).toBe("Click to arm, then pick what it works on.");
    expect(hint("recall")).toBe("Click to cast.");
    const self = leafOf({ class: "warrior", level: 20, book: { pages: [page("hardened", 9, 0)] } });
    expect(self.hint).toBe("Click to cast.");
  });

  it("should say why a page waits instead", () => {
    expect(leafOf(mage([page("levitate", 9, 35)], 4)).hint).toBe("Learned at level 9.");
    expect(leafOf(mage([page("witchlight", 2, 20, { cooldown: { remaining: 11.2, total: 45 } })])).hint).toBe("Recovering.");
    expect(leafOf(mage([page("recall", 17, 50, { limit: "floor", spent: true })])).hint).toBe("Spent until the next floor.");
    const contract = { class: "mercenary", level: 20, book: { pages: [page("take_a_contract", 15, 0, { limit: "delve" as const, spent: true })] } };
    expect(leafOf(contract).hint).toBe("Spent for this delve.");
    expect(leafOf(mage([page("witchlight", 2, 20)], 20, mana(3))).hint).toBe("Not enough mana.");
  });
});

describe("the page the right page shows (FS-X2CMM §Change: the open tome, C5, Edge States)", () => {
  it("should show the hovered page, else the first ready page", () => {
    const view = bookView(mage([page("witchlight", 2, 20, { cooldown: { remaining: 5, total: 45 } }), page("levitate", 9, 35), page("recall", 17, 50)]));
    expect(shownPage(view, 2)).toBe(2);
    expect(shownPage(view, -1)).toBe(1);
  });

  it("should show the first page while every page is locked, and none while none is ready", () => {
    expect(shownPage(bookView(mage([page("levitate", 9, 35), page("recall", 17, 50)], 3)), -1)).toBe(0);
    expect(shownPage(bookView(mage([page("witchlight", 2, 20, { cooldown: { remaining: 5, total: 45 } }), page("recall", 17, 50)], 3)), -1)).toBe(-1);
    expect(shownPage(bookView({ class: "mercenary", level: 20, book: { pages: [] } }), -1)).toBe(-1);
  });
});

describe("the book's keys (FS-X2CMM R38; §Change: the open tome, C7)", () => {
  it("should change with a page's state, and not with a running cooldown's seconds", () => {
    const at = (remaining: number) => bookKey(bookView(mage([page("witchlight", 2, 20, { cooldown: { remaining, total: 45 } })])));
    expect(at(12)).toBe(at(11));
    expect(at(12)).not.toBe(at(0));
  });

  it("should keep the book's shape through a state change, and change it with the pages or the title", () => {
    const shape = (source: BookSource) => bookShape(bookView(source));
    const book = [page("witchlight", 2, 20), page("levitate", 9, 35)];
    expect(shape(mage(book, 4))).toBe(shape(mage(book, 20)));
    expect(shape(mage(book, 20, mana(0)))).toBe(shape(mage(book)));
    expect(shape(mage(book))).not.toBe(shape(mage([...book, page("recall", 17, 50)])));
    expect(shape(mage(book))).not.toBe(shape({ ...mage(book), class: "archer" }));
  });
});
