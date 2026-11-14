import { describe, expect, it } from "vitest";
import type {
  ClientGameState,
  EquipmentState,
  ItemState,
  PlayerState,
} from "@/types/gameState";
import { RUN_ACTIONS } from "@/scenes/runActions";
import { healthPotionCount, potionCell, runOwnHud } from "./potions";

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

// FS-QPDKN § Change: The party death flow and the spectate switcher, R168 (the owner, 「左上角的個人血量魔量不用隱藏
// 就顯示死亡時的狀態就好了」): out of the delve the run's own bars and the cell beside them are held as they were
describe("runOwnHud (FS-QPDKN § Change: The party death flow and the spectate switcher, R168)", () => {
  const carrying = equipment({ consumable_1: health, consumable_2: health });
  const fills = (hud: ReturnType<typeof runOwnHud>) => hud.bars.map((b) => [b.channel, b.fill]);

  it("should be hudBars and potionCell while the player is in the delve", () => {
    const state = run(player({ equipment: carrying }));
    const hud = runOwnHud(state, undefined);
    expect(fills(hud)).toEqual([["health", 0.5]]);
    expect(hud.cell).toEqual(potionCell(state));
  });

  it.each([
    ["dead", { current_health: 0 }, 0],
    ["escaped", { escape: true }, 0.5],
  ] as const)("should draw a %s player's bars and cell as that state has them", (_, fields, fill) => {
    const hud = runOwnHud(run(player({ ...fields, equipment: carrying })), undefined);
    expect(fills(hud)).toEqual([["health", fill]]);
    expect(hud.cell).toMatchObject({ count: 2, dimmed: false });
  });

  it("should give back what is held, whatever the state says", () => {
    const held = runOwnHud(run(player({ current_health: 0, equipment: carrying })), undefined);
    expect(runOwnHud(run(player({ current_health: 120 })), held)).toBe(held);
    expect(runOwnHud(run(null), held)).toBe(held);
  });

  it("should draw nothing in the hub, nor before the first state", () => {
    expect(runOwnHud(run(player({ current_health: 0 }), "hub"), undefined)).toEqual({ bars: [], cell: null });
    expect(runOwnHud(run(null), undefined)).toEqual({ bars: [], cell: null });
  });
});
