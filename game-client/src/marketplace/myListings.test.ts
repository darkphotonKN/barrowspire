import { describe, expect, it } from "vitest";
import { mineRow } from "./myListings";

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
    ["PENDING_SETTLEMENT", "Settling"],
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
