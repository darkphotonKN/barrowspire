import { describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import type { Reticle } from "@/scenes/pageAim";
import { palette } from "@/utils/canvasPalette";
import { PAGE_RETICLE_DEPTH, PageReticle, RETICLE_ALPHA, reticleInk, reticleShapes } from "./pageReticle";

// FS-X2CMM §H R41 (I-X2CMM-11): the armed page's reticle, drawn by the run at the pointer or under the
// body it snapped to, plain on a valid target and faint otherwise. The look stands alone so it can be
// swapped without touching the arming.

function recordingGraphics() {
  const calls: string[] = [];
  const g = {
    calls,
    destroyed: false,
    clear: () => void calls.push("clear"),
    lineStyle: (w: number, c: number, a: number) => void calls.push(`line ${w} ${c} ${a}`),
    fillStyle: (c: number, a: number) => void calls.push(`fill ${c} ${a}`),
    fillPoints: (p: unknown[]) => void calls.push(`fillPoints ${p.length}`),
    strokePoints: (p: unknown[]) => void calls.push(`strokePoints ${p.length}`),
    setDepth: (d: number) => void calls.push(`depth ${d}`),
    destroy: () => void (g.destroyed = true),
  };
  return g;
}

const ground: Reticle = { page: "witchlight", kind: "ground", at: { x: 400, y: 300 }, radius: 240, valid: true };

describe("reticleShapes (FS-X2CMM R41)", () => {
  it("should ring a ground page's effect size round its point, in the iso projection", () => {
    const [ring] = reticleShapes(ground);
    const east = worldToScreen(400 + 240, 300);
    expect(ring[0].x).toBeCloseTo(east.x);
    expect(ring[0].y).toBeCloseTo(east.y);
  });

  it("should lay the hound's paw mark rather than a ring (Call the Hound)", () => {
    const paw = reticleShapes({ ...ground, page: "call_the_hound", radius: 40 });
    // a pad and four toes
    expect(paw).toHaveLength(5);
  });
});

describe("reticleInk (FS-X2CMM R41)", () => {
  it("should wear vellum on the ground, the ally channel under a body, amber on an interactable", () => {
    expect(reticleInk("ground")).toBe(palette.reticleGround);
    expect(reticleInk("ally")).toBe(palette.reticleAlly);
    expect(reticleInk("interactable")).toBe(palette.reticleInteractable);
  });
});

describe("PageReticle (FS-X2CMM R41)", () => {
  it("should draw plain on a valid target and faint otherwise, at its depth, redrawn in place", () => {
    const made: ReturnType<typeof recordingGraphics>[] = [];
    const reticle = new PageReticle(() => {
      const g = recordingGraphics();
      made.push(g);
      return g;
    });

    reticle.draw(ground);
    reticle.draw({ ...ground, valid: false });
    expect(made).toHaveLength(1);
    const calls = made[0].calls;
    expect(calls[0]).toBe(`depth ${PAGE_RETICLE_DEPTH}`);
    expect(calls).toContain(`line 3 ${palette.reticleGround} ${RETICLE_ALPHA.valid.ring}`);
    expect(calls).toContain(`line 3 ${palette.reticleGround} ${RETICLE_ALPHA.faint.ring}`);
  });

  it("should leave nothing behind when cleared", () => {
    const made: ReturnType<typeof recordingGraphics>[] = [];
    const reticle = new PageReticle(() => {
      const g = recordingGraphics();
      made.push(g);
      return g;
    });
    reticle.clear();
    reticle.draw(ground);
    reticle.clear();
    expect(made[0].destroyed).toBe(true);
    expect(reticle.drawn).toBe(false);
  });
});
