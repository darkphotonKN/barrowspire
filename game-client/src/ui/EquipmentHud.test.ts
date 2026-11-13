import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/assets/types/client";
import type { EquipmentState, ItemState } from "@/types/gameState";
import { EquipmentHud, type HudPanel } from "./EquipmentHud";
import { BAG_CAPACITY, BAG_FULL_NOTICE } from "./bag";

const item = (id: string, extra: Partial<ItemState> = {}) => ({ entity_id: id, name: id, ...extra }) as ItemState;

const NOTHING_WORN: EquipmentState = {
  weapon: null,
  head: null,
  chest: null,
  gloves: null,
  legs: null,
  ring_1: null,
  ring_2: null,
  consumable_1: null,
  consumable_2: null,
  consumable_3: null,
};

/** The run's equipment panel as a recording stand-in. */
function panel() {
  let inventory = false;
  let character = false;
  const p = {
    onEquip: undefined as HudPanel["onEquip"],
    onUnequip: undefined as HudPanel["onUnequip"],
    mayUnequip: undefined as HudPanel["mayUnequip"],
    covers: vi.fn((x: number) => x > 500),
    toggle: vi.fn(() => void (inventory = !inventory)),
    toggleCharacter: vi.fn(() => void (character = !character)),
    hide: vi.fn(() => void ((inventory = false), (character = false))),
    isVisible: () => inventory || character,
    isInventoryOpen: () => inventory,
    isCharacterOpen: () => character,
    handleEquipKey: vi.fn(),
    updateInventory: vi.fn(),
    updateEquipment: vi.fn(),
    setCharacterLevel: vi.fn(),
    updateCharacter: vi.fn(),
  };
  return p;
}

function hud(now = () => 5000) {
  const p = panel();
  const send = vi.fn();
  const notice = vi.fn();
  const gearChanged = vi.fn();
  const equipment = new EquipmentHud(p, { send, notice, gearChanged }, now);
  return { p, send, notice, gearChanged, equipment };
}

describe("EquipmentHud (FS-X2F2H §Requirements 56: the run's equip HUD, shared)", () => {
  it("should send the run's equip message and wear the item at once", () => {
    const { p, send, equipment } = hud();
    const sword = item("sword");
    equipment.sync({ inventory: [sword], equipment: NOTHING_WORN });

    p.onEquip?.(sword, "weapon");

    expect(send.mock.calls).toEqual([[ActionType.Equip, { item_entity_id: "sword" }]]);
    expect(equipment.equipped.weapon).toBe(sword);
    expect(equipment.inventory).toEqual([]);
  });

  it("should send the run's unequip message and put the item back in the inventory", () => {
    const { p, send, equipment } = hud();
    const helm = item("helm");
    equipment.sync({ inventory: [], equipment: { ...NOTHING_WORN, head: helm } });

    p.onUnequip?.(helm, "head");

    expect(send.mock.calls).toEqual([[ActionType.Unequip, { item_entity_id: "helm" }]]);
    expect(equipment.equipped.head).toBeNull();
    expect(equipment.inventory).toEqual([helm]);
  });

  it("should map the server's chest, gloves and legs onto the panel's body, hands and feet", () => {
    const { equipment } = hud();
    const [chest, gloves, legs] = [item("chest"), item("gloves"), item("legs")];

    equipment.sync({ equipment: { ...NOTHING_WORN, chest, gloves, legs } });

    expect(equipment.equipped).toMatchObject({ body: chest, hands: gloves, feet: legs });
  });

  it("should fill the panel with the inventory and the worn gear when it opens, and only then", () => {
    const { p, equipment } = hud();
    const ring = item("ring");
    equipment.sync({ inventory: [ring], equipment: NOTHING_WORN });
    expect(p.updateInventory).not.toHaveBeenCalled();

    equipment.toggle();

    expect(equipment.isOpen()).toBe(true);
    expect(p.updateInventory).toHaveBeenLastCalledWith([ring]);
    expect(p.updateEquipment).toHaveBeenCalled();

    equipment.sync({ inventory: [], equipment: NOTHING_WORN });
    expect(p.updateInventory).toHaveBeenLastCalledWith([]);
  });

  it("should hold an item taken but not yet in the server's inventory while its loot is pending", () => {
    let now = 5000;
    const { equipment } = hud(() => now);
    const coin = item("coin");

    equipment.taken(coin);
    equipment.sync({ inventory: [] });
    expect(equipment.inventory.map((i) => i.entity_id)).toEqual(["coin"]);

    now = 6001;
    equipment.sync({ inventory: [] });
    expect(equipment.inventory).toEqual([]);
  });

  it("should take the server's copy of a pending item once the server has it", () => {
    const { equipment } = hud();
    equipment.taken(item("coin"));

    equipment.sync({ inventory: [item("coin", { quantity: 3 })] });

    expect(equipment.inventory).toEqual([{ ...item("coin", { quantity: 3 }), lootedAt: undefined }]);
  });

  it("should give E to the panel only while it is open", () => {
    const { p, equipment } = hud();

    expect(equipment.equipKey()).toBe(false);
    expect(p.handleEquipKey).not.toHaveBeenCalled();

    equipment.toggle();
    expect(equipment.equipKey()).toBe(true);
    expect(p.handleEquipKey).toHaveBeenCalledTimes(1);
  });

  it("should close on hide, and forget everything on reset", () => {
    const { p, equipment } = hud();
    equipment.sync({ inventory: [item("a")], equipment: { ...NOTHING_WORN, head: item("h") } });
    equipment.toggle();

    expect(equipment.hide()).toBe(true);
    expect(equipment.hide()).toBe(false);
    expect(p.hide).toHaveBeenCalled();

    equipment.reset();
    expect(equipment.inventory).toEqual([]);
    expect(equipment.equipped.head).toBeNull();
  });

  it("should put the item an equip swaps out at the end of the bag (FS-HRH2J R16)", () => {
    const { p, equipment } = hud();
    const [old, a, b] = [item("old"), item("a"), item("b")];
    equipment.sync({ inventory: [a, b], equipment: { ...NOTHING_WORN, weapon: old } });

    p.onEquip?.(a, "weapon");

    expect(equipment.inventory.map((i) => i.entity_id)).toEqual(["b", "old"]);
    expect(equipment.equipped.weapon).toBe(a);
  });

  it("should send no point over a closed overlay to it, and every point over an open panel (FS-HRH2J R8)", () => {
    const { equipment } = hud();
    expect(equipment.covers(600, 10)).toBe(false);

    equipment.toggle();
    expect(equipment.covers(600, 10)).toBe(true);
    expect(equipment.covers(100, 10)).toBe(false);
  });
});

describe("EquipmentHud character (FS-HRH2J R24, R30: the stats panel reads the world state)", () => {
  it("should hand every state's player to the panel, open or closed, so it opens on the latest", () => {
    const { p, equipment } = hud();
    const me = { username: "Ignis", class: "mage", level: 3, current_health: 60, max_health: 100 };

    equipment.updateCharacter(me);

    expect(p.updateCharacter).toHaveBeenLastCalledWith(me);
  });
});

describe("EquipmentHud full bag (FS-HRH2J R20–22; edge states: Bag exactly full, Pending pickups)", () => {
  const bag = (n: number) => Array.from({ length: n }, (_, i) => item(`i${i}`));

  it("should refuse an unequip into a full bag with the notice, and send nothing", () => {
    const { p, send, notice, equipment } = hud();
    equipment.sync({ inventory: bag(BAG_CAPACITY), equipment: { ...NOTHING_WORN, head: item("helm") } });

    expect(p.mayUnequip?.(item("helm"))).toBe(false);
    expect(notice).toHaveBeenCalledWith(BAG_FULL_NOTICE);
    expect(send).not.toHaveBeenCalled();
  });

  it("should allow an unequip with room, and say nothing", () => {
    const { p, notice, equipment } = hud();
    equipment.sync({ inventory: bag(BAG_CAPACITY - 1), equipment: NOTHING_WORN });

    expect(p.mayUnequip?.(item("helm"))).toBe(true);
    expect(notice).not.toHaveBeenCalled();
  });

  it("should still send an equip swap at full: it is net-zero", () => {
    const { p, send, equipment } = hud();
    const full = bag(BAG_CAPACITY);
    equipment.sync({ inventory: full, equipment: { ...NOTHING_WORN, weapon: item("old") } });

    p.onEquip?.(full[0], "weapon");

    expect(send).toHaveBeenCalledWith(ActionType.Equip, { item_entity_id: "i0" });
    expect(equipment.inventory).toHaveLength(BAG_CAPACITY);
  });

  it("should count pending pickups, so two quick takes at 29 allow one", () => {
    const { notice, equipment } = hud();
    equipment.sync({ inventory: bag(BAG_CAPACITY - 1) });

    expect(equipment.roomForOne()).toBe(true);
    equipment.taken(item("first"));
    expect(equipment.roomForOne()).toBe(false);
    expect(notice).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledWith(BAG_FULL_NOTICE);
  });
});

// FS-AND39 R7: item_swap plays as each change the player makes is sent, one per change
describe("EquipmentHud gear change sound (FS-AND39 R7)", () => {
  it("should say a change was made as an equip is sent", () => {
    const { p, send, gearChanged, equipment } = hud();
    const sword = item("sword");
    equipment.sync({ inventory: [sword], equipment: NOTHING_WORN });

    p.onEquip?.(sword, "weapon");

    expect(send).toHaveBeenCalledTimes(1);
    expect(gearChanged).toHaveBeenCalledTimes(1);
  });

  it("should say it once for a swap, though the worn item goes back to the bag", () => {
    const { p, gearChanged, equipment } = hud();
    const sword = item("sword");
    equipment.sync({ inventory: [sword], equipment: { ...NOTHING_WORN, weapon: item("old") } });

    p.onEquip?.(sword, "weapon");

    expect(gearChanged).toHaveBeenCalledTimes(1);
  });

  it("should say a change was made as an unequip is sent", () => {
    const { p, send, gearChanged, equipment } = hud();
    const helm = item("helm");
    equipment.sync({ inventory: [], equipment: { ...NOTHING_WORN, head: helm } });

    p.onUnequip?.(helm, "head");

    expect(send).toHaveBeenCalledTimes(1);
    expect(gearChanged).toHaveBeenCalledTimes(1);
  });

  it("should say nothing for an unequip refused for room, which the panel never hands on", () => {
    const { p, send, gearChanged, equipment } = hud();
    const helm = item("helm");
    equipment.sync({
      inventory: Array.from({ length: BAG_CAPACITY }, (_, i) => item(`i${i}`)),
      equipment: { ...NOTHING_WORN, head: helm },
    });

    // the overlay asks first and hands on only what may go
    if (p.mayUnequip?.(helm)) p.onUnequip?.(helm, "head");

    expect(send).not.toHaveBeenCalled();
    expect(gearChanged).not.toHaveBeenCalled();
  });

  it("should still send with no sound hook", () => {
    const p = panel();
    const send = vi.fn();
    new EquipmentHud(p, { send, notice: vi.fn() });

    p.onEquip?.(item("sword"), "weapon");

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("EquipmentHud purse line (FS-7TGZ3 §C R8: every open reads the purse, in a run and a field)", () => {
  it("should read the purse each time the overlay opens, and not on closing", () => {
    const p = panel();
    const purse = { refresh: vi.fn(), forget: vi.fn() };
    const equipment = new EquipmentHud(p, { send: vi.fn(), notice: vi.fn() }, () => 0, purse);

    equipment.toggle();
    expect(purse.refresh).toHaveBeenCalledTimes(1);
    equipment.toggle();
    expect(equipment.hide()).toBe(false);
    expect(purse.refresh).toHaveBeenCalledTimes(1);
    equipment.toggle();
    expect(purse.refresh).toHaveBeenCalledTimes(2);
  });

  it("should let a purse read in flight go on release, so its answer draws nothing", () => {
    const purse = { refresh: vi.fn(), forget: vi.fn() };
    const equipment = new EquipmentHud(panel(), { send: vi.fn(), notice: vi.fn() }, () => 0, purse);
    equipment.toggle();

    equipment.release();

    expect(purse.forget).toHaveBeenCalledTimes(1);
  });

  it("should release without a purse", () => {
    const equipment = new EquipmentHud(panel(), { send: vi.fn(), notice: vi.fn() });
    expect(() => equipment.release()).not.toThrow();
  });
});

// FS-HRH2J § Change: Character and inventory apart (C1–C3, C5, C7, C10). I-3EBCA-4.
describe("EquipmentHud, the character panel apart (FS-HRH2J § Change C1–C10)", () => {
  it("should open the character panel alone with the worn gear for its From gear, reading no purse (C1, C10)", () => {
    const p = panel();
    const purse = { refresh: vi.fn(), forget: vi.fn() };
    const equipment = new EquipmentHud(p, { send: vi.fn(), notice: vi.fn() }, () => 0, purse);
    const helm = item("helm");
    equipment.sync({ inventory: [], equipment: { ...NOTHING_WORN, head: helm } });

    expect(equipment.toggleCharacter()).toBe(true);
    expect(p.toggleCharacter).toHaveBeenCalledTimes(1);
    expect(p.toggle).not.toHaveBeenCalled();
    expect(p.updateEquipment).toHaveBeenLastCalledWith(expect.objectContaining({ head: helm }));
    expect(purse.refresh).not.toHaveBeenCalled();
    expect(equipment.isOpen()).toBe(true);

    expect(equipment.toggleCharacter()).toBe(false);
    expect(equipment.isOpen()).toBe(false);
  });

  it("should say whether the inventory opened, and read the purse only then, the character panel open or not (C10)", () => {
    const p = panel();
    const purse = { refresh: vi.fn(), forget: vi.fn() };
    const equipment = new EquipmentHud(p, { send: vi.fn(), notice: vi.fn() }, () => 0, purse);
    equipment.toggleCharacter();

    expect(equipment.toggle()).toBe(true);
    expect(purse.refresh).toHaveBeenCalledTimes(1);
    // closing the inventory with the character panel still up is no open
    expect(equipment.toggle()).toBe(false);
    expect(purse.refresh).toHaveBeenCalledTimes(1);
    expect(equipment.isOpen()).toBe(true);
  });

  it("should give E to the panel only while the inventory is open, never to the character panel alone (C7)", () => {
    const { p, equipment } = hud();
    equipment.toggleCharacter();
    expect(equipment.equipKey()).toBe(false);
    expect(p.handleEquipKey).not.toHaveBeenCalled();
    equipment.toggle();
    expect(equipment.equipKey()).toBe(true);
  });

  it("should close both on hide and say it closed something (C3)", () => {
    const { p, equipment } = hud();
    equipment.toggleCharacter();
    expect(equipment.hide()).toBe(true);
    expect(p.isVisible()).toBe(false);
    expect(equipment.hide()).toBe(false);
  });

  // the scene's window state for the interface sounds (FS-WDM0X S8): which panel, not only whether either
  it("should say which of the two is open, each apart", () => {
    const { equipment } = hud();
    const open = () => [equipment.isInventoryOpen(), equipment.isCharacterOpen()];
    expect(open()).toEqual([false, false]);
    equipment.toggleCharacter();
    expect(open()).toEqual([false, true]);
    equipment.toggle();
    expect(open()).toEqual([true, true]);
    equipment.toggleCharacter();
    expect(open()).toEqual([true, false]);
    equipment.hide();
    expect(open()).toEqual([false, false]);
  });
});
