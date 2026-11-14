import { describe, expect, it, vi } from "vitest";

// The shared title drawing, watched: the controls panel titles itself through it (FS-3EBCA R20, R22).
vi.mock("./panelFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("./panelFrame")>();
  return { ...real, drawPanelTitle: vi.fn(() => ({ destroy: () => {} })) };
});

const { drawPanelTitle } = await import("./panelFrame");
const { RUN_ACTIONS } = await import("@/scenes/runActions");
const { CONTROLS_PANEL_DEPTH, controlRows, controlsPanelRect, drawControlsPanel } = await import("./controlsPanel");

// The run's controls panel (H), drawn as the run drew it, now by the UI scene (FS-TQZ5J § Change: Phase 3,
// R50, R59; the note on ADR-0083 2.3). Moved here from BarrowspireScene.test.ts with the panel.

/** A stage that records the words drawn and the container made, every other call accepted. */
function stage() {
  const words: string[] = [];
  const containers: { x: number; y: number; depth?: number; scrollFactor?: number }[] = [];
  const any = (): unknown => {
    const self: unknown = new Proxy(() => self, { get: (_t, prop) => (prop === "then" ? undefined : () => self) });
    return self;
  };
  const scene = {
    add: {
      graphics: any,
      text: (_x: number, _y: number, content: string) => (words.push(content), any()),
      container: (x: number, y: number) => {
        const c: (typeof containers)[number] = { x, y };
        containers.push(c);
        const self = {
          setDepth: (d: number) => ((c.depth = d), self),
          setScrollFactor: (f: number) => ((c.scrollFactor = f), self),
        };
        return self;
      },
    },
  };
  return { scene: scene as never, words, containers };
}

describe("the run's controls panel (FS-TQZ5J § Change: Phase 3, R50)", () => {
  // The owner, 2026-11-12: "每個ui視窗的標題都不同位置 都統一放在中間的樣式好了 大小顏色也一樣", "全大寫也統一"
  // (FS-3EBCA R20, R22). I-3EBCA-9.
  it("should title the controls panel CONTROLS with the shared title drawing, across its top", () => {
    const title = vi.mocked(drawPanelTitle);
    title.mockClear();
    drawControlsPanel(stage().scene, { x: 400, y: 300 }, "warrior");
    expect(title).toHaveBeenCalledTimes(1);
    const [, panel, words] = title.mock.calls[0];
    expect(words).toBe("CONTROLS");
    expect(panel.width).toBe(260);
    expect(panel.x).toBe(-130);
  });

  it("should list ESC as the menu", () => {
    const { scene, words } = stage();
    drawControlsPanel(scene, { x: 400, y: 300 }, "warrior");
    expect(words).toContain("ESC");
    expect(words).toContain("Menu");
  });

  it("should list the drink, its key read from the mapping (FS-P9G8R R26)", () => {
    const { scene, words } = stage();
    drawControlsPanel(scene, { x: 400, y: 300 }, "warrior");
    expect(words).toContain(RUN_ACTIONS.drinkPotion.label);
    expect(words).toContain("Drink potion");
  });

  it("should list I / B for the inventory and C for the character panel (FS-HRH2J R11; § Change C15)", () => {
    const { scene, words } = stage();
    drawControlsPanel(scene, { x: 400, y: 300 }, "warrior");
    expect(words).toEqual(expect.arrayContaining(["I / B", "Inventory", "C", "Character"]));
    expect(words).not.toContain("Gear and bag");
    expect(words).not.toContain("I");
  });

  it("should name the class's own ability on RIGHT CLICK, and the class ability for a class with none (FS-8AY7S req 30)", () => {
    const rows = new Map(controlRows("warrior"));
    expect(rows.get("RIGHT CLICK")).not.toBe("Class ability");
    expect(new Map(controlRows("no-such-class")).get("RIGHT CLICK")).toBe("Class ability");
  });

  it("should stand at the centre it is given, at 1200, held against the screen, its ground's rect about it", () => {
    const { scene, containers } = stage();
    drawControlsPanel(scene, { x: 400, y: 300 }, "warrior");
    expect(containers.at(-1)).toEqual({ x: 400, y: 300, depth: CONTROLS_PANEL_DEPTH, scrollFactor: 0 });
    expect(CONTROLS_PANEL_DEPTH).toBe(1200);
    const h = 44 + controlRows("warrior").length * 20 + 32;
    expect(controlsPanelRect({ x: 400, y: 300 }, controlRows("warrior").length)).toEqual({ x: 270, y: 300 - h / 2, width: 260, height: h });
  });
});
