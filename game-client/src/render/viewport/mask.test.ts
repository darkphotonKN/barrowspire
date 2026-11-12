import { describe, expect, it } from "vitest";
import {
  fillMaskArea,
  maskInView,
  type MaskCamera,
  type Maskable,
  type ViewMask,
} from "./mask";

/**
 * maskInView through fakes shaped as Phaser 4.2.1's objects are after `enableFilters()`: a Shape,
 * Graphics or Container focuses its filters on the camera's context (`filtersFocusContext`), an
 * Image or Text on itself; the filter camera starts at Phaser's origin 0.5. The two corrections
 * target bugs in `gameobjects/components/Filters.js` (ADR-0057); a Phaser bump re-runs these and
 * drops the correction Phaser has fixed.
 */

/** The game's camera: origin 0, zoom = render scale (ADR-0056). */
const camera = (zoom: number): MaskCamera & { zoom: number } => ({
  originX: 0,
  originY: 0,
  zoom,
});

interface FakeTarget extends Maskable {
  filterCamera: Maskable["filterCamera"];
  filters: Maskable["filters"];
  filterOrigin: { x: number; y: number };
  /** Where the filter camera was last scrolled, and what Phaser's own camera focus copied. */
  filterScroll: { x: number; y: number };
  focusedOn?: unknown;
  addMaskArgs?: unknown[];
  setMaskArg?: unknown;
}

interface TargetShape {
  /** What Phaser sets after `enableFilters`: true for a Shape, Graphics or Container. */
  focusContext: boolean;
  scrollFactor?: [number, number];
  width?: number;
  height?: number;
  /** false: the canvas renderer, where `enableFilters` leaves no filter list. */
  webgl?: boolean;
  canSetMask?: boolean;
  /** A Text's style: what it is rasterised at (`resolution`, the render scale by the crisp factory). */
  style?: { resolution?: number };
}

const MASK: ViewMask = { setGameObject: () => undefined, invert: false };

function target({
  focusContext,
  scrollFactor = [1, 1],
  width,
  height,
  webgl = true,
  canSetMask = true,
  style,
}: TargetShape): FakeTarget {
  const t: FakeTarget = {
    scrollFactorX: scrollFactor[0],
    scrollFactorY: scrollFactor[1],
    width,
    height,
    style,
    filtersFocusContext: false,
    filterOrigin: { x: 0.5, y: 0.5 },
    filterScroll: { x: 0, y: 0 },
    filterCamera: null,
    filters: null,
    // Phaser's own: the filter camera takes the main camera's size, scroll, rotation and zoom
    focusFiltersOnCamera(cam: { scrollX: number; scrollY: number }) {
      t.focusedOn = cam;
      t.filterScroll = { x: cam.scrollX, y: cam.scrollY };
      return t;
    },
    enableFilters() {
      if (!webgl) return t;
      t.filtersFocusContext = focusContext;
      t.filterCamera = {
        setOrigin: (x: number, y = x) => {
          t.filterOrigin = { x, y };
          return t.filterCamera;
        },
        setScroll: (x: number, y: number) => {
          t.filterScroll = { x, y };
          return t.filterCamera;
        },
      };
      t.filters = {
        external: {
          addMask: (...args: unknown[]) => {
            t.addMaskArgs = args;
            return MASK;
          },
        },
      };
      return t;
    },
  };
  if (canSetMask)
    t.setMask = (mask: unknown) => {
      t.setMaskArg = mask;
      return t;
    };
  return t;
}

/** A Graphics as a mask source: what the canvas fallback clips by. */
const GEOMETRY = { tag: "geometry mask" };
const graphicsSource = () => ({ createGeometryMask: () => GEOMETRY });
/** A render texture as a mask source: no geometry to clip by. */
const textureSource = () => ({ tag: "render texture" });

const ZOOMS = [1, 1.5, 2];

describe("maskInView", () => {
  describe("origin correction (phaserjs/phaser issue 7402: the filter camera ignores the main camera's origin)", () => {
    it.each(ZOOMS)(
      "gives a Graphics' filter camera the main camera's origin at zoom %s",
      (zoom) => {
        const t = target({ focusContext: true });
        maskInView(t, graphicsSource(), camera(zoom));
        expect(t.filterOrigin).toEqual({ x: 0, y: 0 });
      },
    );

    it.each(ZOOMS)(
      "gives a Container's filter camera the main camera's origin at zoom %s",
      (zoom) => {
        const t = target({ focusContext: true, width: 0, height: 0 });
        maskInView(t, graphicsSource(), camera(zoom));
        expect(t.filterOrigin).toEqual({ x: 0, y: 0 });
      },
    );

    it.each(ZOOMS)(
      "gives a camera-fixed object without a size the main camera's origin at zoom %s",
      (zoom) => {
        const t = target({ focusContext: true, scrollFactor: [0, 0] });
        maskInView(t, graphicsSource(), camera(zoom));
        expect(t.filterOrigin).toEqual({ x: 0, y: 0 });
        expect(t.filtersFocusContext).toBe(true);
      },
    );

    it("copies whatever origin the camera has", () => {
      const t = target({ focusContext: true });
      maskInView(t, graphicsSource(), { originX: 0.25, originY: 0.75 });
      expect(t.filterOrigin).toEqual({ x: 0.25, y: 0.75 });
    });

    it("leaves an object focused on itself (an Image) to Phaser", () => {
      const t = target({ focusContext: false, width: 40, height: 20 });
      maskInView(t, graphicsSource(), camera(1.5));
      expect(t.filterOrigin).toEqual({ x: 0.5, y: 0.5 });
      expect(t.filtersFocusContext).toBe(false);
    });
  });

  describe("scroll-factor correction (unfiled Phaser 4.2.1 bug: a context-focused filter ignores scrollFactor 0; repro in I-ADR0057-2)", () => {
    it.each(ZOOMS)(
      "focuses a camera-fixed Shape with a size on itself at zoom %s",
      (zoom) => {
        const t = target({
          focusContext: true,
          scrollFactor: [0, 0],
          width: 800,
          height: 600,
        });
        maskInView(t, textureSource(), camera(zoom));
        expect(t.filtersFocusContext).toBe(false);
      },
    );

    it("does not give a self-focused object the camera's origin: Phaser focuses it on itself", () => {
      const t = target({
        focusContext: true,
        scrollFactor: [0, 0],
        width: 800,
        height: 600,
      });
      maskInView(t, textureSource(), camera(1.5));
      expect(t.filterOrigin).toEqual({ x: 0.5, y: 0.5 });
    });

    it.each([
      ["moving with the world", [1, 1], 800, 600],
      ["fixed on one axis only", [0, 1], 800, 600],
      ["without a width", [0, 0], 0, 600],
      ["without a height", [0, 0], 800, undefined],
    ] as const)(
      "leaves a sized-or-fixed object %s focused on the context",
      (_, scrollFactor, width, height) => {
        const t = target({
          focusContext: true,
          scrollFactor: [scrollFactor[0], scrollFactor[1]],
          width,
          height,
        });
        maskInView(t, textureSource(), camera(1.5));
        expect(t.filtersFocusContext).toBe(true);
        expect(t.filterOrigin).toEqual({ x: 0, y: 0 });
      },
    );
  });

  // The owner, 2026-11-12: "信箱的內文好像解析度有點差" (FS-1GZGD § Change C6). Focused on itself, Phaser
  // 4.2.1 draws a filtered object into a framebuffer of its own size (`focusFilters` →
  // `setFilterSize(width, height)`, zoom 1/scale; `renderNodes/Camera.js` makes the internal context
  // camera.width × camera.height): a Text's width is in logical units, so text rasterised at the
  // render scale is drawn down to one px a unit there and scaled up again by the camera's zoom,
  // soft at 1.5 and 2. Focused on the context, its framebuffer is the camera's, in backing px.
  describe("text keeps its resolution (a Text is drawn through the context, not its own size)", () => {
    const view = (scrollX: number, scrollY: number) => ({ scrollX, scrollY, originX: 0, originY: 0 });

    it.each(ZOOMS)("focuses a camera-fixed Text on the context at zoom %s, with the camera's origin", (zoom) => {
      const t = target({ focusContext: false, scrollFactor: [0, 0], width: 400, height: 18, style: { resolution: zoom } });
      maskInView(t, graphicsSource(), camera(zoom));
      expect(t.filtersFocusContext).toBe(true);
      expect(t.filterOrigin).toEqual({ x: 0, y: 0 });
    });

    it("keeps a camera-fixed Text where it stands while the camera scrolls: its filter camera unscrolled", () => {
      const t = target({ focusContext: false, scrollFactor: [0, 0], width: 400, height: 18, style: { resolution: 2 } });
      maskInView(t, graphicsSource(), camera(2));
      const cam = view(300, 120);
      t.focusFiltersOnCamera!(cam);
      // Phaser's focus still ran (the camera's size and zoom), then the scroll is the Text's own
      expect(t.focusedOn).toBe(cam);
      expect(t.filterScroll).toEqual({ x: 0, y: 0 });
    });

    it("scrolls a Text's filter camera by its scroll factor: with the world at 1, half at 0.5", () => {
      const world = target({ focusContext: false, width: 40, height: 18, style: { resolution: 1.5 } });
      maskInView(world, graphicsSource(), camera(1.5));
      world.focusFiltersOnCamera!(view(300, 120));
      expect(world.filterScroll).toEqual({ x: 300, y: 120 });
      const half = target({ focusContext: false, scrollFactor: [0.5, 0], width: 40, height: 18, style: {} });
      maskInView(half, graphicsSource(), camera(1.5));
      half.focusFiltersOnCamera!(view(300, 120));
      expect(half.filterScroll).toEqual({ x: 150, y: 0 });
    });

    it("leaves an Image, which carries no style, focused on itself", () => {
      const t = target({ focusContext: false, scrollFactor: [0, 0], width: 40, height: 20 });
      maskInView(t, graphicsSource(), camera(2));
      expect(t.filtersFocusContext).toBe(false);
      t.focusFiltersOnCamera!(view(300, 120));
      expect(t.filterScroll).toEqual({ x: 300, y: 120 });
    });
  });

  describe("the mask filter", () => {
    it("masks by the source, viewed through the scene's camera, and returns the mask", () => {
      const t = target({ focusContext: true });
      const source = graphicsSource();
      const cam = camera(1.5);
      expect(maskInView(t, source, cam)).toBe(MASK);
      expect(t.addMaskArgs?.slice(0, 3)).toEqual([source, false, cam]);
    });

    it("passes invert through", () => {
      const t = target({ focusContext: false, width: 40, height: 20 });
      const source = textureSource();
      maskInView(t, source, camera(2), true);
      expect(t.addMaskArgs?.[1]).toBe(true);
    });

    it("leaves the view transform and scaleFactor at Phaser's defaults ('world', 1)", () => {
      const t = target({ focusContext: false, width: 40, height: 20 });
      maskInView(t, textureSource(), camera(1.5));
      expect(t.addMaskArgs).toHaveLength(3);
    });
  });

  describe("canvas renderer (no filters)", () => {
    it.each(ZOOMS)(
      "clips by an uninverted Graphics' geometry mask at zoom %s, returning undefined",
      (zoom) => {
        const t = target({ focusContext: false, webgl: false });
        expect(maskInView(t, graphicsSource(), camera(zoom))).toBeUndefined();
        expect(t.setMaskArg).toBe(GEOMETRY);
      },
    );

    it("leaves the target unmasked for an inverted Graphics", () => {
      const t = target({ focusContext: false, webgl: false });
      expect(
        maskInView(t, graphicsSource(), camera(1.5), true),
      ).toBeUndefined();
      expect(t.setMaskArg).toBeUndefined();
    });

    it("leaves the target unmasked for a texture source", () => {
      const t = target({ focusContext: false, webgl: false });
      expect(maskInView(t, textureSource(), camera(1.5))).toBeUndefined();
      expect(t.setMaskArg).toBeUndefined();
    });

    it("leaves a target that cannot take a geometry mask unmasked", () => {
      const t = target({
        focusContext: false,
        webgl: false,
        canSetMask: false,
      });
      expect(() => maskInView(t, graphicsSource(), camera(1.5))).not.toThrow();
    });
  });
});

/**
 * fillMaskArea: a mask's rectangular area drawn as Phaser 3.90 clipped by it. 3.90's geometry
 * mask was a stencil drawn into the game's multisampled (antialiased) canvas, so a backing px an
 * edge crosses was clipped by the share of it the area covered; Phaser 4's mask filter reads its
 * mask's alpha (`FilterMask-frag.js`: `color *= mask.a`) from a texture with no multisampling. So
 * the area is drawn in whole backing px, each at the alpha of the share the area covers.
 */
describe("fillMaskArea (I-ADR0057-3: a clip at a fractional render scale as 3.90's)", () => {
  type Fill = { x: number; y: number; width: number; height: number; alpha: number };
  const drawn = (rect: { x: number; y: number; width: number; height: number }, rs: number) => {
    const fills: Fill[] = [];
    let alpha = 1;
    const shape = {
      fillStyle: (_colour: number, a = 1) => void (alpha = a),
      fillRect: (x: number, y: number, width: number, height: number) =>
        void fills.push({ x, y, width, height, alpha }),
    };
    fillMaskArea(shape, rect, 0, rs);
    return fills;
  };
  /** How much of backing px (col, row) the drawn mask lets through. */
  const through = (fills: Fill[], rs: number, col: number, row: number) =>
    fills.reduce((sum, f) => {
      const w = Math.min(col + 1, (f.x + f.width) * rs) - Math.max(col, f.x * rs);
      const h = Math.min(row + 1, (f.y + f.height) * rs) - Math.max(row, f.y * rs);
      return w > 1e-6 && h > 1e-6 ? sum + f.alpha * w * h : sum;
    }, 0);
  const chat = { x: 15, y: 497, width: 410, height: 172 };
  const whole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

  it.each([1, 2])("should draw the area as it is, at full alpha, where it lies on whole backing px (render scale %s)", (rs) => {
    expect(drawn(chat, rs)).toEqual([{ ...chat, alpha: 1 }]);
  });

  it.each([
    // rs, top row and its share, bottom row and its share, left col, right col and their shares
    [1.5, 745, 0.5, 1003, 0.5, 22, 0.5, 637, 0.5],
    [1.25, 621, 0.75, 836, 0.25, 18, 0.25, 531, 0.25],
  ])(
    "should let each backing px an edge crosses through by the share the area covers, and every other px wholly or not at all (render scale %s)",
    (rs, top, topShare, bottom, bottomShare, left, leftShare, right, rightShare) => {
      const fills = drawn(chat, rs);
      for (const f of fills) {
        for (const v of [f.x, f.y, f.x + f.width, f.y + f.height]) expect(whole(v * rs)).toBe(true);
      }
      const mid = 300;
      const midRow = 900 * (rs / 1.5);
      expect(through(fills, rs, mid, top - 1)).toBeCloseTo(0);
      expect(through(fills, rs, mid, top)).toBeCloseTo(topShare);
      expect(through(fills, rs, mid, top + 1)).toBeCloseTo(1);
      expect(through(fills, rs, mid, bottom - 1)).toBeCloseTo(1);
      expect(through(fills, rs, mid, bottom)).toBeCloseTo(bottomShare);
      expect(through(fills, rs, mid, bottom + 1)).toBeCloseTo(0);
      expect(through(fills, rs, left, midRow)).toBeCloseTo(leftShare);
      expect(through(fills, rs, left + 1, midRow)).toBeCloseTo(1);
      expect(through(fills, rs, right, midRow)).toBeCloseTo(rightShare);
      expect(through(fills, rs, right + 1, midRow)).toBeCloseTo(0);
      expect(through(fills, rs, left, top)).toBeCloseTo(leftShare * topShare);
    },
  );

  it("should let through, in all, exactly the area's size in backing px", () => {
    const rs = 1.5;
    const total = drawn(chat, rs).reduce((s, f) => s + f.alpha * f.width * f.height * rs * rs, 0);
    expect(total).toBeCloseTo(chat.width * chat.height * rs * rs);
  });

  it("should draw a sliver inside one backing px as that px's share", () => {
    const fills = drawn({ x: 10.1, y: 20.1, width: 0.2, height: 4 }, 1);
    expect(through(fills, 1, 10, 22)).toBeCloseTo(0.2);
    expect(fills.every((f) => f.alpha > 0 && f.width > 0 && f.height > 0)).toBe(true);
  });

  it("should draw nothing for an area with no size (a folded window's messages)", () => {
    expect(drawn({ x: 15, y: 497, width: 410, height: 0 }, 1.5)).toEqual([]);
  });
});
