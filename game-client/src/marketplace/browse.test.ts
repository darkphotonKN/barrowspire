import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  BROWSE_FAILED,
  BROWSE_UNREACHABLE,
  INITIAL_BROWSE,
  SIGN_IN_TO_MARKETPLACE,
  ariaSort,
  browseFailureMessage,
  browseReducer,
  canShowMore,
  nextTickIn,
  priceCell,
  rowAction,
  toggleChip,
  toggleSort,
  typeChips,
  typeLabel,
  type BrowseState,
} from "./browse";

type Row = { id: string };
const page = (ids: string[], nextCursor?: string) => ({
  listings: ids.map((id) => ({ id })),
  nextCursor,
});
const ids = (state: BrowseState<Row>) => state.rows.map((r) => r.id);

describe("browseReducer", () => {
  it("starts loading with no rows", () => {
    expect(INITIAL_BROWSE.phase).toBe("loading");
    expect(INITIAL_BROWSE.rows).toEqual([]);
  });

  it("shows the first page and remembers its cursor", () => {
    const s = browseReducer<Row>(INITIAL_BROWSE, {
      type: "loaded",
      page: page(["a", "b"], "c1"),
    });
    expect(s.phase).toBe("ready");
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.nextCursor).toBe("c1");
  });

  it("appends the next page after the rows already shown, skipping any it already has", () => {
    let s = browseReducer<Row>(INITIAL_BROWSE, {
      type: "loaded",
      page: page(["a", "b"], "c1"),
    });
    s = browseReducer(s, { type: "more" });
    expect(s.loadingMore).toBe(true);
    s = browseReducer(s, { type: "moreLoaded", page: page(["b", "c"]) });
    expect(ids(s)).toEqual(["a", "b", "c"]);
    expect(s.nextCursor).toBeUndefined();
    expect(s.loadingMore).toBe(false);
  });

  it("fails the whole table when the first page fails", () => {
    const s = browseReducer<Row>(INITIAL_BROWSE, {
      type: "failed",
      message: BROWSE_UNREACHABLE,
    });
    expect(s.phase).toBe("failed");
    expect(s.error).toBe(BROWSE_UNREACHABLE);
    expect(s.rows).toEqual([]);
  });

  it("keeps the rows already shown when a later page fails", () => {
    let s = browseReducer<Row>(INITIAL_BROWSE, {
      type: "loaded",
      page: page(["a"], "c1"),
    });
    s = browseReducer(s, { type: "more" });
    s = browseReducer(s, { type: "failed", message: BROWSE_UNREACHABLE });
    expect(s.phase).toBe("ready");
    expect(ids(s)).toEqual(["a"]);
    expect(s.moreError).toBe(BROWSE_UNREACHABLE);
    expect(s.loadingMore).toBe(false);
    expect(s.nextCursor).toBe("c1");
  });

  it("merges a re-read first page in front, keeping the later pages and their cursor", () => {
    let s = browseReducer<Row>(INITIAL_BROWSE, { type: "loaded", page: page(["b", "c"], "c1") });
    s = browseReducer(s, { type: "more" });
    s = browseReducer(s, { type: "moreLoaded", page: page(["d", "e"], "c2") });
    s = browseReducer(s, { type: "refreshed", page: page(["a", "b"], "c-new") });
    expect(ids(s)).toEqual(["a", "b", "c", "d", "e"]);
    expect(s.nextCursor).toBe("c2");
    expect(s.phase).toBe("ready");
  });

  it("shows the re-read copy of a row it already had", () => {
    type Status = { id: string; status: string };
    let s = browseReducer<Status>(INITIAL_BROWSE, {
      type: "loaded",
      page: { listings: [{ id: "a", status: "PENDING" }] },
    });
    s = browseReducer(s, {
      type: "refreshed",
      page: { listings: [{ id: "a", status: "ACTIVE" }] },
    });
    expect(s.rows).toEqual([{ id: "a", status: "ACTIVE" }]);
  });

  it("leaves a Show more in flight alone when the first page is re-read", () => {
    let s = browseReducer<Row>(INITIAL_BROWSE, { type: "loaded", page: page(["a"], "c1") });
    s = browseReducer(s, { type: "more" });
    s = browseReducer(s, { type: "refreshed", page: page(["z", "a"]) });
    expect(s.loadingMore).toBe(true);
  });

  it("shows a re-read first page as the first page when nothing is shown yet", () => {
    const s = browseReducer<Row>(INITIAL_BROWSE, {
      type: "refreshed",
      page: page(["a"], "c1"),
    });
    expect(s.phase).toBe("ready");
    expect(ids(s)).toEqual(["a"]);
    expect(s.nextCursor).toBe("c1");
  });

  it("clears the rows and every error on a reload", () => {
    let s = browseReducer<Row>(INITIAL_BROWSE, {
      type: "failed",
      message: BROWSE_UNREACHABLE,
    });
    s = browseReducer(s, { type: "reload" });
    expect(s).toEqual(INITIAL_BROWSE);
  });
});

describe("canShowMore", () => {
  const ready = browseReducer<Row>(INITIAL_BROWSE, {
    type: "loaded",
    page: page(["a"], "c1"),
  });

  it("offers more only when a next page exists and none is in flight", () => {
    expect(canShowMore(ready)).toBe(true);
    expect(canShowMore(browseReducer(ready, { type: "more" }))).toBe(false);
    expect(
      canShowMore(
        browseReducer<Row>(INITIAL_BROWSE, { type: "loaded", page: page(["a"]) }),
      ),
    ).toBe(false);
    expect(canShowMore(INITIAL_BROWSE)).toBe(false);
  });
});

describe("browseFailureMessage", () => {
  const apiError = (status: number) =>
    new ApiError({ code: "X", status, detail: "", errors: [] });

  it.each([
    ["a 503", apiError(503), BROWSE_UNREACHABLE],
    ["a network failure", new TypeError("Failed to fetch"), BROWSE_UNREACHABLE],
    ["a 500", apiError(500), BROWSE_FAILED],
    ["a 400", apiError(400), BROWSE_FAILED],
  ])("maps %s", (_, err, message) => {
    expect(browseFailureMessage(err)).toBe(message);
  });

  it("uses the plain copy the spec gives for 503", () => {
    expect(BROWSE_UNREACHABLE).toBe(
      "The Bazaar is unreachable — try again shortly.",
    );
  });
});

describe("rowAction", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const live = {
    sellerId: "seller",
    endsAt: "2026-10-01T13:00:00Z",
    ended: false,
  };
  const signedIn = { memberId: "someone" };
  const signedOut = { memberId: undefined };

  it.each([
    ["the seller's own listing", live, { memberId: "seller" }, "own"],
    ["a signed-out visitor", live, signedOut, "signIn"],
    ["a signed-in delver on a live listing", live, signedIn, "bid"],
    [
      "a listing the server says has ended",
      { ...live, ended: true },
      signedIn,
      "ended",
    ],
    [
      "a listing whose countdown ran out while shown",
      { ...live, endsAt: "2026-10-01T12:00:00Z" },
      signedIn,
      "ended",
    ],
    [
      "a signed-out visitor on a listing the server says has ended",
      { ...live, ended: true },
      signedOut,
      "ended",
    ],
    [
      "a signed-out visitor on a listing whose countdown ran out",
      { ...live, endsAt: "2026-10-01T12:00:00Z" },
      signedOut,
      "ended",
    ],
    [
      "the seller's own ended listing",
      { ...live, ended: true },
      { memberId: "seller" },
      "own",
    ],
  ] as const)("%s", (_, listing, viewer, action) => {
    expect(rowAction(listing, viewer, now)).toBe(action);
  });

  it("returns to /marketplace after signing in", () => {
    expect(SIGN_IN_TO_MARKETPLACE).toBe("/login?redirect=%2Fmarketplace");
  });
});

describe("priceCell", () => {
  it("shows the current price when somebody leads", () => {
    expect(priceCell({ startPrice: 50, currentPrice: 1200 })).toEqual({
      gold: "1,200",
      opening: false,
    });
  });

  it("marks the start price as opening when nobody has bid", () => {
    expect(priceCell({ startPrice: 50 })).toEqual({ gold: "50", opening: true });
  });
});

describe("typeLabel", () => {
  it.each([
    ["a weapon, by its weapon type", { itemType: "weapon", weaponType: "sword" }, "Sword"],
    ["armour, by its slot", { itemType: "armor", armorSlot: "chest" }, "Chest"],
    ["anything else, by its type", { itemType: "consumable" }, "Consumable"],
    ["a missing item", undefined, "—"],
  ])("labels %s", (_, item, label) => {
    expect(typeLabel(item)).toBe(label);
  });
});

describe("nextTickIn", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");

  it("wakes for whichever row's countdown text moves first", () => {
    expect(
      nextTickIn(["2026-10-01T12:10:30Z", "2026-10-01T12:00:05.5Z"], now),
    ).toBe(501);
  });

  it("stops once every row has ended, or there are none", () => {
    expect(nextTickIn(["2026-10-01T11:00:00Z"], now)).toBeNull();
    expect(nextTickIn([], now)).toBeNull();
  });
});

describe("toggleSort", () => {
  it("flips the direction when the same column is chosen again", () => {
    expect(toggleSort({ key: "timeLeft", direction: "asc" }, "timeLeft")).toEqual(
      { key: "timeLeft", direction: "desc" },
    );
  });

  it.each([
    ["price", "asc"],
    ["timeLeft", "asc"],
    ["rarity", "desc"],
  ] as const)("opens %s %s", (key, direction) => {
    const from = key === "price" ? "rarity" : "price";
    expect(toggleSort({ key: from, direction: "asc" }, key)).toEqual({
      key,
      direction,
    });
  });
});

describe("ariaSort", () => {
  it("names the active column's direction and none for the rest", () => {
    const sort = { key: "price", direction: "desc" } as const;
    expect(ariaSort(sort, "price")).toBe("descending");
    expect(ariaSort({ ...sort, direction: "asc" }, "price")).toBe("ascending");
    expect(ariaSort(sort, "rarity")).toBe("none");
  });
});

describe("toggleChip", () => {
  it("turns a chip on, then off, leaving the others", () => {
    const on = toggleChip(["rare"], "fabled");
    expect(on).toEqual(["rare", "fabled"]);
    expect(toggleChip(on, "rare")).toEqual(["fabled"]);
  });
});

describe("typeChips", () => {
  it("always offers the three known types, then any other type loaded", () => {
    expect(
      typeChips([
        { item: { itemType: "Trinket" } },
        { item: { itemType: "weapon" } },
        {},
      ]),
    ).toEqual(["weapon", "armor", "consumable", "trinket"]);
  });
});
