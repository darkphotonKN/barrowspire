import { describe, expect, it } from "vitest";
import { formatGold } from "./gold";

describe("formatGold", () => {
  it.each([
    ["zero", 0, "0"],
    ["a small amount", 50, "50"],
    ["three digits", 999, "999"],
    ["the first group", 1000, "1,000"],
    ["several groups", 1234567, "1,234,567"],
    [
      "the largest safe integer",
      Number.MAX_SAFE_INTEGER,
      "9,007,199,254,740,991",
    ],
    ["a negative amount", -1234, "-1,234"],
    [
      "an int64 held as a bigint",
      BigInt("9223372036854775807"),
      "9,223,372,036,854,775,807",
    ],
  ])("should group %s", (_label, gold, want) => {
    expect(formatGold(gold)).toBe(want);
  });

  it("should drop a fraction rather than show one, since gold is whole", () => {
    expect(formatGold(1234.9)).toBe("1,234");
  });
});
