import { describe, expect, it } from "vitest";
import { PAGE_IDS } from "@/ui/pageIcons";
import { CLASS_BOOKS, PAGE_COPY, UNKNOWN_BOOK, classBookOf, isPageId } from "./classBooks";

// FS-X2CMM §G R37, §H R41 (I-X2CMM-10): the books' presentation data, in book order, each page with its
// name, its one line and its target kind; every Scar with the line of where it was earned.

describe("the class books' data (FS-X2CMM R37)", () => {
  it("should title each class's book as the owner named it", () => {
    expect(classBookOf("mage").title).toBe("Spellbook");
    expect(classBookOf("Archer").title).toBe("Hunter's Journal");
    expect(classBookOf("mercenary").title).toBe("The Ledger");
    expect(classBookOf("warrior").title).toBe("Scars");
    expect(classBookOf("bard")).toBe(UNKNOWN_BOOK);
    expect(classBookOf(undefined)).toBe(UNKNOWN_BOOK);
  });

  it("should hold every page once, the four books together in the pictures' book order", () => {
    const order = Object.values(CLASS_BOOKS).flatMap((book) => book.pages);
    expect(order).toEqual([...PAGE_IDS]);
  });

  it("should give every page a name, one line and its target kind", () => {
    for (const id of PAGE_IDS) {
      const page = PAGE_COPY[id];
      expect(page.id).toBe(id);
      expect(page.name.length).toBeGreaterThan(0);
      expect(page.line.length).toBeGreaterThan(0);
      expect(["ground", "ally", "interactable", "self", "none"]).toContain(page.target);
    }
  });

  it("should give every Scar its scar's name and the line of where it was earned, and no other page one", () => {
    for (const id of PAGE_IDS) {
      const scarred = CLASS_BOOKS.warrior.pages.includes(id);
      expect(!!PAGE_COPY[id].scar, id).toBe(scarred);
      expect(!!PAGE_COPY[id].earned, id).toBe(scarred);
    }
    expect(PAGE_COPY.long_night.scar).toBe("Scar of the Long Night");
  });

  it("should size every aimed page's reticle and range, and leave none and self pages without", () => {
    for (const id of PAGE_IDS) {
      const { target, rangeCells, reticleCells } = PAGE_COPY[id];
      const aimed = target === "ground" || target === "ally" || target === "interactable";
      expect(rangeCells !== undefined, id).toBe(aimed);
      expect(reticleCells !== undefined, id).toBe(aimed);
    }
    // Witchlight's 3-cell glow, the rune's 1.5 cells across (R41, R24)
    expect(PAGE_COPY.witchlight.reticleCells).toBe(3);
    expect(PAGE_COPY.binding_glyph.reticleCells).toBe(0.75);
  });

  it("should shape the hound's reticle as a paw mark by its data, every other aimed page a ring (R41)", () => {
    expect(PAGE_COPY.call_the_hound.reticleShape).toBe("paw");
    for (const id of PAGE_IDS) if (id !== "call_the_hound") expect(PAGE_COPY[id].reticleShape ?? "ring", id).toBe("ring");
  });

  it("should read the empty Ledger as the spec words it", () => {
    expect(CLASS_BOOKS.mercenary.empty).toBe("The Ledger is not yet written.");
  });

  it("should know the pages it draws, and no other", () => {
    expect(isPageId("witchlight")).toBe(true);
    expect(isPageId("turncoat")).toBe(false);
  });
});
