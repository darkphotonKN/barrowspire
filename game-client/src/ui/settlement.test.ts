import { describe, expect, it } from "vitest";

import type { SettlementPayload } from "@/assets/types/client";
import * as settlement from "./settlement";
import { settlementRecord } from "./settlement";

// FS-GV8WN §G R19–R21: what the settlement record says, from the `settlement` the server sends.

const item = (name: string, quantity = 1) => ({
  item_id: `i-${name}`,
  entity_id: `e-${name}`,
  name,
  quantity,
});

const settled = (
  fields: Partial<SettlementPayload> = {},
): SettlementPayload => ({
  outcome: "escaped",
  carried: [item("Iron Blade"), { ...item("Bone Ring"), found: true }],
  lost: [],
  experience_gained: 120,
  level_before: 3,
  level_after: 3,
  kills: 7,
  seconds_in_run: 725,
  status: "pending",
  ...fields,
});

describe("settlementRecord (FS-GV8WN R19, R21)", () => {
  it.each([
    ["escaped", "Escaped the barrow"],
    ["died", "Fallen in the barrow"],
  ] as const)(
    "should head a record of a player who %s with the outcome",
    (outcome, title) => {
      expect(settlementRecord(settled({ outcome })).title).toBe(title);
    },
  );

  it("should list what was carried home, marking the finds of this delve", () => {
    const record = settlementRecord(settled());
    expect(record.carried).toEqual([
      { name: "Iron Blade" },
      { name: "Bone Ring", mark: { text: "Found", tone: "found" } },
    ]);
  });

  it("should show a stack's count beside its name", () => {
    const record = settlementRecord(
      settled({ carried: [item("Health Potion", 3)] }),
    );
    expect(record.carried).toEqual([{ name: "Health Potion ×3" }]);
  });

  it("should keep a find left in the barrow apart from an item used up, unsafe first", () => {
    const record = settlementRecord(
      settled({
        outcome: "died",
        lost: [
          { ...item("Health Potion"), reason: "consumed" },
          { ...item("Runed Axe"), reason: "unsafe" },
        ],
      }),
    );
    expect(record.lost).toEqual([
      {
        name: "Runed Axe",
        mark: { text: "Kept by the barrow", tone: "unsafe" },
      },
      { name: "Health Potion", mark: { text: "Used up", tone: "consumed" } },
    ]);
  });

  it("should say what was earned, and name a level risen", () => {
    expect(settlementRecord(settled()).earned).toBe(
      "Experience +120 · Level 3",
    );
    expect(settlementRecord(settled({ level_after: 4 })).earned).toBe(
      "Experience +120 · Risen to level 4",
    );
  });

  it("should say the kills and the time in the delve", () => {
    expect(settlementRecord(settled()).delve).toBe(
      "Slain 7 · 12:05 in the delve",
    );
    expect(
      settlementRecord(settled({ kills: 0, seconds_in_run: 3725 })).delve,
    ).toBe("Slain 0 · 1:02:05 in the delve");
  });

  // R21: once pending, delivery is guaranteed: the copy never says the items may be lost
  it("should read settling while pending and settled once confirmed, never warning of loss", () => {
    const pending = settlementRecord(settled()).status;
    const confirmed = settlementRecord(settled({ status: "confirmed" })).status;
    expect(pending).toEqual({ text: "Settling…", tone: "pending" });
    expect(confirmed).toEqual({ text: "Settled", tone: "settled" });
    for (const line of [pending.text, confirmed.text])
      expect(line).not.toMatch(/lose|lost|risk|may|fail/i);
  });

  it("should change only the status between a pending and a confirmed copy of one settlement", () => {
    const pending = settlementRecord(settled());
    const confirmed = settlementRecord(settled({ status: "confirmed" }));
    expect({ ...confirmed, status: pending.status }).toEqual(pending);
  });

  // FS-GV8WN §Change: The settlement record scrolls S1: no cap, no "and n more"
  it("should list every row, with no count of the rest", () => {
    const many = Array.from({ length: 11 }, (_, i) => item(`Relic ${i}`));
    const record = settlementRecord(
      settled({
        carried: many,
        lost: [
          { ...item("Health Potion"), reason: "consumed" },
          { ...item("Runed Axe"), reason: "unsafe" },
          { ...item("Bone Ring"), reason: "unsafe" },
        ],
      }),
    );
    expect(record.carried.map((r) => r.name)).toEqual(many.map((m) => m.name));
    expect(record.lost.map((r) => r.name)).toEqual([
      "Runed Axe",
      "Bone Ring",
      "Health Potion",
    ]);
    expect(record).not.toHaveProperty("carriedMore");
    expect(record).not.toHaveProperty("lostMore");
    expect(settlement).not.toHaveProperty("RECORD_ROWS_SHOWN");
  });

  it("should treat a missing list as empty", () => {
    const record = settlementRecord({
      ...settled(),
      carried: undefined,
      lost: null,
    } as unknown as SettlementPayload);
    expect(record.carried).toEqual([]);
    expect(record.lost).toEqual([]);
  });

  // a value a later server sends that this client does not know claims nothing it cannot vouch for
  it("should head an unknown outcome and mark an unknown loss in neutral words", () => {
    const record = settlementRecord({
      ...settled(),
      outcome: "vanished",
      lost: [{ ...item("Old Lamp"), reason: "stolen" }],
    } as unknown as SettlementPayload);
    expect(record.title).toBe("Out of the delve");
    expect(record.lost[0].mark?.text).toBe("Lost");
    expect(record.title).not.toMatch(/escaped|fallen/i);
    expect(record.lost[0].mark?.text).not.toMatch(/used up|kept/i);
  });
});
