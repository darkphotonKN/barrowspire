import { describe, expect, it } from "vitest";
import { worldToScreen, type Point } from "@/render/iso/projection";
import type { TrailState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import {
  TRAIL_SECONDS,
  TrailSet,
  trailFade,
  trailOutline,
  type TrailBrush,
} from "./trails";

const trail = (
  entity_id: string,
  remaining = 3,
  to: Point = { x: 200, y: 100 },
): TrailState => ({
  entity_id,
  from: { x: 100, y: 100 },
  to,
  half_width: 30,
  remaining,
});

/** A brush that records what it was last painted with, as a Graphics would hold it. */
function recordingBrush() {
  const brush = {
    destroyed: false,
    fills: [] as { color: number; alpha: number; points: Point[] }[],
    style: { color: 0, alpha: 1 },
    clears: 0,
    clear() {
      brush.clears++;
      brush.fills = [];
      return brush;
    },
    fillStyle(color: number, alpha = 1) {
      brush.style = { color, alpha };
      return brush;
    },
    fillPoints(points: Point[]) {
      brush.fills.push({ ...brush.style, points });
      return brush;
    },
    destroy() {
      brush.destroyed = true;
    },
  };
  return brush satisfies TrailBrush & { destroy(): void };
}

function onStage() {
  const beds: ReturnType<typeof recordingBrush>[] = [];
  const glows: ReturnType<typeof recordingBrush>[] = [];
  const set = new TrailSet({
    bed: () => {
      const b = recordingBrush();
      beds.push(b);
      return b;
    },
    glow: () => {
      const b = recordingBrush();
      glows.push(b);
      return b;
    },
  });
  const live = () => beds.filter((b) => !b.destroyed);
  return { set, beds, glows, live };
}

describe("trailOutline", () => {
  it("should cover the dashed path and half_width either side of it, ends included", () => {
    const corners = trailOutline(trail("t"));
    expect(corners).toEqual([
      worldToScreen(70, 70),
      worldToScreen(230, 70),
      worldToScreen(230, 130),
      worldToScreen(70, 130),
    ]);
  });

  it("should still burn round a dash that went nowhere", () => {
    const corners = trailOutline(trail("t", 3, { x: 100, y: 100 }));
    expect(corners).toHaveLength(4);
    expect(new Set(corners.map((p) => `${p.x},${p.y}`)).size).toBe(4);
  });

  it("should narrow by the share it is asked for", () => {
    const [a, , , d] = trailOutline(trail("t"), 0.5);
    expect(a).toEqual(worldToScreen(85, 85));
    expect(d).toEqual(worldToScreen(85, 115));
  });
});

describe("trailFade", () => {
  it.each([
    [TRAIL_SECONDS, 1],
    [1.5, 0.5],
    [0, 0],
    [-1, 0],
    [9, 1],
  ])("should be %s seconds left → %s", (remaining, fade) => {
    expect(trailFade(remaining)).toBeCloseTo(fade);
  });
});

describe("TrailSet", () => {
  it("should draw a trail that comes into state", () => {
    const { set, live, glows } = onStage();
    set.sync([trail("t1")]);
    expect(live()).toHaveLength(1);
    expect(glows).toHaveLength(1);
    expect(live()[0].fills.length).toBeGreaterThan(0);
  });

  it("should repaint a burning trail fainter as its time runs out, not build another", () => {
    const { set, beds } = onStage();
    set.sync([trail("t1", 3)]);
    const bright = Math.max(...beds[0].fills.map((f) => f.alpha));
    set.sync([trail("t1", 1)]);
    const faint = Math.max(...beds[0].fills.map((f) => f.alpha));
    expect(beds).toHaveLength(1);
    expect(faint).toBeLessThan(bright);
  });

  it("should take a trail down once it leaves state", () => {
    const { set, beds, glows } = onStage();
    set.sync([trail("t1"), trail("t2")]);
    set.sync([trail("t2")]);
    expect(beds[0].destroyed).toBe(true);
    expect(glows[0].destroyed).toBe(true);
    expect(beds[1].destroyed).toBe(false);
  });

  it("should burn in the damage family, never the interactable amber", () => {
    const { set, beds, glows } = onStage();
    set.sync([trail("t1")]);
    const colours = new Set(
      [...beds[0].fills, ...glows[0].fills].map((f) => f.color),
    );
    expect(colours).not.toContain(palette.interactable);
    expect(colours).not.toContain(palette.interactableBright);
    for (const c of colours)
      expect([
        palette.trailScorch,
        palette.trailFlame,
        palette.trailCore,
      ]).toContain(c);
  });

  it("should keep a trail's glow dark while the stage says its flame is out of sight, and light it again after", () => {
    let roofed = true;
    const glows: ReturnType<typeof recordingBrush>[] = [];
    const beds: ReturnType<typeof recordingBrush>[] = [];
    const set = new TrailSet({
      bed: () => {
        const b = recordingBrush();
        beds.push(b);
        return b;
      },
      glow: () => {
        const b = recordingBrush();
        glows.push(b);
        return b;
      },
      glowShown: () => !roofed,
    });

    set.sync([trail("t1")]);
    expect(glows[0].fills).toHaveLength(0);
    // the bed still burns on the ground: the roof covers it in the world band
    expect(beds[0].fills.length).toBeGreaterThan(0);

    roofed = false;
    set.sync([trail("t1")]);
    expect(glows[0].fills.length).toBeGreaterThan(0);

    roofed = true;
    set.sync([trail("t1")]);
    expect(glows[0].fills).toHaveLength(0);
  });

  it("should destroy every trail on clear, and forget them without touching them on forget", () => {
    const { set, beds } = onStage();
    set.sync([trail("t1")]);
    set.clear();
    expect(beds[0].destroyed).toBe(true);

    set.sync([trail("t2")]);
    set.forget();
    expect(beds[1].destroyed).toBe(false);
    set.sync([trail("t2")]);
    expect(beds).toHaveLength(3);
  });
});
