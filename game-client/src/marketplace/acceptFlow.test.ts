import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { ACCEPT_CONFLICT, ACCEPT_GONE, ACCEPT_SOLD } from "./accept";
import { submitAccept, type AcceptSubmitDeps } from "./acceptFlow";
import { BROWSE_UNREACHABLE } from "./browse";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

/** Deps that record the order things happen in; `acceptBid` answers with `answer`. */
function deps(answer?: Error) {
  const log: string[] = [];
  const d: AcceptSubmitDeps = {
    acceptBid: async () => {
      log.push("accept");
      if (answer) throw answer;
    },
    refresh: async () => {
      log.push("refresh");
    },
  };
  return { d, log };
}

describe("submitAccept", () => {
  it("should re-read only the listing once the sale is accepted, then say it is sold", async () => {
    const { d, log } = deps();
    const result = await submitAccept(d);
    expect(log).toEqual(["accept", "refresh"]);
    expect(result).toEqual({ sold: true, note: { tone: "ok", text: ACCEPT_SOLD } });
  });

  it("should re-read the listing when it is no longer for sale", async () => {
    const { d, log } = deps(apiError(400, "FAILED_PRECONDITION"));
    const result = await submitAccept(d);
    expect(log).toEqual(["accept", "refresh"]);
    expect(result).toEqual({ sold: false, note: { tone: "error", text: ACCEPT_GONE } });
  });

  it.each([
    ["a busy listing", apiError(409, "CONFLICT"), ACCEPT_CONFLICT],
    ["an unreachable server", apiError(503, "UNAVAILABLE"), BROWSE_UNREACHABLE],
    ["any other refusal", apiError(403, "PERMISSION_DENIED"), "server prose"],
  ])("should say what %s means without re-reading", async (_label, err, text) => {
    const { d, log } = deps(err);
    const result = await submitAccept(d);
    expect(log).toEqual(["accept"]);
    expect(result).toEqual({ sold: false, note: { tone: "error", text } });
  });
});
