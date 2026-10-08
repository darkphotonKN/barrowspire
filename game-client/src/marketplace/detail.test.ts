import { describe, expect, it } from "vitest";
import { bidPanel, formatCriticalRate, fresher, itemStats, listingReader } from "./detail";

describe("itemStats", () => {
  it("should list a weapon's stats in a fixed order", () => {
    expect(
      itemStats({ weaponType: "sword", attackPower: 12, criticalRate: 0.05 }),
    ).toEqual([
      { label: "Kind", value: "Sword" },
      { label: "Attack", value: "12" },
      { label: "Critical rate", value: "5%" },
    ]);
  });

  it("should list an armour's slot and defences", () => {
    expect(
      itemStats({ armorSlot: "head", defenseRating: 7, magicResistance: 3 }),
    ).toEqual([
      { label: "Slot", value: "Head" },
      { label: "Defense", value: "7" },
      { label: "Magic resistance", value: "3" },
    ]);
  });

  it("should list a consumable's effects, with its duration in seconds", () => {
    expect(itemStats({ healingAmount: 40, manaAmount: 10, buffDuration: 30 })).toEqual([
      { label: "Healing", value: "40" },
      { label: "Mana", value: "10" },
      { label: "Duration", value: "30s" },
    ]);
  });

  it("should leave out stats the item does not have, and zeroes", () => {
    expect(itemStats({ attackPower: 0 })).toEqual([]);
    expect(itemStats(undefined)).toEqual([]);
  });
});

describe("formatCriticalRate", () => {
  // The wire carries the rate as a fraction; the seed stores 0.02–0.12.
  it.each([
    [0.02, "2%"],
    [0.07, "7%"],
    [0.12, "12%"],
    [0.125, "13%"],
  ])("should show %s as %s", (rate, want) => {
    expect(formatCriticalRate(rate)).toBe(want);
  });
});

describe("bidPanel", () => {
  const listing = { sellerId: "aldric" };

  it.each([
    ["a signed-out visitor", undefined, "signIn"],
    ["the listing's seller", "aldric", "own"],
    ["any other delver", "brenna", "bid"],
  ])("should show %s the right panel", (_label, memberId, want) => {
    expect(bidPanel(listing, memberId)).toBe(want);
  });
});

describe("fresher", () => {
  const older = { id: "l1", updatedAt: "2026-10-01T10:00:00Z", bidCount: 0 };
  const newer = { id: "l1", updatedAt: "2026-10-01T10:05:00Z", bidCount: 1 };

  it("should prefer the later read of a listing", () => {
    expect(fresher(older, newer)).toBe(newer);
    expect(fresher(newer, older)).toBe(newer);
  });

  it("should keep the row when there is no other read", () => {
    expect(fresher(older, undefined)).toBe(older);
  });
});

describe("listingReader", () => {
  type L = { id: string; updatedAt: string; minimumBid: number };
  const shown: L = { id: "l1", updatedAt: "2026-10-01T10:00:00Z", minimumBid: 50 };
  const older: L = { ...shown, updatedAt: "2026-10-01T10:01:00Z", minimumBid: 55 };
  const newer: L = { ...shown, updatedAt: "2026-10-01T10:05:00Z", minimumBid: 70 };

  /** A reader over controllable fetches, recording what it applies. */
  function setup() {
    let current = shown;
    const applied: L[] = [];
    const pending: { resolve: (l: L) => void; reject: (e: unknown) => void }[] = [];
    const read = listingReader<L>({
      fetch: () => new Promise<L>((resolve, reject) => pending.push({ resolve, reject })),
      current: () => current,
      apply: (l) => {
        current = l;
        applied.push(l);
      },
    });
    return { read, applied, pending, current: () => current };
  }

  it("should apply a newer read and answer with it", async () => {
    const { read, applied, pending } = setup();
    const answer = read();
    pending[0].resolve(newer);
    expect(await answer).toBe(newer);
    expect(applied).toEqual([newer]);
  });

  it("should drop a read that lands after a newer one", async () => {
    const { read, applied, pending, current } = setup();
    const first = read();
    const second = read();
    pending[1].resolve(newer);
    await second;
    pending[0].resolve(older);
    // The late, older read neither overwrites the newer one nor becomes the caller's answer.
    expect(await first).toBe(newer);
    expect(applied).toEqual([newer]);
    expect(current()).toBe(newer);
  });

  it("should answer undefined when the read fails, and keep what is shown", async () => {
    const { read, applied, pending, current } = setup();
    const answer = read();
    pending[0].reject(new Error("offline"));
    expect(await answer).toBeUndefined();
    expect(applied).toEqual([]);
    expect(current()).toBe(shown);
  });
});
