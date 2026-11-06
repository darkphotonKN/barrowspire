import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  RENEW_AHEAD_MS,
  RENEW_FLOOR_MS,
  accessTokenExpiry,
  scheduleRenewals,
  singleFlight,
  withCooldown,
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
  let renew: Mock<[], Promise<RenewOutcome>>;

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

describe("withCooldown (FS-ZPX58 M2)", () => {
  const NOW = 1_800_000_000_000;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should answer unavailable without asking again for 5 s after an unavailable renewal", async () => {
    const renew = vi.fn(async (): Promise<RenewOutcome> => "unavailable");
    const guarded = withCooldown(renew);

    expect(await guarded()).toBe("unavailable");
    vi.advanceTimersByTime(4_999);
    expect(await guarded()).toBe("unavailable");
    expect(renew).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await guarded();
    expect(renew).toHaveBeenCalledTimes(2);
  });

  it("should double the cooldown on each consecutive unavailable renewal, up to 60 s", async () => {
    const renew = vi.fn(async (): Promise<RenewOutcome> => "unavailable");
    const guarded = withCooldown(renew);
    const gaps: number[] = [];

    await guarded();
    for (let i = 0; i < 6; i++) {
      const calls = renew.mock.calls.length;
      let waited = 0;
      while (renew.mock.calls.length === calls) {
        vi.advanceTimersByTime(1_000);
        waited += 1_000;
        await guarded();
      }
      gaps.push(waited);
    }

    expect(gaps).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  it.each(["renewed", "refused"] as const)("should clear the cooldown on %s", async (settled) => {
    const renew = vi
      .fn<[], Promise<RenewOutcome>>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValueOnce(settled)
      .mockResolvedValue("unavailable");
    const guarded = withCooldown(renew);

    await guarded();
    vi.advanceTimersByTime(5_000);
    expect(await guarded()).toBe(settled);
    await guarded();
    expect(renew).toHaveBeenCalledTimes(3);
  });
});

describe("scheduleRenewals and a skewed client clock (FS-ZPX58 L2)", () => {
  const NOW = 1_800_000_000_000;
  const HOUR = 60 * 60 * 1000;
  let token: string | null;
  let listeners: Set<() => void>;
  const store = {
    current: () => token,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const setToken = (next: string) => {
    token = next;
    listeners.forEach((l) => l());
  };
  /** A token the server minted at serverNow, living an hour. */
  const mintedAt = (serverNow: number) =>
    jwtWith({ iat: Math.floor(serverNow / 1000), exp: Math.floor((serverNow + HOUR) / 1000) });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    listeners = new Set();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should renew at most once a minute when the client clock runs two hours fast", () => {
    // the server is two hours behind the client: every fresh token looks long expired
    const serverNow = () => Date.now() - 2 * HOUR;
    token = mintedAt(serverNow());
    const renew = vi.fn(async (): Promise<RenewOutcome> => {
      setToken(mintedAt(serverNow()));
      return "renewed";
    });
    scheduleRenewals({ ...store, renew });

    vi.advanceTimersByTime(0);
    expect(renew).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RENEW_FLOOR_MS - 1);
    expect(renew).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(renew).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(renew.mock.calls.length).toBeLessThanOrEqual(12);
  });

  it("should never wait longer than the token lives when the client clock runs slow", () => {
    // the server is two hours ahead: a fresh token looks like it lives three hours
    token = mintedAt(Date.now() + 2 * HOUR);
    const renew = vi.fn(async (): Promise<RenewOutcome> => "renewed");
    scheduleRenewals({ ...store, renew });

    vi.advanceTimersByTime(HOUR - RENEW_AHEAD_MS - 1);
    expect(renew).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(renew).toHaveBeenCalledTimes(1);
  });
});
