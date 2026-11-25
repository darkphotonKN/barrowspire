import { describe, expect, it } from "vitest";
import type { EquipmentState, ItemState } from "@/types/gameState";
import { DrinkInFlight, bagDrink, drinksFromBag, healthPotionCount, drinkRefusal } from "./potions";

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

  // FS-9JV5K §Change: The Restoring Draught D6 (I-9JV5K-7): the draught, drunk from the bag as the antidote is
  it("should drink a Restoring Draught from the bag, by the icon resolver's own rule", () => {
    expect(drinksFromBag(item({ name: "Restoring Draught" }))).toBe(true);
  });
});

describe("bagDrink (FS-9JV5K §F R24; §Change: The Restoring Draught D6)", () => {
  it.each([
    ["an antidote", item({ name: "Antidote" }), "antidote"],
    ["a Restoring Draught", item({ name: "Restoring Draught" }), "restoring_draught"],
    ["a health potion", health, null],
  ])("should name what %s is drunk as", (_, it_, want) => expect(bagDrink(it_)).toBe(want));
});

describe("drinkRefusal (FS-9JV5K §F R24)", () => {
  it.each([
    ["not_poisoned", "You are not poisoned."],
    ["not_in_bag", "That is no longer in your bag."],
    ["not_usable", "That cannot be drunk."],
    // §Change: The Restoring Draught D6: stamina, mana and parry charges alike
    ["resource_full", "You are already full."],
  ])("should say %s as %j", (reason, line) => expect(drinkRefusal({ success: false, reason })).toBe(line));

  it("should say nothing on a success", () => expect(drinkRefusal({ success: true })).toBeNull());

  it("should fall back to the server's words, then to its own, for a reason it does not know", () => {
    expect(drinkRefusal({ success: false, reason: "cursed", message: "that item is cursed" })).toBe("That item is cursed.");
    expect(drinkRefusal({ success: false })).toBe("That cannot be drunk.");
  });
});

// FS-9JV5K §F R24: one drink at a time, the antidote held until the server answers it
describe("DrinkInFlight", () => {
  const bag = (...ids: string[]) => ids.map((entity_id) => ({ entity_id }));

  it("should send the first Drink and nothing for a second while its antidote is still in the bag", () => {
    const drinking = new DrinkInFlight();
    expect(drinking.press("antidote-1", "antidote")).toBe(true);
    drinking.see(bag("antidote-1"));
    expect(drinking.press("antidote-1", "antidote")).toBe(false);
    expect(drinking.press("antidote-2", "antidote")).toBe(false);
  });

  it("should let a Drink go again once a state's bag has dropped the drunk antidote", () => {
    const drinking = new DrinkInFlight();
    drinking.press("antidote-1", "antidote");
    drinking.see(bag("antidote-2"));
    expect(drinking.press("antidote-2", "antidote")).toBe(true);
  });

  it("should let the same antidote be drunk again after a refusal, which left it in the bag", () => {
    const drinking = new DrinkInFlight();
    drinking.press("antidote-1", "antidote");
    drinking.refused();
    expect(drinking.press("antidote-1", "antidote")).toBe(true);
  });

  // §Change: The Restoring Draught D6: the success reply names no item, so the drink it answers is the last one sent
  it("should remember what the last drink sent was, through the state that drops it, for its success to show", () => {
    const drinking = new DrinkInFlight();
    expect(drinking.drunk()).toBeUndefined();
    drinking.press("draught-1", "restoring_draught");
    drinking.see(bag());
    expect(drinking.drunk()).toBe("restoring_draught");
    drinking.press("antidote-1", "antidote");
    expect(drinking.drunk()).toBe("antidote");
    drinking.reset();
    expect(drinking.drunk()).toBeUndefined();
  });

  it("should forget the drink on reset (a new run)", () => {
    const drinking = new DrinkInFlight();
    drinking.press("antidote-1", "antidote");
    drinking.reset();
    expect(drinking.press("antidote-1", "antidote")).toBe(true);
  });
});
