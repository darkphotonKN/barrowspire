import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastRatio } from "@/render/lighting/lighting";
import type { Rect } from "@/render/iso/projection";
import { mix, palette } from "@/utils/canvasPalette";
import { MINIMAP, MINIMAP_VIGNETTE, minimapPanel } from "./minimap";
import { MINIMAP_NAME, minimapNameBox, minimapPlaceName } from "./minimapName";
import {
  POSITION_READOUT,
  positionReadoutBox,
  positionReadoutPlace,
  readoutGivesWay,
  showsPositionReadout,
} from "./positionReadout";
import { TARGET_BOSS_FRAME, TARGET_FRAME, targetFrameRect } from "./targetFrame";
import { topRightCorner } from "./topRightColumn";

describe("showsPositionReadout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { nodeEnv: "development", shown: true },
    { nodeEnv: "test", shown: true },
    { nodeEnv: "production", shown: false },
  ])("is $shown when NODE_ENV is $nodeEnv and nothing overrides it", ({ nodeEnv, shown }) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", "");
    expect(showsPositionReadout()).toBe(shown);
  });

  it.each([
    { nodeEnv: "production", override: "true", shown: true },
    { nodeEnv: "production", override: "1", shown: true },
    { nodeEnv: "production", override: " TRUE ", shown: true },
    { nodeEnv: "development", override: "false", shown: false },
    { nodeEnv: "development", override: "0", shown: false },
  ])(
    "follows NEXT_PUBLIC_SHOW_POSITION_READOUT=$override over NODE_ENV=$nodeEnv",
    ({ nodeEnv, override, shown }) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", override);
      expect(showsPositionReadout()).toBe(shown);
    },
  );

  it.each(["yes", "on", "maybe"])("ignores an unrecognised override %j", (override) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", override);
    expect(showsPositionReadout()).toBe(false);
  });
});

// FS-56CKV §Change: Map name, E8 as amended 2026-11-12 (owner: "有小地圖時 x y座標不是要顯示在
// 地圖框框內右下角嗎"): inside the map's bottom-right, under the column in the overlay and with no map; on
// the name's plate. With the map enlarged it stands inside too, as on the normal map (§Change: The
// enlarged map keeps its labels inside, F2; owner 2026-11-14: 「小地圖1.5倍時 區域名稱跟座標也要放在地圖內
// 跟1倍時的位置一樣」)
describe("the position readout's look (FS-56CKV §C; §Change: Map name, E8)", () => {
  it("should hold its look as named values: 10 px vellum at full ink on the map name's plate, over the minimap's depth", () => {
    expect(POSITION_READOUT).toMatchObject({
      fontSize: "10px",
      colour: palette.hudText,
      plate: MINIMAP_NAME.plate,
      plateAlpha: MINIMAP_NAME.plateAlpha,
      padding: MINIMAP_NAME.padding,
      inset: MINIMAP.inset,
      gap: 4,
    });
    expect("alpha" in POSITION_READOUT).toBe(false);
    // nothing places it beside the enlarged map's name any more (F6)
    expect("beside" in POSITION_READOUT).toBe(false);
    expect("beside" in MINIMAP_NAME).toBe(false);
    expect(POSITION_READOUT.depth).toBeGreaterThan(MINIMAP.depth);
  });

  it.each([
    ["the minimap's fill", palette.minimapExplored],
    ["the minimap's backing", palette.hudPanel],
    ["the vignette's darkest", mix(palette.hudPanel, palette.inkDeep, 1 - (1 - MINIMAP_VIGNETTE.edgeAlpha) ** 2)],
    ["a ground as light as vellum", palette.hudText],
  ])("should keep its ink 4.5:1 or better over its plate laid on %s", (_what, under) => {
    const plate = mix(under, POSITION_READOUT.plate, POSITION_READOUT.plateAlpha);
    expect(contrastRatio(POSITION_READOUT.colour, plate)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the position readout's place (FS-56CKV §C.18; §Change: Map name, E8; §Change: The enlarged map keeps its labels inside, F2, F3)", () => {
  const viewOf = (width: number) => ({ width, height: 720 });
  const NORMAL = { ...MINIMAP, mode: "normal" as const };
  const ENLARGED = { ...minimapPanel("enlarged"), mode: "enlarged" as const };
  const OVERLAY = { ...MINIMAP, mode: "overlay" as const };
  /** A generous bound on a plate round 10 or 11 px text, as the name's test takes it: 0.6 em a glyph, 1.5 em a line. */
  const plateOf = (words: string, fontSize: string, letterSpacing = 0) => {
    const px = parseInt(fontSize, 10);
    return { width: Math.ceil(words.length * (px * 0.6 + letterSpacing)) + 8, height: Math.ceil(px * 1.5) + 4 };
  };
  /** The readout at its widest: before the player is in, a floor's largest x/y, and an exterior's Outdoor. */
  const READOUT = ["Awaiting the deep...", "X: 5760 Y: 3840", "X: 5760 Y: 3840 | Outdoor"]
    .map((words) => plateOf(words, POSITION_READOUT.fontSize))
    .reduce((a, b) => (b.width > a.width ? b : a));
  /** The widest floor name a run's map can wear. */
  const NAME = Array.from({ length: 12 }, (_, i) => minimapPlaceName({ world: "run", floor: i + 1, top: false }))
    .map((words) => plateOf(words, MINIMAP_NAME.fontSize, MINIMAP_NAME.letterSpacing))
    .reduce((a, b) => (b.width > a.width ? b : a));
  const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  /** The corner as the scene reads it: the column's head, its name's plate at its widest, and the column's foot. */
  const cornerOf = (width: number, minimap: Parameters<typeof topRightCorner>[1]) => {
    const corner = topRightCorner(viewOf(width), minimap);
    const nameBox = corner.name && minimapNameBox(corner.name, NAME);
    return {
      corner,
      nameBox,
      readout: { minimap: corner.minimap, column: { right: corner.right, bottom: corner.below + 21 } },
    };
  };

  it.each([
    [NORMAL, 1080, 1066, 114],
    [NORMAL, 1280, 1266, 114],
    [ENLARGED, 1080, 1066, 168],
    [ENLARGED, 1280, 1266, 168],
  ])("should stand inside the map's bottom-right, 4 px in from that map's own edges, right-aligned (%o at width %i; E8, F2)", (minimap, width, right, bottom) => {
    const { corner, readout } = cornerOf(width, minimap);
    const at = positionReadoutPlace(readout);
    expect(at).toEqual({ x: right, y: bottom, origin: { x: 1, y: 1 } });
    expect(at.x).toBe(corner.minimap!.x + corner.minimap!.width - 4);
    expect(at.y).toBe(corner.minimap!.y + corner.minimap!.height - 4);
  });

  it.each([
    [NORMAL, 1080],
    [NORMAL, 1280],
    [ENLARGED, 1080],
    [ENLARGED, 1280],
  ])("should keep its widest plate inside the map, clear of the map mode icon and the widest name (%o at width %i; E8, F3)", (minimap, width) => {
    const { corner, nameBox, readout } = cornerOf(width, minimap);
    const box = positionReadoutBox(positionReadoutPlace(readout), READOUT);
    const map = corner.minimap!;
    expect(box.x).toBeGreaterThan(map.x);
    expect(box.y).toBeGreaterThan(map.y);
    expect(box.x + box.width).toBeLessThan(map.x + map.width);
    expect(box.y + box.height).toBeLessThan(map.y + map.height);
    expect(overlaps(box, corner.modeIcon!.hit)).toBe(false);
    expect(overlaps(box, nameBox!)).toBe(false);
  });

  it.each([1080, 1280])("should meet neither target frame inside the enlarged map at width %i, so it stays shown while one stands (F4)", (width) => {
    const { readout } = cornerOf(width, ENLARGED);
    const box = positionReadoutBox(positionReadoutPlace(readout), READOUT);
    expect(readoutGivesWay(box, [targetFrameRect(width / 2, TARGET_FRAME), targetFrameRect(width / 2, TARGET_BOSS_FRAME)])).toBe(false);
  });

  it.each([
    [OVERLAY, 31],
    [null, 10],
  ])("should stand 4 px under the column's last line, right-aligned on the column's x, in the overlay and with no map (§C.18; E8; FS-T3DWX G4, G5): %o", (minimap, top) => {
    for (const width of [1080, 1280]) {
      const { readout } = cornerOf(width, minimap);
      expect(positionReadoutPlace(readout)).toEqual({ x: width - 10, y: top + 21 + 4, origin: { x: 1, y: 0 } });
    }
  });

  it("should stand on whole logical px", () => {
    const at = positionReadoutPlace({ minimap: null, column: { right: 1069.6, bottom: 91.6 } });
    expect([at.x, at.y]).toEqual([1070, 96]);
  });

  it("should take its box from its place and its size, on whichever corner stands on the place", () => {
    const size = { width: 90, height: 19 };
    expect(positionReadoutBox({ x: 1066, y: 114, origin: { x: 1, y: 1 } }, size)).toEqual({ x: 976, y: 95, width: 90, height: 19 });
    expect(positionReadoutBox({ x: 628, y: 20, origin: { x: 1, y: 0.5 } }, size)).toEqual({ x: 538, y: 10.5, width: 90, height: 19 });
    expect(positionReadoutBox({ x: 1070, y: 69, origin: { x: 1, y: 0 } }, size)).toEqual({ x: 980, y: 69, width: 90, height: 19 });
  });

  it("should give way to what its box meets, and to nothing else (as the name's E7; F4)", () => {
    const box = { x: 538, y: 10, width: 90, height: 19 };
    expect(readoutGivesWay(box, [null, undefined])).toBe(false);
    expect(readoutGivesWay(box, [{ x: 351, y: 10, width: 378, height: 54 }])).toBe(true);
    expect(readoutGivesWay(box, [{ x: 629, y: 10, width: 50, height: 54 }])).toBe(false);
  });
});
