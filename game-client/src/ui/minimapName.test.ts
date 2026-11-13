import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/render/lighting/lighting";
import { CANVAS_FONT, mix, palette, rgba, toCss } from "@/utils/canvasPalette";
import { MINIMAP, minimapPanel } from "./minimap";
import { MINIMAP_MODE_HINT } from "./minimapModeIcon";
import { MINIMAP_NAME, MinimapName, minimapNameBox, minimapPlaceName, type MinimapNameStage } from "./minimapName";
import { PLACE_CARDS, placeCard, type Place } from "./placeCard";
import { TARGET_BOSS_FRAME, TARGET_FRAME, targetFrameRect } from "./targetFrame";
import { topRightCorner } from "./topRightColumn";

// FS-56CKV §Change: Map name (owner 2026-11-12: "小地圖右上角顯示目前地圖的名字"): the place's name
// on the minimap, its words, its look, its place in each mode, and where it gives way. With the map
// enlarged it stands inside, as on the normal map (§Change: The enlarged map keeps its labels
// inside, owner 2026-11-14: 「小地圖1.5倍時 區域名稱跟座標也要放在地圖內跟1倍時的位置一樣」).

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

describe("the map name's place (FS-56CKV §Change: Map name, E3–E6; §Change: The enlarged map keeps its labels inside, F1)", () => {
  it.each([
    [NORMAL, 1080, 1066],
    [NORMAL, 1280, 1266],
    [ENLARGED, 1080, 1066],
    [ENLARGED, 1280, 1266],
  ])("should stand inside the map's top-right, 4 px in from that map's own edges, right-aligned (%o at width %i; E3, F1)", (minimap, width, right) => {
    const corner = topRightCorner(viewOf(width), minimap);
    expect(corner.name).toEqual({ right, y: 14, align: "top" });
    expect(corner.name!.right).toBe(corner.minimap!.x + corner.minimap!.width - 4);
    expect(corner.name!.y).toBe(corner.minimap!.y + 4);
  });

  it.each([
    [NORMAL, 1080],
    [NORMAL, 1280],
    [ENLARGED, 1080],
    [ENLARGED, 1280],
  ])("should keep its widest plate inside the map, clear of the map mode icon (%o at width %i; E3, F3)", (minimap, width) => {
    const corner = topRightCorner(viewOf(width), minimap);
    const box = minimapNameBox(corner.name!, plateOf(WIDEST));
    const map = corner.minimap!;
    expect(box.x).toBeGreaterThan(map.x);
    expect(box.y + box.height).toBeLessThan(map.y + map.height);
    expect(overlaps(box, corner.modeIcon!.hit)).toBe(false);
  });

  it.each([
    [1080, 1055],
    [1280, 1255],
  ])("should stand left of the map mode icon in the overlay's corner, 6 px off, centred on it, at width %i (E5; FS-T3DWX G4)", (width, right) => {
    const corner = topRightCorner(viewOf(width), OVERLAY);
    expect(corner.name).toEqual({ right, y: 14.5, align: "middle" });
    expect(corner.name!.right).toBe(corner.modeIcon!.box.x - 6);
    expect(corner.name!.y).toBe(corner.modeIcon!.box.y + 9 / 2);
    const box = minimapNameBox(corner.name!, plateOf(WIDEST));
    expect(overlaps(box, corner.modeIcon!.hit)).toBe(false);
    // on the view, and above the column's first line, which starts at y 31 under the row
    expect(box.y).toBeGreaterThanOrEqual(0);
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

  /** The name's plate as the stage measures it: the widest place's. */
  const sized = (words: string) => {
    const { stage, texts } = fakeStage();
    const name = new MinimapName(stage, words);
    Object.assign(texts[0], plateOf(words));
    return { name, text: texts[0] };
  };

  // E7 stands: hidden while its plate meets a shown cover, wherever it is placed
  it("should give way to a cover its plate meets, and show again when the cover goes (E7, F4)", () => {
    const { name, text } = sized(WIDEST);
    name.place(topRightCorner(viewOf(1080), ENLARGED).name!);
    const cover = { ...name.box!, x: name.box!.x + 10, width: 20 };
    name.giveWay([cover]);
    expect(text.visible).toBe(false);
    expect(name.shown).toBe(false);
    name.giveWay([null]);
    expect(text.visible).toBe(true);
  });

  it("should stay given way when placed again while the cover is up (E7)", () => {
    const { name, text } = sized(WIDEST);
    name.place(topRightCorner(viewOf(1080), NORMAL).name!);
    name.giveWay([name.box!]);
    name.place(topRightCorner(viewOf(1080), NORMAL).name!);
    expect(text.visible).toBe(false);
  });

  // inside the map, normal or enlarged, neither target frame reaches it at either width (F4)
  it.each([
    [NORMAL, 1080],
    [NORMAL, 1280],
    [ENLARGED, 1080],
    [ENLARGED, 1280],
  ])("should stay shown inside the map while either target frame stands (%o at width %i; F4)", (minimap, width) => {
    const { name, text } = sized(WIDEST);
    name.place(topRightCorner(viewOf(width), minimap).name!);
    for (const size of [TARGET_FRAME, TARGET_BOSS_FRAME]) {
      name.giveWay([targetFrameRect(width / 2, size)]);
      expect(text.visible).toBe(true);
    }
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
