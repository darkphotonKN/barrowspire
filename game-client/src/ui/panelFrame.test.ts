import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { palette, toCss } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { FRAME_CLOSE_PX, drawPanelFrame, frameClose, lightClose } from "./panelFrame";

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
});
