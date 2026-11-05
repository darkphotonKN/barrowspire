import { describe, expect, it, vi } from "vitest";
import {
  RENDER_SCALE_CAP,
  Viewport,
  backingSize,
  fitView,
  type View,
} from "./viewport";

describe("fitView (FS-ZAJMH R2, R3: the logical view and the render scale)", () => {
  it.each([
    [1, 1],
    [1.25, 1.25],
    [1.5, 1.5],
    [2, 2],
    [3, 2],
  ])(
    "should draw at render scale %s → %s at 1080×720 CSS px, the logical view staying 1080×720",
    (dpr, scale) => {
      expect(fitView({ width: 1080, height: 720 }, dpr)).toEqual({
        width: 1080,
        height: 720,
        renderScale: scale,
        cssScale: 1,
      });
    },
  );

  it("should cap the render scale at the one named constant, 2", () => {
    expect(RENDER_SCALE_CAP).toBe(2);
    expect(fitView({ width: 1080, height: 720 }, 4).renderScale).toBe(
      RENDER_SCALE_CAP,
    );
  });

  it("should fall back to render scale 1 when the ratio is missing or nonsense", () => {
    for (const dpr of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(fitView({ width: 1080, height: 720 }, dpr).renderScale).toBe(1);
  });
});

/** The canvas's CSS size: the logical view at its CSS scale. The rest of the frame is bars. */
const shown = (view: View) => ({
  width: view.width * (view.cssScale ?? 1),
  height: view.height * (view.cssScale ?? 1),
});

describe("fitView (FS-ZAJMH R7–R9: the logical view follows the frame's shape)", () => {
  it.each([
    [1.2, 1080],
    [1.5, 1080],
    [1.6, 1152],
    [16 / 9, 1280],
    [2.4, 1280],
  ])(
    "should give a frame of aspect %s a logical view %s wide and 720 tall",
    (aspect, width) => {
      const view = fitView({ width: 720 * aspect, height: 720 }, 1);
      expect([view.width, view.height]).toEqual([width, 720]);
    },
  );

  it.each([
    // frame, logical width, bars left/right, bars top/bottom
    [{ width: 864, height: 720 }, 1080, 0, 72], // 1.2: taller than 3:2, bars above and below
    [{ width: 1080, height: 720 }, 1080, 0, 0],
    [{ width: 1152, height: 720 }, 1152, 0, 0],
    [{ width: 1280, height: 720 }, 1280, 0, 0],
    [{ width: 1728, height: 720 }, 1280, 224, 0], // 2.4: wider than 16:9, bars at the sides
  ])(
    "should letterbox a %o frame only outside 3:2–16:9 (R8)",
    (frame, width, sideBar, topBar) => {
      const view = fitView(frame, 1);
      const css = shown(view);
      expect(view.width).toBe(width);
      expect((frame.width - css.width) / 2).toBeCloseTo(sideBar);
      expect((frame.height - css.height) / 2).toBeCloseTo(topBar);
    },
  );

  it("should scale the canvas up to fill a bigger frame, the render scale following its CSS size (R3, R9)", () => {
    const view = fitView({ width: 1920, height: 1080 }, 1);
    expect(view).toEqual({
      width: 1280,
      height: 720,
      renderScale: 1.5,
      cssScale: 1.5,
    });
    expect(fitView({ width: 1920, height: 1080 }, 2).renderScale).toBe(
      RENDER_SCALE_CAP,
    );
  });

  it("should shrink the canvas below 1080×720, still fully visible (R9)", () => {
    const view = fitView({ width: 810, height: 540 }, 2);
    expect(view).toEqual({
      width: 1080,
      height: 720,
      renderScale: 1.5,
      cssScale: 0.75,
    });
    expect(shown(view)).toEqual({ width: 810, height: 540 });
  });

  it("should fall back to the 1080×720 view at its own size while the frame has no size yet", () => {
    for (const frame of [
      { width: 0, height: 0 },
      { width: 1080, height: 0 },
      { width: Number.NaN, height: 720 },
    ])
      expect(fitView(frame, 2)).toEqual({
        width: 1080,
        height: 720,
        renderScale: 2,
        cssScale: 1,
      });
  });
});

describe("backingSize (FS-ZAJMH AC: DPR 2 at 1080×720 → 2160×1440)", () => {
  it.each([
    [1, 1080, 720],
    [1.5, 1620, 1080],
    [2, 2160, 1440],
    [1.1, 1188, 792],
  ])(
    "should give the backing store at render scale %s as %s×%s whole px",
    (renderScale, width, height) => {
      expect(backingSize({ width: 1080, height: 720, renderScale })).toEqual({
        width,
        height,
      });
    },
  );
});

describe("Viewport (FS-ZAJMH R2: one owner of the logical view)", () => {
  it("should start at today's 1080×720 at render scale 1", () => {
    const v = new Viewport();
    expect([v.width, v.height, v.renderScale, v.centerX, v.centerY]).toEqual([
      1080, 720, 1, 540, 360,
    ]);
  });

  it("should tell its listeners when the render scale changes, and stay quiet when nothing did", () => {
    const v = new Viewport();
    const heard = vi.fn();
    v.onChange(heard);
    v.set({ width: 1080, height: 720, renderScale: 1 });
    expect(heard).not.toHaveBeenCalled();
    v.set({ width: 1080, height: 720, renderScale: 2 });
    expect(heard).toHaveBeenCalledWith({
      width: 1080,
      height: 720,
      renderScale: 2,
      cssScale: 1,
    });
    expect(v.renderScale).toBe(2);
  });

  it("should stop telling a listener once it unsubscribes", () => {
    const v = new Viewport();
    const heard = vi.fn();
    const stop = v.onChange(heard);
    stop();
    v.set({ width: 1080, height: 720, renderScale: 2 });
    expect(heard).not.toHaveBeenCalled();
  });

  it("should tell every listener when one of them throws, and report the error", () => {
    const v = new Viewport();
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new TypeError("a destroyed scene");
    const before = vi.fn();
    const after = vi.fn();
    v.onChange(before);
    v.onChange(() => {
      throw boom;
    });
    v.onChange(after);
    expect(() =>
      v.set({ width: 1280, height: 720, renderScale: 2 }),
    ).not.toThrow();
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(v.width).toBe(1280);
    expect(report).toHaveBeenCalledWith(expect.any(String), boom);
    report.mockRestore();
  });

  it.each([1, 1.5, 2])(
    "should map a pointer's backing px to logical units at render scale %s (R15)",
    (renderScale) => {
      const v = new Viewport();
      v.set({ width: 1080, height: 720, renderScale });
      expect(
        v.toLogical({ x: 300 * renderScale, y: 650 * renderScale }),
      ).toEqual({ x: 300, y: 650 });
    },
  );
});
