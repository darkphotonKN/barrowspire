import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { BID_CONFLICT, BID_NOT_ENOUGH_GOLD, type BidAttempt } from "./bid";
import { BROWSE_UNREACHABLE } from "./browse";
import { submitBid, type BidSubmitDeps } from "./bidFlow";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

/** Deps that record the order things happen in; `placeBid` answers from a script. */
function deps(
  answers: (Error | undefined)[],
  { minimumAfter = 80, refreshFails = false } = {},
) {
  const log: string[] = [];
  const keys: string[] = [];
  let minted = 0;
  const d: BidSubmitDeps = {
    placeBid: async (amount, key) => {
      log.push(`place ${amount}`);
      keys.push(key);
      const answer = answers.shift();
      if (answer) throw answer;
    },
    refresh: async () => {
      log.push("refresh");
      return refreshFails ? undefined : { minimumBid: minimumAfter };
    },
    reloadPurse: async () => {
      log.push("purse");
    },
    mint: () => `key-${++minted}`,
    resetTouched: () => log.push("resetTouched"),
  };
  return { d, log, keys };
}

describe("submitBid", () => {
  it("should say the bid leads only after the listing and purse are re-read", async () => {
    const { d, log } = deps([undefined]);
    const result = await submitBid({ amount: 60, previous: undefined, availableGold: 100 }, d);
    expect(log).toEqual(["place 60", "resetTouched", "refresh", "purse"]);
    expect(result.note).toEqual({ tone: "ok", text: "Your bid of ⟡60 leads." });
  });

  it("should forget a landed bid, so the next bid of the same amount mints a new key", async () => {
    const { d, keys } = deps([undefined, undefined]);
    const first = await submitBid({ amount: 60, previous: undefined, availableGold: 100 }, d);
    expect(first.attempt).toBeUndefined();
    await submitBid({ amount: 60, previous: first.attempt, availableGold: 100 }, d);
    expect(keys).toEqual(["key-1", "key-2"]);
  });

  it("should keep a refused bid's key, so a retry of the same amount reuses it", async () => {
    const { d, keys } = deps([apiError(409, "CONFLICT"), undefined]);
    const first = await submitBid({ amount: 60, previous: undefined, availableGold: 100 }, d);
    expect(first.note).toEqual({ tone: "error", text: BID_CONFLICT });
    expect(first.attempt).toEqual<BidAttempt>({ amount: 60, key: "key-1" });
    await submitBid({ amount: 60, previous: first.attempt, availableGold: 100 }, d);
    expect(keys).toEqual(["key-1", "key-1"]);
  });

  it("should mint a new key when the amount changes after a refusal", async () => {
    const { d, keys } = deps([apiError(409, "CONFLICT"), undefined]);
    const first = await submitBid({ amount: 60, previous: undefined, availableGold: 100 }, d);
    await submitBid({ amount: 65, previous: first.attempt, availableGold: 100 }, d);
    expect(keys).toEqual(["key-1", "key-2"]);
  });

  it("should re-read the listing before naming the new minimum when outbid", async () => {
    const { d, log } = deps([apiError(400, "VALIDATION_FAILED")], { minimumAfter: 90 });
    const result = await submitBid({ amount: 60, previous: undefined, availableGold: 100 }, d);
    expect(log).toEqual(["place 60", "resetTouched", "refresh"]);
    expect(result.note).toEqual({
      tone: "error",
      text: "Someone bid higher — the minimum is now ⟡90.",
    });
  });

  it("should say the Bazaar is unreachable when the outbid re-read fails", async () => {
    const { d } = deps([apiError(400, "VALIDATION_FAILED")], { refreshFails: true });
    const result = await submitBid({ amount: 60, previous: undefined, availableGold: 100 }, d);
    expect(result.note).toEqual({ tone: "error", text: BROWSE_UNREACHABLE });
  });

  it("should leave the box as typed on a plain refusal", async () => {
    const { d, log } = deps([apiError(422, "FAILED_PRECONDITION")]);
    const result = await submitBid({ amount: 60, previous: undefined, availableGold: 40 }, d);
    expect(log).toEqual(["place 60"]);
    expect(result.note).toEqual({ tone: "error", text: BID_NOT_ENOUGH_GOLD });
  });
});
