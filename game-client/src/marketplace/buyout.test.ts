import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  BOUGHT,
  BUYOUT_CONFLICT,
  BUYOUT_GONE,
  BUYOUT_LAPSED,
  BUYOUT_PRICE_CHANGED,
  buyoutAction,
  buyoutFailure,
  buyoutLabel,
  buyoutQuestion,
  keepsBuyoutKey,
} from "./buyout";
import { BID_NOT_ENOUGH_GOLD, PURSE_FAILED, PURSE_NOT_READY } from "./bid";
import { BROWSE_UNREACHABLE } from "./browse";

const apiError = (status: number, code: string, detail = "server prose") =>
  new ApiError({ status, code, detail, errors: [] });

const NOW = Date.parse("2026-10-20T12:00:00Z");
const listing = (over: Partial<Parameters<typeof buyoutAction>[0]["listing"]> = {}) => ({
  sellerId: "seller",
  status: "ACTIVE",
  endsAt: "2026-10-21T12:00:00Z",
  buyoutPrice: 500,
  ...over,
});
const ready = (availableGold: number) => ({ state: "ready" as const, availableGold });

describe("buyoutAction", () => {
  it.each([
    ["the viewer is signed out", { listing: listing(), memberId: undefined }],
    ["the viewer is the seller", { listing: listing(), memberId: "seller" }],
    ["the listing is not ACTIVE", { listing: listing({ status: "PENDING_SETTLEMENT" }), memberId: "buyer" }],
    ["the server says it ended", { listing: listing({ ended: true }), memberId: "buyer" }],
    ["the countdown reached zero", { listing: listing({ endsAt: "2026-10-20T12:00:00Z" }), memberId: "buyer" }],
    ["it has no buyout price", { listing: listing({ buyoutPrice: undefined }), memberId: "buyer" }],
  ])("should be absent when %s", (_, input) => {
    expect(buyoutAction({ ...input, now: NOW, purse: ready(1000) })).toEqual({ shown: false });
  });

  it("should offer the buyout at its price when the buyer can afford it", () => {
    expect(
      buyoutAction({ listing: listing(), memberId: "buyer", now: NOW, purse: ready(500) }),
    ).toEqual({ shown: true, price: 500, canPress: true });
  });

  it("should be disabled with Not enough gold when available gold is below the price", () => {
    expect(
      buyoutAction({ listing: listing(), memberId: "buyer", now: NOW, purse: ready(499) }),
    ).toEqual({ shown: true, price: 500, canPress: false, reason: "Not enough gold" });
  });

  it.each([
    ["loading", { state: "loading" as const }, undefined],
    ["missing", { state: "missing" as const }, PURSE_NOT_READY],
    ["failed", { state: "failed" as const }, PURSE_FAILED],
  ])("should be disabled with the bid box's purse state while the purse is %s", (_, purse, reason) => {
    expect(
      buyoutAction({ listing: listing(), memberId: "buyer", now: NOW, purse }),
    ).toEqual({ shown: true, price: 500, canPress: false, ...(reason ? { reason } : {}) });
  });
});

describe("keepsBuyoutKey", () => {
  it.each([
    ["409 · CONFLICT", apiError(409, "CONFLICT"), true],
    ["503", apiError(503, "UNAVAILABLE"), true],
    ["a transport failure", new TypeError("Failed to fetch"), true],
    ["409 · ALREADY_EXISTS", apiError(409, "ALREADY_EXISTS"), false],
    ["400 · VALIDATION_FAILED", apiError(400, "VALIDATION_FAILED"), false],
    ["400 · FAILED_PRECONDITION", apiError(400, "FAILED_PRECONDITION"), false],
    ["anything else", apiError(500, "INTERNAL"), false],
  ])("after %s, keep the key: %s", (_, err, keep) => {
    expect(keepsBuyoutKey(err)).toBe(keep);
  });
});

describe("buyoutFailure", () => {
  const ctx = { price: 500, availableGold: 800 };
  it.each([
    ["409 · CONFLICT", apiError(409, "CONFLICT"), ctx, { message: BUYOUT_CONFLICT }],
    ["409 · ALREADY_EXISTS", apiError(409, "ALREADY_EXISTS"), ctx, { message: BUYOUT_LAPSED }],
    [
      "400 · VALIDATION_FAILED",
      apiError(400, "VALIDATION_FAILED"),
      ctx,
      { message: BUYOUT_PRICE_CHANGED, refetch: true },
    ],
    [
      "FAILED_PRECONDITION short of gold",
      apiError(400, "FAILED_PRECONDITION"),
      { price: 500, availableGold: 499 },
      { message: BID_NOT_ENOUGH_GOLD },
    ],
    [
      "FAILED_PRECONDITION with gold enough",
      apiError(400, "FAILED_PRECONDITION"),
      ctx,
      { message: BUYOUT_GONE, refetch: true, ends: true },
    ],
    [
      "FAILED_PRECONDITION with the purse unread",
      apiError(400, "FAILED_PRECONDITION"),
      { price: 500, availableGold: undefined },
      { message: BUYOUT_GONE, refetch: true, ends: true },
    ],
    ["503", apiError(503, "UNAVAILABLE"), ctx, { message: BROWSE_UNREACHABLE }],
    ["a transport failure", new TypeError("Failed to fetch"), ctx, { message: BROWSE_UNREACHABLE }],
    ["anything else", apiError(403, "FORBIDDEN", "Not yours."), ctx, { message: "Not yours." }],
  ])("should map %s to its copy", (_, err, context, want) => {
    expect(buyoutFailure(err, context)).toEqual(want);
  });

  it("should word each refusal as Requirement 12 does", () => {
    expect([BUYOUT_CONFLICT, BUYOUT_LAPSED, BUYOUT_PRICE_CHANGED, BUYOUT_GONE]).toEqual([
      "Someone acted at the same moment — try again.",
      "That attempt lapsed — try again.",
      "The buyout price has changed — check it and try again.",
      "This relic is no longer for sale.",
    ]);
  });
});

describe("buyout copy", () => {
  it("should label the button and ask the confirm question with the price", () => {
    expect(buyoutLabel(1500)).toBe("Buy out — 1,500 gold");
    expect(buyoutQuestion("Barrow Blade", 1500)).toBe(
      "Buy Barrow Blade outright for 1,500 gold? The auction ends at once.",
    );
    expect(BOUGHT).toBe("Bought — the relic reaches your stash once the sale settles.");
  });
});
