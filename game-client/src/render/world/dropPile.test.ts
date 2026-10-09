import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { DROP_PILE, paintDropPile, type PileBrush } from "./dropPile";

/** A brush that records every colour it is given and every point it touches. */
function recordingBrush() {
  const colours = new Set<number>();
  const points: { x: number; y: number }[] = [];
  const brush: PileBrush = {
    fillStyle: (c) => void colours.add(c),
    lineStyle: (_w, c) => void colours.add(c),
    fillEllipse: (x, y, w, h) =>
      void points.push(
        { x: x - w / 2, y: y - h / 2 },
        { x: x + w / 2, y: y + h / 2 },
      ),
    fillCircle: (x, y, r) =>
      void points.push({ x: x - r, y: y - r }, { x: x + r, y: y + r }),
    fillPoints: (ps) => void points.push(...ps),
    lineBetween: (x1, y1, x2, y2) =>
      void points.push({ x: x1, y: y1 }, { x: x2, y: y2 }),
  };
  return { brush, colours, points };
}

describe("paintDropPile", () => {
  it("should catch the eye in amber, because a pile is something the delver can loot", () => {
    const { brush, colours } = recordingBrush();
    paintDropPile(brush);
    expect(colours).toContain(palette.interactable);
  });

  it("should paint in palette colours only, and none from the damage channel", () => {
    const { brush, colours } = recordingBrush();
    paintDropPile(brush);
    const known = new Set<number>(
      Object.values(palette).filter((v): v is number => typeof v === "number"),
    );
    for (const c of colours) expect(known).toContain(c);
    expect(colours).not.toContain(palette.damage);
  });

  it("should stay inside its texture", () => {
    const { brush, points } = recordingBrush();
    paintDropPile(brush);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(DROP_PILE.width);
      expect(p.y).toBeLessThanOrEqual(DROP_PILE.height);
    }
  });
});
