import { describe, expect, it } from "vitest";
import { FULLSCREEN_BUTTON } from "@/render/viewport";
import { MINIMAP, minimapPanel } from "./minimap";
import { TOP_RIGHT_LINE, topRightColumn, topRightCorner } from "./topRightColumn";

/** A logical view `width` wide. */
const viewOf = (width: number) => ({ width, height: 720 });
/** A 12 px HUD line in its 3 px padding (the floor indicator, the escaped count), as Phaser measures one. */
const LINE_H = 21;
const NORMAL = { ...MINIMAP, mode: "normal" as const };
const ENLARGED = { ...minimapPanel("enlarged"), mode: "enlarged" as const };
/** The button in the canvas's corner, as FS-ZAJMH R18 stands it: 6 px in from the top and the right. */
const CORNER = { top: FULLSCREEN_BUTTON.inset, right: FULLSCREEN_BUTTON.inset };

describe("topRightColumn (FS-56CKV §B)", () => {
  it("should hold the lines' look as named values: 12 px, padding 8 × 3, 4 px apart, 6 px under the minimap", () => {
    expect(TOP_RIGHT_LINE).toEqual({ fontSize: "12px", padding: { x: 8, y: 3 }, gap: 4 });
    expect(MINIMAP.gap).toBe(6);
  });

  // FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C1, C2, C5 (owner
  // 2026-11-12: "地圖移動到最上面 全螢幕按鈕移動到地圖左側", "其他文字也要跟著往上移動")
  it.each([
    [1080, 1070],
    [1280, 1270],
  ])(
    "should stand the normal minimap at the very top, y 10, the fullscreen button 6 px to its left on its top, and the floor indicator 6 px under the map, the escaped count 4 px under that, at logical width %i (§Change C1, C2, C5)",
    (width, right) => {
      const column = topRightColumn({ view: viewOf(width), minimap: NORMAL, floorHeight: LINE_H, escapedHeight: LINE_H });
      expect(column.minimap).toEqual({ x: right - 216, y: 10, width: 216, height: 108 });
      // the button's right edge 6 px left of the map's left, its top on the map's top
      expect(column.button).toEqual({ top: 10, right: width - (right - 216 - 6) });
      expect(width - column.button.right).toBe(column.minimap!.x - MINIMAP.gap);
      // the first line under the map at its bottom + the column's gap, no band left above the map
      expect(column.floor).toEqual({ x: right, y: 10 + 108 + 6 });
      expect(column.floor.y).toBe(column.minimap!.y + column.minimap!.height + MINIMAP.gap);
      expect(column.escaped).toEqual({ x: right, y: 124 + LINE_H + 4 });
    },
  );

  it.each([1080, 1280])("should leave the escaped count as the first line under the normal map while the floor indicator is hidden, at width %i (§Change C5)", (width) => {
    const column = topRightColumn({ view: viewOf(width), minimap: NORMAL, floorHeight: null, escapedHeight: LINE_H });
    expect(column.escaped.y).toBe(column.minimap!.y + column.minimap!.height + MINIMAP.gap);
  });

  // §Change C3; FS-1SEF0 §B.11: the enlarged minimap under the button in the corner, the lines under it
  it.each([
    [1080, 1070],
    [1280, 1270],
  ])("should stand the enlarged minimap at y 44 under the button in the corner, and the lines under it, their gaps kept, at logical width %i (§Change C3)", (width, right) => {
    const column = topRightColumn({ view: viewOf(width), minimap: ENLARGED, floorHeight: LINE_H, escapedHeight: LINE_H });
    expect(column.button).toEqual(CORNER);
    expect(column.minimap).toEqual({ x: right - 324, y: 44, width: 324, height: 162 });
    expect(column.floor).toEqual({ x: right, y: 212 });
    expect(column.escaped).toEqual({ x: right, y: 212 + LINE_H + 4 });
    expect(column.bottom).toBe(212 + LINE_H + 4 + LINE_H);
  });

  // §Change C4; §B.11; FS-1SEF0 §D.21: no panel in the corner (no minimap, or the overlay)
  it.each([1080, 1280])(
    "should keep the button in the corner and close the column up under it with no minimap shown: the floor indicator at y 44, the escaped count under it, at width %i (§Change C4, §B.11)",
    (width) => {
      const column = topRightColumn({ view: viewOf(width), minimap: null, floorHeight: LINE_H, escapedHeight: LINE_H });
      expect(column.button).toEqual(CORNER);
      expect(column.floor).toEqual({ x: width - 10, y: 44 });
      expect(column.escaped).toEqual({ x: width - 10, y: 44 + LINE_H + 4 });
      expect(column.minimap).toBeNull();
    },
  );

  it.each([
    [NORMAL, 124],
    [null, 44],
  ])("should stand the escaped count where the floor indicator would while it is hidden (minimap: %o)", (minimap, top) => {
    const column = topRightColumn({ view: viewOf(1080), minimap, floorHeight: null, escapedHeight: LINE_H });
    expect(column.escaped).toEqual({ x: 1070, y: top });
  });

  it("should land every top on a whole logical px", () => {
    for (const minimap of [NORMAL, ENLARGED, null]) {
      const column = topRightColumn({ view: { width: 1080.4, height: 720 }, minimap, floorHeight: 20.6, escapedHeight: 20.6 });
      for (const y of [column.minimap?.y ?? 0, column.floor.y, column.escaped.y, column.bottom, column.button.top]) expect(Number.isInteger(y)).toBe(true);
    }
  });

  it.each([
    [NORMAL, true, 124 + LINE_H + 4 + LINE_H],
    [NORMAL, false, 124 + LINE_H],
    [null, true, 44 + LINE_H + 4 + LINE_H],
    [null, false, 44 + LINE_H],
  ])(
    "should end at the escaped count's bottom, the column's last line, so the dev readout can stand under it (minimap: %o, floor indicator labelled: %s; FS-56CKV §C.18)",
    (minimap, labelled, bottom) => {
      const column = topRightColumn({ view: viewOf(1080), minimap, floorHeight: labelled ? LINE_H : null, escapedHeight: LINE_H });
      expect(column.bottom).toBe(bottom);
    },
  );
});

// §Change C1–C4: the corner alone, as the town and the fields stand their minimap (FS-P0HSP §G.35)
describe("topRightCorner (FS-56CKV §Change: Minimap at the top, fullscreen button beside it)", () => {
  it.each([1080, 1280])("should stand the normal map at y 10 with the button at its left, and say where what stands under it starts, at width %i", (width) => {
    const corner = topRightCorner(viewOf(width), NORMAL);
    expect(corner.minimap).toEqual({ x: width - 226, y: 10, width: 216, height: 108 });
    // 10 + 216 + 6 in from the right edge: the map's inset, its width and the gap
    expect(corner.button).toEqual({ top: 10, right: 232 });
    expect(corner.below).toBe(124);
    expect(corner.right).toBe(width - 10);
  });

  it.each([1080, 1280])("should keep the button in the corner for the enlarged map, the overlay and no map, at width %i", (width) => {
    expect(topRightCorner(viewOf(width), ENLARGED)).toMatchObject({ button: CORNER, minimap: { y: 44 }, below: 212 });
    expect(topRightCorner(viewOf(width), null)).toEqual({ button: CORNER, minimap: null, below: 44, right: width - 10 });
    // a panel handed in the overlay's mode stands nothing in the corner beside the button
    expect(topRightCorner(viewOf(width), { ...MINIMAP, mode: "overlay" }).button).toEqual(CORNER);
  });
});
