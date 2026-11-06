import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/utils/apiError";
import { pickerCards } from "./listRelic";
import { loadPickerRelics, wornIds } from "./pickerRelics";

describe("wornIds", () => {
  it.each([
    ["weaponId"],
    ["headId"],
    ["chestId"],
    ["glovesId"],
    ["legsId"],
    ["ring1Id"],
    ["ring2Id"],
    ["consumable1Id"],
    ["consumable2Id"],
    ["consumable3Id"],
  ])("should count the %s slot as worn", (field) => {
    expect([...wornIds({ [field]: "relic" })]).toEqual(["relic"]);
  });

  it("should skip empty slots and read no loadout as nothing worn", () => {
    expect([...wornIds({ weaponId: "", ring2Id: "ring", memberId: "me", id: "row" })]).toEqual([
      "ring",
    ]);
    expect(wornIds(undefined).size).toBe(0);
  });
});

describe("loadPickerRelics", () => {
  const items = [
    { id: "sword", status: "AVAILABLE", location: "stash" },
    { id: "potion", status: "AVAILABLE", location: "stash" },
  ];
  const api = (loadout: () => Promise<unknown>) => ({
    getItemInstances: vi.fn(async () => ({ result: { items } })),
    getLoadout: vi.fn(loadout) as never,
  });

  it("should read the relics and which of them are worn", async () => {
    const got = await loadPickerRelics(
      api(async () => ({ result: { weaponId: "sword", consumable2Id: "potion" } })),
    );
    expect(got.items).toEqual(items);
    expect([...got.worn].sort()).toEqual(["potion", "sword"]);
  });

  it("should mark nothing worn when the loadout cannot be read, and still list (FS-HBXZN R16)", async () => {
    const got = await loadPickerRelics(
      api(() => Promise.reject(new ApiError({ code: "X", status: 500, detail: "", errors: [] }))),
    );
    expect(got.worn.size).toBe(0);
    expect(pickerCards(got.items, got.worn).map((c) => c.id)).toEqual(["sword", "potion"]);
  });

  it("should fail when the relics cannot be read", async () => {
    const failing = {
      getItemInstances: () => Promise.reject(new TypeError("Failed to fetch")),
      getLoadout: async () => ({ result: {} }),
    };
    await expect(loadPickerRelics(failing)).rejects.toThrow("Failed to fetch");
  });

  it("should read the loadout afresh on every load, so a relic taken off is offered again", async () => {
    const loadouts = [{ weaponId: "sword" }, {}];
    const reader = api(async () => ({ result: loadouts.shift() }));
    const first = await loadPickerRelics(reader);
    const second = await loadPickerRelics(reader);
    expect(reader.getLoadout).toHaveBeenCalledTimes(2);
    expect(pickerCards(first.items, first.worn).map((c) => c.id)).toEqual(["potion"]);
    expect(pickerCards(second.items, second.worn).map((c) => c.id)).toEqual(["sword", "potion"]);
  });
});
