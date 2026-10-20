import { describe, expect, it } from "vitest";
import { NO_BIDS, bidPage, bidStatusLabel, myBidRow, type MyBid } from "./myBids";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

const bid: MyBid = {
  bidId: "b-1",
  listingId: "l-1",
  amount: 1200,
  status: "WINNING",
  placedAt: "2026-10-01T11:00:00.000Z",
  item: {
    id: "i-1",
    name: "Barrow Blade",
    rarity: "rare",
    itemType: "weapon",
    itemLevel: 3,
    requiredLevel: 1,
    affixes: [],
  },
  listing: {
    status: "ACTIVE",
    ended: false,
    endsAt: "2026-10-01T13:05:00.000Z",
    currentPrice: 1200,
  },
};

describe("bidStatusLabel", () => {
  it.each([
    ["WINNING", "Leading"],
    ["OUTBID", "Outbid"],
    ["PENDING", "Placing…"],
    ["WON", "Won"],
    ["LOST", "Lost"],
  ])("should label %s as %s", (status, label) => {
    expect(bidStatusLabel(status)).toBe(label);
  });

  it("should read a lower-case status the same", () => {
    expect(bidStatusLabel("outbid")).toBe("Outbid");
  });

  it("should show a status it has no copy for as its words, never hide it", () => {
    expect(bidStatusLabel("SOMETHING_NEW")).toBe("Something new");
  });
});

describe("NO_BIDS", () => {
  it("should say the delver has no bids", () => {
    expect(NO_BIDS).toBe("You have no bids.");
  });
});

describe("bidPage", () => {
  it("should key each bid by its bid id and keep the server's order and cursor", () => {
    const second = { ...bid, bidId: "b-2" };
    const page = bidPage({ bids: [bid, second], nextCursor: "c-2" });
    expect(page.listings.map((b) => b.id)).toEqual(["b-1", "b-2"]);
    expect(page.listings[0]).toMatchObject(bid);
    expect(page.nextCursor).toBe("c-2");
  });

  it("should keep two bids on one listing as two rows", () => {
    const raised = { ...bid, bidId: "b-2", amount: 1500 };
    expect(bidPage({ bids: [raised, bid] }).listings).toHaveLength(2);
  });

  it("should have no cursor on the last page", () => {
    expect(bidPage({ bids: [] })).toEqual({ listings: [], nextCursor: undefined });
  });
});

describe("myBidRow", () => {
  it("should show a leading bid on a live auction with its countdown and current price", () => {
    expect(myBidRow(bid, NOW)).toEqual({
      status: "Leading",
      emphasis: true,
      amount: { gold: "1,200", opening: false },
      price: { gold: "1,200", opening: false },
      live: true,
      timeLeft: "1h 5m",
    });
  });

  it("should show the leader's price, not the delver's, when outbid", () => {
    const row = myBidRow(
      { ...bid, status: "OUTBID", listing: { ...bid.listing, currentPrice: 2000 } },
      NOW,
    );
    expect(row.status).toBe("Outbid");
    expect(row.emphasis).toBe(false);
    expect(row.amount.gold).toBe("1,200");
    expect(row.price?.gold).toBe("2,000");
  });

  it("should have no price when nobody leads the auction", () => {
    const row = myBidRow(
      { ...bid, status: "PENDING", listing: { ...bid.listing, currentPrice: undefined } },
      NOW,
    );
    expect(row.status).toBe("Placing…");
    expect(row.price).toBeUndefined();
  });

  it("should carry the buyout badge when the seller set one", () => {
    const row = myBidRow({ ...bid, listing: { ...bid.listing, buyoutPrice: 5000 } }, NOW);
    expect(row.buyout).toBe("Buyout 5,000");
  });

  it("should still shape a row whose item is missing", () => {
    const { item: _item, ...noItem } = bid;
    expect(myBidRow(noItem, NOW).status).toBe("Leading");
  });

  it("should read an auction the server says has ended as ended", () => {
    const row = myBidRow({ ...bid, listing: { ...bid.listing, ended: true } }, NOW);
    expect(row.live).toBe(false);
    expect(row.timeLeft).toBe("Ended");
  });

  it("should read a countdown that ran out while shown as ended", () => {
    const row = myBidRow(
      { ...bid, listing: { ...bid.listing, endsAt: "2026-10-01T12:00:00.000Z" } },
      NOW,
    );
    expect(row.live).toBe(false);
    expect(row.timeLeft).toBe("Ended");
  });

  it("should read a settled auction as ended, with a won bid emphasised", () => {
    const row = myBidRow(
      { ...bid, status: "WON", listing: { ...bid.listing, status: "SOLD", ended: false } },
      NOW,
    );
    expect(row).toMatchObject({ status: "Won", emphasis: true, live: false, timeLeft: "Ended" });
  });

  it("should not emphasise a lost bid", () => {
    const row = myBidRow({ ...bid, status: "LOST", listing: { ...bid.listing, status: "SOLD" } }, NOW);
    expect(row).toMatchObject({ status: "Lost", emphasis: false });
  });
});
