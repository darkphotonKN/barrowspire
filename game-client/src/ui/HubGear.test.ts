import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EquipmentSlot,
  EquippedItems,
  ItemState,
} from "@/types/gameState";
import type { ItemInstance } from "@/items/loadoutItem";
import { nothingWorn } from "./EquipmentHud";
import {
  GEAR_BUSY,
  GEAR_CHANGE_FAILED,
  GEAR_LOADING,
  GEAR_LOAD_FAILED,
  HubGear,
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
    status: undefined as string | undefined,
    statuses: [] as (string | undefined)[],
    inventory: [] as ItemState[],
    equipped: nothingWorn() as EquippedItems,
    onEquip: undefined as HubGearPanel["onEquip"],
    onUnequip: undefined as HubGearPanel["onUnequip"],
    mayUnequip: undefined as (() => boolean) | undefined,
    toggle: vi.fn(() => {
      panel.visible = !panel.visible;
    }),
    hide: vi.fn(() => {
      panel.visible = false;
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

  it("should send an unequip as updateLoadout with no id, and never pre-check the bag (R42, R44)", async () => {
    const owned = Array.from({ length: 31 }, (_, i) => instance(`i${i}`));
    const { gear, panel, api } = hubGearOnStage([...owned, instance("helm")], {
      headId: "helm",
    });
    gear.toggle();
    await settle();

    expect(panel.mayUnequip).toBeUndefined();
    panel.onUnequip?.(panel.equipped.head as ItemState, "head");

    expect(api.updateLoadout).toHaveBeenCalledWith("head", null);
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
