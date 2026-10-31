import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EquipmentSlot,
  EquippedItems,
  ItemState,
} from "@/types/gameState";
import type { ItemInstance } from "@/items/loadoutItem";
import { nothingWorn } from "./EquipmentHud";
import { ApiError } from "@/utils/apiError";
import { BAG_FULL_NOTICE } from "./bag";
import { NOT_FREE_NOTICE, STASH_FULL_NOTICE, type ItemLocation } from "./stash";
import {
  GEAR_BUSY,
  GEAR_CHANGE_FAILED,
  GEAR_LOADING,
  GEAR_LOAD_FAILED,
  HubGear,
  IN_RUN_NOTICE,
  backendSlot,
  loadHubGear,
  type HubGearApi,
  type HubGearPanel,
} from "./HubGear";

const instance = (
  id: string,
  extra: Partial<ItemInstance> = {},
): ItemInstance =>
  ({
    id,
    name: id,
    template_id: `t-${id}`,
    affixes: [],
    ...extra,
  }) as ItemInstance;

/** A promise the test settles by hand, so what is in flight can be looked at. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The REST calls as the hub makes them: instances, loadout, rarities, and the slot update. */
function fakeApi(
  instances: ItemInstance[] = [],
  loadout: Record<string, string> = {},
  rarities: { id: string; name: string }[] = [],
) {
  const api = {
    getItemInstances: vi.fn(async () => ({ result: { items: instances } })),
    getLoadout: vi.fn(async () => ({ result: loadout })),
    getItemRarities: vi.fn(async () => ({ result: rarities })),
    updateLoadout: vi.fn(async (_slot: string, _id: string | null) => ({
      result: {},
    })),
    moveItemInstance: vi.fn(
      async (
        id: string,
        location: ItemLocation,
      ): Promise<{ result: object }> => ({
        result: { id, location },
      }),
    ),
  };
  return api as typeof api & HubGearApi;
}

const ids = (items: readonly ItemState[]) => items.map((i) => i.entity_id);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadHubGear (FS-HRH2J R41)", () => {
  it("should put the loadout's ids in their slots and every other instance in the bag, in REST order", async () => {
    const api = fakeApi(
      [
        instance("ring"),
        instance("sword"),
        instance("cloak"),
        instance("helm"),
        instance("potion"),
      ],
      { weaponId: "sword", headId: "helm", chestId: "cloak", ring2Id: "ring" },
    );

    const { equipped, bag } = await loadHubGear(api);

    expect(equipped.weapon?.entity_id).toBe("sword");
    expect(equipped.head?.entity_id).toBe("helm");
    expect(equipped.body?.entity_id).toBe("cloak");
    expect(equipped.ring_2?.entity_id).toBe("ring");
    expect(equipped.ring_1).toBeNull();
    expect(ids(bag)).toEqual(["potion"]);
  });

  it("should put bag items not worn in the bag and stash items not worn in the stash, in REST order (FS-VPD8Y R27)", async () => {
    const api = fakeApi(
      [
        instance("s1", { location: "stash" }),
        instance("b1", { location: "bag" }),
        instance("sword", { location: "stash" }),
        instance("s2", { location: "stash" }),
        instance("helm", { location: "bag" }),
        instance("b2", { location: "bag" }),
      ],
      { weaponId: "sword", headId: "helm" },
    );

    const { equipped, bag, stash } = await loadHubGear(api);

    expect(equipped.weapon?.entity_id).toBe("sword");
    expect(equipped.head?.entity_id).toBe("helm");
    expect(ids(bag)).toEqual(["b1", "b2"]);
    expect(ids(stash)).toEqual(["s1", "s2"]);
  });

  it("should put an instance with no location in the bag, as an older gateway sends it (FS-VPD8Y R28)", async () => {
    const api = fakeApi([
      instance("old"),
      instance("s1", { location: "stash" }),
      instance("b1", { location: "bag" }),
    ]);

    const { bag, stash } = await loadHubGear(api);

    expect(ids(bag)).toEqual(["old", "b1"]);
    expect(ids(stash)).toEqual(["s1"]);
  });

  it("should map every backend slot name to its overlay slot", async () => {
    const names = [
      "weapon",
      "head",
      "chest",
      "gloves",
      "legs",
      "ring1",
      "ring2",
      "c1",
      "c2",
      "c3",
    ];
    const api = fakeApi(
      names.map((n) => instance(n)),
      {
        weaponId: "weapon",
        headId: "head",
        chestId: "chest",
        glovesId: "gloves",
        legsId: "legs",
        ring1Id: "ring1",
        ring2Id: "ring2",
        consumable1Id: "c1",
        consumable2Id: "c2",
        consumable3Id: "c3",
      },
    );

    const { equipped, bag } = await loadHubGear(api);

    const worn = Object.fromEntries(
      Object.entries(equipped).map(([slot, item]) => [slot, item?.entity_id]),
    );
    expect(worn).toEqual({
      weapon: "weapon",
      head: "head",
      body: "chest",
      hands: "gloves",
      feet: "legs",
      ring_1: "ring1",
      ring_2: "ring2",
      consumable_1: "c1",
      consumable_2: "c2",
      consumable_3: "c3",
    });
    expect(bag).toEqual([]);
  });

  it("should keep every unworn item past 30, dropping none (R23, R44)", async () => {
    const owned = Array.from({ length: 34 }, (_, i) => instance(`i${i}`));
    const { bag } = await loadHubGear(fakeApi(owned));
    expect(ids(bag)).toEqual(owned.map((o) => o.id));
  });

  it("should name rarities when they come, and load without them when they fail", async () => {
    const api = fakeApi([instance("sword", { rarity_id: "r1" })], {}, [
      { id: "r1", name: "rare" },
    ]);
    expect((await loadHubGear(api)).bag[0].rarity).toBe("rare");

    api.getItemRarities.mockRejectedValueOnce(new Error("down"));
    const { bag } = await loadHubGear(api);
    expect(ids(bag)).toEqual(["sword"]);
    expect(bag[0].rarity).toBeUndefined();
  });

  it("should ignore a loadout id the instances do not hold", async () => {
    const { equipped, bag } = await loadHubGear(
      fakeApi([instance("sword")], { weaponId: "gone" }),
    );
    expect(equipped.weapon).toBeNull();
    expect(ids(bag)).toEqual(["sword"]);
  });
});

describe("backendSlot (FS-HRH2J R42)", () => {
  it.each([
    ["body", "chest"],
    ["hands", "gloves"],
    ["feet", "legs"],
    ["weapon", "weapon"],
    ["ring_2", "ring_2"],
    ["consumable_3", "consumable_3"],
  ] as [EquipmentSlot, string][])("should send %s as %s", (slot, backend) => {
    expect(backendSlot(slot)).toBe(backend);
  });
});

/** The overlay as the hub drives it: what it was handed, and its open state. */
function fakePanel() {
  const panel = {
    visible: false,
    /** Open at the stash chest: the left panel is the stash (FS-VPD8Y R35). */
    stashMode: false,
    stash: [] as ItemState[],
    status: undefined as string | undefined,
    statuses: [] as (string | undefined)[],
    inventory: [] as ItemState[],
    equipped: nothingWorn() as EquippedItems,
    onEquip: undefined as HubGearPanel["onEquip"],
    onUnequip: undefined as HubGearPanel["onUnequip"],
    mayEquip: undefined as HubGearPanel["mayEquip"],
    mayUnequip: undefined as HubGearPanel["mayUnequip"],
    onMove: undefined as HubGearPanel["onMove"],
    mayMove: undefined as HubGearPanel["mayMove"],
    toggle: vi.fn(() => {
      panel.visible = !panel.visible;
      panel.stashMode = false;
    }),
    hide: vi.fn(() => {
      panel.visible = false;
      panel.stashMode = false;
    }),
    openStash: vi.fn(() => {
      if (panel.visible) return;
      panel.visible = true;
      panel.stashMode = true;
      panel.stash = [];
    }),
    isStashOpen: () => panel.visible && panel.stashMode,
    updateStash: vi.fn((items: ItemState[]) => {
      panel.stash = [...items];
    }),
    isVisible: () => panel.visible,
    /** The panels cover the left half of the screen, in this stand-in. */
    covers: (x: number) => panel.visible && x < 100,
    handleEquipKey: vi.fn(),
    updateInventory: vi.fn((items: ItemState[]) => {
      panel.inventory = [...items];
    }),
    updateEquipment: vi.fn((worn: EquippedItems) => {
      panel.equipped = { ...worn };
    }),
    setCharacterLevel: vi.fn(),
    updateCharacter: vi.fn(),
    setStatus: vi.fn((line: string | undefined) => {
      panel.status = line;
      panel.statuses.push(line);
    }),
  };
  return panel;
}

/** `count` unworn bag items, b0, b1, ... */
const bagOf = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    instance(`b${i}`, { location: "bag" }),
  );

/**
 * An unequip as the overlay makes it: asked first, then drawn and handed on; whether it went
 * ahead. The fake panel does not draw, so it is only the hand-off here.
 */
function unequip(
  panel: ReturnType<typeof fakePanel>,
  slot: EquipmentSlot,
): boolean {
  const item = panel.equipped[slot] as ItemState;
  if (panel.mayUnequip && !panel.mayUnequip(item)) return false;
  panel.onUnequip?.(item, slot);
  return true;
}

/** An equip as the overlay makes it: asked first, then drawn and handed on; whether it went ahead. */
function equip(
  panel: ReturnType<typeof fakePanel>,
  item: ItemState,
  slot: EquipmentSlot,
): boolean {
  if (panel.mayEquip && !panel.mayEquip(item, slot)) return false;
  panel.onEquip?.(item, slot);
  return true;
}

/**
 * A move as the overlay makes it in stash mode: asked first, then drawn and handed on; whether
 * it went ahead (FS-VPD8Y R38–39).
 */
function moveItem(
  panel: ReturnType<typeof fakePanel>,
  item: ItemState,
  to: ItemLocation,
): boolean {
  if (panel.mayMove && !panel.mayMove(item, to)) return false;
  panel.onMove?.(item, to);
  return true;
}

/** Lets every settled promise's callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function hubGearOnStage(
  instances: ItemInstance[] = [],
  loadout: Record<string, string> = {},
) {
  const panel = fakePanel();
  const api = fakeApi(instances, loadout);
  const notice = vi.fn();
  // a refused load or change is logged; the test reads what the player sees
  vi.spyOn(console, "error").mockImplementation(() => {});
  const gear = new HubGear(panel, api, { notice });
  return { panel, api, notice, gear };
}

describe("HubGear (FS-HRH2J §E R40–44)", () => {
  it("should open at once with a loading line, then fill the gear and bag from REST", async () => {
    const { gear, panel, api } = hubGearOnStage(
      [instance("sword"), instance("helm")],
      { weaponId: "sword" },
    );
    const instances = deferred<{ result: { items: ItemInstance[] } }>();
    api.getItemInstances.mockReturnValueOnce(instances.promise);

    gear.toggle();

    expect(gear.isOpen()).toBe(true);
    expect(panel.status).toBe(GEAR_LOADING);
    instances.resolve({
      result: { items: [instance("sword"), instance("helm")] },
    });
    await settle();
    expect(panel.status).toBeUndefined();
    expect(panel.equipped.weapon?.entity_id).toBe("sword");
    expect(ids(panel.inventory)).toEqual(["helm"]);
  });

  it("should load again on every open (R41)", async () => {
    const { gear, api } = hubGearOnStage();
    gear.toggle();
    await settle();
    gear.toggle();
    gear.toggle();
    await settle();
    expect(api.getItemInstances).toHaveBeenCalledTimes(2);
    expect(api.getLoadout).toHaveBeenCalledTimes(2);
  });

  it("should show an error line when the load fails, and try again on the next open (R43)", async () => {
    const { gear, panel, api } = hubGearOnStage([instance("sword")]);
    api.getLoadout.mockRejectedValueOnce(new Error("down"));

    gear.toggle();
    await settle();
    expect(panel.status).toBe(GEAR_LOAD_FAILED);

    gear.toggle();
    gear.toggle();
    await settle();
    expect(panel.status).toBeUndefined();
    expect(ids(panel.inventory)).toEqual(["sword"]);
  });

  it("should send an equip as updateLoadout with the backend slot, busy until it answers (R42)", async () => {
    const { gear, panel, api } = hubGearOnStage([instance("cloak")]);
    gear.toggle();
    await settle();
    const call = deferred<{ result: object }>();
    api.updateLoadout.mockReturnValueOnce(call.promise);

    const cloak = panel.inventory[0];
    panel.onEquip?.(cloak, "body");

    expect(api.updateLoadout).toHaveBeenCalledWith("chest", "cloak");
    expect(panel.status).toBe(GEAR_BUSY);
    call.resolve({ result: {} });
    await settle();
    expect(panel.status).toBeUndefined();
    // optimistic: no reload after a change the server took
    expect(api.getItemInstances).toHaveBeenCalledTimes(1);
  });

  it("should send an unequip as updateLoadout with no id while the bag has room (R42)", async () => {
    const owned = bagOf(29);
    const { gear, panel, api, notice } = hubGearOnStage(
      [...owned, instance("helm", { location: "bag" })],
      { headId: "helm" },
    );
    gear.toggle();
    await settle();

    expect(unequip(panel, "head")).toBe(true);

    expect(api.updateLoadout).toHaveBeenCalledWith("head", null);
    expect(notice).not.toHaveBeenCalled();
  });

  it.each([30, 31])(
    "should send no unequip and say the bag is full with %i in the bag (FS-VPD8Y R29)",
    async (count) => {
      const { gear, panel, api, notice } = hubGearOnStage(
        [...bagOf(count), instance("helm", { location: "bag" })],
        { headId: "helm" },
      );
      gear.toggle();
      await settle();

      expect(unequip(panel, "head")).toBe(false);

      expect(api.updateLoadout).not.toHaveBeenCalled();
      expect(notice).toHaveBeenCalledWith(BAG_FULL_NOTICE);
      expect(panel.status).toBeUndefined();
    },
  );

  it("should not count stash items toward a full bag (FS-VPD8Y R29)", async () => {
    const stashed = Array.from({ length: 40 }, (_, i) =>
      instance(`s${i}`, { location: "stash" }),
    );
    const { gear, panel, api } = hubGearOnStage(
      [...stashed, instance("helm", { location: "stash" })],
      { headId: "helm" },
    );
    gear.toggle();
    await settle();

    expect(unequip(panel, "head")).toBe(true);
    expect(api.updateLoadout).toHaveBeenCalledWith("head", null);
  });

  it("should always send a swap, even with a full bag (FS-VPD8Y R29)", async () => {
    const { gear, panel, api, notice } = hubGearOnStage(
      [...bagOf(30), instance("helm", { location: "bag" })],
      { headId: "helm" },
    );
    gear.toggle();
    await settle();

    panel.onEquip?.(panel.inventory[0], "head");

    expect(api.updateLoadout).toHaveBeenCalledWith("head", "b0");
    expect(notice).not.toHaveBeenCalled();
  });

  it("should count the bag as the changes it sent leave it (FS-VPD8Y R29)", async () => {
    const { gear, panel, api, notice } = hubGearOnStage(
      [
        ...bagOf(29),
        instance("helm", { location: "bag" }),
        instance("ring", { location: "bag" }),
      ],
      { headId: "helm", ring1Id: "ring" },
    );
    gear.toggle();
    await settle();

    expect(unequip(panel, "head")).toBe(true);
    await settle();
    expect(unequip(panel, "ring_1")).toBe(false);
    expect(notice).toHaveBeenCalledWith(BAG_FULL_NOTICE);

    // an equip into an empty slot takes one out of the bag, so there is room again
    panel.onEquip?.(panel.inventory[0], "weapon");
    await settle();
    expect(unequip(panel, "ring_1")).toBe(true);
    expect(api.updateLoadout).toHaveBeenCalledTimes(3);
  });

  it("should send one change at a time, ignoring a second while the first is in flight", async () => {
    const { gear, panel, api } = hubGearOnStage([instance("a"), instance("b")]);
    gear.toggle();
    await settle();
    api.updateLoadout.mockReturnValueOnce(
      deferred<{ result: object }>().promise,
    );

    panel.onEquip?.(panel.inventory[0], "weapon");
    panel.onEquip?.(panel.inventory[1], "head");

    expect(api.updateLoadout).toHaveBeenCalledTimes(1);
  });

  it("should say so and reload from REST when a change fails (R43)", async () => {
    const { gear, panel, api, notice } = hubGearOnStage([instance("sword")]);
    gear.toggle();
    await settle();
    api.updateLoadout.mockRejectedValueOnce(new Error("refused"));

    panel.onEquip?.(panel.inventory[0], "weapon");
    await settle();

    expect(notice).toHaveBeenCalledWith(GEAR_CHANGE_FAILED);
    expect(api.getItemInstances).toHaveBeenCalledTimes(2);
    expect(panel.equipped.weapon).toBeNull();
    expect(ids(panel.inventory)).toEqual(["sword"]);
  });

  it("should say the bag is full and reload when the server refuses with BAG_FULL (FS-VPD8Y R29)", async () => {
    const { gear, panel, api, notice } = hubGearOnStage(
      [instance("helm", { location: "bag" })],
      { headId: "helm" },
    );
    gear.toggle();
    await settle();
    api.updateLoadout.mockRejectedValueOnce(
      new ApiError({
        code: "BAG_FULL",
        status: 400,
        detail: "bag full",
        errors: [],
      }),
    );

    expect(unequip(panel, "head")).toBe(true);
    await settle();

    expect(notice).toHaveBeenCalledWith(BAG_FULL_NOTICE);
    expect(notice).not.toHaveBeenCalledWith(GEAR_CHANGE_FAILED);
    expect(api.getItemInstances).toHaveBeenCalledTimes(2);
    expect(panel.equipped.head?.entity_id).toBe("helm");
  });

  it("should say the item is not free and reload when the server refuses an equip with ITEM_NOT_AVAILABLE (FS-18Z5F story 14)", async () => {
    const { gear, panel, api, notice } = hubGearOnStage([instance("sword")]);
    gear.toggle();
    await settle();
    api.updateLoadout.mockRejectedValueOnce(
      new ApiError({
        code: "ITEM_NOT_AVAILABLE",
        status: 409,
        detail: "listed",
        errors: [],
      }),
    );

    panel.onEquip?.(panel.inventory[0], "weapon");
    await settle();

    expect(notice).toHaveBeenCalledWith(NOT_FREE_NOTICE);
    expect(notice).not.toHaveBeenCalledWith(GEAR_CHANGE_FAILED);
    expect(api.getItemInstances).toHaveBeenCalledTimes(2);
    expect(panel.equipped.weapon).toBeNull();
    expect(ids(panel.inventory)).toEqual(["sword"]);
  });

  it("should keep the generic words for any other coded refusal (FS-HRH2J R43)", async () => {
    const { gear, panel, api, notice } = hubGearOnStage([instance("sword")]);
    gear.toggle();
    await settle();
    api.updateLoadout.mockRejectedValueOnce(
      new ApiError({
        code: "SERVICE_UNAVAILABLE",
        status: 503,
        detail: "down",
        errors: [],
      }),
    );

    panel.onEquip?.(panel.inventory[0], "weapon");
    await settle();

    expect(notice).toHaveBeenCalledWith(GEAR_CHANGE_FAILED);
    expect(api.getItemInstances).toHaveBeenCalledTimes(2);
  });

  it("should let a change finish after the overlay closes, and reload after it on the next open (edge state)", async () => {
    const { gear, panel, api } = hubGearOnStage([instance("sword")]);
    gear.toggle();
    await settle();
    const call = deferred<{ result: object }>();
    api.updateLoadout.mockReturnValueOnce(call.promise);
    panel.onEquip?.(panel.inventory[0], "weapon");

    expect(gear.hide()).toBe(true);
    gear.toggle();
    // the load waits for the change, so it never reads gear from before it
    await settle();
    expect(api.getItemInstances).toHaveBeenCalledTimes(1);
    expect(panel.status).toBe(GEAR_BUSY);

    call.resolve({ result: {} });
    await settle();
    expect(api.getItemInstances).toHaveBeenCalledTimes(2);
    expect(panel.status).toBeUndefined();
  });

  it("should drop a load that lands after the overlay was closed and opened again", async () => {
    const { gear, panel, api } = hubGearOnStage();
    const stale = deferred<{ result: { items: ItemInstance[] } }>();
    api.getItemInstances.mockReturnValueOnce(stale.promise);
    gear.toggle();
    gear.toggle();
    api.getItemInstances.mockResolvedValueOnce({
      result: { items: [instance("fresh")] },
    });
    gear.toggle();
    await settle();

    stale.resolve({ result: { items: [instance("stale")] } });
    await settle();
    expect(ids(panel.inventory)).toEqual(["fresh"]);
  });

  it("should hand E to the panel only while open", () => {
    const { gear, panel } = hubGearOnStage();
    expect(gear.equipKey()).toBe(false);
    gear.toggle();
    expect(gear.equipKey()).toBe(true);
    expect(panel.handleEquipKey).toHaveBeenCalledTimes(1);
  });

  it("should close only when open, saying whether it did", () => {
    const { gear } = hubGearOnStage();
    expect(gear.hide()).toBe(false);
    gear.toggle();
    expect(gear.hide()).toBe(true);
    expect(gear.isOpen()).toBe(false);
  });

  it("should hand the player's state and level to the stats panel (R24)", () => {
    const { gear, panel } = hubGearOnStage();
    const me = { username: "Ignis", class: "mage", level: 4 };
    gear.updateCharacter(me);
    gear.setCharacterLevel(4);
    expect(panel.updateCharacter).toHaveBeenCalledWith(me);
    expect(panel.setCharacterLevel).toHaveBeenCalledWith(4);
  });

  it("should cover a point over the open overlay's panels only, never while closed (R8)", () => {
    const { gear } = hubGearOnStage();
    expect(gear.covers(10, 10)).toBe(false);
    gear.toggle();
    expect(gear.covers(10, 10)).toBe(true);
    expect(gear.covers(400, 10)).toBe(false);
  });
});

describe("HubGear at the stash chest (FS-VPD8Y §F R35–37)", () => {
  const stocked = [
    instance("sword", { location: "bag" }),
    instance("s1", { location: "stash" }),
    instance("b1", { location: "bag" }),
    instance("s2", { location: "stash" }),
  ];

  it("should open the overlay in stash mode and fill the stash, the bag and the gear from REST", async () => {
    const { gear, panel } = hubGearOnStage(stocked, { weaponId: "sword" });

    expect(gear.openStash()).toBe(true);

    expect(gear.isOpen()).toBe(true);
    expect(gear.stashOpen()).toBe(true);
    expect(panel.status).toBe(GEAR_LOADING);
    await settle();
    expect(panel.status).toBeUndefined();
    expect(ids(panel.stash)).toEqual(["s1", "s2"]);
    expect(ids(panel.inventory)).toEqual(["b1"]);
    expect(panel.equipped.weapon?.entity_id).toBe("sword");
  });

  it("should leave an open overlay as it is, loading nothing (R34: E stays the overlay's)", async () => {
    const { gear, api } = hubGearOnStage(stocked);
    gear.toggle();
    await settle();

    expect(gear.openStash()).toBe(false);
    await settle();
    expect(gear.stashOpen()).toBe(false);
    expect(api.getItemInstances).toHaveBeenCalledTimes(1);
  });

  it("should show the error line when the stash's load fails, and retry on reopening (edge state)", async () => {
    const { gear, panel, api } = hubGearOnStage(stocked);
    api.getItemInstances.mockRejectedValueOnce(new Error("down"));

    gear.openStash();
    await settle();
    expect(panel.status).toBe(GEAR_LOAD_FAILED);

    gear.hide();
    gear.openStash();
    await settle();
    expect(panel.status).toBeUndefined();
    expect(ids(panel.stash)).toEqual(["s1", "s2"]);
  });

  it("should end stash mode on closing, the next I or B a plain open (R37)", async () => {
    const { gear } = hubGearOnStage(stocked);
    gear.openStash();
    await settle();
    gear.toggle();
    expect(gear.stashOpen()).toBe(false);
    gear.toggle();
    expect(gear.isOpen()).toBe(true);
    expect(gear.stashOpen()).toBe(false);
  });

  it("should count the bag without the stash, so a full-bag pre-check reads the bag alone (FS-VPD8Y R29)", async () => {
    const { gear, panel, api } = hubGearOnStage(
      [
        instance("helm", { location: "bag" }),
        ...Array.from({ length: 40 }, (_, i) =>
          instance(`s${i}`, { location: "stash" }),
        ),
      ],
      { headId: "helm" },
    );
    gear.openStash();
    await settle();
    expect(unequip(panel, "head")).toBe(true);
    expect(api.updateLoadout).toHaveBeenCalledWith("head", null);
  });
});

describe("HubGear moving items between bag and stash (FS-VPD8Y §F R38–42)", () => {
  const stashOf = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      instance(`s${i}`, { location: "stash" }),
    );

  async function stashOpen(
    instances: ItemInstance[],
    loadout: Record<string, string> = {},
  ) {
    const stage = hubGearOnStage(instances, loadout);
    stage.gear.openStash();
    await settle();
    return stage;
  }

  it("should send a bag item to the stash as one moveItemInstance, busy until it answers (R38, R41)", async () => {
    const { panel, api, notice } = await stashOpen([
      instance("b1", { location: "bag" }),
    ]);
    const pending = deferred<{ result: object }>();
    api.moveItemInstance.mockReturnValueOnce(pending.promise);

    expect(moveItem(panel, panel.inventory[0], "stash")).toBe(true);

    expect(api.moveItemInstance).toHaveBeenCalledTimes(1);
    expect(api.moveItemInstance).toHaveBeenCalledWith("b1", "stash");
    expect(api.updateLoadout).not.toHaveBeenCalled();
    expect(panel.status).toBe(GEAR_BUSY);
    pending.resolve({ result: {} });
    await settle();
    expect(panel.status).toBeUndefined();
    expect(notice).not.toHaveBeenCalled();
  });

  it("should send a stash item to the bag (R38)", async () => {
    const { panel, api } = await stashOpen([
      instance("s1", { location: "stash" }),
    ]);

    expect(moveItem(panel, panel.stash[0], "bag")).toBe(true);

    expect(api.moveItemInstance).toHaveBeenCalledWith("s1", "bag");
  });

  it("should not send a move into a bag of 30, saying the bag is full (R39)", async () => {
    const { panel, api, notice } = await stashOpen([
      ...bagOf(30),
      instance("s1", { location: "stash" }),
    ]);

    expect(moveItem(panel, panel.stash[0], "bag")).toBe(false);

    expect(notice).toHaveBeenCalledWith(BAG_FULL_NOTICE);
    expect(api.moveItemInstance).not.toHaveBeenCalled();
  });

  it("should not send a move into a stash of 60, saying the stash is full (R39)", async () => {
    const { panel, api, notice } = await stashOpen([
      ...stashOf(60),
      instance("b1", { location: "bag" }),
    ]);

    expect(moveItem(panel, panel.inventory[0], "stash")).toBe(false);

    expect(notice).toHaveBeenCalledWith(STASH_FULL_NOTICE);
    expect(api.moveItemInstance).not.toHaveBeenCalled();
  });

  it("should let a move out of an over-full stash go (user story 21)", async () => {
    const { panel, api } = await stashOpen(stashOf(64));

    expect(moveItem(panel, panel.stash[0], "bag")).toBe(true);
    expect(api.moveItemInstance).toHaveBeenCalledWith("s0", "bag");
  });

  it.each([
    ["LISTED", "stash"],
    ["PENDING_SETTLEMENT", "bag"],
    ["IN_ESCROW", "stash"],
  ] as const)(
    "should not send a move of a %s item from the %s, saying it is not free to move (R39)",
    async (status, from) => {
      const { panel, api, notice } = await stashOpen([
        instance("x", { location: from, status }),
      ]);
      const item = from === "bag" ? panel.inventory[0] : panel.stash[0];

      expect(moveItem(panel, item, from === "bag" ? "stash" : "bag")).toBe(
        false,
      );

      expect(notice).toHaveBeenCalledWith(NOT_FREE_NOTICE);
      expect(api.moveItemInstance).not.toHaveBeenCalled();
    },
  );

  it("should send one move at a time, ignoring a second while the first is in flight (R41)", async () => {
    const { panel, api } = await stashOpen([
      instance("b1", { location: "bag" }),
      instance("b2", { location: "bag" }),
    ]);
    api.moveItemInstance.mockReturnValueOnce(
      deferred<{ result: object }>().promise,
    );

    moveItem(panel, panel.inventory[0], "stash");
    moveItem(panel, panel.inventory[1], "stash");
    unequip(panel, "head");

    expect(api.moveItemInstance).toHaveBeenCalledTimes(1);
    expect(api.updateLoadout).not.toHaveBeenCalled();
  });

  it("should count the bag and the stash as the moves it sent leave them (R39)", async () => {
    const { panel, api, notice } = await stashOpen(
      [...bagOf(30), instance("helm", { location: "bag" }), ...stashOf(59)],
      { headId: "helm" },
    );
    // the bag is full: nothing comes off
    expect(unequip(panel, "head")).toBe(false);

    // one bag item into the stash leaves room in the bag and fills the stash
    expect(moveItem(panel, panel.inventory[0], "stash")).toBe(true);
    await settle();
    expect(moveItem(panel, panel.inventory[1], "stash")).toBe(false);
    expect(notice).toHaveBeenLastCalledWith(STASH_FULL_NOTICE);
    expect(unequip(panel, "head")).toBe(true);
    await settle();

    // the bag is full again, so nothing comes out of the stash
    expect(moveItem(panel, panel.stash[0], "bag")).toBe(false);
    expect(notice).toHaveBeenLastCalledWith(BAG_FULL_NOTICE);
    expect(api.moveItemInstance).toHaveBeenCalledTimes(1);
    expect(api.updateLoadout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["BAG_FULL", BAG_FULL_NOTICE],
    ["STASH_FULL", STASH_FULL_NOTICE],
    ["ITEM_NOT_AVAILABLE", NOT_FREE_NOTICE],
    ["ITEM_WORN", NOT_FREE_NOTICE],
    ["NOT_FOUND", NOT_FREE_NOTICE],
    ["SERVICE_UNAVAILABLE", GEAR_CHANGE_FAILED],
    ["UNKNOWN_ERROR", GEAR_CHANGE_FAILED],
  ])(
    "should show the notice for a %s refusal and reload gear, bag and stash (R42)",
    async (code, words) => {
      const { panel, api, notice } = await stashOpen([
        instance("b1", { location: "bag" }),
        instance("s1", { location: "stash" }),
      ]);
      api.moveItemInstance.mockRejectedValueOnce(
        new ApiError({ code, status: 400, detail: "refused", errors: [] }),
      );

      moveItem(panel, panel.inventory[0], "stash");
      await settle();

      expect(notice).toHaveBeenCalledTimes(1);
      expect(notice).toHaveBeenCalledWith(words);
      expect(api.getItemInstances).toHaveBeenCalledTimes(2);
      expect(ids(panel.inventory)).toEqual(["b1"]);
      expect(ids(panel.stash)).toEqual(["s1"]);
      expect(gearStashStillOpen(panel)).toBe(true);
    },
  );

  it("should show the generic notice for a refusal that is not an ApiError (R42)", async () => {
    const { panel, api, notice } = await stashOpen([
      instance("b1", { location: "bag" }),
    ]);
    api.moveItemInstance.mockRejectedValueOnce(new Error("offline"));

    moveItem(panel, panel.inventory[0], "stash");
    await settle();

    expect(notice).toHaveBeenCalledWith(GEAR_CHANGE_FAILED);
    expect(api.getItemInstances).toHaveBeenCalledTimes(2);
  });

  it("should let a move finish after the overlay closes, the next open reloading after it (edge state: in flight on close)", async () => {
    const { gear, panel, api } = await stashOpen([
      instance("b1", { location: "bag" }),
    ]);
    const pending = deferred<{ result: object }>();
    api.moveItemInstance.mockReturnValueOnce(pending.promise);
    moveItem(panel, panel.inventory[0], "stash");

    gear.hide();
    gear.openStash();
    await settle();
    expect(api.getItemInstances).toHaveBeenCalledTimes(1);
    pending.resolve({ result: {} });
    await settle();
    expect(api.getItemInstances).toHaveBeenCalledTimes(2);
  });
});

/** Whether the fake overlay is still open in stash mode. */
function gearStashStillOpen(panel: ReturnType<typeof fakePanel>): boolean {
  return panel.isStashOpen();
}

describe("HubGear with items still in a delve (FS-18Z5F R38)", () => {
  const inDelve = (id: string, location: "bag" | "stash" = "bag") =>
    instance(id, { location, status: "IN_RUN" });

  it("should send no equip for an IN_RUN bag item, saying it is still in a delve", async () => {
    const { gear, panel, api, notice } = hubGearOnStage([inDelve("cloak")]);
    gear.toggle();
    await settle();

    expect(equip(panel, panel.inventory[0], "body")).toBe(false);

    expect(api.updateLoadout).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(IN_RUN_NOTICE);
    expect(panel.status).toBeUndefined();
  });

  it("should send no unequip for a worn IN_RUN item", async () => {
    const { gear, panel, api, notice } = hubGearOnStage([inDelve("helm")], {
      headId: "helm",
    });
    gear.toggle();
    await settle();

    expect(unequip(panel, "head")).toBe(false);

    expect(api.updateLoadout).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(IN_RUN_NOTICE);
  });

  it("should send no equip that would take a worn IN_RUN item off", async () => {
    const { gear, panel, api, notice } = hubGearOnStage(
      [inDelve("helm"), instance("cap", { location: "bag" })],
      { headId: "helm" },
    );
    gear.toggle();
    await settle();

    expect(equip(panel, panel.inventory[0], "head")).toBe(false);

    expect(api.updateLoadout).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(IN_RUN_NOTICE);
  });

  it("should still send an equip of a free item into an empty slot", async () => {
    const { gear, panel, api } = hubGearOnStage(
      [inDelve("helm"), instance("cloak", { location: "bag" })],
      { headId: "helm" },
    );
    gear.toggle();
    await settle();

    expect(equip(panel, panel.inventory[0], "body")).toBe(true);

    expect(api.updateLoadout).toHaveBeenCalledWith("chest", "cloak");
  });

  it.each([
    ["bag", "stash"],
    ["stash", "bag"],
  ] as const)(
    "should send no move of an IN_RUN %s item, saying it is still in a delve",
    async (from, to) => {
      const { gear, panel, api, notice } = hubGearOnStage([
        inDelve("relic", from),
      ]);
      gear.openStash();
      await settle();
      const relic = from === "bag" ? panel.inventory[0] : panel.stash[0];

      expect(moveItem(panel, relic, to)).toBe(false);

      expect(api.moveItemInstance).not.toHaveBeenCalled();
      expect(notice).toHaveBeenCalledWith(IN_RUN_NOTICE);
    },
  );
});
