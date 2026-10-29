import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/assets/types/client";
import type { ContainerState, ItemState } from "@/types/gameState";
import { RESERVED_PILE_ALPHA } from "@/render/world/dropPile";
import { CHEST_OPEN_WINDOW_MS, FieldPiles, PILE_REACH, type PileSatchel, type PileStage } from "./fieldPiles";
import { lootRefusalCopy } from "./fieldRefusals";

const ME = "me";
const item = (id: string) => ({ entity_id: id }) as ItemState;

function pile(id: string, x: number, reserved_for?: string, items = [item(`${id}-item`)]): ContainerState {
  return {
    container_id: `c-${id}`,
    entity_id: id,
    kind: "drop_pile",
    position: { x, y: 0 },
    is_open: true,
    items,
    reserved_for,
  };
}

/** The piles with a recording stage, satchel and port. */
function piles() {
  const sprites = new Map<string, { alpha: number; destroyed: boolean; at: { x: number; y: number } }>();
  let placed = 0;
  const stage: PileStage = {
    placeChest: () => {
      throw new Error("replaced below");
    },
    place: (at: { x: number; y: number }) => {
      const sprite = { alpha: 1, destroyed: false, at };
      sprites.set(String(placed++), sprite);
      return {
        setAlpha: (a: number) => void (sprite.alpha = a),
        destroy: () => void (sprite.destroyed = true),
        moveTo: (to: { x: number; y: number }) => void (sprite.at = to),
      };
    },
  };
  const chests = new Map<string, { frames: boolean[]; destroyed: boolean; at: { x: number; y: number } }>();
  stage.placeChest = (at: { x: number; y: number }) => {
    const chest = { frames: [] as boolean[], destroyed: false, at };
    chests.set(String(placed++), chest);
    return {
      show: (isOpen: boolean) => void chest.frames.push(isOpen),
      destroy: () => void (chest.destroyed = true),
    };
  };
  let openFor: string | undefined;
  const satchel: PileSatchel & { items: readonly ItemState[] } = {
    items: [],
    get entityId() {
      return openFor;
    },
    open: (id) => void (openFor = id),
    close: () => void (openFor = undefined),
    setItems(items) {
      this.items = items;
    },
  };
  const notices: string[] = [];
  const send = vi.fn();
  let now = 10_000;
  const fp = new FieldPiles(stage, satchel, { notice: (t) => notices.push(t), send }, () => now);
  const live = () => [...sprites.values()].filter((s) => !s.destroyed);
  const liveChests = () => [...chests.values()].filter((c) => !c.destroyed);
  const wait = (ms: number) => void (now += ms);
  return { fp, satchel, notices, send, live, liveChests, wait };
}

describe("FieldPiles drawing (FS-X2F2H §Requirements 56, 59)", () => {
  it("should draw someone else's reserved pile dimmed, and mine and open piles as a run's", () => {
    const { fp, live } = piles();
    fp.sync([pile("theirs", 0, "killer"), pile("mine", 100, ME), pile("open", 200)], ME);

    expect(live().map((s) => s.alpha)).toEqual([RESERVED_PILE_ALPHA, 1, 1]);
  });

  it("should brighten a pile once its window ends", () => {
    const { fp, live } = piles();
    fp.sync([pile("p", 0, "killer")], ME);
    fp.sync([pile("p", 0)], ME);

    expect(live()).toHaveLength(1);
    expect(live()[0].alpha).toBe(1);
  });

  it("should draw no emptied pile, and let a pile go once the state drops it", () => {
    const { fp, live } = piles();
    fp.sync([pile("p", 0), pile("empty", 50, undefined, [])], ME);
    expect(live()).toHaveLength(1);

    fp.sync([], ME);
    expect(live()).toHaveLength(0);
  });
});

describe("FieldPiles pickup (FS-X2F2H §Requirements 33, 59, 60)", () => {
  it("should open my pile's satchel within reach, with its items", () => {
    const { fp, satchel } = piles();
    fp.sync([pile("mine", 10, ME)], ME);

    expect(fp.interact({ x: 0, y: 0 })).toBe(true);
    expect(satchel.entityId).toBe("mine");
    expect(satchel.items).toEqual([item("mine-item")]);
  });

  it("should not offer someone else's reserved pile: the loot_reserved words, and no satchel", () => {
    const { fp, satchel, notices, send } = piles();
    fp.sync([pile("theirs", 10, "killer")], ME);

    expect(fp.interact({ x: 0, y: 0 })).toBe(true);
    expect(satchel.entityId).toBeUndefined();
    expect(notices).toEqual([lootRefusalCopy("loot_reserved")]);
    expect(send).not.toHaveBeenCalled();
  });

  it("should offer nothing out of reach", () => {
    const { fp, satchel } = piles();
    fp.sync([pile("far", PILE_REACH + 1)], ME);

    expect(fp.interact({ x: 0, y: 0 })).toBe(false);
    expect(satchel.entityId).toBeUndefined();
  });

  it("should close the satchel on a second press, as a run's coffer", () => {
    const { fp, satchel } = piles();
    fp.sync([pile("open", 10)], ME);
    fp.interact({ x: 0, y: 0 });
    fp.interact({ x: 0, y: 0 });

    expect(satchel.entityId).toBeUndefined();
  });

  it("should send a loot from an offered pile as the run does", () => {
    const { fp, send } = piles();
    fp.sync([pile("open", 10)], ME);
    fp.interact({ x: 0, y: 0 });
    fp.loot(item("open-item"));

    expect(send).toHaveBeenCalledWith(ActionType.Interact, { entity_id: "open-item" });
  });

  it("should say why in its own words when the server refuses a reserved pickup, and nothing for other refusals", () => {
    const { fp, notices } = piles();
    fp.refused("loot_reserved");
    fp.refused("something_else");
    fp.refused(undefined);

    expect(notices).toEqual([lootRefusalCopy("loot_reserved")]);
  });

  it("should close the satchel when the pile goes or is walked away from", () => {
    const { fp, satchel } = piles();
    fp.sync([pile("p", 10)], ME);
    fp.interact({ x: 0, y: 0 });
    fp.follow({ x: 10 + PILE_REACH + 1, y: 0 });
    expect(satchel.entityId).toBeUndefined();

    fp.interact({ x: 0, y: 0 });
    fp.sync([], ME);
    expect(satchel.entityId).toBeUndefined();
  });

  it("should keep the open satchel's items in step with the state", () => {
    const { fp, satchel } = piles();
    fp.sync([pile("p", 10, undefined, [item("a"), item("b")])], ME);
    fp.interact({ x: 0, y: 0 });
    fp.sync([pile("p", 10, undefined, [item("b")])], ME);

    expect(satchel.items).toEqual([item("b")]);
  });

  it("should forget every pile on release", () => {
    const { fp, satchel, live } = piles();
    fp.sync([pile("p", 10)], ME);
    fp.interact({ x: 0, y: 0 });
    fp.release();

    expect(live()).toHaveLength(0);
    expect(satchel.entityId).toBeUndefined();
    expect(fp.interact({ x: 0, y: 0 })).toBe(false);
  });
});

/** A Forest clearing chest as the broadcast carries it: never reserved, its items once open. */
function chest(id: string, x: number, is_open = false, items: ItemState[] = []): ContainerState {
  return { container_id: `c-${id}`, entity_id: id, kind: "chest", position: { x, y: 0 }, is_open, items };
}

describe("FieldPiles chests (FS-3QHQZ §Requirements 19, 20)", () => {
  it("should draw a chest where the server put it, its frame from is_open on every state", () => {
    const { fp, liveChests } = piles();
    fp.sync([chest("c", 80)], ME);
    fp.sync([chest("c", 80, true, [item("a")])], ME);

    expect(liveChests()).toHaveLength(1);
    expect(liveChests()[0].at).toEqual({ x: 80, y: 0 });
    expect(liveChests()[0].frames).toEqual([false, true]);
  });

  it("should draw a restocked chest closed again: no remembered open", () => {
    const { fp, liveChests } = piles();
    fp.sync([chest("c", 80)], ME);
    fp.sync([chest("c", 80, true, [item("a")])], ME);
    fp.sync([chest("c", 80, false, [])], ME);

    expect(liveChests()[0].frames).toEqual([false, true, false]);
  });

  it("should let a chest go once the state drops it", () => {
    const { fp, liveChests } = piles();
    fp.sync([chest("c", 80)], ME);
    fp.sync([], ME);

    expect(liveChests()).toHaveLength(0);
  });

  it("should open a chest in reach with the run's message, its satchel once the server has it open", () => {
    const { fp, satchel, send } = piles();
    fp.sync([chest("c", 10)], ME);

    expect(fp.interact({ x: 0, y: 0 })).toBe(true);
    expect(send).toHaveBeenCalledWith(ActionType.Interact, { entity_id: "c" });
    // not on the press: the server has not answered (I-3QHQZ-8 review, finding a)
    expect(satchel.entityId).toBeUndefined();

    fp.sync([chest("c", 10, true, [item("a")])], ME);
    expect(satchel.entityId).toBe("c");
  });

  it("should fill the satchel once the state has the chest open", () => {
    const { fp, satchel } = piles();
    fp.sync([chest("c", 10)], ME);
    fp.interact({ x: 0, y: 0 });
    fp.sync([chest("c", 10)], ME);
    expect(satchel.entityId).toBeUndefined();

    fp.sync([chest("c", 10, true, [item("a"), item("b")])], ME);
    expect(satchel.entityId).toBe("c");
    expect(satchel.items).toEqual([item("a"), item("b")]);
  });

  it("should leave nothing open when the server refuses the open: no open state comes within the window", () => {
    const { fp, satchel, wait } = piles();
    fp.sync([chest("c", 10)], ME);
    fp.interact({ x: 0, y: 0 });

    wait(CHEST_OPEN_WINDOW_MS + 1);
    fp.sync([chest("c", 10)], ME);
    expect(satchel.entityId).toBeUndefined();

    // someone else opens it later: my lapsed reach does not pop the satchel open
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    expect(satchel.entityId).toBeUndefined();
  });

  it("should try again on a second press before the chest has opened", () => {
    const { fp, satchel, send } = piles();
    fp.sync([chest("c", 10)], ME);
    fp.interact({ x: 0, y: 0 });
    fp.interact({ x: 0, y: 0 });

    expect(send).toHaveBeenCalledTimes(2);
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    expect(satchel.entityId).toBe("c");
  });

  it("should open a chest someone else opened, never faint and never reserved", () => {
    const { fp, satchel, notices } = piles();
    const theirs = { ...chest("c", 10, true, [item("a")]), reserved_for: "killer" };
    fp.sync([theirs], ME);

    fp.interact({ x: 0, y: 0 });
    fp.sync([theirs], ME);
    expect(notices).toEqual([]);
    expect(satchel.entityId).toBe("c");
    expect(satchel.items).toEqual([item("a")]);
  });

  it("should send a loot from a chest as the run does", () => {
    const { fp, send } = piles();
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    fp.interact({ x: 0, y: 0 });
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    fp.loot(item("a"));

    expect(send).toHaveBeenLastCalledWith(ActionType.Interact, { entity_id: "a" });
  });

  it("should close the satchel when its chest restocks, and open it again on a fresh press", () => {
    const { fp, satchel, send, wait } = piles();
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    fp.interact({ x: 0, y: 0 });
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    wait(CHEST_OPEN_WINDOW_MS + 1);
    fp.sync([chest("c", 10, false, [])], ME);
    expect(satchel.entityId).toBeUndefined();

    fp.interact({ x: 0, y: 0 });
    fp.sync([chest("c", 10, true, [item("b")])], ME);
    expect(satchel.entityId).toBe("c");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("should keep the satchel open through a restock that lands before my own open (I-3QHQZ-8 review, finding b)", () => {
    const { fp, satchel } = piles();
    // last seen open; the press races a restock
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    fp.interact({ x: 0, y: 0 });
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    fp.sync([chest("c", 10, false, [])], ME);
    expect(satchel.entityId).toBe("c");

    // my own interact reopens the restocked chest
    fp.sync([chest("c", 10, true, [item("fresh")])], ME);
    expect(satchel.entityId).toBe("c");
    expect(satchel.items).toEqual([item("fresh")]);
  });

  it("should close the satchel on a second press without sending again", () => {
    const { fp, satchel, send } = piles();
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    fp.interact({ x: 0, y: 0 });
    fp.sync([chest("c", 10, true, [item("a")])], ME);
    fp.interact({ x: 0, y: 0 });
    fp.sync([chest("c", 10, true, [item("a")])], ME);

    expect(satchel.entityId).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should not reopen a chest's satchel walked away from while its open was on the way", () => {
    const { fp, satchel } = piles();
    fp.sync([chest("c", 10)], ME);
    fp.interact({ x: 0, y: 0 });
    fp.follow({ x: 10 + PILE_REACH + 1, y: 0 });
    fp.sync([chest("c", 10, true, [item("a")])], ME);

    expect(satchel.entityId).toBeUndefined();
  });

  it("should reach for the nearer of a pile and a chest", () => {
    const { fp, satchel, send } = piles();
    fp.sync([pile("p", 40), chest("c", 10)], ME);
    fp.interact({ x: 0, y: 0 });

    expect(send).toHaveBeenCalledWith(ActionType.Interact, { entity_id: "c" });
    fp.sync([pile("p", 40), chest("c", 10, true, [item("a")])], ME);
    expect(satchel.entityId).toBe("c");
  });

  it("should forget every chest on release", () => {
    const { fp, liveChests } = piles();
    fp.sync([chest("c", 10)], ME);
    fp.release();

    expect(liveChests()).toHaveLength(0);
    expect(fp.interact({ x: 0, y: 0 })).toBe(false);
  });
});
