import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { BID_CONFLICT } from "./bid";
import { BROWSE_UNREACHABLE } from "./browse";
import {
  WITHDRAW_GONE,
  withdrawConfirmText,
  withdrawFailure,
  withdrawOffered,
} from "./withdrawBid";

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, detail: "server prose", errors: [] });

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

const bid = {
  amount: 1200,
  status: "WINNING",
  listing: {
    status: "ACTIVE",
    ended: false,
    endsAt: "2026-10-01T13:05:00.000Z",
  },
};

describe("withdrawOffered", () => {
  it.each([
    ["WINNING", true],
    ["OUTBID", true],
    ["winning", true],
    ["PENDING", false],
    ["WON", false],
    ["LOST", false],
  ])("should offer Withdraw on a %s bid of a live listing: %s", (status, offered) => {
    expect(withdrawOffered({ ...bid, status }, NOW)).toBe(offered);
  });

  it.each([
    ["is settling", { status: "PENDING_SETTLEMENT" }],
    ["is sold", { status: "SOLD" }],
    ["is withdrawn", { status: "CANCELLED" }],
    ["has ended by the server's word", { ended: true }],
    ["has ended by the countdown", { endsAt: "2026-10-01T12:00:00.000Z" }],
  ])("should not offer Withdraw once the listing %s", (_label, change) => {
    for (const status of ["WINNING", "OUTBID"])
      expect(withdrawOffered({ ...bid, status, listing: { ...bid.listing, ...change } }, NOW)).toBe(
        false,
      );
  });
});

// FS-EYQ8K §Requirements 11; FS-ZE43K §Requirements 13 (the withdrawal-cap warning);
// FS-S109X §Requirements 10–11 (only a leading withdrawal counts)
describe("withdrawConfirmText", () => {
  it("should warn a leading player that the next highest bid takes the lead and the withdrawal counts", () => {
    expect(withdrawConfirmText({ status: "WINNING", amount: 1200 })).toBe(
      "Withdraw your bid of 1,200 gold? The next highest bid takes the lead. After three withdrawals on one auction, you can't bid on it again.",
    );
  });

  it.each(["outbid", "OUTBID"])(
    "should tell an outbid player their gold is returned and the withdrawal doesn't count (%s)",
    (status) => {
      expect(withdrawConfirmText({ status, amount: 75 })).toBe(
        "Withdraw your bid of 75 gold? Your gold is returned. Withdrawing an outbid bid doesn't count toward the limit.",
      );
    },
  );
});

describe("withdrawFailure", () => {
  it.each([
    [
      "a bid that can no longer be withdrawn",
      apiError(400, "FAILED_PRECONDITION"),
      { message: WITHDRAW_GONE, refetch: true },
    ],
    ["a busy listing", apiError(409, "CONFLICT"), { message: BID_CONFLICT }],
    ["an unreachable server", apiError(503, "UNAVAILABLE"), { message: BROWSE_UNREACHABLE }],
    ["no answer at all", new TypeError("Failed to fetch"), { message: BROWSE_UNREACHABLE }],
    ["a malformed id", apiError(400, "VALIDATION_FAILED"), { message: "server prose" }],
    ["anything else", apiError(403, "PERMISSION_DENIED"), { message: "server prose" }],
  ])("should map %s to its copy", (_label, err, want) => {
    expect(withdrawFailure(err)).toEqual(want);
  });

  it("should word a spent bid as Requirement 14 does", () => {
    expect(WITHDRAW_GONE).toBe("This bid can no longer be withdrawn.");
  });
});
