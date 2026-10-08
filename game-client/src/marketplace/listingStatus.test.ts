import { describe, expect, it } from "vitest";
import { listingStatusLabel } from "./listingStatus";

describe("listingStatusLabel", () => {
  it.each([
    ["a live auction", "ACTIVE", false, "Active"],
    [
      "an active listing past its end",
      "ACTIVE",
      true,
      "Ended — awaiting settlement",
    ],
    ["a listing being settled", "PENDING_SETTLEMENT", false, "Settling"],
    ["a sold listing", "SOLD", false, "Sold"],
    ["a cancelled listing", "CANCELLED", false, "Withdrawn"],
    ["an expired listing", "EXPIRED", false, "Expired"],
    ["a failed settlement", "SETTLEMENT_FAILED", false, "Settlement failed"],
  ])("should label %s", (_label, status, ended, want) => {
    expect(listingStatusLabel({ status, ended })).toBe(want);
  });

  it.each([
    ["SOLD", "Sold"],
    ["PENDING_SETTLEMENT", "Settling"],
    ["CANCELLED", "Withdrawn"],
  ])("should let a settled status win over ended for %s", (status, want) => {
    expect(listingStatusLabel({ status, ended: true })).toBe(want);
  });

  it("should read an absent ended flag as not ended", () => {
    expect(listingStatusLabel({ status: "ACTIVE" })).toBe("Active");
  });

  it("should match the status regardless of case", () => {
    expect(listingStatusLabel({ status: "sold" })).toBe("Sold");
  });
});
