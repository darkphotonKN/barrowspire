import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  BID_CONFLICT,
  BID_ENDED,
  BID_NOT_ENOUGH_GOLD,
  PURSE_FAILED,
  PURSE_NOT_READY,
  bidAttempt,
  bidBox,
  bidFailure,
  bidLeads,
  closedBoxNotes,
  outbidMessage,
  parseBidAmount,
  purseFailure,
} from "./bid";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

describe("parseBidAmount", () => {
  it.each([
    ["a whole number", "50", 50],
    ["surrounding space", " 51 ", 51],
    ["digit grouping as the page prints it", "1,234", 1234],
    ["an empty box", "", null],
    ["a fraction", "50.5", null],
    ["a negative amount", "-5", null],
    ["words", "fifty", null],
    ["zero", "0", null],
    ["an amount past the safe integers", "9007199254740993", null],
  ])("should read %s", (_label, text, want) => {
    expect(parseBidAmount(text)).toBe(want);
  });
});

describe("bidBox", () => {
  const ready = {
    text: "50",
    minimumBid: 50,
    purse: { state: "ready", availableGold: 100 } as const,
    ended: false,
    submitting: false,
  };

  it("should allow a bid at the minimum the delver can afford", () => {
    expect(bidBox(ready)).toEqual({ canSubmit: true, amount: 50 });
  });

  it("should allow a bid of exactly the available gold", () => {
    expect(bidBox({ ...ready, text: "100" }).canSubmit).toBe(true);
  });

  it.each([
    ["below the minimum", { text: "49" }, "The minimum bid is ⟡50."],
    ["above the available gold", { text: "101" }, "Not enough gold"],
    ["not a whole number", { text: "5.5" }, "Enter a whole amount of gold."],
    ["empty", { text: "" }, "Enter a whole amount of gold."],
  ])("should refuse an amount %s", (_label, change, reason) => {
    expect(bidBox({ ...ready, ...change })).toEqual({ canSubmit: false, reason });
  });

  it("should close for good once the auction has ended", () => {
    expect(bidBox({ ...ready, ended: true })).toEqual({
      canSubmit: false,
      reason: BID_ENDED,
      closed: true,
    });
  });

  it("should say the purse is not ready while the wallet answers 404", () => {
    expect(bidBox({ ...ready, purse: { state: "missing" } })).toEqual({
      canSubmit: false,
      reason: PURSE_NOT_READY,
    });
  });

  it("should hold the bid when the purse could not be read", () => {
    expect(bidBox({ ...ready, purse: { state: "failed" } })).toEqual({
      canSubmit: false,
      reason: PURSE_FAILED,
    });
  });

  it("should wait, without a reason, while the purse is loading", () => {
    expect(bidBox({ ...ready, purse: { state: "loading" } })).toEqual({
      canSubmit: false,
    });
  });

  it("should not submit twice while a bid is in flight", () => {
    expect(bidBox({ ...ready, submitting: true }).canSubmit).toBe(false);
  });

  it("should group large minimums without floating point", () => {
    expect(
      bidBox({ ...ready, text: "1", minimumBid: 1234567 }).reason,
    ).toBe("The minimum bid is ⟡1,234,567.");
  });
});

describe("bidAttempt", () => {
  let n = 0;
  const mint = () => `key-${++n}`;

  it("should mint a key for a first bid", () => {
    expect(bidAttempt(undefined, 50, () => "fresh")).toEqual({
      amount: 50,
      key: "fresh",
    });
  });

  it("should reuse the key when the same bid is sent again", () => {
    const first = bidAttempt(undefined, 50, mint);
    expect(bidAttempt(first, 50, mint)).toBe(first);
  });

  it("should mint a new key when the amount changes", () => {
    const first = bidAttempt(undefined, 50, mint);
    const second = bidAttempt(first, 51, mint);
    expect(second.amount).toBe(51);
    expect(second.key).not.toBe(first.key);
  });
});

describe("bidFailure", () => {
  it("should refetch before saying someone bid higher", () => {
    expect(bidFailure(apiError(400, "VALIDATION_FAILED"), { amount: 50, availableGold: 100 }))
      .toEqual({ refetch: true });
  });

  it("should blame gold when the amount is more than is available", () => {
    expect(
      bidFailure(apiError(400, "FAILED_PRECONDITION"), { amount: 150, availableGold: 100 }),
    ).toEqual({ message: BID_NOT_ENOUGH_GOLD });
  });

  it("should call the auction ended when the gold was there", () => {
    expect(
      bidFailure(apiError(400, "FAILED_PRECONDITION"), { amount: 50, availableGold: 100 }),
    ).toEqual({ message: BID_ENDED });
  });

  it("should ask for a retry on a conflict", () => {
    expect(bidFailure(apiError(409, "CONFLICT"), { amount: 50, availableGold: 100 })).toEqual({
      message: BID_CONFLICT,
    });
  });

  it("should say the Bazaar is unreachable on a 503 or no answer at all", () => {
    const want = { message: "The Bazaar is unreachable — try again shortly." };
    expect(bidFailure(apiError(503, "UNAVAILABLE"), { amount: 50 })).toEqual(want);
    expect(bidFailure(new TypeError("fetch failed"), { amount: 50 })).toEqual(want);
  });

  it("should fall back to the server's own words for any other code", () => {
    expect(bidFailure(apiError(400, "SOMETHING_NEW"), { amount: 50 })).toEqual({
      message: "server prose",
    });
  });
});

describe("outbidMessage", () => {
  it("should name the new minimum", () => {
    expect(outbidMessage(1051)).toBe("Someone bid higher — the minimum is now ⟡1,051.");
  });
});

describe("bidLeads", () => {
  it("should confirm the amount", () => {
    expect(bidLeads(2500)).toBe("Your bid of ⟡2,500 leads.");
  });
});

describe("purseFailure", () => {
  it("should read a 404 as a purse not yet made", () => {
    expect(purseFailure(apiError(404, "NOT_FOUND"))).toEqual({ state: "missing" });
  });

  it("should read anything else as a failed read", () => {
    expect(purseFailure(apiError(503, "UNAVAILABLE"))).toEqual({ state: "failed" });
  });
});

describe("closedBoxNotes", () => {
  it("should say only that bidding has closed when no bid was in flight", () => {
    expect(closedBoxNotes(undefined, BID_ENDED)).toEqual([{ tone: "muted", text: BID_ENDED }]);
  });

  it("should keep the answer to a bid that was in flight when the countdown reached zero", () => {
    expect(closedBoxNotes({ tone: "ok", text: bidLeads(120) }, BID_ENDED)).toEqual([
      { tone: "ok", text: "Your bid of ⟡120 leads." },
      { tone: "muted", text: BID_ENDED },
    ]);
  });

  it("should keep an in-flight bid's refusal beside the closed message", () => {
    expect(closedBoxNotes({ tone: "error", text: BID_CONFLICT }, BID_ENDED)).toEqual([
      { tone: "error", text: BID_CONFLICT },
      { tone: "muted", text: BID_ENDED },
    ]);
  });

  it("should not say the auction has ended twice", () => {
    expect(closedBoxNotes({ tone: "error", text: BID_ENDED }, BID_ENDED)).toEqual([
      { tone: "error", text: BID_ENDED },
    ]);
  });
});
