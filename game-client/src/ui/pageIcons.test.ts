import { describe, expect, it } from "vitest";
import { PAGE_ICONS, PAGE_IDS } from "./pageIcons";

// FS-X2CMM §I R45 (I-X2CMM-9): the 14 page pictures, each in the pigment its page's table names.

/** R45's table: each page's pigment, by what it does. */
const R45 = {
  witchlight: "ochre",
  far_hand: "lapis",
  levitate: "lapis",
  binding_glyph: "madder",
  recall: "lapis",
  trackers_eye: "ochre",
  brew: "verdigris",
  call_the_hound: "verdigris",
  pick_the_lock: "ochre",
  strike_a_deal: "ochre",
  take_a_contract: "madder",
  heave: "madder",
  hardened: "verdigris",
  long_night: "madder",
} as const;

describe("PAGE_ICONS (FS-X2CMM R45)", () => {
  it("should hold the 14 pages in book order, Spellbook, Hunter's Journal, The Ledger, Scars", () => {
    expect([...PAGE_IDS]).toEqual(Object.keys(R45));
    expect(Object.keys(PAGE_ICONS).sort()).toEqual([...PAGE_IDS].sort());
  });

  it.each(PAGE_IDS)("should paint %s in its R45 pigment", (id) => {
    expect(PAGE_ICONS[id].pigment).toBe(R45[id]);
  });

  it.each(PAGE_IDS)("should give %s a body, bone laid on it and a line fallback, all inside the 30 px box's round", (id) => {
    const { body, bone, lines } = PAGE_ICONS[id].glyph;
    expect(body.silhouette.length).toBeGreaterThan(0);
    expect(bone.silhouette.length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
    for (const shape of [...body.silhouette, ...bone.silhouette]) {
      expect(shape.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of shape) expect(Math.hypot(x, y), `${id} at (${x.toFixed(1)}, ${y.toFixed(1)})`).toBeLessThanOrEqual(15.5);
    }
  });

  it("should give every page a picture of its own", () => {
    const pictures = PAGE_IDS.map((id) => JSON.stringify(PAGE_ICONS[id].glyph.body.silhouette));
    expect(new Set(pictures).size).toBe(PAGE_IDS.length);
  });
});
