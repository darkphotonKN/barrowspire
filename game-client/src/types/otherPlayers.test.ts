import { describe, it, expect } from "vitest";
import type { ClientGameState, ItemState } from "./gameState";

/**
 * FS-KE075 §I R51, R54 (ADR-0064): another player's entry carries no bag (`inventory`) and no worn
 * gear (`equipment`), and the type says so, so a read of either fails the typecheck. The player's
 * own `current_player` keeps both. I-KE075-10.
 */

const blade: ItemState = {
  item_id: "t-1",
  entity_id: "e-1",
  name: "Notched Blade",
  quantity: 1,
};

const shown = {
  entity_id: "body-2",
  username: "Ash",
  class: "warrior",
  position: { x: 1, y: 2 },
  direction: { vx: 0, vy: 0, speed: 0 },
  escape: false,
  current_health: 90,
  max_health: 100,
  level: 3,
};

function aState(): ClientGameState {
  return {
    session_id: "s-1",
    world_type: "run",
    current_player: {
      ...shown,
      id: "me",
      inventory: [blade],
      equipment: {
        weapon: blade,
        head: null,
        chest: null,
        gloves: null,
        legs: null,
        ring_1: null,
        ring_2: null,
        consumable_1: null,
        consumable_2: null,
        consumable_3: null,
      },
    },
    other_players: [
      {
        ...shown,
        id: "ash",
        resource: { kind: "stamina", current: 40, max: 100, ability_cost: 20 },
      },
    ],
    items: [],
    doors: [],
    containers: [],
    escape_doors: [],
    switches: [],
    escaped_count: 0,
  };
}

describe("another player's entry (FS-KE075 §I)", () => {
  it("has no bag or worn gear to read", () => {
    const [other] = aState().other_players;
    // @ts-expect-error another player's bag is never sent (R51), so it is not on the type (R54)
    const bag = other.inventory;
    // @ts-expect-error nor their worn gear
    const worn = other.equipment;
    expect(bag).toBeUndefined();
    expect(worn).toBeUndefined();
  });

  it("keeps everything the scenes and party frames read", () => {
    const [other] = aState().other_players;
    expect([
      other.id,
      other.username,
      other.class,
      other.current_health,
      other.level,
    ]).toEqual(["ash", "Ash", "warrior", 90, 3]);
    expect(other.resource?.current).toBe(40);
  });

  it("cannot be built with a bag or worn gear", () => {
    const state = aState();
    // @ts-expect-error an entry with a bag is not an `other_players` entry
    state.other_players = [{ ...shown, id: "ash", inventory: [blade] }];
    expect(state.other_players).toHaveLength(1);
  });

  it("leaves the player's own bag and worn gear on current_player (R52)", () => {
    const me = aState().current_player;
    expect(me?.inventory).toHaveLength(1);
    expect(me?.equipment?.weapon?.name).toBe("Notched Blade");
  });
});
