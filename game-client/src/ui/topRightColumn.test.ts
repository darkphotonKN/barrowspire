import { describe, expect, it } from "vitest";
import { MINIMAP, minimapPanel } from "./minimap";
import { TOP_RIGHT_LINE, TOP_RIGHT_UNDER_ICON, topRightColumn, topRightCorner } from "./topRightColumn";

/** A logical view `width` wide. */
const viewOf = (width: number) => ({ width, height: 720 });
/** A 12 px HUD line in its 3 px padding (the floor indicator, the escaped count), as Phaser measures one. */
const LINE_H = 21;
const NORMAL = { ...MINIMAP, mode: "normal" as const };
const ENLARGED = { ...minimapPanel("enlarged"), mode: "enlarged" as const };
const OVERLAY = { mode: "overlay" as const };

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
    "should stand the normal minimap in the very corner, y 10, and the floor indicator 6 px under the map, the escaped count 4 px under that, at logical width %i (§Change C1, C5; FS-T3DWX G2)",
    (width, right) => {
      const column = topRightColumn({ view: viewOf(width), minimap: NORMAL, floorHeight: LINE_H, escapedHeight: LINE_H });
      expect(column.minimap).toEqual({ x: right - 216, y: 10, width: 216, height: 108 });
      expect(column).not.toHaveProperty("button");
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

  // §Change C3, C5 as amended 2026-11-12 (owner: "1.5倍地圖時全螢幕按鈕一樣要在地圖左側"): the
  // enlarged minimap at the very top too, the button at its left, the lines under it moved up
  it.each([
    [1080, 1070],
    [1280, 1270],
  ])(
    "should stand the enlarged minimap in the very corner, y 10, and the lines under it from y 178, their gaps kept, at logical width %i (§Change C3, C5; FS-T3DWX G3)",
    (width, right) => {
      const column = topRightColumn({ view: viewOf(width), minimap: ENLARGED, floorHeight: LINE_H, escapedHeight: LINE_H });
      expect(column.minimap).toEqual({ x: right - 324, y: 10, width: 324, height: 162 });
      expect(column.floor).toEqual({ x: right, y: 10 + 162 + 6 });
      expect(column.floor.y).toBe(178);
      expect(column.escaped).toEqual({ x: right, y: 178 + LINE_H + 4 });
      expect(column.escaped.y).toBe(203);
      expect(column.bottom).toBe(203 + LINE_H);
    },
  );

  // FS-T3DWX §Change: The top-right HUD fills the button's spot, G5: no minimap, the column from the top
  it.each([1080, 1280])(
    "should start the column in the very corner with no minimap shown: the floor indicator at y 10, the escaped count under it, at width %i (FS-T3DWX G5)",
    (width) => {
      const column = topRightColumn({ view: viewOf(width), minimap: null, floorHeight: LINE_H, escapedHeight: LINE_H });
      expect(column.floor).toEqual({ x: width - 10, y: 10 });
      expect(column.escaped).toEqual({ x: width - 10, y: 10 + LINE_H + 4 });
      expect(column.minimap).toBeNull();
    },
  );

  // G4 (owner 2026-11-13, option A): the overlay's icon and name take the corner, the column under them at y 31
  it.each([1080, 1280])(
    "should start the column at y 31 under the map mode icon's row with the overlay up, at width %i (FS-T3DWX G4)",
    (width) => {
      const column = topRightColumn({ view: viewOf(width), minimap: OVERLAY, floorHeight: null, escapedHeight: LINE_H });
      expect(TOP_RIGHT_UNDER_ICON).toEqual({ anchor: "top-right", dx: -10, dy: 31 });
      expect(column.escaped).toEqual({ x: width - 10, y: 31 });
      expect(column.bottom).toBe(31 + LINE_H);
      expect(column.minimap).toBeNull();
      // under the icon's box and the name's middle
      expect(column.escaped.y).toBeGreaterThan(column.modeIcon!.hit.y + column.modeIcon!.hit.height);
    },
  );

  it.each([
    [NORMAL, 124],
    [ENLARGED, 178],
    [OVERLAY, 31],
    [null, 10],
  ])("should stand the escaped count where the floor indicator would while it is hidden (minimap: %o)", (minimap, top) => {
    const column = topRightColumn({ view: viewOf(1080), minimap, floorHeight: null, escapedHeight: LINE_H });
    expect(column.escaped).toEqual({ x: 1070, y: top });
  });

  it("should land every top on a whole logical px", () => {
    for (const minimap of [NORMAL, ENLARGED, OVERLAY, null]) {
      const column = topRightColumn({ view: { width: 1080.4, height: 720 }, minimap, floorHeight: 20.6, escapedHeight: 20.6 });
      for (const y of [column.minimap?.y ?? 0, column.floor.y, column.escaped.y, column.bottom, column.modeIcon?.box.y ?? 0]) expect(Number.isInteger(y)).toBe(true);
    }
  });

  it.each([
    [NORMAL, true, 124 + LINE_H + 4 + LINE_H],
    [NORMAL, false, 124 + LINE_H],
    [null, true, 10 + LINE_H + 4 + LINE_H],
    [null, false, 10 + LINE_H],
    [OVERLAY, false, 31 + LINE_H],
  ])(
    "should end at the escaped count's bottom, the column's last line, so the dev readout can stand under it (minimap: %o, floor indicator labelled: %s; FS-56CKV §C.18)",
    (minimap, labelled, bottom) => {
      const column = topRightColumn({ view: viewOf(1080), minimap, floorHeight: labelled ? LINE_H : null, escapedHeight: LINE_H });
      expect(column.bottom).toBe(bottom);
    },
  );
});

// the corner alone, as the town and the fields stand their minimap (FS-P0HSP §G.35); FS-T3DWX G1–G5
describe("topRightCorner (FS-T3DWX §Change: The top-right HUD fills the button's spot)", () => {
  it.each([1080, 1280])("should stand the normal map in the corner and say where what stands under it starts, at width %i (G2)", (width) => {
    const corner = topRightCorner(viewOf(width), NORMAL);
    expect(corner.minimap).toEqual({ x: width - 226, y: 10, width: 216, height: 108 });
    expect(corner.below).toBe(124);
    expect(corner.right).toBe(width - 10);
  });

  it.each([1080, 1280])("should stand the enlarged map in the corner, at width %i (G3)", (width) => {
    const corner = topRightCorner(viewOf(width), ENLARGED);
    expect(corner.minimap).toEqual({ x: width - 334, y: 10, width: 324, height: 162 });
    expect(corner.below).toBe(178);
  });

  it.each([1080, 1280])("should keep no spot for a button: nothing with no map from y 10, the overlay's column from y 31, at width %i (G1, G4, G5)", (width) => {
    expect(topRightCorner(viewOf(width), null)).toEqual({ minimap: null, modeIcon: null, name: null, below: 10, right: width - 10 });
    const overlay = topRightCorner(viewOf(width), OVERLAY);
    expect(overlay.below).toBe(31);
    expect(overlay).not.toHaveProperty("button");
    // a panel handed in the overlay's mode stands nothing in the corner but the icon's row
    expect(topRightCorner(viewOf(width), { ...MINIMAP, mode: "overlay" }).minimap).toBeNull();
  });
});

// FS-56CKV §Change: Map mode icon, D2–D4: the column hands on the icon's place with the corner's
describe("topRightColumn and the map mode icon (FS-56CKV §Change: Map mode icon)", () => {
  it.each([
    [NORMAL, { x: 858, y: 105, width: 9, height: 9 }],
    [ENLARGED, { x: 750, y: 159, width: 9, height: 9 }],
    [{ ...MINIMAP, mode: "overlay" as const }, { x: 1061, y: 10, width: 9, height: 9 }],
  ])("should hand on the icon's box with the column (minimap: %o)", (minimap, box) => {
    const column = topRightColumn({ view: viewOf(1080), minimap, floorHeight: LINE_H, escapedHeight: LINE_H });
    expect(column.modeIcon?.box).toEqual(box);
    expect(column.modeIcon).toEqual(topRightCorner(viewOf(1080), minimap).modeIcon);
  });

  it("should hand on none with no minimap", () => {
    expect(topRightColumn({ view: viewOf(1080), minimap: null, floorHeight: LINE_H, escapedHeight: LINE_H }).modeIcon).toBeNull();
  });
});

// FS-56CKV §Change: Map name, E3–E6: the column hands on the name's place with the corner's
describe("topRightColumn and the map name (FS-56CKV §Change: Map name)", () => {
  it.each([
    [NORMAL, { right: 1066, y: 14, align: "top" }],
    [ENLARGED, { right: 740, y: 20, align: "middle" }],
    [{ ...MINIMAP, mode: "overlay" as const }, { right: 1055, y: 14.5, align: "middle" }],
    [null, null],
  ])("should hand on the name's place with the column (minimap: %o)", (minimap, name) => {
    const column = topRightColumn({ view: viewOf(1080), minimap, floorHeight: LINE_H, escapedHeight: LINE_H });
    expect(column.name).toEqual(name);
    expect(column.name).toEqual(topRightCorner(viewOf(1080), minimap).name);
  });
});
