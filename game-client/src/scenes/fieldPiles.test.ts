import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/assets/types/client";
import type { ContainerState, ItemState } from "@/types/gameState";
import { RESERVED_PILE_ALPHA } from "@/render/world/dropPile";
import { FieldPiles, PILE_REACH, type PileSatchel } from "./fieldPiles";
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
  const stage = {
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
  const fp = new FieldPiles(stage, satchel, { notice: (t) => notices.push(t), send });
  const live = () => [...sprites.values()].filter((s) => !s.destroyed);
  return { fp, satchel, notices, send, live };
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

  it("should draw no chest and no emptied pile, and let a pile go once the state drops it", () => {
    const { fp, live } = piles();
    fp.sync([pile("p", 0), pile("empty", 50, undefined, []), { ...pile("chest", 80), kind: "chest" }], ME);
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
