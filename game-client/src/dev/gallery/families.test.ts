import { describe, expect, it } from "vitest";
import { FAMILIES } from "./families";

describe("tracked families (FS-1819Q R3)", () => {
  it("should list exactly effects, item icons, the tree's colours (FS-8RZ51 L13) and the page roundels (FS-X2CMM R46)", () => {
    expect([...FAMILIES]).toEqual(["effects", "item-icons", "tree-colours", "page-roundels"]);
  });
});
