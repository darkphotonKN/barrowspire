import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { BROWSE_UNREACHABLE } from "./browse";
import {
  CANNOT_LIST,
  DURATIONS,
  END_TIME_PASSED,
  LIST_FAILED,
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
  const cards = pickerCards([
    { id: "sword", name: "Longsword", status: "AVAILABLE", attack_power: 12, critical_rate: 0.05 },
    { id: "helm", name: "Iron Helm", status: "LISTED", defense_rating: 4 },
    { id: "ring", name: "Ring", status: "IN_ESCROW" },
    { id: "odd", name: "Odd", status: "DESTROYED" as "AVAILABLE" },
    { id: "old", name: "Old Dagger" },
    { name: "No id" },
  ]);

  it("should make one card per instance with an id", () => {
    expect(cards.map((c) => c.id)).toEqual(["sword", "helm", "ring", "odd", "old"]);
  });

  it.each([
    ["sword", true, undefined],
    ["helm", false, "Listed"],
    ["ring", false, "In escrow"],
    ["odd", false, "Unavailable"],
    ["old", true, undefined],
  ])("should let %s be chosen: %s, tagged %s", (id, selectable, tag) => {
    const card = cards.find((c) => c.id === id)!;
    expect(card.selectable).toBe(selectable);
    expect(card.tag).toBe(tag);
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
    expect(pickerCards([{ id: "x" }])[0].name).toBe("Unknown relic");
  });
});

describe("canSubmitListing", () => {
  const cards = pickerCards([
    { id: "sword", status: "AVAILABLE" },
    { id: "helm", status: "LISTED" },
  ]);
  const ok = { cards, selectedId: "sword", priceText: "50", submitting: false };

  it("should allow a chosen available relic at a valid price", () => {
    expect(canSubmitListing(ok)).toBe(true);
  });

  it.each([
    ["nothing is chosen", { selectedId: undefined }],
    ["the chosen relic is listed", { selectedId: "helm" }],
    ["the chosen relic is gone", { selectedId: "gone" }],
    ["the price is not a whole number of 1 or more", { priceText: "0" }],
    ["a listing is already on its way", { submitting: true }],
  ])("should refuse when %s", (_l, change) => {
    expect(canSubmitListing({ ...ok, ...change })).toBe(false);
  });
});

describe("createListingFailureMessage", () => {
  const apiError = (status: number) =>
    new ApiError({ code: "X", status, detail: "", errors: [] });

  it.each([
    ["a 500, the item-side refusal", apiError(500), CANNOT_LIST],
    ["a 400, an end time already past", apiError(400), END_TIME_PASSED],
    ["a 503", apiError(503), BROWSE_UNREACHABLE],
    ["a network failure", new TypeError("Failed to fetch"), BROWSE_UNREACHABLE],
    ["a 422", apiError(422), LIST_FAILED],
  ])("should map %s", (_l, err, want) => {
    expect(createListingFailureMessage(err)).toBe(want);
  });

  it("should use the plain copy the spec gives", () => {
    expect(CANNOT_LIST).toBe(
      "That relic can't be listed right now — it may already be listed.",
    );
    expect(END_TIME_PASSED).toBe(
      "That end time has already passed — check your clock",
    );
  });
});
