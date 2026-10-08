import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { CANNOT_LIST, POSTED_LIVE, STILL_PROCESSING, endsAtFor } from "./listRelic";
import { postListing, type PostListingDeps } from "./listRelicFlow";
import type { PollOutcome } from "./postedPoll";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Deps that log each step; the poll resolves when the test says. */
function deps({ refuse }: { refuse?: unknown } = {}) {
  const log: string[] = [];
  let finishPoll: (outcome: PollOutcome) => void = () => {};
  let gone = false;
  const d: PostListingDeps = {
    createListing: async (itemId, startPrice, endsAt) => {
      log.push(`create ${itemId} ${startPrice} ${endsAt}`);
      if (refuse) throw refuse;
    },
    onPosted: () => log.push("posted"),
    poll: (itemId) => {
      log.push(`poll ${itemId}`);
      return new Promise((resolve) => {
        finishPoll = (outcome) => resolve({ outcome });
      });
    },
    onSettled: (notice) => log.push(`settled ${notice}`),
    cancelled: () => gone,
    now: () => NOW,
  };
  return {
    d,
    log,
    finish: (outcome: PollOutcome) => finishPoll(outcome),
    leave: () => {
      gone = true;
    },
  };
}

const input = { itemId: "item-1", startPrice: 50, duration: "24h" as const };

describe("postListing", () => {
  it("should post with the end time the duration gives, then hand over and start polling", async () => {
    const t = deps();
    expect(await postListing(input, t.d)).toBeNull();
    expect(t.log).toEqual([
      `create item-1 50 ${endsAtFor("24h", NOW)}`,
      "posted",
      "poll item-1",
    ]);
  });

  it("should answer before the poll ends, so the drawer closes at once", async () => {
    const t = deps();
    await postListing(input, t.d);
    expect(t.log).not.toContainEqual(expect.stringMatching(/^settled/));
  });

  it.each([
    ["found", POSTED_LIVE],
    ["gaveUp", STILL_PROCESSING],
  ] as const)("should say so once the poll ends %s", async (outcome, notice) => {
    const t = deps();
    await postListing(input, t.d);
    t.finish(outcome);
    await settle();
    expect(t.log.at(-1)).toBe(`settled ${notice}`);
  });

  it("should say nothing when the poll was cancelled", async () => {
    const t = deps();
    await postListing(input, t.d);
    t.finish("cancelled");
    await settle();
    expect(t.log.at(-1)).toBe("poll item-1");
  });

  it("should say nothing when the page went away as the poll's last read landed", async () => {
    const t = deps();
    await postListing(input, t.d);
    t.leave();
    t.finish("found");
    await settle();
    expect(t.log.at(-1)).toBe("poll item-1");
  });

  it("should answer a refusal's copy and neither hand over nor poll", async () => {
    const t = deps({ refuse: new ApiError({ status: 500, code: "INTERNAL", detail: "", errors: [] }) });
    expect(await postListing(input, t.d)).toBe(CANNOT_LIST);
    expect(t.log).toEqual([`create item-1 50 ${endsAtFor("24h", NOW)}`]);
  });
});
