import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import {
  WITHDRAW_LISTING_CONFLICT,
  WITHDRAW_LISTING_GONE,
  WITHDRAW_LISTING_LOCKED,
  WITHDRAW_LISTING_RETRY,
  listingWithdrawable,
  withdrawListingConfirmText,
  withdrawListingFailure,
  withdrawListingOffered,
} from "./withdrawListing";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

const NOW = Date.parse("2026-10-01T12:00:00Z");
const MIN = 60 * 1000;
const endsIn = (ms: number) => new Date(NOW + ms).toISOString();

const live = {
  sellerId: "aldric",
  status: "ACTIVE",
  ended: false,
  endsAt: endsIn(24 * 60 * MIN),
  bidCount: 0,
};

describe("listingWithdrawable (FS-V7A5S req 14)", () => {
  it.each([
    ["an open auction with no bids", {}, true],
    ["an open auction with bids, well before its end", { bidCount: 2, currentPrice: 120 }, true],
    ["with bids, 31 minutes before its end", { bidCount: 1, currentPrice: 120, endsAt: endsIn(31 * MIN) }, true],
    ["with bids, exactly 30 minutes before its end", { bidCount: 1, currentPrice: 120, endsAt: endsIn(30 * MIN) }, false],
    ["with bids, 5 minutes before its end", { bidCount: 3, currentPrice: 120, endsAt: endsIn(5 * MIN) }, false],
    ["without bids, 5 minutes before its end", { endsAt: endsIn(5 * MIN) }, true],
    ["bought out", { bidCount: 1, buyoutPrice: 500, currentPrice: 500 }, false],
    ["with a buyout price nobody has reached", { bidCount: 1, buyoutPrice: 500, currentPrice: 499 }, true],
    ["ended by the server's word", { ended: true }, false],
    ["ended by the countdown", { endsAt: endsIn(0) }, false],
    ["settling", { status: "PENDING_SETTLEMENT" }, false],
    ["sold", { status: "SOLD" }, false],
    ["already withdrawn", { status: "CANCELLED" }, false],
  ])("%s → %s", (_label, change, want) => {
    expect(listingWithdrawable({ ...live, ...change }, NOW)).toBe(want);
  });
});

describe("withdrawListingOffered", () => {
  it("should offer the seller Withdraw on their withdrawable listing", () => {
    expect(withdrawListingOffered(live, "aldric", NOW)).toBe(true);
  });

  it.each([
    ["another member", "brenna"],
    ["a visitor", undefined],
  ])("should never offer it to %s", (_label, memberId) => {
    expect(withdrawListingOffered(live, memberId, NOW)).toBe(false);
  });

  it("should not offer it on the seller's listing inside the contested final 30 minutes", () => {
    expect(
      withdrawListingOffered({ ...live, bidCount: 1, endsAt: endsIn(10 * MIN) }, "aldric", NOW),
    ).toBe(false);
  });
});

describe("withdrawListingConfirmText (req 15)", () => {
  it("should say the relic comes back when there are no bids", () => {
    const text = withdrawListingConfirmText(0);
    expect(text).toMatch(/relic comes back to you/);
    expect(text).not.toMatch(/bid/);
  });

  it.each([
    [1, "1 bid"],
    [3, "3 bids"],
  ])("should name the %s and say every bidder gets their gold back", (count, words) => {
    const text = withdrawListingConfirmText(count);
    expect(text).toContain(words);
    expect(text).toMatch(/every bidder gets their gold back/);
  });
});

describe("withdrawListingFailure (req 16)", () => {
  it.each([
    ["the contested final 30 minutes", apiError(400, "LISTING_WITHDRAW_LOCKED"), { message: WITHDRAW_LISTING_LOCKED, refetch: true }],
    ["a listing no longer withdrawable", apiError(400, "FAILED_PRECONDITION"), { message: WITHDRAW_LISTING_GONE, refetch: true }],
    ["not the seller", apiError(403, "FORBIDDEN"), { message: "server prose" }],
    ["a busy listing", apiError(409, "CONFLICT"), { message: WITHDRAW_LISTING_CONFLICT }],
    ["an unavailable marketplace, or a withdrawal whose follow-up did not start", apiError(503, "SERVICE_UNAVAILABLE"), { message: WITHDRAW_LISTING_RETRY, retry: true }],
    ["an ingress with no answer from the gateway (502)", apiError(502, "BAD_GATEWAY"), { message: WITHDRAW_LISTING_RETRY, retry: true }],
    ["an ingress that timed out waiting for the gateway (504)", apiError(504, "GATEWAY_TIMEOUT"), { message: WITHDRAW_LISTING_RETRY, retry: true }],
    ["no answer at all", new TypeError("fetch failed"), { message: WITHDRAW_LISTING_RETRY, retry: true }],
  ])("should map %s to its copy", (_label, err, want) => {
    expect(withdrawListingFailure(err)).toEqual(want);
  });

  // Req 16 as amended 2026-11-05: a 503 may mean the listing is withdrawn but its item and gold
  // are not on their way yet, so it asks for a retry rather than saying the marketplace is down,
  // and it never re-reads the listing into a state that hides Withdraw.
  it("should ask for a retry on a 503 and not re-read the listing", () => {
    const failure = withdrawListingFailure(apiError(503, "SERVICE_UNAVAILABLE"));
    expect(failure.retry).toBe(true);
    expect(failure.refetch).toBeUndefined();
    expect(failure.message).not.toBe(BROWSE_UNREACHABLE);
    expect(failure.message).toMatch(/again/i);
  });

  it("should use the FS's exact copy for the lock", () => {
    expect(WITHDRAW_LISTING_LOCKED).toBe(
      "Too late to withdraw — this auction has bids and ends within 30 minutes.",
    );
  });
});
