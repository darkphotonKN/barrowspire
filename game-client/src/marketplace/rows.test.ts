import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  filterRows,
  rowPrice,
  sortRows,
  type ListingRow,
} from "./rows";

const row = (
  id: string,
  fields: Partial<ListingRow> & { rarity?: string; itemType?: string } = {},
): ListingRow & { id: string } => {
  const { rarity, itemType, ...rest } = fields;
  return {
    id,
    startPrice: 10,
    endsAt: "2026-10-01T13:00:00.000Z",
    item:
      rarity === undefined && itemType === undefined
        ? undefined
        : { rarity, itemType },
    ...rest,
  };
};

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

describe("rowPrice", () => {
  it.each([
    ["the opening price when nobody has bid", row("a", { startPrice: 50 }), 50],
    [
      "the current price once there is a leading bid",
      row("a", { startPrice: 50, currentPrice: 72 }),
      72,
    ],
  ])("should be %s", (_label, r, want) => {
    expect(rowPrice(r)).toBe(want);
  });
});

describe("sortRows", () => {
  const cheapLate = row("cheap-late", {
    startPrice: 5,
    endsAt: "2026-10-01T15:00:00.000Z",
    rarity: "rare",
  });
  const dearSoon = row("dear-soon", {
    startPrice: 10,
    currentPrice: 90,
    endsAt: "2026-10-01T12:30:00.000Z",
    rarity: "normal",
  });
  const midMid = row("mid-mid", {
    startPrice: 40,
    endsAt: "2026-10-01T14:00:00.000Z",
    rarity: "fabled",
  });
  const unknown = row("unknown", {
    startPrice: 40,
    endsAt: "2026-10-02T00:00:00.000Z",
  });
  const rows = [cheapLate, dearSoon, midMid, unknown];

  it.each([
    [
      "time left, soonest first",
      { key: "timeLeft", direction: "asc" },
      ["dear-soon", "mid-mid", "cheap-late", "unknown"],
    ],
    [
      "time left, latest first",
      { key: "timeLeft", direction: "desc" },
      ["unknown", "cheap-late", "mid-mid", "dear-soon"],
    ],
    [
      "price, cheapest first, using the current price when there is one",
      { key: "price", direction: "asc" },
      ["cheap-late", "mid-mid", "unknown", "dear-soon"],
    ],
    [
      "price, dearest first",
      { key: "price", direction: "desc" },
      ["dear-soon", "mid-mid", "unknown", "cheap-late"],
    ],
    [
      "rarity, highest first, an unknown tier last",
      { key: "rarity", direction: "desc" },
      ["mid-mid", "cheap-late", "dear-soon", "unknown"],
    ],
    [
      "rarity, lowest first, an unknown tier first",
      { key: "rarity", direction: "asc" },
      ["unknown", "dear-soon", "cheap-late", "mid-mid"],
    ],
  ] as const)("should order by %s", (_label, sort, want) => {
    expect(ids(sortRows(rows, sort))).toEqual(want);
  });

  it("should keep the loaded order among equals, whichever the direction", () => {
    const a = row("a", { startPrice: 7 });
    const b = row("b", { startPrice: 7 });
    expect(ids(sortRows([a, b], { key: "price", direction: "asc" }))).toEqual([
      "a",
      "b",
    ]);
    expect(ids(sortRows([a, b], { key: "price", direction: "desc" }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("should not reorder the rows it was given", () => {
    const given = [cheapLate, dearSoon];
    sortRows(given, { key: "price", direction: "desc" });
    expect(ids(given)).toEqual(["cheap-late", "dear-soon"]);
  });

  it("should default to time left, ascending", () => {
    expect(DEFAULT_SORT).toEqual({ key: "timeLeft", direction: "asc" });
  });
});

describe("filterRows", () => {
  const sword = row("sword", { rarity: "rare", itemType: "weapon" });
  const helm = row("helm", { rarity: "Fabled", itemType: "Armor" });
  const potion = row("potion", { rarity: "normal", itemType: "consumable" });
  const odd = row("odd", { rarity: "mythic", itemType: "weapon" });
  const missing = row("missing");
  const rows = [sword, helm, potion, odd, missing];

  it.each([
    [
      "nothing when no chip is on",
      {},
      ["sword", "helm", "potion", "odd", "missing"],
    ],
    ["by one rarity", { rarities: ["rare"] }, ["sword"]],
    [
      "by several rarities",
      { rarities: ["rare", "fabled"] },
      ["sword", "helm"],
    ],
    ["by type", { types: ["weapon"] }, ["sword", "odd"]],
    ["by type, whatever its case", { types: ["armor"] }, ["helm"]],
    [
      "by rarity and type together",
      { rarities: ["rare", "normal"], types: ["consumable"] },
      ["potion"],
    ],
    ["to nothing when no row matches", { rarities: ["runed"] }, []],
  ])("should filter %s", (_label, filter, want) => {
    expect(ids(filterRows(rows, filter))).toEqual(want);
  });

  it("should drop an unknown tier and a missing item once a rarity chip is on", () => {
    expect(ids(filterRows(rows, { rarities: ["normal"] }))).not.toContain(
      "odd",
    );
    expect(ids(filterRows(rows, { rarities: ["normal"] }))).not.toContain(
      "missing",
    );
  });
});
