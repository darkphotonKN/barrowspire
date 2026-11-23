import { describe, expect, it } from "vitest";
import { FAMILIES } from "./families";

describe("tracked families (FS-1819Q R3)", () => {
  it("should list exactly effects, item icons and the tree's colours (FS-8RZ51 L13)", () => {
    expect([...FAMILIES]).toEqual(["effects", "item-icons", "tree-colours"]);
  });
});
