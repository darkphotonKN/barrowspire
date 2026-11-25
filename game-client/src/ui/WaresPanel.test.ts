import { describe, expect, it, vi } from "vitest";
import { ArtLibrary } from "@/render/art/library";
import { shippedManifest } from "@/render/art/artLoader.standin";
import { recordingStage, type Made } from "@/scenes/recordingStage.standin";
import { palette, toCss } from "@/utils/canvasPalette";
import { WARES_PANEL_DEPTH, WaresPanel } from "./WaresPanel";
import { waresRows, type ShownWares } from "./wares";

const shown = (paying?: string, line?: string): ShownWares => ({
  merchantId: "merchant-1",
  rows: waresRows(
    [
      { ware: "health_potion", price: 60, left: 3, item: { name: "Lesser Heal Potion", item_type: "consumable", healing_amount: 30 } },
      { ware: "antidote", price: 40, left: 0, item: { name: "Antidote", item_type: "consumable" } },
      { ware: "tome_of_filth", price: 1500, left: 1 },
    ],
    paying,
  ),
  ...(line ? { line } : {}),
});

function onStage() {
  const stage = recordingStage();
  const art = new ArtLibrary(shippedManifest(), { warn: () => {} });
  const wiring = { buy: vi.fn(), close: vi.fn() };
  const panel = new WaresPanel({ add: stage.add } as never, () => art, wiring);
  const live = () => stage.made.filter((m) => !m.destroyed);
  const words = () => live().filter((m) => m.kind === "text").map((m) => String(m.args[2]));
  const text = (words: string) => live().find((m) => m.kind === "text" && m.args[2] === words);
  const zones = () => live().filter((m) => m.kind === "zone");
  return { stage, panel, wiring, live, words, text, zones };
}

// FS-9JV5K §F R22, R23 (I-9JV5K-5)
describe("WaresPanel: the wares panel drawn (FS-9JV5K §F R22, R23)", () => {
  it("should draw a row per ware with its icon, name, price, count left and Buy, under the windows' title", () => {
    const { panel, words, live } = onStage();
    panel.set(shown());
    expect(words()).toEqual(
      expect.arrayContaining(["WARES", "Lesser Heal Potion", "60 gold", "3 left", "Antidote", "40 gold", "Sold out", "Tome of Filth", "1,500 gold", "1 left", "Buy"]),
    );
    const icons = live().filter((m) => m.kind === "sprite").map((m) => String(m.args[3] ?? m.args[2]));
    expect(icons.some((f) => f.startsWith("icon_potion_health"))).toBe(true);
    expect(icons.some((f) => f.startsWith("icon_antidote"))).toBe(true);
    expect(icons.some((f) => f.startsWith("tome"))).toBe(true);
  });

  it("should stand every piece at its depth, held against the screen", () => {
    const { panel, live } = onStage();
    panel.set(shown());
    for (const m of live()) expect((m as Made).depth).toBe(WARES_PANEL_DEPTH);
  });

  it("should give Buy a hit only where it can be pressed, and buy that ware on its release", () => {
    const { panel, wiring, zones } = onStage();
    panel.set(shown());
    // the ground, the two Buys with some left, the purse line's hover, the ×
    expect(zones()).toHaveLength(5);
    zones()[1].handlers.pointerup();
    zones()[2].handlers.pointerup();
    expect(wiring.buy.mock.calls).toEqual([["health_potion"], ["tome_of_filth"]]);
  });

  it("should show Paying… on the ware in flight and give no Buy a hit meanwhile", () => {
    const { panel, words, zones, text } = onStage();
    panel.set(shown("health_potion"));
    expect(words()).toContain("Paying…");
    // the ground, the purse line's hover, the ×
    expect(zones()).toHaveLength(3);
    expect(text("Paying…")!.args[3]).toMatchObject({ color: toCss(palette.hudFaint) });
  });

  it("should show the refusal's line in plain words", () => {
    const { panel, text } = onStage();
    panel.set(shown(undefined, "Not enough gold."));
    expect(text("Not enough gold.")!.args[3]).toMatchObject({ color: toCss(palette.waresRefused) });
  });

  it("should close on the ×'s release", () => {
    const { panel, wiring, zones } = onStage();
    panel.set(shown());
    zones().at(-1)!.handlers.pointerup();
    expect(wiring.close).toHaveBeenCalledTimes(1);
  });

  // the purse line as the gear overlay's (game-client CONTEXT "Purse line", FS-7TGZ3 R3, R5)
  it("should show the purse line as the coin icon and the total, the dash until it is read", () => {
    const { panel, words, text, live } = onStage();
    panel.set(shown());
    expect(words()).toContain("—");
    panel.setPurse({ amount: "1,250", tip: "Available 1,000 · Held in bids 250" });
    expect(text("1,250")).toBeDefined();
    expect(words().some((w) => w.startsWith("Available"))).toBe(false);
    const coins = live().filter((m) => m.kind === "sprite" && String(m.args[3] ?? m.args[2]).startsWith("icon_coins"));
    expect(coins).toHaveLength(1);
    // kept across a redraw
    panel.set(shown(undefined, "Sold out."));
    expect(text("1,250")).toBeDefined();
  });

  it("should show the split, Available X · Held in bids Y, only while the pointer is over the purse line", () => {
    const { panel, text, zones } = onStage();
    panel.set(shown());
    panel.setPurse({ amount: "1,250", tip: "Available 1,000 · Held in bids 250" });
    const hover = zones().at(-2)!;
    hover.handlers.pointerover({ x: 0, y: 0 });
    expect(text("Available 1,000 · Held in bids 250")).toBeDefined();
    hover.handlers.pointerout();
    expect(text("Available 1,000 · Held in bids 250")).toBeUndefined();
  });

  it("should show the split as the purse is read while the pointer is already over the line", () => {
    const { panel, text, zones } = onStage();
    panel.set(shown());
    zones().at(-2)!.handlers.pointerover({ x: 0, y: 0 });
    panel.setPurse({ amount: "1,250", tip: "Available 1,000 · Held in bids 250" });
    expect(text("Available 1,000 · Held in bids 250")).toBeDefined();
  });

  it("should show no split over the dash: the purse is not read", () => {
    const { panel, live, zones } = onStage();
    panel.set(shown());
    zones().at(-2)!.handlers.pointerover({ x: 0, y: 0 });
    expect(live().filter((m) => m.kind === "container")).toEqual([]);
  });

  it("should take the split down with the panel", () => {
    const { panel, live, zones } = onStage();
    panel.set(shown());
    panel.setPurse({ amount: "1,250", tip: "Available 1,000 · Held in bids 250" });
    zones().at(-2)!.handlers.pointerover({ x: 0, y: 0 });
    panel.destroy();
    expect(live()).toEqual([]);
  });

  it("should draw nothing anew for a show that changes nothing, and take everything down", () => {
    const { panel, stage, live } = onStage();
    panel.set(shown());
    const count = stage.made.length;
    panel.set(shown());
    expect(stage.made.length).toBe(count);
    panel.destroy();
    expect(live()).toEqual([]);
  });
});
