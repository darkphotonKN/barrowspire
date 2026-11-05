import { describe, expect, it } from "vitest";
import { openSellerConfirm, type SellerConfirmState } from "./sellerConfirm";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const MIN = 60 * 1000;
const endsIn = (ms: number) => new Date(NOW + ms).toISOString();

const SELLER = "aldric";
// Whose listing it is comes from the server's `own` (FS-GKHYD Req 13), never an id comparison.
const live = {
  own: true,
  status: "ACTIVE",
  ended: false,
  endsAt: endsIn(24 * 60 * MIN),
  bidCount: 1,
  currentPrice: 120,
};

const state = (change: Partial<SellerConfirmState>): SellerConfirmState => ({
  asked: undefined,
  retrying: false,
  done: false,
  ...change,
});

describe("openSellerConfirm (FS-49Z37 req 13–17, FS-V7A5S req 14–16)", () => {
  it.each([
    ["nothing asked", live, state({}), undefined],
    ["Accept asked on a listing with a leading bid", live, state({ asked: "accept" }), "accept"],
    ["Accept asked once nobody leads", { ...live, bidCount: 0, currentPrice: undefined }, state({ asked: "accept" }), undefined],
    ["Accept asked once the listing has ended", { ...live, ended: true }, state({ asked: "accept" }), undefined],
    ["Withdraw asked on a withdrawable listing", live, state({ asked: "withdraw" }), "withdraw"],
    ["Withdraw asked once the final 30 minutes begin", { ...live, endsAt: endsIn(10 * MIN) }, state({ asked: "withdraw" }), undefined],
    ["Withdraw asked once the listing reads withdrawn", { ...live, status: "CANCELLED" }, state({ asked: "withdraw" }), undefined],
    ["an action that has landed", live, state({ asked: "withdraw", done: true }), undefined],
  ])("%s → %s", (_label, listing, s, want) => {
    expect(openSellerConfirm(listing, SELLER, NOW, s)).toBe(want);
  });

  // Req 16 as amended 2026-11-05: a withdrawal that answered 503 or not at all may already hold
  // the listing withdrawn, its follow-up not started. Its confirm stays open, whose button sends
  // it again, however the listing reads meanwhile.
  it.each([
    ["still withdrawable", live],
    ["re-read as withdrawn", { ...live, status: "CANCELLED" }],
    ["past its end", { ...live, endsAt: endsIn(-MIN) }],
    ["ended by the server's word", { ...live, ended: true }],
    ["inside the final 30 minutes", { ...live, endsAt: endsIn(10 * MIN) }],
  ])("should keep a retrying withdraw confirm open on a listing %s", (_label, listing) => {
    expect(openSellerConfirm(listing, SELLER, NOW, state({ asked: "withdraw", retrying: true }))).toBe(
      "withdraw",
    );
  });

  it("should not hold a retrying confirm open for anyone but the seller", () => {
    const notTheirs = { ...live, own: false };
    expect(
      openSellerConfirm(notTheirs, "brenna", NOW, state({ asked: "withdraw", retrying: true })),
    ).toBeUndefined();
  });

  it("should close a retrying confirm once the withdrawal lands", () => {
    expect(
      openSellerConfirm(live, SELLER, NOW, state({ asked: "withdraw", retrying: true, done: true })),
    ).toBeUndefined();
  });
});
