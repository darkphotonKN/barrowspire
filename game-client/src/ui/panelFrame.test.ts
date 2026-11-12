import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { palette, toCss } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { CANVAS_FONT } from "@/utils/canvasPalette";
import {
  FRAME_CLOSE_PX,
  PANEL_TITLE_BAND,
  PANEL_TITLE_PX,
  PANEL_TITLE_SPACING,
  PANEL_TITLE_TOP,
  drawPanelFrame,
  drawPanelTitle,
  frameClose,
  lightClose,
} from "./panelFrame";

// The party panel's outer frame, one drawing for the party panel, the ESC menu, the inventory and
// the character panel (owner 2026-11-12: "menu跟道具欄跟角色欄的ui調整成跟party一樣外框"; FS-G4VMQ
// § Change: The menu wears the party panel's frame; FS-HRH2J § Change C16). I-3EBCA-6.
describe("panelFrame (FS-G4VMQ § Change C1, C2; FS-HRH2J § Change C4, C16)", () => {
  it("should put the × box 12 px in from the panel's top and right edges, 24 × 24", () => {
    expect(frameClose({ x: 100, y: 50, width: 300 })).toEqual({ x: 364, y: 62, width: 24, height: 24 });
  });

  it("should draw the carved ground with its brass rule and corner studs, and an amber 22 px × centred in its box", () => {
    const fills: number[] = [];
    const strokes: number[] = [];
    const studs: number[] = [];
    const g = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "fillStyle") return (c: number) => (fills.push(c), g);
          if (prop === "lineStyle") return (_w: number, c: number) => (strokes.push(c), g);
          if (prop === "fillCircle") return (x: number) => (studs.push(x), g);
          return () => g;
        },
      },
    ) as Phaser.GameObjects.Graphics;
    const made: { x: number; y: number; words: string; style: { fontSize: string; color: string } }[] = [];
    const scene = {
      add: {
        text: (x: number, y: number, words: string, style: { fontSize: string; color: string }) => {
          made.push({ x, y, words, style });
          const self: Record<string, unknown> = { setOrigin: () => self, setColor: vi.fn(() => self) };
          return self;
        },
      },
    } as unknown as Pick<Phaser.Scene, "add">;

    const { close, glyph } = drawPanelFrame(scene, g, { x: 0, y: 0, width: 200, height: 100 });

    expect(strokes).toContain(BARROW_HEX.brass);
    // a stud at each of the four corners, each a ring and its glint
    expect(studs).toHaveLength(8);
    expect(close).toEqual({ x: 164, y: 12, width: 24, height: 24 });
    expect(made).toEqual([
      { x: 176, y: 24, words: "×", style: expect.objectContaining({ fontSize: `${FRAME_CLOSE_PX}px`, color: toCss(palette.interactable) }) },
    ]);
    lightClose(glyph, true);
    expect((glyph as unknown as { setColor: ReturnType<typeof vi.fn> }).setColor).toHaveBeenLastCalledWith(
      toCss(palette.interactableBright),
    );
    lightClose(glyph, false);
    expect((glyph as unknown as { setColor: ReturnType<typeof vi.fn> }).setColor).toHaveBeenLastCalledWith(
      toCss(palette.interactable),
    );
  });

  // The disconnect notice wears the frame but has one way out, its button (FS-R6EYZ R9, R13):
  // a frame told `{ close: false }` draws no ×; every other window, untold, keeps its ×.
  describe("with or without its × (FS-R6EYZ R9)", () => {
    function framed(options?: { close: false }) {
      const studs: number[] = [];
      const g = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "fillCircle") return (x: number) => (studs.push(x), g);
            return () => g;
          },
        },
      ) as Phaser.GameObjects.Graphics;
      const words: string[] = [];
      const scene = {
        add: {
          text: (_x: number, _y: number, w: string) => {
            words.push(w);
            const self: Record<string, unknown> = { setOrigin: () => self };
            return self;
          },
        },
      } as unknown as Pick<Phaser.Scene, "add">;
      const panel = { x: 0, y: 0, width: 200, height: 100 };
      return { studs, words, drawn: options ? drawPanelFrame(scene, g, panel, options) : drawPanelFrame(scene, g, panel) };
    }

    it("should draw the carved ground and no × when told close: false", () => {
      const { studs, words, drawn } = framed({ close: false });
      expect(studs).toHaveLength(8);
      expect(words).toEqual([]);
      expect(drawn).toBeUndefined();
    });

    it("should still give every other window its ×, untold", () => {
      const { studs, words, drawn } = framed();
      expect(studs).toHaveLength(8);
      expect(words).toEqual(["×"]);
      expect(drawn?.close).toEqual({ x: 164, y: 12, width: 24, height: 24 });
    });
  });
});

// The owner, 2026-11-12: "每個ui視窗的標題都不同位置 都統一放在中間的樣式好了 大小顏色也一樣", "全大寫也統一":
// one title drawing every window calls (FS-3EBCA R20, R21). I-3EBCA-9.
describe("drawPanelTitle (FS-3EBCA R20, R21)", () => {
  function titled(panel: { x: number; y: number; width: number }, words: string) {
    const made: { x: number; y: number; words: string; style: Record<string, unknown>; origin?: number[] }[] = [];
    const scene = {
      add: {
        text: (x: number, y: number, w: string, style: Record<string, unknown>) => {
          const rec: (typeof made)[number] = { x, y, words: w, style };
          made.push(rec);
          const self: Record<string, unknown> = {
            setOrigin: (ox: number, oy: number) => ((rec.origin = [ox, oy]), self),
          };
          return self;
        },
      },
    } as unknown as Pick<Phaser.Scene, "add">;
    drawPanelTitle(scene, panel, words);
    return made;
  }

  it("should centre the words across the panel, their top a fixed inset below its top edge", () => {
    const [title] = titled({ x: 100, y: 50, width: 300 }, "INVENTORY");
    expect(title).toMatchObject({ x: 250, y: 50 + PANEL_TITLE_TOP, origin: [0.5, 0] });
    expect(PANEL_TITLE_TOP).toBe(14);
  });

  it("should draw every title in one face, size, colour and spacing", () => {
    const [title] = titled({ x: 0, y: 0, width: 200 }, "MENU");
    expect(title.style).toEqual(
      expect.objectContaining({
        fontFamily: CANVAS_FONT.body,
        fontSize: `${PANEL_TITLE_PX}px`,
        color: toCss(palette.frameBright),
        letterSpacing: PANEL_TITLE_SPACING,
      }),
    );
    expect([PANEL_TITLE_PX, PANEL_TITLE_SPACING]).toEqual([14, 4]);
  });

  it("should put the words in capitals itself, so no caller can forget", () => {
    expect(titled({ x: 0, y: 0, width: 300 }, "Party (2/4)")[0].words).toBe("PARTY (2/4)");
  });

  it("should keep its band clear of the ×: the band ends below the × box and below the title's line", () => {
    const close = frameClose({ x: 0, y: 0, width: 300 });
    expect(PANEL_TITLE_BAND).toBeGreaterThanOrEqual(close.y + close.height);
    expect(PANEL_TITLE_BAND).toBeGreaterThanOrEqual(PANEL_TITLE_TOP + Math.ceil(PANEL_TITLE_PX * 1.3));
  });
});
