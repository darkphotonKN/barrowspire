import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { VERIFY_TO_BID, VERIFY_TO_BUY_OUT, VERIFY_TO_LIST, gateFlag } from "./emailGate";

const apiError = (code: string) => new ApiError({ status: 400, code, detail: "", errors: [] });

// FS-V6SFK §Requirements 38: the gate's refusal is recognised by its code and carried as a typed
// flag on the note, never by matching the note's text.
describe("gateFlag", () => {
  it("should flag EMAIL_UNVERIFIED", () => {
    expect(gateFlag(apiError("EMAIL_UNVERIFIED"))).toEqual({ verifyEmail: true });
  });

  it.each([
    ["another code", apiError("FAILED_PRECONDITION")],
    ["no answer at all", new TypeError("Failed to fetch")],
    ["a plain object carrying the code", { code: "EMAIL_UNVERIFIED" }],
  ])("should not flag %s", (_label, err) => {
    expect(gateFlag(err)).toEqual({});
  });
});

describe("the gate's copy", () => {
  // FS-V6SFK §Requirements 38: the prompt says why *this* action failed.
  it("should name the action each prompt was refused for", () => {
    expect([VERIFY_TO_LIST, VERIFY_TO_BID, VERIFY_TO_BUY_OUT]).toEqual([
      "Listing a relic needs a verified email.",
      "Bidding needs a verified email.",
      "Buying out needs a verified email.",
    ]);
  });
});
