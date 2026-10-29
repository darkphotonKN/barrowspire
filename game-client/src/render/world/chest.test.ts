import { describe, expect, it } from "vitest";
import { CHEST, chestFrame, paintChest, type ChestBrush, type ChestFrame } from "./chest";

/** A brush that records every rect it touches. */
function recordingBrush() {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const brush: ChestBrush = {
    fillStyle: () => undefined,
    lineStyle: () => undefined,
    fillRect: (x, y, w, h) => void rects.push({ x, y, w, h }),
    strokeRect: (x, y, w, h) => void rects.push({ x, y, w, h }),
  };
  return { brush, rects };
}

describe("chest", () => {
  it("should show the frame its server state names, on every state", () => {
    expect(chestFrame(false)).toBe("closed");
    expect(chestFrame(true)).toBe("open");
  });

  it("should keep the run's sheet and placeholder keys", () => {
    expect(CHEST.sheet).toBe("chest");
    expect(CHEST.placeholder).toEqual({ closed: "chest_closed", open: "chest_open" });
  });

  it.each<ChestFrame>(["closed", "open"])("should paint the %s placeholder inside its texture", (frame) => {
    const { brush, rects } = recordingBrush();
    paintChest(brush, frame);

    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(CHEST.width);
      expect(r.y + r.h).toBeLessThanOrEqual(CHEST.height);
    }
  });

  it("should paint the two placeholders differently", () => {
    const closed = recordingBrush();
    const open = recordingBrush();
    paintChest(closed.brush, "closed");
    paintChest(open.brush, "open");

    expect(open.rects).not.toEqual(closed.rects);
  });
});
