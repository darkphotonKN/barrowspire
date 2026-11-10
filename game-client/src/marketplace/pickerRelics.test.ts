import { describe, expect, it, vi } from "vitest";
import { pickerCards } from "./listRelic";
import { loadPickerRelics } from "./pickerRelics";

describe("loadPickerRelics (FS-50MTX R38)", () => {
  const items = [
    { id: "sword", status: "AVAILABLE", location: "stash" },
    { id: "potion", status: "AVAILABLE", location: "stash" },
  ];

  it("should read the stash with no character, so the Bazaar needs none", async () => {
    const api = { getItemInstances: vi.fn(async () => ({ result: { items } })) };
    expect(await loadPickerRelics(api)).toEqual(items);
    expect(api.getItemInstances).toHaveBeenCalledWith();
  });

  it("should make no loadout read", async () => {
    const getLoadout = vi.fn();
    const api = { getItemInstances: async () => ({ result: { items } }), getLoadout };
    await loadPickerRelics(api);
    expect(getLoadout).not.toHaveBeenCalled();
  });

  it("should read nothing listed as no relics", async () => {
    expect(await loadPickerRelics({ getItemInstances: async () => ({}) })).toEqual([]);
    expect(
      await loadPickerRelics({ getItemInstances: async () => ({ result: { items: null } }) }),
    ).toEqual([]);
  });

  it("should offer no held item, should one come back", async () => {
    const got = await loadPickerRelics({
      getItemInstances: async () => ({
        result: { items: [...items, { id: "worn", status: "AVAILABLE", location: "bag" }] },
      }),
    });
    expect(pickerCards(got).map((c) => c.id)).toEqual(["sword", "potion"]);
  });

  it("should fail when the relics cannot be read", async () => {
    const failing = { getItemInstances: () => Promise.reject(new TypeError("Failed to fetch")) };
    await expect(loadPickerRelics(failing)).rejects.toThrow("Failed to fetch");
  });
});
