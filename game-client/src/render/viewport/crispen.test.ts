import { describe, expect, it, vi } from "vitest";
import { crispen } from "./crispen";
import { viewport } from "./viewport";

/** A Phaser Text as far as crispen reads it: its style's resolution and how it is changed. */
const label = (resolution: number) => {
  const style = { resolution };
  return {
    style,
    setResolution: vi.fn((r: number): void => {
      style.resolution = r;
    }),
  };
};

describe("crispen (FS-ZAJMH R5: re-laid-out HUD text stays crisp)", () => {
  it("should rasterise moved text again at the render scale it is given", () => {
    const t = label(1);
    crispen([t], 2);
    expect(t.setResolution).toHaveBeenCalledWith(2);
  });

  it("should take the render scale of now when given none", () => {
    viewport.set({ width: 1280, height: 720, renderScale: 2 });
    const t = label(1);
    crispen([t]);
    expect(t.setResolution).toHaveBeenCalledWith(2);
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
  });

  it("should leave text already at the render scale alone: a re-rasterise is not free", () => {
    const t = label(2);
    crispen([t], 2);
    expect(t.setResolution).not.toHaveBeenCalled();
  });

  it("should reach text held in containers, however deep, and pass over what is not text", () => {
    const inner = label(1);
    const outer = label(1);
    const graphics = { clear: vi.fn() };
    crispen(
      [{ list: [outer, graphics, { list: [inner] }] }, undefined, null],
      1.5,
    );
    expect(outer.setResolution).toHaveBeenCalledWith(1.5);
    expect(inner.setResolution).toHaveBeenCalledWith(1.5);
  });
});
