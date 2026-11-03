import { describe, expect, it } from "vitest";
import { FAMILIES } from "./families";

describe("tracked families (FS-1819Q R3)", () => {
  it("should list exactly effects and item icons", () => {
    expect([...FAMILIES]).toEqual(["effects", "item-icons"]);
  });
});
