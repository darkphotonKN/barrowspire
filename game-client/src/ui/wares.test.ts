import { describe, expect, it } from "vitest";
import type { MerchantState } from "@/types/gameState";
import { WaresTrade, buyRefusalLine, waresRows } from "./wares";

const merchant = (over: Partial<MerchantState> = {}): MerchantState => ({
  entity_id: "merchant-1",
  position: { x: 900, y: 420 },
  wares: [
    { ware: "health_potion", price: 60, left: 3, item: { name: "Lesser Heal Potion", item_type: "consumable", rarity: "normal", healing_amount: 30 } },
    { ware: "antidote", price: 40, left: 0, item: { name: "Antidote", item_type: "consumable" } },
    { ware: "tome_of_filth", price: 1500, left: 1 },
  ],
  ...over,
});

// FS-9JV5K §F R22 (I-9JV5K-5)
describe("waresRows: the wares panel's rows (FS-9JV5K §F R22)", () => {
  it("should give each ware its icon, name, price in gold, count left and Buy", () => {
    expect(waresRows(merchant().wares)).toEqual([
      { ware: "health_potion", icon: "icon_potion_health", name: "Lesser Heal Potion", price: "60 gold", left: "3 left", action: "Buy", enabled: true },
      { ware: "antidote", icon: "icon_antidote", name: "Antidote", price: "40 gold", left: "Sold out", action: "Buy", enabled: false },
      { ware: "tome_of_filth", icon: "tome", name: "Tome of Filth", price: "1,500 gold", left: "1 left", action: "Buy", enabled: true },
    ]);
  });

  // FS-9JV5K §Change: The Restoring Draught D6 (I-9JV5K-7): its row from the ware on the wire, no new field
  it("should give the Restoring Draught its own flask, its name, price and count left, as any ware", () => {
    const draught = { ware: "restoring_draught", price: 50, left: 3, item: { name: "Restoring Draught", item_type: "consumable", rarity: "normal" } };
    expect(waresRows([draught])).toEqual([
      { ware: "restoring_draught", icon: "icon_restoring_draught", name: "Restoring Draught", price: "50 gold", left: "3 left", action: "Buy", enabled: true },
    ]);
    expect(waresRows([{ ware: "restoring_draught", price: 50, left: 0 }])[0]).toMatchObject({ name: "Restoring Draught", left: "Sold out" });
  });

  it("should show Paying… on the ware being paid for, and offer no Buy anywhere while it is in flight", () => {
    const rows = waresRows(merchant().wares, "health_potion");
    expect(rows.map((r) => [r.action, r.enabled])).toEqual([
      ["Paying…", false],
      ["Buy", false],
      ["Buy", false],
    ]);
  });

  it("should name a ware this client does not know by its item, else its own words", () => {
    const rows = waresRows([
      { ware: "bone_charm", price: 5, left: 1, item: { name: "Bone Charm" } },
      { ware: "rope_coil", price: 5, left: 1 },
    ]);
    expect(rows.map((r) => [r.name, r.icon])).toEqual([
      ["Bone Charm", "icon_generic"],
      ["Rope Coil", "icon_generic"],
    ]);
  });
});

// FS-9JV5K §F R23
describe("buyRefusalLine: a refusal in plain words (FS-9JV5K §F R23)", () => {
  it.each([
    ["not_enough_gold", "Not enough gold."],
    ["sold_out", "Sold out."],
    ["bag_full", "Your bag is full."],
    ["out_of_reach", "Too far away."],
    ["wallet_unavailable", "Your purse can't be reached. Nothing was taken."],
    ["no_wallet", "Your purse can't be reached. Nothing was taken."],
    // FS-9JV5K R10, R23 amended 2026-11-25: the debit may have applied, so nothing is promised
    ["outcome_unknown", "Your purse did not answer. Check your gold before you buy again."],
    ["tome_held", "You already carry a tome."],
  ])("should say %s as %j", (reason, line) => expect(buyRefusalLine(reason)).toBe(line));

  it("should say nothing new for purchase_pending", () => expect(buyRefusalLine("purchase_pending")).toBeNull());

  it("should still say nothing was bought for a reason this client does not know", () =>
    expect(buyRefusalLine("ledger_on_fire")).toBe("Nothing was bought."));
});

// FS-9JV5K §F R22, R23
describe("WaresTrade: the run's side of the wares panel (FS-9JV5K §F R22, R23)", () => {
  it("should open for the merchant and show his wares, and close", () => {
    const trade = new WaresTrade();
    expect(trade.openFor).toBeUndefined();
    const shown = trade.open(merchant());
    expect(trade.openFor).toBe("merchant-1");
    expect(shown).toMatchObject({ merchantId: "merchant-1", rows: waresRows(merchant().wares) });
    expect(shown.line).toBeUndefined();
    trade.close();
    expect(trade.openFor).toBeUndefined();
  });

  it("should buy one ware at a time: the buy's payload, then nothing while it is paid for", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    expect(trade.buy("health_potion")).toEqual({ merchant_id: "merchant-1", ware: "health_potion" });
    expect(trade.paying).toBe("health_potion");
    expect(trade.buy("tome_of_filth")).toBeNull();
    expect(trade.view(merchant()).rows[0].action).toBe("Paying…");
  });

  it("should not buy a sold-out ware, a ware he does not list, or with the panel shut", () => {
    const trade = new WaresTrade();
    expect(trade.buy("health_potion")).toBeNull();
    trade.open(merchant());
    expect(trade.buy("antidote")).toBeNull();
    expect(trade.buy("rope_coil")).toBeNull();
    expect(trade.paying).toBeUndefined();
  });

  it("should end Paying… on a success and say Bought: with the ware's name, as a done notice", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    trade.buy("health_potion");
    expect(trade.answer({ success: true, ware: "health_potion" })).toEqual({ notice: { text: "Bought: Lesser Heal Potion.", tone: "done" } });
    expect(trade.paying).toBeUndefined();
    expect(trade.view(merchant()).line).toBeUndefined();
  });

  it("should end Paying… on a refusal and show its line on the open panel", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    trade.buy("tome_of_filth");
    expect(trade.answer({ success: false, reason: "not_enough_gold" })).toEqual({});
    expect(trade.paying).toBeUndefined();
    expect(trade.view(merchant()).line).toBe("Not enough gold.");
  });

  it("should keep Paying… and say nothing new on purchase_pending: the first purchase is still paid for", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    trade.buy("health_potion");
    expect(trade.answer({ success: false, reason: "purchase_pending" })).toEqual({});
    expect(trade.paying).toBe("health_potion");
    expect(trade.view(merchant()).line).toBeUndefined();
  });

  it("should say an unknown outcome as a refused notice once the panel is shut, never that nothing was taken", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    trade.buy("health_potion");
    trade.close();
    expect(trade.answer({ success: false, reason: "outcome_unknown" })).toEqual({
      notice: { text: "Your purse did not answer. Check your gold before you buy again.", tone: "refused" },
    });
    expect(trade.paying).toBeUndefined();
  });

  it("should keep a purchase in flight across a close, and say its refusal as a notice once the panel is shut", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    trade.buy("health_potion");
    trade.close();
    expect(trade.paying).toBe("health_potion");
    trade.open(merchant());
    expect(trade.view(merchant()).rows[0].action).toBe("Paying…");
    trade.close();
    expect(trade.answer({ success: false, reason: "wallet_unavailable" })).toEqual({
      notice: { text: "Your purse can't be reached. Nothing was taken.", tone: "refused" },
    });
  });

  it("should clear the last refusal's line on a new buy, and on a fresh open", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    trade.buy("health_potion");
    trade.answer({ success: false, reason: "bag_full" });
    trade.buy("health_potion");
    expect(trade.view(merchant()).line).toBeUndefined();
    trade.answer({ success: false, reason: "bag_full" });
    trade.close();
    trade.open(merchant());
    expect(trade.view(merchant()).line).toBeUndefined();
  });

  it("should name a bought ware by the name last shown for it, after his floor is gone (the party climbed while it was paid for)", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    trade.buy("health_potion");
    trade.close();
    expect(trade.answer({ success: true, ware: "health_potion" }).notice?.text).toBe("Bought: Lesser Heal Potion.");
  });

  it("should name a bought ware it never showed by its kind", () => {
    const trade = new WaresTrade();
    expect(trade.answer({ success: true, ware: "tome_of_filth" }).notice?.text).toBe("Bought: Tome of Filth.");
  });

  it("should forget everything on a reset (a new run)", () => {
    const trade = new WaresTrade();
    trade.open(merchant());
    trade.buy("health_potion");
    trade.reset();
    expect(trade.openFor).toBeUndefined();
    expect(trade.paying).toBeUndefined();
  });

  describe("follow: the open panel kept to each broadcast (R22)", () => {
    it("should show his wares as they now stand while he is listed, in reach and the player in play", () => {
      const trade = new WaresTrade();
      trade.open(merchant());
      const sold = merchant({ wares: [{ ware: "health_potion", price: 60, left: 0 }] });
      const next = trade.follow(sold, true, true);
      expect(next?.kind).toBe("show");
      expect(next?.kind === "show" && next.wares.rows.map((r) => r.left)).toEqual(["Sold out"]);
    });

    it.each([
      ["he is gone from the state", undefined, true, true],
      ["another merchant is listed (a new floor's)", merchant({ entity_id: "merchant-2" }), true, true],
      ["the player walked out of reach", merchant(), false, true],
      ["the player is out of play", merchant(), true, false],
    ])("should close when %s, changing nothing on the server", (_why, him, inReach, inPlay) => {
      const trade = new WaresTrade();
      trade.open(merchant());
      expect(trade.follow(him, inReach, inPlay)).toEqual({ kind: "close" });
    });

    it("should say nothing with the panel shut", () => {
      expect(new WaresTrade().follow(merchant(), true, true)).toBeNull();
    });
  });
});
