import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastRatio } from "@/render/lighting/lighting";
import { viewport } from "@/render/viewport";
import { FULLSCREEN_CORNER } from "@/render/viewport/fullscreenButton";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { MINIMAP, MINIMAP_GLYPH, minimapPanel } from "./minimap";
import {
  MINIMAP_MODE_HINT,
  MINIMAP_MODE_ICON,
  MinimapModeIcon,
  minimapModeIconPlace,
  type ModeIconStage,
} from "./minimapModeIcon";
import { topRightCorner } from "./topRightColumn";

// FS-56CKV §Change: Map mode icon (owner 2026-11-12: "右上角地圖左下角多加小icon hover顯示可以切換大小或是
// 模式(M)"): the icon's place in every mode, its glyph, its hit area, its hint and its press.

const viewOf = (width: number) => ({ width, height: 720 });
const NORMAL = { ...MINIMAP, mode: "normal" as const };
const ENLARGED = { ...minimapPanel("enlarged"), mode: "enlarged" as const };
const OVERLAY = { ...MINIMAP, mode: "overlay" as const };

afterEach(() => {
  viewport.set({ width: 800, height: 600, renderScale: 1 });
  vi.restoreAllMocks();
});

describe("the map mode icon's place (FS-56CKV §Change: Map mode icon, D2–D4)", () => {
  it.each([
    [1080, 858, 105],
    [1280, 1058, 105],
  ])("should stand its 9 × 9 box 4 px inside the normal map's bottom-left at width %i (D2)", (width, x, y) => {
    const corner = topRightCorner(viewOf(width), NORMAL);
    const map = corner.minimap!;
    expect(corner.modeIcon?.box).toEqual({ x, y, width: 9, height: 9 });
    expect(corner.modeIcon!.box.x).toBe(map.x + 4);
    expect(corner.modeIcon!.box.y + 9).toBe(map.y + map.height - 4);
  });

  it.each([
    [1080, 750, 159],
    [1280, 950, 159],
  ])("should stand it 4 px inside the enlarged map's bottom-left at its own size, at width %i (D2)", (width, x, y) => {
    const corner = topRightCorner(viewOf(width), ENLARGED);
    expect(corner.modeIcon?.box).toEqual({ x, y, width: 9, height: 9 });
    expect(corner.modeIcon!.box.y + 9).toBe(10 + 162 - 4);
  });

  it.each([
    [1080, 1039],
    [1280, 1239],
  ])("should stand it left of the fullscreen button in its corner, 6 px off and centred on its height, in the overlay, at width %i (D3)", (width, x) => {
    const corner = topRightCorner(viewOf(width), OVERLAY);
    expect(corner.button).toEqual(FULLSCREEN_CORNER);
    expect(corner.modeIcon?.box).toEqual({ x, y: 12, width: 9, height: 9 });
    // the button x width − 26 to width − 6, y 6–26
    expect(corner.modeIcon!.box.x + 9).toBe(width - 26 - 6);
  });

  it("should stand none where no minimap is (D4)", () => {
    expect(topRightCorner(viewOf(1080), null).modeIcon).toBeNull();
    expect(minimapModeIconPlace(null, false, FULLSCREEN_CORNER, viewOf(1080))).toBeNull();
  });

  it.each([NORMAL, ENLARGED, OVERLAY])("should give it a 13 × 13 hit area, its box grown 2 px each side (D5, %o)", (minimap) => {
    const { box, hit } = topRightCorner(viewOf(1080), minimap).modeIcon!;
    expect(hit).toEqual({ x: box.x - 2, y: box.y - 2, width: 13, height: 13 });
    expect(MINIMAP_MODE_ICON.pad).toBe(2);
  });

  it.each([NORMAL, ENLARGED])("should keep its hit area inside the map, off its rim (D5, %o)", (minimap) => {
    const { minimap: map, modeIcon } = topRightCorner(viewOf(1080), minimap);
    const rim = minimapPanel(minimap.mode).rim;
    expect(modeIcon!.hit.x).toBeGreaterThanOrEqual(map!.x + rim);
    expect(modeIcon!.hit.y + modeIcon!.hit.height).toBeLessThanOrEqual(map!.y + map!.height - rim);
  });

  it.each([
    [NORMAL, 854 - 6, 109.5],
    [ENLARGED, 746 - 6, 163.5],
    [OVERLAY, 1039 - 6, 16.5],
  ])("should stand the hint's right edge 6 px left of the map, or of the icon in the overlay, centred on the icon (D7, %o)", (minimap, right, middle) => {
    expect(topRightCorner(viewOf(1080), minimap).modeIcon?.hint).toEqual({ right, middle });
  });

  it("should land every edge on a whole logical px", () => {
    for (const minimap of [NORMAL, ENLARGED, OVERLAY]) {
      const { box, hit } = topRightCorner({ width: 1080.4, height: 720 }, minimap).modeIcon!;
      for (const v of [box.x, box.y, hit.x, hit.y]) expect(Number.isInteger(v)).toBe(true);
    }
  });
});

type Drawn = { kind: string; calls: [string, ...unknown[]][]; x: number; y: number; visible: boolean; depth?: number; scroll?: number; destroyed: boolean; width: number; height: number; words?: string; style?: unknown };

/** The scene as the icon asks it: each object made, and every call on it. */
function fakeStage() {
  const made: Drawn[] = [];
  const make = (kind: string, extra: Partial<Drawn> = {}) => {
    const d: Drawn = { kind, calls: [], x: 0, y: 0, visible: true, destroyed: false, width: 0, height: 0, ...extra };
    made.push(d);
    const self: Record<string, unknown> = new Proxy(d as unknown as Record<string, unknown>, {
      get: (t, key) => {
        if (key in t) return t[key as string];
        if (key === "setPosition") return (x: number, y: number) => ((d.x = x), (d.y = y), self);
        if (key === "setVisible") return (v: boolean) => ((d.visible = v), self);
        if (key === "setDepth") return (v: number) => ((d.depth = v), self);
        if (key === "setScrollFactor") return (v: number) => ((d.scroll = v), self);
        if (key === "destroy") return () => void (d.destroyed = true);
        return (...args: unknown[]) => (d.calls.push([key as string, ...args]), self);
      },
    });
    return self;
  };
  const stage = {
    graphics: () => make("graphics"),
    // as Phaser measures "Map mode (M)" at 12 px in the body face, near enough
    text: (words: string, style: unknown) => make("text", { words, style, width: 74.4, height: 15.2 }),
  } as unknown as ModeIconStage;
  return { stage, made };
}

function icon(blocked = () => false) {
  const { stage, made } = fakeStage();
  const press = vi.fn();
  const subject = new MinimapModeIcon(stage, { press, blocked });
  const [glyph, ground] = made.filter((m) => m.kind === "graphics");
  const hint = made.find((m) => m.kind === "text")!;
  return { icon: subject, press, made, glyph, ground, hint };
}

const placeAt = (minimap: typeof NORMAL | typeof ENLARGED | typeof OVERLAY, width = 1080) => topRightCorner(viewOf(width), minimap).modeIcon;

describe("MinimapModeIcon (FS-56CKV §Change: Map mode icon, D1, D5–D7)", () => {
  it("should draw nested squares round a dark middle, 7 × 7 ink on a 1 px ring, the map marks' build (D1)", () => {
    expect(MINIMAP_MODE_ICON.art).toEqual(["#######", "#ooooo#", "#o###o#", "#o#o#o#", "#o###o#", "#ooooo#", "#######"]);
    expect(MINIMAP_GLYPH).toEqual({ ink: 7, ring: 1, box: 9 });
  });

  it("should draw its glyph in the ring's dark and the interactable amber, every rect on whole px inside its 9 × 9 box, at the box's top-left, over the minimap (D1)", () => {
    const { icon: i, glyph } = icon();
    i.place(placeAt(NORMAL)!);
    expect([glyph.x, glyph.y]).toEqual([858, 105]);
    expect(glyph.scroll).toBe(0);
    expect(glyph.depth).toBe(MINIMAP.depth + 1);
    expect(MINIMAP_MODE_ICON.depth).toBe(MINIMAP.depth + 1);
    const fills = glyph.calls.filter(([c]) => c === "fillStyle").map(([, colour]) => colour);
    expect(fills).toEqual([palette.markerStroke, palette.interactable]);
    const rects = glyph.calls.filter(([c]) => c === "fillRect").map(([, ...r]) => r as number[]);
    expect(rects.length).toBeGreaterThan(0);
    for (const [x, y, w, h] of rects) {
      for (const v of [x, y, w, h]) expect(Number.isInteger(v)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(9);
      expect(y + h).toBeLessThanOrEqual(9);
    }
    // the whole box is covered: the ring's dark fills it, so nothing of the map shows through
    let colour: unknown;
    const ring: number[][] = [];
    for (const [c, ...args] of glyph.calls) {
      if (c === "fillStyle") colour = args[0];
      if (c === "fillRect" && colour === palette.markerStroke) ring.push(args as number[]);
    }
    const covered = new Set<string>();
    for (const [x, y, w, h] of ring) for (let a = x; a < x + w; a++) for (let b = y; b < y + h; b++) covered.add(`${a},${b}`);
    expect(covered.size).toBe(81);
  });

  it("should keep the ink at 3:1 or better against its ring, normal and hovered (D1)", () => {
    expect(contrastRatio(palette.interactable, palette.markerStroke)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.interactableBright, palette.markerStroke)).toBeGreaterThanOrEqual(3);
  });

  it("should say where its hit area is, and nothing outside it, the rest of the map included (D5)", () => {
    const { icon: i } = icon();
    i.place(placeAt(NORMAL)!);
    // the hit area x 856–869, y 103–116
    expect(i.covers(856, 103)).toBe(true);
    expect(i.covers(868.9, 115.9)).toBe(true);
    expect(i.covers(855, 110)).toBe(false);
    expect(i.covers(869, 110)).toBe(false);
    expect(i.covers(860, 102)).toBe(false);
    expect(i.covers(900, 60)).toBe(false);
  });

  it("should take nothing and show nothing where no minimap is (D4)", () => {
    const { icon: i, glyph, press, hint } = icon();
    i.place(placeAt(NORMAL)!);
    i.place(null);
    expect(glyph.visible).toBe(false);
    expect(i.covers(860, 110)).toBe(false);
    i.pointerMove(860, 110);
    expect(hint.visible).toBe(false);
    expect(i.pointerDown(860, 110)).toBe(false);
    expect(press).not.toHaveBeenCalled();
  });

  it("should step the mode on a primary press in its hit area, and take that press (D6)", () => {
    const { icon: i, press } = icon();
    i.place(placeAt(NORMAL)!);
    expect(i.pointerDown(860, 110)).toBe(true);
    expect(press).toHaveBeenCalledTimes(1);
  });

  it("should take a press of another button in its hit area without stepping, and leave one outside it to the game (D5, D6)", () => {
    const { icon: i, press } = icon();
    i.place(placeAt(NORMAL)!);
    expect(i.pointerDown(860, 110, false)).toBe(true);
    expect(i.pointerDown(855, 110)).toBe(false);
    expect(press).not.toHaveBeenCalled();
  });

  it("should take a press while a guard holds and do nothing with it (D6)", () => {
    let guarded = true;
    const { icon: i, press } = icon(() => guarded);
    i.place(placeAt(NORMAL)!);
    expect(i.pointerDown(860, 110)).toBe(true);
    expect(press).not.toHaveBeenCalled();
    guarded = false;
    i.pointerDown(860, 110);
    expect(press).toHaveBeenCalledTimes(1);
  });

  it("should show \"Map mode (M)\" on hover in the item tip's look, left of the map and centred on the icon, and brighten its ink (D7)", () => {
    const { icon: i, glyph, ground, hint } = icon();
    i.place(placeAt(NORMAL)!);
    expect(hint.visible).toBe(false);
    expect(ground.visible).toBe(false);
    glyph.calls.length = 0;
    i.pointerMove(860, 110);
    expect(i.hovered).toBe(true);
    expect(hint.words).toBe("Map mode (M)");
    expect(MINIMAP_MODE_HINT.text).toBe("Map mode (M)");
    expect(hint.style).toEqual({ fontFamily: CANVAS_FONT.body, fontSize: "12px", color: toCss(palette.hudText) });
    expect([hint.visible, ground.visible]).toEqual([true, true]);
    expect(glyph.calls.filter(([c]) => c === "fillStyle").map(([, colour]) => colour)).toEqual([palette.markerStroke, palette.interactableBright]);
    // the ground: the text's 75 × 16 in 8 × 3 padding, 91 × 22, its right edge 6 px left of the map (848)
    expect([ground.x, ground.y]).toEqual([848 - 91, Math.round(109.5 - 11)]);
    expect([hint.x, hint.y]).toEqual([848 - 91 + 8, Math.round(109.5 - 11) + 3]);
    expect(ground.calls).toEqual([
      ["clear"],
      ["fillStyle", palette.mapEdge, 0.97],
      ["fillRoundedRect", 0, 0, 91, 22, 6],
      ["lineStyle", 1, palette.frame, 0.5],
      ["strokeRoundedRect", 0, 0, 91, 22, 6],
    ]);
    for (const d of [ground, hint]) {
      expect(d.depth).toBe(MINIMAP.depth + 2);
      expect(d.scroll).toBe(0);
    }
  });

  it("should hide the hint and dim the ink as the pointer leaves the hit area or the canvas (D7)", () => {
    const { icon: i, glyph, hint } = icon();
    i.place(placeAt(NORMAL)!);
    i.pointerMove(860, 110);
    i.pointerMove(880, 110);
    expect([i.hovered, hint.visible]).toEqual([false, false]);
    expect(glyph.calls.filter(([c]) => c === "fillStyle").at(-1)?.[1]).toBe(palette.interactable);
    i.pointerMove(860, 110);
    i.pointerOut();
    expect([i.hovered, hint.visible]).toEqual([false, false]);
  });

  it("should not light up while a guard holds, and drop the hint once one comes to hold (D7)", () => {
    let guarded = true;
    const { icon: i, hint } = icon(() => guarded);
    i.place(placeAt(NORMAL)!);
    i.pointerMove(860, 110);
    expect([i.hovered, hint.visible]).toEqual([false, false]);
    guarded = false;
    i.pointerMove(860, 110);
    expect(hint.visible).toBe(true);
    guarded = true;
    i.pointerMove(861, 110);
    expect(hint.visible).toBe(false);
  });

  it("should move with its place, the hint beside the icon in the overlay, and drop a hover its new place no longer holds (D3, D7)", () => {
    const { icon: i, glyph, ground, hint } = icon();
    i.place(placeAt(NORMAL)!);
    i.pointerMove(860, 110);
    i.place(placeAt(OVERLAY)!);
    expect([glyph.x, glyph.y]).toEqual([1039, 12]);
    expect([i.hovered, hint.visible]).toEqual([false, false]);
    i.pointerMove(1040, 15);
    expect([ground.x + 91, hint.visible]).toEqual([1033, true]);
  });

  it("should rasterise its hint at the render scale of now when it is placed (FS-ZAJMH R5)", () => {
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    const { icon: i, hint } = icon();
    i.place(placeAt(NORMAL)!);
    expect(hint.calls).toContainEqual(["setResolution", 2]);
  });

  it("should let go of everything it made", () => {
    const { icon: i, made } = icon();
    i.destroy();
    expect(made.every((m) => m.destroyed)).toBe(true);
  });
});
