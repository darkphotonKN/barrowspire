import { describe, expect, it } from "vitest";
import {
  POLL_INTERVAL_MS,
  POLL_MAX_TRIES,
  pollForPostedListing,
} from "./postedPoll";

type Row = { itemId: string; status: string };
const page = (...listings: Row[]) => ({ listings });

const LONGSWORD = "item-longsword";

/** A fetcher that answers each attempt from the list in turn, repeating the last. */
function scripted(answers: (Row[] | Error)[]) {
  let calls = 0;
  const fetchMine = async () => {
    const answer = answers[Math.min(calls, answers.length - 1)];
    calls++;
    if (answer instanceof Error) throw answer;
    return page(...answer);
  };
  return { fetchMine, calls: () => calls };
}

/** A clock that records every wait instead of waiting. */
function fakeClock() {
  const waits: number[] = [];
  return { sleep: async (ms: number) => void waits.push(ms), waits };
}

describe("pollForPostedListing", () => {
  it.each([1, 3, POLL_MAX_TRIES])(
    "should find the listing once it is ACTIVE on attempt %i and stop there",
    async (n) => {
      const absent: Row[] = [{ itemId: "other", status: "ACTIVE" }];
      const present: Row[] = [{ itemId: LONGSWORD, status: "ACTIVE" }];
      const answers = [...Array.from({ length: n - 1 }, () => absent), present];
      const fetcher = scripted(answers);
      const clock = fakeClock();

      const result = await pollForPostedListing(LONGSWORD, {
        fetchMine: fetcher.fetchMine,
        sleep: clock.sleep,
      });

      expect(result).toEqual({ outcome: "found", attempts: n });
      expect(fetcher.calls()).toBe(n);
      expect(clock.waits).toEqual(Array(n).fill(POLL_INTERVAL_MS));
    },
  );

  it("should give up after the last attempt when the listing never appears", async () => {
    const fetcher = scripted([[]]);
    const clock = fakeClock();

    const result = await pollForPostedListing(LONGSWORD, {
      fetchMine: fetcher.fetchMine,
      sleep: clock.sleep,
    });

    expect(result).toEqual({ outcome: "gaveUp", attempts: POLL_MAX_TRIES });
    expect(fetcher.calls()).toBe(POLL_MAX_TRIES);
  });

  it("should poll every 1.5 seconds, up to 8 times", () => {
    expect(POLL_INTERVAL_MS).toBe(1500);
    expect(POLL_MAX_TRIES).toBe(8);
  });

  it("should not count a listing for the item that is not ACTIVE", async () => {
    const fetcher = scripted([
      [{ itemId: LONGSWORD, status: "CANCELLED" }],
      [
        { itemId: LONGSWORD, status: "CANCELLED" },
        { itemId: LONGSWORD, status: "active" },
      ],
    ]);

    const result = await pollForPostedListing(LONGSWORD, {
      fetchMine: fetcher.fetchMine,
      sleep: fakeClock().sleep,
    });

    expect(result).toEqual({ outcome: "found", attempts: 2 });
  });

  it("should treat a failed fetch as a miss and keep polling", async () => {
    const fetcher = scripted([
      new Error("503"),
      [{ itemId: LONGSWORD, status: "ACTIVE" }],
    ]);

    const result = await pollForPostedListing(LONGSWORD, {
      fetchMine: fetcher.fetchMine,
      sleep: fakeClock().sleep,
    });

    expect(result).toEqual({ outcome: "found", attempts: 2 });
  });

  it("should hand every page it reads to onPage, so Mine shows it", async () => {
    const seen: number[] = [];
    const fetcher = scripted([[], [{ itemId: LONGSWORD, status: "ACTIVE" }]]);

    await pollForPostedListing(LONGSWORD, {
      fetchMine: fetcher.fetchMine,
      sleep: fakeClock().sleep,
      onPage: (p) => seen.push(p.listings.length),
    });

    expect(seen).toEqual([0, 1]);
  });

  it("should stop without fetching again once cancelled", async () => {
    let cancelled = false;
    const fetcher = scripted([[]]);
    const sleep = async () => {
      if (fetcher.calls() === 2) cancelled = true;
    };

    const result = await pollForPostedListing(LONGSWORD, {
      fetchMine: fetcher.fetchMine,
      sleep,
      cancelled: () => cancelled,
    });

    expect(result).toEqual({ outcome: "cancelled", attempts: 2 });
    expect(fetcher.calls()).toBe(2);
  });

  it("should honour a custom interval and try count", async () => {
    const fetcher = scripted([[]]);
    const clock = fakeClock();

    const result = await pollForPostedListing(LONGSWORD, {
      fetchMine: fetcher.fetchMine,
      sleep: clock.sleep,
      intervalMs: 10,
      maxTries: 2,
    });

    expect(result).toEqual({ outcome: "gaveUp", attempts: 2 });
    expect(clock.waits).toEqual([10, 10]);
  });
});
