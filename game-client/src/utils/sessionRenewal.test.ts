import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RENEW_AHEAD_MS,
  accessTokenExpiry,
  scheduleRenewals,
  singleFlight,
  type RenewOutcome,
} from "./sessionRenewal";
import { jwtWith } from "./jwt.fixture";

describe("accessTokenExpiry (FS-ZPX58 R18)", () => {
  it("should read exp, in seconds, as epoch milliseconds", () => {
    expect(accessTokenExpiry(jwtWith({ sub: "m-1", exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it("should read a payload whose base64url needs - and _ and no padding", () => {
    // "~~~" and "???" in the name force the url-safe alphabet; the length forces stripped padding
    const token = jwtWith({ name: "~~~???>>>", exp: 1_800_000_001 });
    expect(token.split(".")[1]).toMatch(/[-_]/);
    expect(accessTokenExpiry(token)).toBe(1_800_000_001_000);
  });

  it.each([
    ["no token", null],
    ["empty", ""],
    ["one segment", "abc"],
    ["payload not base64", "a.!!!.c"],
    ["payload not JSON", `a.${btoa("not json")}.c`],
    ["no exp", jwtWith({ sub: "m-1" })],
    ["exp not a number", jwtWith({ exp: "soon" })],
  ])("should answer null for %s", (_label, token) => {
    expect(accessTokenExpiry(token)).toBeNull();
  });
});

describe("singleFlight (FS-ZPX58 R14)", () => {
  it("should share one in-flight call between every caller", async () => {
    let resolve!: (o: RenewOutcome) => void;
    const renew = vi.fn(() => new Promise<RenewOutcome>((r) => (resolve = r)));
    const shared = singleFlight(renew);

    const calls = [shared(), shared(), shared()];
    resolve("renewed");

    expect(await Promise.all(calls)).toEqual(["renewed", "renewed", "renewed"]);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("should run again once the previous call settled", async () => {
    const renew = vi.fn(async (): Promise<RenewOutcome> => "renewed");
    const shared = singleFlight(renew);

    await shared();
    await shared();

    expect(renew).toHaveBeenCalledTimes(2);
  });

  it("should read a thrown renewal as unavailable and let the next call try again", async () => {
    const renew = vi
      .fn<[], Promise<RenewOutcome>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("renewed");
    const shared = singleFlight(renew);

    expect(await shared()).toBe("unavailable");
    expect(await shared()).toBe("renewed");
  });
});

describe("scheduleRenewals (FS-ZPX58 R18)", () => {
  const NOW = 1_800_000_000_000;
  let token: string | null;
  let listeners: Set<() => void>;
  let renew: ReturnType<typeof vi.fn>;

  const store = {
    current: () => token,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const setToken = (next: string | null) => {
    token = next;
    listeners.forEach((l) => l());
  };
  const expiringIn = (ms: number) => jwtWith({ exp: Math.floor((NOW + ms) / 1000) });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    token = null;
    listeners = new Set();
    renew = vi.fn(async (): Promise<RenewOutcome> => "renewed");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should renew two minutes before the stored token's exp", () => {
    token = expiringIn(60 * 60 * 1000);
    scheduleRenewals({ ...store, renew });

    vi.advanceTimersByTime(60 * 60 * 1000 - RENEW_AHEAD_MS - 1);
    expect(renew).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("should renew at once a token already inside the window", () => {
    token = expiringIn(30 * 1000);
    scheduleRenewals({ ...store, renew });

    vi.advanceTimersByTime(0);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("should renew at once a token that has already expired", () => {
    token = expiringIn(-5 * 60 * 1000);
    scheduleRenewals({ ...store, renew });

    vi.advanceTimersByTime(0);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("should set no timer for a token whose exp cannot be read", () => {
    token = "not-a-jwt";
    scheduleRenewals({ ...store, renew });

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(renew).not.toHaveBeenCalled();
  });

  it("should reschedule for a new token and drop the old timer", () => {
    token = expiringIn(10 * 60 * 1000);
    scheduleRenewals({ ...store, renew });

    setToken(expiringIn(60 * 60 * 1000));
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(renew).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50 * 60 * 1000 - RENEW_AHEAD_MS);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("should not restart the timer when the store changes but the token does not", () => {
    token = expiringIn(10 * 60 * 1000);
    scheduleRenewals({ ...store, renew });

    vi.advanceTimersByTime(5 * 60 * 1000);
    setToken(token);
    vi.advanceTimersByTime(5 * 60 * 1000 - RENEW_AHEAD_MS);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("should clear the timer on sign-out", () => {
    token = expiringIn(10 * 60 * 1000);
    scheduleRenewals({ ...store, renew });

    setToken(null);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(renew).not.toHaveBeenCalled();
  });

  it("should stop: no timer and no listener left", () => {
    token = expiringIn(10 * 60 * 1000);
    const stop = scheduleRenewals({ ...store, renew });

    stop();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(renew).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
