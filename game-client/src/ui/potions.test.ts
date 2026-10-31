import { describe, expect, it } from "vitest";
import type {
  ClientGameState,
  EquipmentState,
  ItemState,
  PlayerState,
} from "@/types/gameState";
import { RUN_ACTIONS } from "@/scenes/runActions";
import { healthPotionCount, potionCell } from "./potions";

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

const player = (fields: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: "me",
    entity_id: "e_me",
    username: "Aldric",
    class: "mage",
    position: { x: 0, y: 0 },
    direction: { vx: 0, vy: 0, speed: 0 },
    escape: false,
    current_health: 60,
    max_health: 120,
    ...fields,
  }) as PlayerState;

const run = (
  me: PlayerState | null,
  world_type: ClientGameState["world_type"] = "run",
): Pick<ClientGameState, "world_type" | "current_player"> => ({
  world_type,
  current_player: me,
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

describe("potionCell (FS-P9G8R R23–R26)", () => {
  it("should show the count and the drink key read from the drinkPotion mapping", () => {
    const view = potionCell(
      run(
        player({
          equipment: equipment({ consumable_1: health, consumable_2: health }),
        }),
      ),
    );
    expect(view).toEqual({
      count: 2,
      keyLabel: `[${RUN_ACTIONS.drinkPotion.label}]`,
      dimmed: false,
    });
  });

  it("should label the key [1]", () => {
    expect(potionCell(run(player()))?.keyLabel).toBe("[1]");
  });

  it("should stay up, dimmed and reading 0, with no health potion", () => {
    expect(
      potionCell(run(player({ equipment: equipment({ consumable_1: mana }) }))),
    ).toEqual({ count: 0, keyLabel: "[1]", dimmed: true });
  });

  it("should follow each state: a drunk potion's emptied slot lowers the count", () => {
    const before = potionCell(
      run(
        player({
          equipment: equipment({ consumable_1: health, consumable_2: health }),
        }),
      ),
    );
    const after = potionCell(
      run(player({ equipment: equipment({ consumable_2: health }) })),
    );
    expect([before?.count, after?.count]).toEqual([2, 1]);
  });

  it.each([
    [
      "in the hub",
      run(player({ equipment: equipment({ consumable_1: health }) }), "hub"),
    ],
    ["before the player's first state", run(null)],
    ["once the player has escaped", run(player({ escape: true }))],
    ["once the player is dead", run(player({ current_health: 0 }))],
  ])("should be down %s, as the resource bars are", (_, state) => {
    expect(potionCell(state)).toBeNull();
  });
});
