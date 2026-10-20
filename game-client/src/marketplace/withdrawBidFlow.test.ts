import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { BID_CONFLICT } from "./bid";
import { BROWSE_UNREACHABLE } from "./browse";
import { WITHDRAWN, WITHDRAW_GONE } from "./withdrawBid";
import { submitWithdraw, type WithdrawSubmitDeps } from "./withdrawBidFlow";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

/** Deps that record the order things happen in; `withdraw` answers with `answer`. */
function deps(answer?: Error) {
  const log: string[] = [];
  const d: WithdrawSubmitDeps = {
    withdraw: async () => {
      log.push("withdraw");
      if (answer) throw answer;
    },
    refresh: async () => {
      log.push("refresh");
    },
    reloadPurse: async () => {
      log.push("purse");
    },
  };
  return { d, log };
}

describe("submitWithdraw", () => {
  it("should re-read the list and the purse once the bid is withdrawn", async () => {
    const { d, log } = deps();
    const result = await submitWithdraw(d);
    expect(log[0]).toBe("withdraw");
    expect(log.slice(1).sort()).toEqual(["purse", "refresh"]);
    expect(result).toEqual({ withdrawn: true, note: { tone: "ok", text: WITHDRAWN } });
  });

  it("should re-read only the list when the bid can no longer be withdrawn", async () => {
    const { d, log } = deps(apiError(400, "FAILED_PRECONDITION"));
    const result = await submitWithdraw(d);
    expect(log).toEqual(["withdraw", "refresh"]);
    expect(result).toEqual({ withdrawn: false, note: { tone: "error", text: WITHDRAW_GONE } });
  });

  it.each([
    ["a busy listing", apiError(409, "CONFLICT"), BID_CONFLICT],
    ["an unreachable server", apiError(503, "UNAVAILABLE"), BROWSE_UNREACHABLE],
    ["any other refusal", apiError(403, "PERMISSION_DENIED"), "server prose"],
  ])("should say what %s means without re-reading", async (_label, err, text) => {
    const { d, log } = deps(err);
    const result = await submitWithdraw(d);
    expect(log).toEqual(["withdraw"]);
    expect(result).toEqual({ withdrawn: false, note: { tone: "error", text } });
  });
});
