import { describe, expect, it, vi } from "vitest";

// FS-84N1G R13–R15: the controls panel's × closes it on the release, lit under the pointer, its hit
// standing over the panel's ground (made after it, at the same depth), no cursor of its own.

vi.mock("./controlsPanel", async (importOriginal) => {
  const real = await importOriginal<typeof import("./controlsPanel")>();
  return {
    ...real,
    drawControlsPanel: vi.fn(() => ({
      container: { setPosition: () => {}, destroy: () => {}, list: [] },
      close: { x: 94, y: -150, width: 24, height: 24 },
      glyph: glyphs.at(-1),
    })),
  };
});

const glyphs = vi.hoisted(() => [{ colours: [] as string[], setColor(c: string) { this.colours.push(c); return this; } }]);

const { mountControlsPiece } = await import("./controlsPiece");
const { viewport } = await import("@/render/viewport");

interface Zone {
  rect: { x: number; y: number; width: number; height: number };
  depth?: number;
  handlers: Record<string, () => void>;
  config?: unknown;
  destroyed: boolean;
}

function stage() {
  const zones: Zone[] = [];
  const scene = {
    add: {
      zone: (x: number, y: number, width: number, height: number) => {
        const z: Zone = { rect: { x, y, width, height }, handlers: {}, destroyed: false };
        zones.push(z);
        const self = {
          setOrigin: () => self,
          setScrollFactor: () => self,
          setDepth: (d: number) => ((z.depth = d), self),
          setInteractive: (config?: unknown) => ((z.config = config), self),
          on: (event: string, fn: () => void) => ((z.handlers[event] = fn), self),
          destroy: () => void (z.destroyed = true),
        };
        return self;
      },
    },
  };
  return { scene: scene as never, zones };
}

describe("the controls panel's × (FS-84N1G R14)", () => {
  it("should stand the ×'s hit over the ground, at the panel's depth, where the × box is", () => {
    const { scene, zones } = stage();
    mountControlsPiece(scene, () => {});
    expect(zones).toHaveLength(2);
    const [ground, x] = zones;
    expect(ground.depth).toBe(1200);
    expect(x.depth).toBe(1200);
    expect(x.rect).toEqual({ x: viewport.centerX + 94, y: viewport.centerY - 150, width: 24, height: 24 });
    expect(x.config).toBeUndefined();
  });

  it("should close on the release over the ×, and light the × while the pointer is on it", () => {
    const { scene, zones } = stage();
    const close = vi.fn();
    mountControlsPiece(scene, close);
    const x = zones[1];
    expect(x.handlers.pointerdown).toBeUndefined();
    x.handlers.pointerover();
    x.handlers.pointerout();
    expect(glyphs.at(-1)!.colours).toHaveLength(2);
    expect(close).not.toHaveBeenCalled();
    x.handlers.pointerup();
    expect(close).toHaveBeenCalledTimes(1);
  });

  // the review of FS-84N1G: the old hit is gone with no pointerout, so the × goes back unlit
  it("should put the lit × back unlit as a new view stands its hit again", () => {
    const { scene, zones } = stage();
    const piece = mountControlsPiece(scene, () => {});
    const glyph = glyphs.at(-1)!;
    zones[1].handlers.pointerover();
    const lit = glyph.colours.at(-1);
    piece.relayout();
    expect(glyph.colours.at(-1)).not.toBe(lit);
    zones[3].handlers.pointerover();
    expect(glyph.colours.at(-1)).toBe(lit);
  });

  it("should stand the ground and then the × again on a new view, the old ones gone", () => {
    const { scene, zones } = stage();
    const piece = mountControlsPiece(scene, () => {});
    piece.relayout();
    expect(zones.map((z) => z.destroyed)).toEqual([true, true, false, false]);
    piece.destroy();
    expect(zones.every((z) => z.destroyed)).toBe(true);
  });
});
