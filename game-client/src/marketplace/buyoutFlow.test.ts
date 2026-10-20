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
import { buyoutConfirm, submitBuyout, type BuyoutResult, type BuyoutSubmitDeps } from "./buyoutFlow";

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
    expect(results[0]).toEqual({ bought: false, ends: false, key: "key-1", note: { tone: "error", text } });
    expect(keys).toEqual(["key-1", "key-1"]);
  });

  it.each([
    ["409 · ALREADY_EXISTS", apiError(409, "ALREADY_EXISTS"), BUYOUT_LAPSED],
    ["400 · VALIDATION_FAILED", apiError(400, "VALIDATION_FAILED"), BUYOUT_PRICE_CHANGED],
    ["400 · FAILED_PRECONDITION", apiError(400, "FAILED_PRECONDITION"), BUYOUT_GONE],
  ])("should mint a new key after %s", async (_, err, text) => {
    const { keys, results } = await pressAll([err, undefined]);
    expect(results[0]).toMatchObject({ bought: false, key: undefined, note: { tone: "error", text } });
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
      ends: false,
      key: undefined,
      note: { tone: "error", text: "Not enough gold" },
    });
    expect(log).toEqual(["buyout 500"]);
  });
});

describe("buyoutConfirm", () => {
  const sent: BuyoutResult = { bought: false, ends: false, key: "key-1", note: { tone: "error", text: BUYOUT_CONFLICT } };

  it("should open a new intent with no key, whatever the last one held (req 9)", () => {
    expect(buyoutConfirm({ open: false, key: "stale" }, { type: "open" })).toEqual({ open: true, key: undefined });
  });

  it("should drop the key when the confirm closes, so reopening is a new intent", () => {
    const pressed = buyoutConfirm({ open: true, key: undefined }, { type: "answered", result: sent });
    expect(pressed).toEqual({ open: true, key: "key-1" });
    const closed = buyoutConfirm(pressed, { type: "close" });
    expect(closed).toEqual({ open: false, key: undefined });
    expect(buyoutConfirm(closed, { type: "open" })).toEqual({ open: true, key: undefined });
  });

  it("should stay open holding the key the answer kept, or none when it spent it", () => {
    expect(buyoutConfirm({ open: true, key: "key-1" }, { type: "answered", result: sent })).toEqual({ open: true, key: "key-1" });
    const spent: BuyoutResult = { ...sent, key: undefined, note: { tone: "error", text: BUYOUT_LAPSED } };
    expect(buyoutConfirm({ open: true, key: "key-1" }, { type: "answered", result: spent })).toEqual({ open: true, key: undefined });
  });

  it.each<[string, BuyoutResult]>([
    ["a sale", { bought: true, note: { tone: "ok", text: BOUGHT } }],
    ["a relic no longer for sale", { bought: false, ends: true, key: undefined, note: { tone: "error", text: BUYOUT_GONE } }],
  ])("should close and drop the key after %s", (_, result) => {
    expect(buyoutConfirm({ open: true, key: "key-1" }, { type: "answered", result })).toEqual({ open: false, key: undefined });
  });
});

describe("submitBuyout ends", () => {
  it("should end the intent only when the relic is no longer for sale", async () => {
    const gone = await pressAll([apiError(400, "FAILED_PRECONDITION")]);
    expect(gone.results[0]).toMatchObject({ bought: false, ends: true });
    const lapsed = await pressAll([apiError(409, "ALREADY_EXISTS")]);
    expect(lapsed.results[0]).toMatchObject({ bought: false, ends: false });
  });
});
