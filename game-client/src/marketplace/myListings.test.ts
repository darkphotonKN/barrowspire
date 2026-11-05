import { describe, expect, it } from "vitest";
import type { Listing, PublicListing } from "./listing";
import { asOwnListing, mineRow, mineWithRead } from "./myListings";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const listing = {
  status: "ACTIVE",
  ended: false,
  endsAt: "2026-10-01T13:05:00.000Z",
  startPrice: 50,
};

describe("mineRow", () => {
  it("should show a live auction's countdown and its opening price", () => {
    expect(mineRow(listing, NOW)).toEqual({
      status: "Active",
      live: true,
      timeLeft: "1h 5m",
      price: { gold: "50", opening: true },
    });
  });

  it("should show the current price once somebody leads", () => {
    expect(mineRow({ ...listing, currentPrice: 1200 }, NOW).price).toEqual({
      gold: "1,200",
      opening: false,
    });
  });

  it("should label an ACTIVE listing past its end as awaiting settlement", () => {
    const row = mineRow({ ...listing, ended: true, endsAt: "2026-10-01T11:00:00.000Z" }, NOW);
    expect(row.status).toBe("Ended — awaiting settlement");
    expect(row.live).toBe(false);
    expect(row.timeLeft).toBe("Ended");
  });

  it("should read a countdown that ran out while shown as ended, before the server says so", () => {
    const row = mineRow({ ...listing, endsAt: "2026-10-01T12:00:00.000Z" }, NOW);
    expect(row.status).toBe("Ended — awaiting settlement");
    expect(row.live).toBe(false);
    expect(row.timeLeft).toBe("Ended");
  });

  it.each([
    ["PENDING_SETTLEMENT", "Sold — settling"],
    ["SOLD", "Sold"],
    ["CANCELLED", "Withdrawn"],
  ])("should label %s as %s with no countdown", (status, label) => {
    const row = mineRow({ ...listing, status }, NOW);
    expect(row.status).toBe(label);
    expect(row.live).toBe(false);
    expect(row.timeLeft).toBe("—");
  });

  it("should show what a sold listing fetched", () => {
    expect(
      mineRow({ ...listing, status: "SOLD", currentPrice: 90, soldPrice: 120 }, NOW).price,
    ).toEqual({ gold: "120", opening: false });
  });
});

describe("mineRow buyout (FS-49Z37 req 3)", () => {
  it("should carry the buyout badge when the listing has a buyout price", () => {
    expect(mineRow({ ...listing, buyoutPrice: 900 }, NOW).buyout).toBe("Buyout 900");
  });

  it("should carry none when it has not", () => {
    expect(mineRow(listing, NOW).buyout).toBeUndefined();
  });
});

describe("Mine's rows and the public detail (FS-GKHYD Req 3, 13)", () => {
  const row: Listing = {
    id: "l1",
    itemId: "i1",
    sellerId: "aldric",
    buyerId: "brenna",
    soldPrice: 120,
    status: "ACTIVE",
    ended: false,
    startPrice: 50,
    currentPrice: 100,
    minimumBid: 105,
    bidCount: 2,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    endsAt: "2026-10-01T13:05:00.000Z",
  };
  const read: PublicListing = {
    id: "l1",
    itemId: "i1",
    own: false,
    status: "ACTIVE",
    ended: false,
    startPrice: 50,
    currentPrice: 110,
    minimumBid: 115,
    bidCount: 3,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:05:00.000Z",
    endsAt: "2026-10-01T13:05:00.000Z",
  };

  it("should open a Mine row in the detail as the seller's own, without its member ids", () => {
    const detail = asOwnListing(row);
    expect(detail.own).toBe(true);
    expect(detail).not.toHaveProperty("sellerId");
    expect(detail).not.toHaveProperty("buyerId");
    expect(detail).not.toHaveProperty("soldPrice");
    expect(detail.currentPrice).toBe(100);
  });

  it("should take a public read's fields into a Mine row and keep the seller's own fields", () => {
    const merged = mineWithRead(row, read);
    expect(merged).toMatchObject({
      currentPrice: 110,
      minimumBid: 115,
      bidCount: 3,
      updatedAt: "2026-10-01T10:05:00.000Z",
      sellerId: "aldric",
      buyerId: "brenna",
      soldPrice: 120,
    });
    expect(merged).not.toHaveProperty("own");
  });

  // The public read leaves an absent optional key out, so a field the newer read dropped must
  // not survive from the row: the only leading bid withdrawn leaves no current price to accept.
  it("should drop a field the newer public read no longer carries", () => {
    const { currentPrice: _gone, ...noLeader } = read;
    const merged = mineWithRead(row, { ...noLeader, bidCount: 0 });
    expect(merged).not.toHaveProperty("currentPrice");
    expect(merged).toMatchObject({ sellerId: "aldric", buyerId: "brenna", soldPrice: 120 });
  });
});
