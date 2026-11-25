import { describe, expect, it } from "vitest";
import { COUNTDOWN_BAR_H } from "./countdownBar";
import { CAST_BAR, CastBar, castBarFraction, castBarRects, type CastBarGraphics, type CastBarStage } from "./castBar";
import { PAGE_ROUNDEL_SIZE } from "./pageRoundel";
import type { Rect } from "./partyPanelLayout";

// FS-X2CMM §H R43 (I-X2CMM-11): while the owner's `book.casting` is present a small bar under the player's
// feet fills toward the cast's total, the page's roundel at cast-bar size on its left; it clears as the
// cast goes. The server counts the cast; the bar only draws what a state said.

describe("castBarFraction (R43)", () => {
  it("should be the cast's elapsed share of its total, run on by the time since the state", () => {
    expect(castBarFraction({ page: "witchlight", remaining: 1, total: 2 })).toBe(0.5);
    expect(castBarFraction({ page: "witchlight", remaining: 1, total: 2 }, 500)).toBe(0.75);
  });

  it("should never pass full, never go below empty, and be empty for a cast with no total", () => {
    expect(castBarFraction({ page: "witchlight", remaining: 0.1, total: 2 }, 5000)).toBe(1);
    expect(castBarFraction({ page: "witchlight", remaining: 3, total: 2 })).toBe(0);
    expect(castBarFraction({ page: "witchlight", remaining: 0, total: 0 })).toBe(0);
  });
});

describe("castBarRects (R43)", () => {
  it("should stand under the feet, the roundel at cast-bar size on the bar's left, centred on it", () => {
    const { bar, roundel } = castBarRects({ x: 500, y: 300 });
    expect(bar.height).toBe(COUNTDOWN_BAR_H);
    expect(bar.width).toBe(CAST_BAR.width);
    expect(roundel.width).toBe(PAGE_ROUNDEL_SIZE.castBar);
    expect(roundel.x + roundel.width).toBeLessThan(bar.x);
    expect(roundel.y + roundel.height / 2).toBeCloseTo(bar.y + bar.height / 2);
    // the whole under the feet, centred on them
    expect(roundel.y).toBeGreaterThan(300);
    expect((roundel.x + bar.x + bar.width) / 2).toBeCloseTo(500);
  });
});

function onStage(roundelShows = true) {
  const log: string[] = [];
  const graphics: { destroyed: boolean }[] = [];
  const stage: CastBarStage = {
    graphics: () => {
      const g = {
        destroyed: false,
        clear: () => void log.push("clear"),
        fillStyle: () => void log.push("fillStyle"),
        fillRect: (_x: number, _y: number, w: number) => void log.push(`fillRect ${Math.round(w)}`),
        lineStyle: () => void log.push("lineStyle"),
        strokeRect: () => void log.push("strokeRect"),
        beginPath: () => void log.push("beginPath"),
        moveTo: () => {},
        lineTo: () => {},
        strokePath: () => void log.push("strokePath"),
        closePath: () => {},
        strokeCircle: () => void log.push("strokeCircle"),
        destroy: () => void (g.destroyed = true),
      };
      graphics.push(g);
      return g as unknown as CastBarGraphics;
    },
    roundel: (page) => {
      log.push(`roundel ${page}`);
      return {
        show: (rect: Rect, state) => (log.push(`show ${state} ${rect.width}`), roundelShows),
        destroy: () => void log.push(`destroy ${page}`),
      };
    },
  };
  return { stage, log, graphics, bar: new CastBar(stage) };
}

describe("CastBar (R43)", () => {
  it("should draw nothing while no cast is heard", () => {
    const t = onStage();
    t.bar.hear(undefined, 0);
    t.bar.frame({ x: 0, y: 0 }, 0);
    expect(t.log).toEqual([]);
  });

  it("should fill while casting is present, with the page's ready roundel at its left", () => {
    const t = onStage();
    t.bar.hear({ page: "binding_glyph", remaining: 2, total: 2.5 }, 1000);
    t.bar.frame({ x: 100, y: 100 }, 1000);
    expect(t.log).toContain("roundel binding_glyph");
    expect(t.log).toContain(`show ready ${PAGE_ROUNDEL_SIZE.castBar}`);
    // the fill: a fifth of the bar
    expect(t.log).toContain(`fillRect ${Math.round(CAST_BAR.width * 0.2)}`);
  });

  it("should keep its roundel across the cast's ticks, and clear as casting goes", () => {
    const t = onStage();
    t.bar.hear({ page: "witchlight", remaining: 1, total: 1 }, 0);
    t.bar.hear({ page: "witchlight", remaining: 0.5, total: 1 }, 500);
    expect(t.log.filter((l) => l.startsWith("roundel"))).toHaveLength(1);
    t.bar.frame({ x: 0, y: 0 }, 500);
    t.bar.hear(undefined, 600);
    expect(t.log).toContain("destroy witchlight");
    expect(t.graphics.every((g) => g.destroyed)).toBe(true);
  });

  it("should build the new page's roundel when a cast of another page follows", () => {
    const t = onStage();
    t.bar.hear({ page: "witchlight", remaining: 1, total: 1 }, 0);
    t.bar.hear({ page: "levitate", remaining: 1.5, total: 1.5 }, 100);
    expect(t.log).toEqual(["roundel witchlight", "destroy witchlight", "roundel levitate"]);
  });

  it("should draw the page's lines where the roundel cannot stand", () => {
    const t = onStage(false);
    t.bar.hear({ page: "witchlight", remaining: 1, total: 1 }, 0);
    t.bar.frame({ x: 0, y: 0 }, 0);
    expect(t.log).toContain("strokePath");
  });

  it("should draw nothing for a page the client does not know", () => {
    const t = onStage();
    t.bar.hear({ page: "not_a_page", remaining: 1, total: 1 }, 0);
    t.bar.frame({ x: 0, y: 0 }, 0);
    expect(t.log).toEqual([]);
  });
});
