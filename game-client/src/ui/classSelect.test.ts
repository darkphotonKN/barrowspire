import { describe, expect, it } from "vitest";
import { CLASS_LORE } from "@/data/classLore";
import { palette } from "@/utils/canvasPalette";
import {
  CLASS_CARD_COLUMN,
  CLASS_ORDER,
  classCardRects,
  loreStatRows,
} from "./classSelect";

describe("CLASS_ORDER (FS-MAMHR §G.30)", () => {
  it("should offer every class, the Mercenary fourth", () => {
    expect(CLASS_ORDER).toEqual(["warrior", "mage", "archer", "mercenary"]);
    expect([...CLASS_ORDER].sort()).toEqual(Object.keys(CLASS_LORE).sort());
  });
});

describe("classCardRects (FS-MAMHR §G.30: four cards without overlap)", () => {
  const rects = classCardRects(CLASS_ORDER.length);

  it("should give one card per class", () => {
    expect(rects).toHaveLength(4);
  });

  it("should leave a gap between each card and the next", () => {
    for (let i = 1; i < rects.length; i++)
      expect(rects[i].y, `card ${i}`).toBeGreaterThan(
        rects[i - 1].y + rects[i - 1].h,
      );
  });

  it("should keep every card inside its column, under the header and above the name", () => {
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(CLASS_CARD_COLUMN.left);
      expect(r.x + r.w).toBeLessThanOrEqual(CLASS_CARD_COLUMN.right);
      expect(r.y).toBeGreaterThanOrEqual(CLASS_CARD_COLUMN.top);
      expect(r.y + r.h).toBeLessThanOrEqual(CLASS_CARD_COLUMN.bottom);
    }
  });

  it("should keep each card tall enough for its name and title lines", () => {
    for (const r of rects) expect(r.h).toBeGreaterThanOrEqual(72);
  });
});

describe("loreStatRows (FS-8AY7S: each class names its own resource; FS-MAMHR §G.30)", () => {
  const labels = (key: keyof typeof CLASS_LORE) =>
    loreStatRows(CLASS_LORE[key].stats).map((r) => r.label);

  it("should name the resource by its kind, second after HP, and never MP", () => {
    expect(labels("warrior")).toEqual([
      "HP",
      "STAMINA",
      "ATK",
      "DEF",
      "RNG",
      "SPD",
    ]);
    expect(labels("archer")[1]).toBe("STAMINA");
    expect(labels("mage")[1]).toBe("MANA");
    expect(labels("mercenary")[1]).toBe("PARRY");
    for (const key of Object.keys(CLASS_LORE) as (keyof typeof CLASS_LORE)[])
      expect(labels(key)).not.toContain("MP");
  });

  it("should draw the resource in the HUD's own colour for its kind", () => {
    const colour = (key: keyof typeof CLASS_LORE) =>
      loreStatRows(CLASS_LORE[key].stats)[1].color;
    expect(colour("mage")).toBe(palette.hudMana);
    expect(colour("warrior")).toBe(palette.hudStamina);
    expect(colour("mercenary")).toBe(palette.hudParry);
  });

  it("should show the Mercenary's parry charges as 3 pips, valued 3", () => {
    const parry = loreStatRows(CLASS_LORE.mercenary.stats)[1];
    expect(parry.value).toBe(3);
    expect(parry.pips).toBe(3);
  });

  it("should fill a pooled resource as a bar, with no pips", () => {
    const mana = loreStatRows(CLASS_LORE.mage.stats)[1];
    expect(mana.value).toBe(150);
    expect(mana.pips).toBeUndefined();
    expect(mana.fill).toBeCloseTo(150 / 200);
  });

  it("should keep the Mercenary's stats card: HP 130, ATK 12, DEF 7, range 1, speed 200", () => {
    const rows = loreStatRows(CLASS_LORE.mercenary.stats);
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["HP", 130],
      ["PARRY", 3],
      ["ATK", 12],
      ["DEF", 7],
      ["RNG", 1],
      ["SPD", 200],
    ]);
  });

  it("should clamp every fill to 0..1", () => {
    for (const lore of Object.values(CLASS_LORE))
      for (const r of loreStatRows(lore.stats)) {
        expect(r.fill).toBeGreaterThanOrEqual(0);
        expect(r.fill).toBeLessThanOrEqual(1);
      }
  });
});
