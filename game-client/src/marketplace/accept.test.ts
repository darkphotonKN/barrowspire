import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  ACCEPT_CONFLICT,
  ACCEPT_GONE,
  acceptConfirmText,
  acceptFailure,
  leadingBidLine,
  sellerBlock,
} from "./accept";
import { BROWSE_UNREACHABLE } from "./browse";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

describe("sellerBlock", () => {
  const NOW = Date.parse("2026-10-01T12:00:00Z");
  const live = {
    sellerId: "aldric",
    status: "ACTIVE",
    ended: false,
    endsAt: "2026-10-02T12:00:00Z",
    currentPrice: 120,
  };

  it("should offer the seller the leading bid when someone leads", () => {
    expect(sellerBlock(live, "aldric", NOW)).toEqual({ kind: "accept", currentPrice: 120 });
  });

  it("should tell the seller there are no bids, with nothing to accept, when nobody leads", () => {
    const { currentPrice: _price, ...unbid } = live;
    expect(sellerBlock(unbid, "aldric", NOW)).toEqual({ kind: "noBids" });
  });

  it.each([
    ["is settling", { status: "PENDING_SETTLEMENT" }],
    ["is sold", { status: "SOLD" }],
    ["is withdrawn", { status: "CANCELLED" }],
    ["has ended by the server's word", { ended: true }],
    ["has ended by the countdown", { endsAt: "2026-10-01T12:00:00Z" }],
  ])("should offer the seller nothing once the listing %s", (_label, change) => {
    expect(sellerBlock({ ...live, ...change }, "aldric", NOW)).toEqual({ kind: "none" });
  });

  it.each([
    ["another delver", "brenna"],
    ["a signed-out visitor", undefined],
  ])("should give %s no seller block", (_label, memberId) => {
    expect(sellerBlock(live, memberId, NOW)).toEqual({ kind: "none" });
  });
});

describe("seller copy", () => {
  it("should name the leading bid", () => {
    expect(leadingBidLine(1200)).toBe("Leading bid: 1,200 gold");
  });

  it("should promise the leading bid, not the amount, in the confirm", () => {
    expect(acceptConfirmText(120)).toBe(
      "End the auction and sell to the leading bid (currently 120 gold)? A higher bid landing first is the one that wins.",
    );
  });
});

describe("acceptFailure", () => {
  it.each([
    ["a busy listing", apiError(409, "CONFLICT"), { message: ACCEPT_CONFLICT }],
    [
      "a listing no longer for sale",
      apiError(400, "FAILED_PRECONDITION"),
      { message: ACCEPT_GONE, refetch: true },
    ],
    ["an unreachable server", apiError(503, "UNAVAILABLE"), { message: BROWSE_UNREACHABLE }],
    ["no answer at all", new TypeError("Failed to fetch"), { message: BROWSE_UNREACHABLE }],
    ["anything else", apiError(403, "PERMISSION_DENIED"), { message: "server prose" }],
  ])("should map %s to its copy", (_label, err, want) => {
    expect(acceptFailure(err)).toEqual(want);
  });

  it("should word the refusals in the Bazaar's house style", () => {
    expect(ACCEPT_CONFLICT).toBe("Someone acted at the same moment — try again.");
    expect(ACCEPT_GONE).toBe("This relic is no longer for sale.");
  });
});
