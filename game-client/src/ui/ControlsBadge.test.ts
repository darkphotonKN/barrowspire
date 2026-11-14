import { describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import { ControlsBadge } from "./ControlsBadge";
import { CONTROLS_BADGE_LABEL, controlsBadgeFrame } from "./hudCornerLayout";

// FS-84N1G R3, R5–R9: the controls badge on its plate, at the corner row's depth, its book drawn in lines
// where the scene makes no knockout texture (a stand-in scene makes none), its label and hover on the
// pointer, its press on the release, no cursor of its own

function stage() {
  const zones: { rect: number[]; depth?: number; config?: unknown; handlers: Record<string, () => void>; destroyed: boolean }[] = [];
  const texts: { words: string; destroyed: boolean }[] = [];
  const strokes: string[] = [];
  const self = <T extends object>(o: T): T =>
    new Proxy(o, { get: (t, prop) => (prop in t ? (t as Record<string | symbol, unknown>)[prop] : () => self(o)) }) as T;
  const scene = {
    add: {
      graphics: () =>
        self({
          clear: () => (strokes.length = 0, self({})),
          strokePath: () => void strokes.push("path"),
          strokeCircle: () => void strokes.push("circle"),
        }),
      zone: (x: number, y: number, w: number, h: number) => {
        const z = { rect: [x, y, w, h], handlers: {} as Record<string, () => void>, destroyed: false } as (typeof zones)[number];
        zones.push(z);
        const api: Record<string, unknown> = {
          setDepth: (d: number) => ((z.depth = d), api),
          setInteractive: (config?: unknown) => ((z.config = config), api),
          on: (event: string, fn: () => void) => ((z.handlers[event] = fn), api),
          destroy: () => void (z.destroyed = true),
          setPosition: (nx: number, ny: number) => ((z.rect = [nx, ny, w, h]), api),
        };
        return self(api);
      },
      text: (_x: number, _y: number, words: string) => {
        const t = { words, destroyed: false };
        texts.push(t);
        return self({ width: 80, destroy: () => void (t.destroyed = true) });
      },
    },
  };
  return { scene: scene as never, zones, texts, strokes };
}

describe("the controls badge (FS-84N1G R3, R5–R9)", () => {
  it("should stand its press area on its plate at the corner row's depth, with no cursor of its own", () => {
    const { scene, zones } = stage();
    new ControlsBadge(scene, { press: () => {}, hovered: () => {} });
    const f = controlsBadgeFrame(viewport);
    expect(zones.map((z) => [z.rect, z.depth, z.config])).toEqual([[[f.x, f.y, f.width, f.height], 1000, undefined]]);
  });

  it("should draw its book in lines where the scene makes no knockout texture", () => {
    const { scene, strokes } = stage();
    new ControlsBadge(scene, { press: () => {}, hovered: () => {} });
    expect(strokes.length).toBeGreaterThan(0);
  });

  it("should name itself on the pointer, tell the hover, and take it away as the pointer leaves", () => {
    const { scene, zones, texts } = stage();
    const hovered = vi.fn();
    new ControlsBadge(scene, { press: () => {}, hovered });
    zones[0].handlers.pointerover();
    expect(texts.filter((t) => !t.destroyed).map((t) => t.words)).toEqual([CONTROLS_BADGE_LABEL]);
    expect(hovered).toHaveBeenCalledTimes(1);
    zones[0].handlers.pointerout();
    expect(texts.filter((t) => !t.destroyed)).toEqual([]);
  });

  it("should answer a press on the release, not on the press", () => {
    const { scene, zones } = stage();
    const press = vi.fn();
    new ControlsBadge(scene, { press, hovered: () => {} });
    expect(zones[0].handlers.pointerdown).toBeUndefined();
    zones[0].handlers.pointerup();
    expect(press).toHaveBeenCalledTimes(1);
  });

  it("should go down whole", () => {
    const { scene, zones, texts } = stage();
    const badge = new ControlsBadge(scene, { press: () => {}, hovered: () => {} });
    zones[0].handlers.pointerover();
    badge.destroy();
    expect(zones[0].destroyed).toBe(true);
    expect(texts.every((t) => t.destroyed)).toBe(true);
  });
});
