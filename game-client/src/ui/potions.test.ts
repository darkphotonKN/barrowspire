import { describe, expect, it } from "vitest";
import type { EquipmentState, ItemState } from "@/types/gameState";
import { drinksFromBag, healthPotionCount, drinkRefusal } from "./potions";

const item = (fields: Partial<ItemState>): ItemState =>
  ({
    item_id: "i",
    entity_id: "e",
    name: "Potion",
    quantity: 1,
    item_type: "consumable",
    ...fields,
  }) as ItemState;

const health = item({ name: "Lesser Heal Potion", healing_amount: 25 });
const mana = item({ name: "Mana Potion", mana_amount: 30 });

const equipment = (slots: Partial<EquipmentState> = {}): EquipmentState => ({
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
  ...slots,
});

describe("healthPotionCount (FS-P9G8R R23)", () => {
  it.each([
    ["no equipment on the wire", undefined, 0],
    ["empty consumable slots", equipment(), 0],
    [
      "three health potions",
      equipment({
        consumable_1: health,
        consumable_2: health,
        consumable_3: health,
      }),
      3,
    ],
    [
      "health + mana + empty",
      equipment({ consumable_1: health, consumable_2: mana }),
      1,
    ],
    [
      "mana potions only",
      equipment({ consumable_1: mana, consumable_3: mana }),
      0,
    ],
    [
      "a health potion in the last slot",
      equipment({ consumable_3: health }),
      1,
    ],
    [
      "a potion that heals and restores mana (counts by its healing, R1)",
      equipment({
        consumable_2: item({ healing_amount: 10, mana_amount: 10 }),
      }),
      1,
    ],
    [
      "a healing item worn outside the consumable slots",
      equipment({ weapon: item({ healing_amount: 5 }) }),
      0,
    ],
  ])("should count %s", (_, worn, want) => {
    expect(healthPotionCount(worn)).toBe(want);
  });
});

// FS-9JV5K §F R24 (I-9JV5K-5): the antidote is drunk from the bag
describe("drinksFromBag (FS-9JV5K §F R24)", () => {
  it("should drink an antidote from the bag, by the icon resolver's own rule", () => {
    expect(drinksFromBag(item({ name: "Antidote" }))).toBe(true);
  });

  it.each([
    ["a health potion, worn to the belt instead", health],
    ["a mana potion", mana],
    ["a sword", item({ name: "Rusted Sword", weapon_type: "sword", item_type: "weapon" })],
  ])("should not drink %s from the bag", (_, it_) => expect(drinksFromBag(it_)).toBe(false));
});

describe("drinkRefusal (FS-9JV5K §F R24)", () => {
  it.each([
    ["not_poisoned", "You are not poisoned."],
    ["not_in_bag", "That is no longer in your bag."],
    ["not_usable", "That cannot be drunk."],
  ])("should say %s as %j", (reason, line) => expect(drinkRefusal({ success: false, reason })).toBe(line));

  it("should say nothing on a success", () => expect(drinkRefusal({ success: true })).toBeNull());

  it("should fall back to the server's words, then to its own, for a reason it does not know", () => {
    expect(drinkRefusal({ success: false, reason: "cursed", message: "that item is cursed" })).toBe("That item is cursed.");
    expect(drinkRefusal({ success: false })).toBe("That cannot be drunk.");
  });
});
