import { describe, expect, it } from "vitest";
import { formatTimeLeft, msUntilTimeLeftChanges } from "./timeLeft";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;
const at = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();

describe("formatTimeLeft", () => {
  it.each([
    ["three days", 3 * D, "3d 0h 0m"],
    ["a day and a bit", D + 2 * H + 5 * M + 30 * S, "1d 2h 5m"],
    ["hours and minutes", 5 * H + 12 * M, "5h 12m"],
    ["an exact hour", H, "1h 0m"],
    ["minutes, rounded down to the whole minute", 12 * M + 59 * S, "12m"],
    ["just over a minute", M + S, "1m"],
    ["exactly a minute", M, "1m"],
    ["the last minute, in seconds", 59 * S, "59s"],
    ["the last second", S, "1s"],
    ["under a second, still counting", 400, "0s"],
    ["the end moment", 0, "Ended"],
    ["long past", -5 * M, "Ended"],
  ])("should show %s", (_label, ms, want) => {
    expect(formatTimeLeft(at(ms), NOW)).toBe(want);
  });
});

describe("msUntilTimeLeftChanges", () => {
  // The wait runs one millisecond past the boundary: at exactly 5m left the display still
  // reads "5m", so a timer set for the boundary itself would re-render the same text.
  it.each([
    [
      "a whole-minute display waits for the next minute",
      5 * M + 20 * S,
      20 * S + 1,
    ],
    ["on a minute boundary it waits just past it", 5 * M, 1],
    ["just under a minute boundary it waits a full minute", 5 * M - 1, M],
    ["a display just over a minute waits for the seconds", M + 250, 251],
    ["the last minute ticks each second", 30 * S + 300, 301],
    ["the last second waits for the end", 400, 401],
  ])("%s", (_label, ms, want) => {
    expect(msUntilTimeLeftChanges(at(ms), NOW)).toBe(want);
  });

  it("should stop ticking once the auction has ended", () => {
    expect(msUntilTimeLeftChanges(at(0), NOW)).toBeNull();
    expect(msUntilTimeLeftChanges(at(-M), NOW)).toBeNull();
  });
});
