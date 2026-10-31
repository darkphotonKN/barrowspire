import { describe, expect, it } from "vitest";
import { SACK, paintSack, sackFrame, type SackBrush, type SackFrame } from "./sack";

/** A brush that records every point it touches. */
function recordingBrush() {
  const points: { x: number; y: number }[] = [];
  const box = (x: number, y: number, w: number, h: number) => void points.push({ x, y }, { x: x + w, y: y + h });
  const brush: SackBrush = {
    fillStyle: () => undefined,
    lineStyle: () => undefined,
    fillRect: box,
    fillEllipse: (x, y, w, h) => box(x - w / 2, y - h / 2, w, h),
    fillPoints: (ps) => void points.push(...ps),
    lineBetween: (x1, y1, x2, y2) => void points.push({ x: x1, y: y1 }, { x: x2, y: y2 }),
  };
  return { brush, points };
}

describe("sack (FS-1D6BX R13, R17, D3)", () => {
  it("should show the frame its server state names, on every state", () => {
    expect(sackFrame(false)).toBe("closed");
    expect(sackFrame(true)).toBe("open");
  });

  it("should name the baked sheet and its frames as the chest's are named, so the bake slots in", () => {
    expect(SACK.sheet).toBe("sack");
    expect(SACK.placeholder).toEqual({ closed: "sack_closed", open: "sack_open" });
  });

  it.each<SackFrame>(["closed", "open"])("should paint the %s placeholder inside its texture", (frame) => {
    const { brush, points } = recordingBrush();
    paintSack(brush, frame);

    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(SACK.width);
      expect(p.y).toBeLessThanOrEqual(SACK.height);
    }
  });

  it("should paint the two placeholders differently", () => {
    const closed = recordingBrush();
    const open = recordingBrush();
    paintSack(closed.brush, "closed");
    paintSack(open.brush, "open");

    expect(open.points).not.toEqual(closed.points);
  });
});
