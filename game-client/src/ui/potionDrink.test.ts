import { describe, expect, it } from "vitest";
import type { EquipmentState, ItemState, PlayerState } from "@/types/gameState";
import { PotionDrinkWatcher } from "./potionDrink";

const potion = {
  item_id: "i",
  entity_id: "e",
  name: "Lesser Heal Potion",
  quantity: 1,
  item_type: "consumable",
  healing_amount: 25,
} as ItemState;

const worn = (potions: number): EquipmentState => ({
  weapon: null,
  head: null,
  chest: null,
  gloves: null,
  legs: null,
  ring_1: null,
  ring_2: null,
  consumable_1: potions > 0 ? potion : null,
  consumable_2: potions > 1 ? potion : null,
  consumable_3: potions > 2 ? potion : null,
});

/** The local player with `potions` health potions worn and `hp` health. */
const me = (potions: number, hp: number): PlayerState =>
  ({
    id: "me",
    entity_id: "e_me",
    username: "Aldric",
    class: "mage",
    position: { x: 0, y: 0 },
    direction: { vx: 0, vy: 0, speed: 0 },
    escape: false,
    current_health: hp,
    max_health: 120,
    equipment: worn(potions),
  }) as PlayerState;

/** A step: a state fed to the watcher, or `"forget"` (a run reset). */
type Step = PlayerState | null | "forget";

describe("PotionDrinkWatcher (FS-KZC92 §G R33–R37)", () => {
  it.each<[string, Step[], boolean]>([
    ["a drink (count down, health up) plays", [me(2, 60), me(1, 85)], true],
    ["an unequip (count down, health same) doesn't", [me(2, 60), me(1, 60)], false],
    ["health up with the count the same doesn't", [me(2, 60), me(2, 70)], false],
    ["health up with the count up doesn't", [me(1, 60), me(2, 70)], false],
    ["a refused full-health press (no change) doesn't", [me(2, 120), me(2, 120)], false],
    ["the first state doesn't", [me(1, 85)], false],
    ["the first state after forget() doesn't", [me(2, 60), "forget", me(1, 85)], false],
    [
      "a state with no current_player, then lower count and higher health, doesn't (fresh baseline)",
      [me(2, 60), null, me(1, 85)],
      false,
    ],
    ["heal and damage netting no rise doesn't", [me(2, 60), me(1, 60)], false],
    ["heal and damage netting a fall doesn't", [me(2, 60), me(1, 50)], false],
    ["a heal capped at max health plays", [me(2, 119), me(1, 120)], true],
  ])("%s", (_name, steps, plays) => {
    const watcher = new PotionDrinkWatcher();
    let last = false;
    for (const step of steps) {
      if (step === "forget") watcher.forget();
      else last = watcher.see(step);
    }
    expect(last).toBe(plays);
  });

  it("should compare each state with the one just before it, so two drinks play twice", () => {
    const watcher = new PotionDrinkWatcher();
    const answers = [me(3, 40), me(2, 65), me(2, 65), me(1, 90)].map((s) => watcher.see(s));
    expect(answers).toEqual([false, true, false, true]);
  });

  it("should take a fresh baseline after the state that cleared it", () => {
    const watcher = new PotionDrinkWatcher();
    watcher.see(me(2, 60));
    watcher.see(undefined);
    expect(watcher.see(me(1, 85))).toBe(false);
    expect(watcher.see(me(0, 110))).toBe(true);
  });
});
