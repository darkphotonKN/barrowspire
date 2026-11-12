import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/render/lighting/lighting";
import { FULLSCREEN_BUTTON, FULLSCREEN_CORNER } from "@/render/viewport/fullscreenButton";
import { CANVAS_FONT, mix, palette, rgba, toCss } from "@/utils/canvasPalette";
import { MINIMAP, minimapPanel } from "./minimap";
import { MINIMAP_MODE_HINT } from "./minimapModeIcon";
import { MINIMAP_NAME, MinimapName, minimapNameBox, minimapPlaceName, type MinimapNameStage } from "./minimapName";
import { PLACE_CARDS, placeCard, type Place } from "./placeCard";
import { TARGET_BOSS_FRAME, TARGET_FRAME, targetFrameRect } from "./targetFrame";
import { topRightCorner } from "./topRightColumn";

// FS-56CKV §Change: Map name (owner 2026-11-12: "小地圖右上角顯示目前地圖的名字", then
// "兩倍地圖時不顯示", replaced by "兩倍地圖時地圖名稱顯示在全螢幕icon的左邊"): the place's name on the
// minimap, its words, its look, its place in each mode, and where it gives way.

const viewOf = (width: number) => ({ width, height: 720 });
const NORMAL = { ...MINIMAP, mode: "normal" as const };
const ENLARGED = { ...minimapPanel("enlarged"), mode: "enlarged" as const };
const OVERLAY = { ...MINIMAP, mode: "overlay" as const };

/** Every name a place can wear: the town, each field, and a run's floors up past the ordinals. */
const PLACES: Place[] = [
  { world: "hub" },
  ...(Object.keys(PLACE_CARDS.field) as (keyof typeof PLACE_CARDS.field)[]).map((field) => ({ world: "field" as const, field })),
  ...Array.from({ length: 12 }, (_, i) => ({ world: "run" as const, floor: i + 1, top: false })),
];

/**
 * A generous bound on the plate round a name, as Phaser measures one: no glyph of the HUD face is
 * wider than 0.6 em on average, plus the letter-spacing; its line under 1.5 em; the padding round it.
 * No canvas here to measure with, so the bound stands in.
 */
const plateOf = (words: string) => {
  const px = parseInt(MINIMAP_NAME.fontSize, 10);
  return {
    width: Math.ceil(words.length * (px * 0.6 + MINIMAP_NAME.letterSpacing)) + MINIMAP_NAME.padding.x * 2,
    height: Math.ceil(px * 1.5) + MINIMAP_NAME.padding.y * 2,
  };
};
const WIDEST = PLACES.map((p) => minimapPlaceName(p)).reduce((a, b) => (plateOf(b).width > plateOf(a).width ? b : a));

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("the map name's words (FS-56CKV §Change: Map name, E1)", () => {
  it.each(PLACES)("should name %o as the arrival card titles it", (place) => {
    expect(minimapPlaceName(place)).toBe(placeCard(place).title);
  });

  it.each<[Place, string]>([
    [{ world: "hub" }, "The Town"],
    [{ world: "field", field: "gentle_meadows" }, "Gentle Meadows"],
    [{ world: "field", field: "forlorn_forest" }, "The Forlorn Forest"],
    [{ world: "field", field: "dev_test_room" }, "Dev Test Room"],
    [{ world: "run", floor: 1, top: false }, "The First Floor"],
    [{ world: "run", floor: 2, top: false }, "The Second Floor"],
    [{ world: "run", floor: 3, top: true }, "The Third Floor"],
    [{ world: "run", floor: 10, top: true }, "The Tenth Floor"],
    [{ world: "run", floor: 11, top: false }, "Floor 11"],
  ])("should show %o as %j", (place, words) => {
    expect(minimapPlaceName(place)).toBe(words);
  });
});

describe("the map name's look (FS-56CKV §Change: Map name, E2)", () => {
  it("should hold its look as named values: 11 px, letter-spaced 1, vellum on hudPanel at 0.75, padded 4 × 2, over the map, under the icon's hint", () => {
    expect(MINIMAP_NAME).toMatchObject({
      fontSize: "11px",
      letterSpacing: 1,
      colour: palette.hudText,
      plate: palette.hudPanel,
      plateAlpha: 0.75,
      padding: { x: 4, y: 2 },
      inset: MINIMAP.inset,
      gap: MINIMAP.gap,
    });
    expect(MINIMAP_NAME.depth).toBeGreaterThan(MINIMAP.depth);
    expect(MINIMAP_NAME.depth).toBeLessThan(MINIMAP_MODE_HINT.depth);
  });

  it.each([
    ["the minimap's fill", palette.minimapExplored],
    ["the minimap's backing", palette.hudPanel],
    ["a ground as light as vellum", palette.hudText],
  ])("should keep its ink 4.5:1 or better over its plate laid on %s", (_what, under) => {
    const plate = mix(under, MINIMAP_NAME.plate, MINIMAP_NAME.plateAlpha);
    expect(contrastRatio(MINIMAP_NAME.colour, plate)).toBeGreaterThanOrEqual(4.5);
  });

  it("should make its text in that look, on the scene's stage, at its depth, fixed to the screen", () => {
    const { stage, texts } = fakeStage();
    new MinimapName(stage, "The Town");
    expect(texts).toHaveLength(1);
    expect(texts[0].words).toBe("The Town");
    expect(texts[0].style).toEqual({
      fontFamily: CANVAS_FONT.body,
      fontSize: "11px",
      color: toCss(palette.hudText),
      backgroundColor: rgba(palette.hudPanel, 0.75),
      padding: { x: 4, y: 2 },
      letterSpacing: 1,
    });
    expect(texts[0].depth).toBe(MINIMAP_NAME.depth);
    expect(texts[0].scrollFactor).toBe(0);
    // hidden until it is placed
    expect(texts[0].visible).toBe(false);
  });
});

describe("the map name's place (FS-56CKV §Change: Map name, E3–E6)", () => {
  it.each([
    [1080, 1066],
    [1280, 1266],
  ])("should stand inside the normal map's top-right, 4 px in, right-aligned, at width %i (E3)", (width, right) => {
    const corner = topRightCorner(viewOf(width), NORMAL);
    expect(corner.name).toEqual({ right, y: 14, align: "top" });
    expect(corner.name!.right).toBe(corner.minimap!.x + corner.minimap!.width - 4);
    expect(corner.name!.y).toBe(corner.minimap!.y + 4);
  });

  it.each([1080, 1280])("should keep its widest plate inside the normal map, clear of the map mode icon, at width %i (E3)", (width) => {
    const corner = topRightCorner(viewOf(width), NORMAL);
    const box = minimapNameBox(corner.name!, plateOf(WIDEST));
    const map = corner.minimap!;
    expect(box.x).toBeGreaterThan(map.x);
    expect(box.y + box.height).toBeLessThan(map.y + map.height);
    expect(overlaps(box, corner.modeIcon!.hit)).toBe(false);
  });

  it.each([
    [1080, 714],
    [1280, 914],
  ])("should stand left of the fullscreen button with the map enlarged, 6 px off, centred on its height, at width %i (E4)", (width, right) => {
    const corner = topRightCorner(viewOf(width), ENLARGED);
    expect(corner.name).toEqual({ right, y: 20, align: "middle" });
    const buttonLeft = width - corner.button.right - FULLSCREEN_BUTTON.height;
    expect(corner.name!.right).toBe(buttonLeft - 6);
    expect(corner.name!.y).toBe(corner.button.top + FULLSCREEN_BUTTON.height / 2);
  });

  it.each([1080, 1280])("should keep its widest plate outside the enlarged map, on the view, clear of the button and the icon, at width %i (E4)", (width) => {
    const corner = topRightCorner(viewOf(width), ENLARGED);
    const box = minimapNameBox(corner.name!, plateOf(WIDEST));
    const button = { x: width - corner.button.right - FULLSCREEN_BUTTON.height, y: corner.button.top, width: 20, height: 20 };
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThan(corner.minimap!.x);
    expect(overlaps(box, button)).toBe(false);
    expect(overlaps(box, corner.modeIcon!.hit)).toBe(false);
  });

  it.each([
    [1080, 1033],
    [1280, 1233],
  ])("should stand left of the map mode icon in the overlay, 6 px off, centred on the button's height, at width %i (E5)", (width, right) => {
    const corner = topRightCorner(viewOf(width), OVERLAY);
    expect(corner.button).toEqual(FULLSCREEN_CORNER);
    expect(corner.name).toEqual({ right, y: 16, align: "middle" });
    expect(corner.name!.right).toBe(corner.modeIcon!.box.x - 6);
    const box = minimapNameBox(corner.name!, plateOf(WIDEST));
    const button = { x: width - 26, y: 6, width: 20, height: 20 };
    expect(overlaps(box, button)).toBe(false);
    expect(overlaps(box, corner.modeIcon!.hit)).toBe(false);
    // above the column's first line, which starts at y 44 under the button
    expect(box.y + box.height).toBeLessThanOrEqual(corner.below);
  });

  it("should stand nowhere with no minimap (E6)", () => {
    expect(topRightCorner(viewOf(1080), null).name).toBeNull();
  });

  it.each([NORMAL, ENLARGED, OVERLAY])("should keep its widest plate above the notices' band, from y 60 down (E7, %o)", (minimap) => {
    for (const width of [1080, 1280]) {
      const box = minimapNameBox(topRightCorner(viewOf(width), minimap).name!, plateOf(WIDEST));
      expect(box.y + box.height).toBeLessThan(60);
    }
  });

  it("should seat its plate on whole logical px, its top-right on the place, or its middle on it", () => {
    expect(minimapNameBox({ right: 1066, y: 14, align: "top" }, { width: 80.4, height: 17.6 })).toEqual({ x: 986, y: 14, width: 80, height: 18 });
    expect(minimapNameBox({ right: 714, y: 20, align: "middle" }, { width: 80, height: 17 })).toEqual({ x: 634, y: 12, width: 80, height: 17 });
  });
});

describe("MinimapName (FS-56CKV §Change: Map name, E3–E7)", () => {
  it("should stand its text's top-left at its plate's, shown, once placed; hidden with no place", () => {
    const { stage, texts } = fakeStage();
    const name = new MinimapName(stage, "The Town");
    Object.assign(texts[0], { width: 60, height: 17 });
    name.place({ right: 1066, y: 14, align: "top" });
    expect([texts[0].x, texts[0].y, texts[0].visible]).toEqual([1006, 14, true]);
    expect(name.box).toEqual({ x: 1006, y: 14, width: 60, height: 17 });
    expect(name.shown).toBe(true);
    name.place({ right: 714, y: 20, align: "middle" });
    expect([texts[0].x, texts[0].y]).toEqual([654, 12]);
    name.place(null);
    expect(texts[0].visible).toBe(false);
    expect(name.box).toBeNull();
  });

  it("should rasterise its text again at the render scale of now each time it is placed (FS-ZAJMH R5)", () => {
    const { stage, texts } = fakeStage();
    const name = new MinimapName(stage, "The Town");
    name.place({ right: 1066, y: 14, align: "top" });
    expect(texts[0].resolution).toBeGreaterThan(0);
  });

  // E7: beside the enlarged map's button the plate meets the top centre's frames at 1080
  it("should give way to a target frame its plate meets, and show again when the frame goes (E7)", () => {
    const { stage, texts } = fakeStage();
    const name = new MinimapName(stage, "The First Floor");
    Object.assign(texts[0], { width: plateOf("The First Floor").width, height: plateOf("The First Floor").height });
    const at = topRightCorner(viewOf(1080), ENLARGED).name!;
    name.place(at);
    for (const size of [TARGET_FRAME, TARGET_BOSS_FRAME]) {
      name.giveWay([targetFrameRect(540, size)]);
      expect(texts[0].visible).toBe(false);
      expect(name.shown).toBe(false);
      name.giveWay([null]);
      expect(texts[0].visible).toBe(true);
    }
  });

  it("should stay given way when placed again while the frame is up, and stand clear of a frame it does not meet (E7)", () => {
    const { stage, texts } = fakeStage();
    const name = new MinimapName(stage, "The Town");
    Object.assign(texts[0], { width: plateOf("The Town").width, height: plateOf("The Town").height });
    name.place(topRightCorner(viewOf(1080), ENLARGED).name!);
    name.giveWay([targetFrameRect(540, TARGET_BOSS_FRAME)]);
    name.place(topRightCorner(viewOf(1080), ENLARGED).name!);
    expect(texts[0].visible).toBe(false);
    // at 1280 a short name stands clear of the normal frame (x 510–770)
    name.place(topRightCorner(viewOf(1280), ENLARGED).name!);
    name.giveWay([targetFrameRect(640, TARGET_FRAME)]);
    expect(texts[0].visible).toBe(true);
    // and in normal mode, inside the map, no frame reaches it
    name.place(topRightCorner(viewOf(1080), NORMAL).name!);
    name.giveWay([targetFrameRect(540, TARGET_BOSS_FRAME)]);
    expect(texts[0].visible).toBe(true);
  });

  it("should go with its minimap", () => {
    const { stage, texts } = fakeStage();
    const name = new MinimapName(stage, "The Town");
    name.destroy();
    expect(texts[0].destroyed).toBe(true);
    expect(name.box).toBeNull();
  });
});

/** The scene's text factory, recording each text as it was left. */
function fakeStage() {
  type Made = {
    words: string;
    style: unknown;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    depth: number;
    scrollFactor: number;
    resolution: number;
    destroyed: boolean;
  };
  const texts: Made[] = [];
  const stage: MinimapNameStage = {
    text: (words, style) => {
      const t: Made = { words, style, x: 0, y: 0, width: 0, height: 0, visible: true, depth: 0, scrollFactor: 1, resolution: 0, destroyed: false };
      texts.push(t);
      const self = {
        get width() {
          return t.width;
        },
        get height() {
          return t.height;
        },
        setPosition: (x: number, y: number) => ((t.x = x), (t.y = y), self),
        setDepth: (d: number) => ((t.depth = d), self),
        setScrollFactor: (f: number) => ((t.scrollFactor = f), self),
        setVisible: (v: boolean) => ((t.visible = v), self),
        setResolution: (r: number) => ((t.resolution = r), self),
        destroy: () => void (t.destroyed = true),
      };
      return self;
    },
  };
  return { stage, texts };
}
