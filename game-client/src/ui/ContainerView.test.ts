import { describe, expect, it } from "vitest";
import type { ItemState } from "@/types/gameState";
import { ActionType } from "@/assets/types/client";
import {
  ContainerContents,
  SATCHEL_INTERIOR,
  iconSheet,
  itemAt,
  itemDetail,
  itemIcon,
  lootMessage,
  satchelLayout,
} from "./ContainerView";

const item = (fields: Partial<ItemState> & { name: string }): ItemState => ({
  item_id: `id-${fields.name}`,
  entity_id: `e-${fields.name}`,
  quantity: 1,
  ...fields,
});

describe("itemIcon", () => {
  it.each([
    [
      "an iron sword",
      item({ name: "Iron Sword", weapon_type: "sword", attack_power: 10 }),
      "sword",
    ],
    [
      "an elven bow",
      item({ name: "Elven Bow", weapon_type: "bow", attack_power: 45 }),
      "bow",
    ],
    [
      "a dagger",
      item({ name: "Grave Knife", weapon_type: "dagger", attack_power: 8 }),
      "dagger",
    ],
    [
      "a staff",
      item({ name: "Ash Staff", weapon_type: "staff", attack_power: 12 }),
      "staff",
    ],
    [
      "a helm",
      item({ name: "Wooden Helm", armor_slot: "head", defense_rating: 15 }),
      "helm",
    ],
    [
      "body armour",
      item({ name: "Leather Armor", armor_slot: "chest", defense_rating: 20 }),
      "cuirass",
    ],
    [
      "gloves",
      item({ name: "Iron Gloves", armor_slot: "gloves", defense_rating: 6 }),
      "gauntlets",
    ],
    [
      "leggings",
      item({ name: "Chain Leggings", armor_slot: "legs", defense_rating: 30 }),
      "greaves",
    ],
    [
      "a ring slot",
      item({ name: "Band", armor_slot: "ring_1", defense_rating: 2 }),
      "ring",
    ],
    [
      "a health potion",
      item({ name: "Health Potion", healing_amount: 50 }),
      "potion_health",
    ],
    [
      "a mana potion",
      item({ name: "Mana Potion", mana_amount: 50 }),
      "potion_mana",
    ],
    [
      "an elixir of both",
      item({
        name: "Elixir of Restoration",
        healing_amount: 500,
        mana_amount: 500,
      }),
      "vial_tonic",
    ],
    ["a scroll by name", item({ name: "Attack buff scroll" }), "scroll"],
    ["coin by name", item({ name: "Grave-gold", quantity: 37 }), "coins"],
    ["a gem by name", item({ name: "Lich-glass Gem" }), "gem"],
    ["a signet by name", item({ name: "Signet of the Spire" }), "ring"],
    ["a skull by name", item({ name: "Wight Skull" }), "skull"],
  ])("should map %s to its baked icon", (_label, it_, icon) => {
    expect(itemIcon(it_)).toBe(icon);
  });

  it.each([
    [
      "an axe (no axe icon is baked)",
      item({ name: "Iron Axe", weapon_type: "axe", attack_power: 15 }),
    ],
    [
      "a shield (no shield icon is baked)",
      item({ name: "Tower Shield", armor_slot: "shield", defense_rating: 50 }),
    ],
    ["an item nothing recognises", item({ name: "Something Strange" })],
  ])("should fall back to the generic icon for %s", (_label, it_) => {
    expect(itemIcon(it_)).toBe("generic");
  });

  it("should name the manifest sheet the icon is baked under", () => {
    expect(iconSheet("potion_health")).toBe("icon_potion_health");
    expect(iconSheet(itemIcon(item({ name: "Something Strange" })))).toBe(
      "icon_generic",
    );
  });
});

describe("lootMessage", () => {
  it("should be exactly the message the chest item UI sent to loot that item", () => {
    const sword = item({
      name: "Iron Sword",
      weapon_type: "sword",
      attack_power: 10,
      quantity: 2,
      lootedAt: 5,
    });
    // What BarrowspireScene sent before the satchel (pickupSingleItemFromChest):
    //   socketManager.sendMessage(ActionType.Interact, { entity_id: item.entity_id })
    const before = {
      action: ActionType.Interact,
      payload: { entity_id: sword.entity_id },
    };

    expect(lootMessage(sword)).toStrictEqual(before);
    expect(lootMessage(sword).action).toBe("interact");
  });
});

describe("ContainerContents", () => {
  const PENDING = 1000;
  const sword = item({ name: "Iron Sword", weapon_type: "sword" });
  const potion = item({ name: "Health Potion", healing_amount: 50 });
  const gem = item({ name: "Lich-glass Gem" });

  it("should show the server's items in the server's order", () => {
    const contents = new ContainerContents(PENDING);
    expect(contents.sync([sword, potion, gem], 0)).toBe(true);
    expect(contents.items.map((i) => i.name)).toEqual([
      "Iron Sword",
      "Health Potion",
      "Lich-glass Gem",
    ]);
  });

  it("should report no change when the same items arrive again, so the view does not rebuild", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([sword, potion], 0);
    expect(contents.sync([{ ...sword }, { ...potion }], 33)).toBe(false);
  });

  it("should take an item, remove it at once, and hold it back while the loot is pending", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([sword, potion], 0);

    expect(contents.take(sword.entity_id, 100)).toEqual(sword);
    expect(contents.items).toEqual([potion]);
    // the server has not confirmed yet: it still lists the sword
    expect(contents.sync([sword, potion], 500)).toBe(false);
    expect(contents.items).toEqual([potion]);
  });

  it("should ignore a take while that item's loot is pending, as the item UI did", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([sword, potion], 0);
    contents.take(sword.entity_id, 100);

    expect(contents.take(sword.entity_id, 150)).toBeNull();
    contents.sync([sword, potion], 400);
    expect(contents.take(sword.entity_id, 450)).toBeNull();
  });

  it("should show the item again once the pending window passes and the server still has it", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([sword, potion], 0);
    contents.take(sword.entity_id, 100);

    expect(contents.sync([sword, potion], 100 + PENDING)).toBe(true);
    expect(contents.items).toEqual([sword, potion]);
    expect(contents.take(sword.entity_id, 100 + PENDING + 1)).toEqual(sword);
  });

  it("should hold a taken item's place while its loot is pending, so a second click there does nothing", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([sword, potion, gem], 0);
    const { slots } = satchelLayout(contents.laidOut);

    contents.take(potion.entity_id, 100);
    contents.sync([sword, potion, gem], 200); // not confirmed yet

    expect(contents.laidOut).toEqual([sword, potion, gem]);
    expect(contents.at(slots[1].x, slots[1].y)).toBeUndefined();
    expect(contents.at(slots[2].x, slots[2].y)).toEqual(gem);
  });

  it("should close the gap once the server confirms the loot", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([sword, potion, gem], 0);
    contents.take(potion.entity_id, 100);

    expect(contents.sync([sword, gem], 250)).toBe(true);
    expect(contents.laidOut).toEqual([sword, gem]);
    const { slots } = satchelLayout(contents.laidOut);
    expect(contents.at(slots[1].x, slots[1].y)).toEqual(gem);
  });

  it("should call a satchel whose every item is pending picked clean", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([potion], 0);
    contents.take(potion.entity_id, 10);
    expect(contents.state).toBe("empty");
  });

  it("should refuse an item that is not in the satchel", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([potion], 0);
    expect(contents.take(sword.entity_id, 10)).toBeNull();
  });

  it("should take the first item for the F key", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([gem, sword], 0);
    expect(contents.takeFirst(10)).toEqual(gem);
    expect(contents.takeFirst(20)).toEqual(sword);
    expect(contents.takeFirst(30)).toBeNull();
  });

  it("should keep pending loots across a close and reopen, as the item UI did", () => {
    const contents = new ContainerContents(PENDING);
    contents.sync([sword, potion], 0);
    contents.take(sword.entity_id, 100);
    contents.clear();

    expect(contents.items).toEqual([]);
    contents.sync([sword, potion], 300);
    expect(contents.items).toEqual([potion]);
  });

  it("should say it is rummaging until the first sync, then empty or full", () => {
    const contents = new ContainerContents(PENDING);
    expect(contents.state).toBe("rummaging");
    contents.sync([], 0);
    expect(contents.state).toBe("empty");
    contents.sync([potion], 10);
    expect(contents.state).toBe("items");
    contents.clear();
    expect(contents.state).toBe("rummaging");
  });
});

describe("satchelLayout", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => item({ name: `Relic ${i}` }));
  const boxes = (n: number) => {
    const { slots, hit } = satchelLayout(many(n));
    return slots.map((s) => ({
      l: s.x - hit / 2,
      r: s.x + hit / 2,
      t: s.y - hit / 2,
      b: s.y + hit / 2,
    }));
  };

  it.each([1, 4, 12, 13, 30])(
    "should keep every one of %i icons inside the satchel",
    (n) => {
      const all = boxes(n);
      expect(all).toHaveLength(n);
      for (const b of all) {
        expect(b.l).toBeGreaterThanOrEqual(SATCHEL_INTERIOR.left);
        expect(b.r).toBeLessThanOrEqual(SATCHEL_INTERIOR.right);
        expect(b.t).toBeGreaterThanOrEqual(SATCHEL_INTERIOR.top);
        expect(b.b).toBeLessThanOrEqual(SATCHEL_INTERIOR.bottom);
      }
    },
  );

  it.each([5, 12, 13, 30])(
    "should never let two of %i icons share a click target",
    (n) => {
      const all = boxes(n);
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i],
            b = all[j];
          const overlap = a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
          expect(overlap, `icons ${i} and ${j}`).toBe(false);
        }
    },
  );

  it("should draw full size while a coffer's plunder fits, and shrink only when it does not", () => {
    expect(satchelLayout(many(12)).scale).toBe(1);
    expect(satchelLayout(many(13)).scale).toBeLessThan(1);
  });

  it("should place an item in the same spot every time, so a rebuild does not shuffle the bag", () => {
    const items = many(6);
    expect(satchelLayout(items)).toEqual(
      satchelLayout(items.map((i) => ({ ...i }))),
    );
  });
});

describe("itemAt", () => {
  const sword = item({ name: "Iron Sword", weapon_type: "sword" });
  const potion = item({ name: "Health Potion", healing_amount: 50 });

  it("should find the item under a point on its icon", () => {
    const items = [sword, potion];
    const { slots } = satchelLayout(items);
    expect(itemAt(items, slots[0].x, slots[0].y)).toBe(sword);
    expect(itemAt(items, slots[1].x + 10, slots[1].y - 10)).toBe(potion);
  });

  it("should find nothing on bare leather or outside the satchel", () => {
    const items = [sword];
    expect(
      itemAt(items, SATCHEL_INTERIOR.right - 1, SATCHEL_INTERIOR.bottom - 1),
    ).toBeUndefined();
    expect(itemAt(items, 0, -500)).toBeUndefined();
  });
});

describe("itemDetail", () => {
  it.each([
    [
      "a weapon",
      item({ name: "Iron Sword", attack_power: 10, critical_rate: 5 }),
      "ATK 10",
    ],
    ["armour", item({ name: "Wooden Helm", defense_rating: 15 }), "DEF 15"],
    [
      "a health potion",
      item({ name: "Health Potion", healing_amount: 50 }),
      "+50 HP",
    ],
    ["a mana potion", item({ name: "Mana Potion", mana_amount: 40 }), "+40 MP"],
    ["a stack", item({ name: "Grave-gold", quantity: 37 }), "x37"],
    ["a single plain relic", item({ name: "Wight Skull" }), ""],
  ])(
    "should give %s the stat line the item row showed",
    (_label, it_, detail) => {
      expect(itemDetail(it_)).toBe(detail);
    },
  );
});
