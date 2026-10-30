import { describe, expect, it } from "vitest";
import { HUB_FIXED_RESIDENTS } from "@/render/world/hubInteriors";
import { TOWN_LINES, townLines } from "./townLines";

describe("townLines (FS-B0H2D R27)", () => {
  it("should give the Alewife four passages as Keeper of the Inn", () => {
    const alewife = townLines("Alewife");

    expect(alewife?.role).toBe("Keeper of the Inn");
    expect(alewife?.passages).toHaveLength(4);
  });

  it.each([
    ["Smith", "Keeper of the forge", 3],
    ["Gravedigger", undefined, 3],
    ["Drover", undefined, 2],
    ["Pilgrim", undefined, 2],
  ])("should give the %s the role %s and %i passages", (name, role, passages) => {
    expect(townLines(name)?.role).toBe(role);
    expect(townLines(name)?.passages).toHaveLength(passages);
  });

  it("should give the innkeeper the longest talk", () => {
    const longest = Math.max(...Object.values(TOWN_LINES).map((l) => l.passages.length));
    expect(townLines("Alewife")?.passages.length).toBe(longest);
  });

  it.each(["Nobody", "alewife", "", "toString", "constructor"])(
    "should have nothing for %j, which falls back to a resident's line",
    (name) => {
      expect(townLines(name)).toBeUndefined();
    },
  );

  it("should key exactly the fixed residents the server places, by their exact name", () => {
    expect(Object.keys(TOWN_LINES).sort()).toEqual(HUB_FIXED_RESIDENTS.map((r) => r.name).sort());
  });

  it("should keep every passage non-empty and every telling within four passages", () => {
    for (const { passages } of Object.values(TOWN_LINES)) {
      expect(passages.length).toBeGreaterThanOrEqual(2);
      expect(passages.length).toBeLessThanOrEqual(4);
      for (const passage of passages) expect(passage.trim()).not.toBe("");
    }
  });

  it("should call players players, never delvers", () => {
    for (const { passages } of Object.values(TOWN_LINES)) {
      for (const passage of passages) expect(passage).not.toMatch(/delver/i);
    }
  });
});
