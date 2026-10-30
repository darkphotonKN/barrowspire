import { describe, expect, it } from "vitest";
import { BAG_CAPACITY, BAG_FULL_NOTICE, bagCountLabel, bagFull } from "./bag";

describe("the bag (FS-HRH2J R14, R20–23)", () => {
  it("should hold 30 items, game-service's BagCapacity", () => {
    expect(BAG_CAPACITY).toBe(30);
  });

  it.each([
    [0, false],
    [29, false],
    [30, true],
    [31, true],
  ])("should call a bag of %i full: %s", (count, full) => {
    expect(bagFull(count)).toBe(full);
  });

  it("should count as N / 30, over capacity too", () => {
    expect(bagCountLabel(0)).toBe("0 / 30");
    expect(bagCountLabel(34)).toBe("34 / 30");
  });

  it("should refuse in plain words", () => {
    expect(BAG_FULL_NOTICE).toBe("Your bag is full.");
  });
});
