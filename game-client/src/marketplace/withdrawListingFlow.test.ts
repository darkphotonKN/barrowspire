import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  LISTING_WITHDRAWN,
  WITHDRAW_LISTING_GONE,
  WITHDRAW_LISTING_LOCKED,
  WITHDRAW_LISTING_RETRY,
} from "./withdrawListing";
import { submitWithdrawListing, type WithdrawListingSubmitDeps } from "./withdrawListingFlow";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

/** Deps that record the order things happen in; `withdrawListing` answers with `answer`. */
function deps(answer?: Error) {
  const log: string[] = [];
  const d: WithdrawListingSubmitDeps = {
    withdrawListing: async () => {
      log.push("withdraw");
      if (answer) throw answer;
    },
    refresh: async () => {
      log.push("refresh");
    },
  };
  return { d, log };
}

describe("submitWithdrawListing (FS-V7A5S req 15, 16)", () => {
  it("should re-read the listing once it is withdrawn, then say so", async () => {
    const { d, log } = deps();
    const result = await submitWithdrawListing(d);
    expect(log).toEqual(["withdraw", "refresh"]);
    expect(result).toEqual({ withdrawn: true, note: { tone: "ok", text: LISTING_WITHDRAWN } });
  });

  it.each([
    ["no longer withdrawable", apiError(400, "FAILED_PRECONDITION"), WITHDRAW_LISTING_GONE],
    ["too late to withdraw", apiError(400, "LISTING_WITHDRAW_LOCKED"), WITHDRAW_LISTING_LOCKED],
  ])("should re-read the listing when it is %s", async (_label, err, text) => {
    const { d, log } = deps(err);
    const result = await submitWithdrawListing(d);
    expect(log).toEqual(["withdraw", "refresh"]);
    expect(result).toEqual({ withdrawn: false, note: { tone: "error", text } });
  });

  it("should say what not being the seller means without re-reading", async () => {
    const { d, log } = deps(apiError(403, "FORBIDDEN"));
    const result = await submitWithdrawListing(d);
    expect(log).toEqual(["withdraw"]);
    expect(result).toEqual({ withdrawn: false, note: { tone: "error", text: "server prose" } });
  });

  // Req 16 as amended 2026-11-05: the confirm stays open and its button sends the same withdrawal
  // again, which the server treats as a repeat that starts the follow-up.
  it.each([
    ["a 503", apiError(503, "SERVICE_UNAVAILABLE")],
    ["no answer", new TypeError("fetch failed")],
  ])("should ask for a retry after %s, without re-reading", async (_label, err) => {
    const { d, log } = deps(err);
    const result = await submitWithdrawListing(d);
    expect(log).toEqual(["withdraw"]);
    expect(result).toEqual({
      withdrawn: false,
      retry: true,
      note: { tone: "error", text: WITHDRAW_LISTING_RETRY },
    });
  });

  it("should land the retry once the server answers", async () => {
    const first = deps(apiError(503, "SERVICE_UNAVAILABLE"));
    expect((await submitWithdrawListing(first.d)).retry).toBe(true);

    const { d, log } = deps();
    const result = await submitWithdrawListing(d);
    expect(log).toEqual(["withdraw", "refresh"]);
    expect(result).toEqual({ withdrawn: true, note: { tone: "ok", text: LISTING_WITHDRAWN } });
  });
});
