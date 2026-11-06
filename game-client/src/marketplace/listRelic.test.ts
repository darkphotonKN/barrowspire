import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import { VERIFY_TO_LIST } from "./emailGate";
import {
  BUYOUT_NOT_ABOVE_START,
  CANNOT_LIST,
  DURATIONS,
  END_TIME_PASSED,
  LIST_FAILED,
  LISTING_DURATION_OUT_OF_RANGE_COPY,
  LISTING_LIMIT_REACHED_COPY,
  NOT_IN_STASH_CANNOT_LIST,
  NOTHING_LISTABLE,
  WORN_CANNOT_LIST,
  buyoutField,
  canSubmitListing,
  createListingFailureMessage,
  endsAtFor,
  instanceStatus,
  parseStartPrice,
  pickerCards,
} from "./listRelic";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

describe("endsAtFor", () => {
  it.each([
    ["1h", "2026-10-01T13:00:00.000Z"],
    ["12h", "2026-10-02T00:00:00.000Z"],
    ["24h", "2026-10-02T12:00:00.000Z"],
    ["3d", "2026-10-04T12:00:00.000Z"],
  ] as const)("should end a %s auction that long from now", (id, want) => {
    expect(endsAtFor(id, NOW)).toBe(want);
  });

  it("should offer exactly the four presets, shortest first", () => {
    expect(DURATIONS.map((d) => d.label)).toEqual([
      "1 hour",
      "12 hours",
      "24 hours",
      "3 days",
    ]);
  });
});

describe("parseStartPrice", () => {
  it.each([
    ["a whole number", "50", 50],
    ["one, the least allowed", "1", 1],
    ["surrounding space", " 75 ", 75],
    ["a large amount", "1000000", 1_000_000],
  ])("should accept %s", (_l, text, want) => {
    expect(parseStartPrice(text)).toBe(want);
  });

  it.each([
    ["empty", ""],
    ["zero", "0"],
    ["negative", "-5"],
    ["a fraction", "12.5"],
    ["an exponent", "1e3"],
    ["words", "fifty"],
    ["past the safe integer range", "9007199254740993"],
  ])("should refuse %s", (_l, text) => {
    expect(parseStartPrice(text)).toBeNull();
  });
});

describe("instanceStatus", () => {
  it.each([
    ["AVAILABLE", "AVAILABLE"],
    ["LISTED", "LISTED"],
    ["IN_ESCROW", "IN_ESCROW"],
    ["PENDING_SETTLEMENT", "PENDING_SETTLEMENT"],
    ["listed", "LISTED"],
  ] as const)("should read %s as %s", (status, want) => {
    expect(instanceStatus(status)).toBe(want);
  });

  it("should read an absent status as AVAILABLE, since the wire marks it optional", () => {
    expect(instanceStatus(undefined)).toBe("AVAILABLE");
  });

  it("should read a status it does not know as unavailable", () => {
    expect(instanceStatus("DESTROYED")).toBe("UNKNOWN");
  });
});

describe("pickerCards", () => {
  // FS-3R77D R10–R12: only stash relics that can be listed right now get a card.
  const cards = pickerCards(
    [
      {
        id: "sword",
        name: "Longsword",
        status: "AVAILABLE",
        location: "stash",
        attack_power: 12,
        critical_rate: 0.05,
      },
      { id: "axe", name: "Axe", status: "AVAILABLE", location: "bag" },
      { id: "helm", name: "Iron Helm", status: "LISTED", location: "stash", defense_rating: 4 },
      { id: "ring", name: "Ring", status: "IN_ESCROW", location: "stash" },
      { id: "cloak", name: "Cloak", status: "PENDING_SETTLEMENT", location: "stash" },
      { id: "bow", name: "Bow", status: "IN_RUN", location: "stash" },
      { id: "odd", name: "Odd", status: "DESTROYED", location: "stash" },
      { id: "crown", name: "Crown", status: "AVAILABLE", location: "stash" },
      { id: "old", name: "Old Dagger", location: "STASH" },
      { id: "nowhere", name: "Nowhere", status: "AVAILABLE" },
      { name: "No id", status: "AVAILABLE", location: "stash" },
    ],
    new Set(["crown"]),
  );

  it("should make a card only for an available, unworn stash relic with an id, in order", () => {
    expect(cards.map((c) => c.id)).toEqual(["sword", "old"]);
  });

  it.each([
    ["a bag relic", "axe"],
    ["a listed relic", "helm"],
    ["a relic in escrow", "ring"],
    ["a settling relic", "cloak"],
    ["a relic in a run", "bow"],
    ["a relic of unknown status", "odd"],
    ["a worn stash relic", "crown"],
    ["a relic with no location", "nowhere"],
  ])("should leave out %s", (_l, id) => {
    expect(cards.find((c) => c.id === id)).toBeUndefined();
  });

  it("should read a stash relic with no status as available, the server staying the authority", () => {
    expect(cards.find((c) => c.id === "old")).toBeDefined();
  });

  it("should mark nothing: a card has no choosable flag and no tag (FS-3R77D R11)", () => {
    for (const card of cards) {
      expect(card).not.toHaveProperty("selectable");
      expect(card).not.toHaveProperty("tag");
    }
  });

  it("should show the stats the relic has, and no price", () => {
    const sword = cards.find((c) => c.id === "sword")!;
    expect(sword.stats).toEqual([
      { label: "Attack", value: "12" },
      { label: "Crit", value: "5%" },
    ]);
    expect(JSON.stringify(sword)).not.toMatch(/price/i);
  });

  it("should name a nameless relic", () => {
    expect(pickerCards([{ id: "x", location: "stash" }])[0].name).toBe("Unknown relic");
  });

  it("should read no worn ids as nothing worn", () => {
    const instances = [
      { id: "sword", status: "AVAILABLE", location: "stash" },
      { id: "helm", status: "LISTED", location: "stash" },
    ];
    expect(pickerCards(instances, new Set())).toEqual(pickerCards(instances));
    expect(pickerCards(instances).map((c) => c.id)).toEqual(["sword"]);
  });

  it("should say plainly when the stash holds nothing to list (FS-3R77D R14)", () => {
    expect(NOTHING_LISTABLE).toBe(
      "Nothing in your stash to list. Move a relic into your stash in town.",
    );
  });
});

describe("buyoutField", () => {
  it.each([
    ["empty", ""],
    ["only spaces", "   "],
  ])("should read %s as no buyout price, valid", (_l, text) => {
    expect(buyoutField(text, 50)).toEqual({ valid: true, buyoutPrice: undefined });
  });

  it.each([
    ["one above the start", "51", 51],
    ["far above, padded", " 5000 ", 5000],
  ])("should accept %s", (_l, text, want) => {
    expect(buyoutField(text, 50)).toEqual({ valid: true, buyoutPrice: want });
  });

  it.each([
    ["equal to the start", "50"],
    ["below the start", "10"],
    ["zero", "0"],
    ["not whole", "60.5"],
    ["not a number", "lots"],
    ["negative", "-60"],
  ])("should refuse %s with the copy", (_l, text) => {
    expect(buyoutField(text, 50)).toEqual({ valid: false, error: BUYOUT_NOT_ABOVE_START });
  });

  it("should hold its judgement while the start price is not valid yet", () => {
    expect(buyoutField("60", null)).toEqual({ valid: false });
  });

  it("should use the copy the spec gives", () => {
    expect(BUYOUT_NOT_ABOVE_START).toBe("The buyout price must be above the starting bid.");
  });
});

describe("canSubmitListing", () => {
  const cards = pickerCards([
    { id: "sword", status: "AVAILABLE", location: "stash" },
    { id: "helm", status: "LISTED", location: "stash" },
  ]);
  const ok = { cards, selectedId: "sword", priceText: "50", submitting: false };

  it("should allow a chosen available relic at a valid price", () => {
    expect(canSubmitListing(ok)).toBe(true);
  });

  it("should allow a buyout price above the start price", () => {
    expect(canSubmitListing({ ...ok, buyoutText: "51" })).toBe(true);
  });

  it.each([
    ["nothing is chosen", { selectedId: undefined }],
    ["the chosen relic is listed, so it has no card", { selectedId: "helm" }],
    ["the chosen relic is gone", { selectedId: "gone" }],
    ["the price is not a whole number of 1 or more", { priceText: "0" }],
    ["a listing is already on its way", { submitting: true }],
    ["the buyout price is not above the start price", { buyoutText: "50" }],
  ])("should refuse when %s", (_l, change) => {
    expect(canSubmitListing({ ...ok, ...change })).toBe(false);
  });

  it("should refuse a worn relic, which gets no card (FS-3R77D R10)", () => {
    const wornCards = pickerCards(
      [{ id: "sword", status: "AVAILABLE", location: "stash" }],
      new Set(["sword"]),
    );
    expect(canSubmitListing({ ...ok, cards: wornCards })).toBe(false);
  });
});

describe("listing limit copy", () => {
  // FS-XEDFF Req 12: the exact words
  it("should say the duration range and the cap in the FS's words", () => {
    expect(LISTING_DURATION_OUT_OF_RANGE_COPY).toBe(
      "A listing must last between 1 hour and 7 days.",
    );
    expect(LISTING_LIMIT_REACHED_COPY).toBe(
      "You already have 20 relics for sale. Wait for one to end, or withdraw one.",
    );
  });
});

describe("createListingFailureMessage", () => {
  const apiError = (status: number) =>
    new ApiError({ code: "X", status, detail: "", errors: [] });

  const refusal = (code: string, status = 400) =>
    new ApiError({ code, status, detail: "", errors: [] });

  it.each([
    // FS-HBXZN R17: items' refusals are named by their code
    ["ITEM_WORN, a worn relic", refusal("ITEM_WORN"), WORN_CANNOT_LIST],
    ["ITEM_NOT_AVAILABLE, a relic already held", refusal("ITEM_NOT_AVAILABLE"), CANNOT_LIST],
    // FS-3R77D R15: a relic outside the stash
    ["ITEM_NOT_IN_STASH, a relic not in the stash", refusal("ITEM_NOT_IN_STASH"), NOT_IN_STASH_CANNOT_LIST],
    ["a 404, a relic not the member's", refusal("NOT_FOUND", 404), CANNOT_LIST],
    ["a 500, a real failure", apiError(500), LIST_FAILED],
    ["a 400, an end time already past", apiError(400), END_TIME_PASSED],
    ["a 503", apiError(503), BROWSE_UNREACHABLE],
    ["a network failure", new TypeError("Failed to fetch"), BROWSE_UNREACHABLE],
    ["a 422", apiError(422), LIST_FAILED],
    // FS-XEDFF Req 12: the duration bound and the per-seller cap
    [
      "LISTING_DURATION_OUT_OF_RANGE, a listing too short or too long",
      refusal("LISTING_DURATION_OUT_OF_RANGE"),
      LISTING_DURATION_OUT_OF_RANGE_COPY,
    ],
    [
      "LISTING_LIMIT_REACHED, a seller with 20 relics for sale",
      refusal("LISTING_LIMIT_REACHED"),
      LISTING_LIMIT_REACHED_COPY,
    ],
  ])("should map %s", (_l, err, want) => {
    expect(createListingFailureMessage(err)).toBe(want);
  });

  // FS-HBXZN R17–R18: a code wins over the price reading, so a refused relic never reads as a
  // buyout or an end-time problem
  it.each([
    "ITEM_WORN",
    "ITEM_NOT_AVAILABLE",
    "LISTING_DURATION_OUT_OF_RANGE",
    "LISTING_LIMIT_REACHED",
  ])(
    "should name %s by its code whatever prices were sent",
    (code) => {
      expect(
        createListingFailureMessage(refusal(code), { startPrice: 50, buyoutPrice: 50 }),
      ).not.toBe(BUYOUT_NOT_ABOVE_START);
      expect(createListingFailureMessage(refusal(code))).not.toBe(END_TIME_PASSED);
    },
  );

  // FS-V6SFK §Requirements 38: the gate's 400 is named by its code, before any price reading
  it("should ask an unverified seller to verify their email, whatever was sent", () => {
    const unverified = new ApiError({ code: "EMAIL_UNVERIFIED", status: 400, detail: "", errors: [] });
    expect(createListingFailureMessage(unverified)).toBe(VERIFY_TO_LIST);
    expect(
      createListingFailureMessage(unverified, { startPrice: 50, buyoutPrice: 50 }),
    ).toBe(VERIFY_TO_LIST);
  });

  it("should read a 400 on a buyout not above the start as the buyout refusal", () => {
    expect(
      createListingFailureMessage(apiError(400), { startPrice: 50, buyoutPrice: 50 }),
    ).toBe(BUYOUT_NOT_ABOVE_START);
  });

  it("should still read a 400 on a valid buyout as the end time", () => {
    expect(
      createListingFailureMessage(apiError(400), { startPrice: 50, buyoutPrice: 51 }),
    ).toBe(END_TIME_PASSED);
  });

  it("should use the plain copy the spec gives", () => {
    expect(CANNOT_LIST).toBe(
      "That relic can't be listed right now — it may already be listed.",
    );
    expect(END_TIME_PASSED).toBe(
      "That end time has already passed — check your clock",
    );
    expect(WORN_CANNOT_LIST).toBe("Take it off first — worn relics can't be listed.");
  });
});
