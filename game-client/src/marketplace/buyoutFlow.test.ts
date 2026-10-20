import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import {
  BOUGHT,
  BUYOUT_CONFLICT,
  BUYOUT_GONE,
  BUYOUT_LAPSED,
  BUYOUT_PRICE_CHANGED,
} from "./buyout";
import { submitBuyout, type BuyoutSubmitDeps } from "./buyoutFlow";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

/** Deps that record the order things happen in; `buyout` answers from a script. */
function deps(answers: (Error | undefined)[]) {
  const log: string[] = [];
  const keys: string[] = [];
  let minted = 0;
  const d: BuyoutSubmitDeps = {
    buyout: async (amount, key) => {
      log.push(`buyout ${amount}`);
      keys.push(key);
      const answer = answers.shift();
      if (answer) throw answer;
    },
    refresh: async () => {
      log.push("refresh");
    },
    reloadPurse: async () => {
      log.push("purse");
    },
    mint: () => `key-${++minted}`,
  };
  return { d, log, keys };
}

/** Presses Buy out in one open dialog until the script runs out, carrying the key along. */
async function pressAll(answers: (Error | undefined)[]) {
  const { d, keys, log } = deps([...answers]);
  let key: string | undefined;
  const results = [];
  for (let i = 0; i < answers.length; i++) {
    const result = await submitBuyout({ price: 500, key, availableGold: 800 }, d);
    key = result.bought ? undefined : result.key;
    results.push(result);
  }
  return { keys, log, results };
}

describe("submitBuyout", () => {
  it("should send the shown price under a fresh key, then re-read the listing and purse", async () => {
    const { log, keys, results } = await pressAll([undefined]);
    expect(log).toEqual(["buyout 500", "refresh", "purse"]);
    expect(keys).toEqual(["key-1"]);
    expect(results[0]).toEqual({ bought: true, note: { tone: "ok", text: BOUGHT } });
  });

  it.each([
    ["409 · CONFLICT", apiError(409, "CONFLICT"), BUYOUT_CONFLICT],
    ["503", apiError(503, "UNAVAILABLE"), BROWSE_UNREACHABLE],
    ["a transport failure", new TypeError("Failed to fetch"), BROWSE_UNREACHABLE],
  ])("should resend under the same key after %s", async (_, err, text) => {
    const { keys, results } = await pressAll([err, undefined]);
    expect(results[0]).toEqual({ bought: false, key: "key-1", note: { tone: "error", text } });
    expect(keys).toEqual(["key-1", "key-1"]);
  });

  it.each([
    ["409 · ALREADY_EXISTS", apiError(409, "ALREADY_EXISTS"), BUYOUT_LAPSED],
    ["400 · VALIDATION_FAILED", apiError(400, "VALIDATION_FAILED"), BUYOUT_PRICE_CHANGED],
    ["400 · FAILED_PRECONDITION", apiError(400, "FAILED_PRECONDITION"), BUYOUT_GONE],
  ])("should mint a new key after %s", async (_, err, text) => {
    const { keys, results } = await pressAll([err, undefined]);
    expect(results[0]).toEqual({ bought: false, key: undefined, note: { tone: "error", text } });
    expect(keys).toEqual(["key-1", "key-2"]);
  });

  it.each([
    ["a changed price", apiError(400, "VALIDATION_FAILED")],
    ["a relic no longer for sale", apiError(400, "FAILED_PRECONDITION")],
  ])("should re-read the listing, not the purse, after %s", async (_, err) => {
    const { log } = await pressAll([err]);
    expect(log).toEqual(["buyout 500", "refresh"]);
  });

  it("should not re-read anything after a busy listing", async () => {
    const { log } = await pressAll([apiError(409, "CONFLICT")]);
    expect(log).toEqual(["buyout 500"]);
  });

  it("should say Not enough gold, without a re-read, when the buyer is short", async () => {
    const { d, log } = deps([apiError(400, "FAILED_PRECONDITION")]);
    const result = await submitBuyout({ price: 500, key: undefined, availableGold: 100 }, d);
    expect(result).toEqual({
      bought: false,
      key: undefined,
      note: { tone: "error", text: "Not enough gold" },
    });
    expect(log).toEqual(["buyout 500"]);
  });
});
