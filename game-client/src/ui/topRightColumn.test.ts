import { describe, expect, it } from "vitest";
import { MINIMAP, minimapRect } from "./minimap";
import { TOP_RIGHT_LINE, topRightColumn } from "./topRightColumn";

/**
 * The column's corner at a logical width: `anchorAt(TOP_RIGHT_HUD)`, 10 px in from the right and
 * 44 down, under the fullscreen button (the scene's test pins the anchor itself, and the column's
 * clearances at it).
 */
const cornerAt = (width: number) => ({ x: width - 10, y: 44 });
/** A 12 px HUD line in its 3 px padding (the floor indicator, the escaped count), as Phaser measures one. */
const LINE_H = 21;

describe("topRightColumn (FS-56CKV §B)", () => {
  it("should hold the lines' look as named values: 12 px, padding 8 × 3, 4 px apart, 6 px under the minimap", () => {
    expect(TOP_RIGHT_LINE).toEqual({ fontSize: "12px", padding: { x: 8, y: 3 }, gap: 4 });
    expect(MINIMAP.gap).toBe(6);
  });

  it.each([
    [1080, 1070],
    [1280, 1270],
  ])(
    "should stack the minimap at the column's top, the floor indicator 6 px under it and the escaped count 4 px under that, right-aligned, at logical width %i (§B.9)",
    (width, right) => {
      const corner = cornerAt(width);
      expect(corner.x).toBe(right);
      const column = topRightColumn({ corner, minimap: true, floorHeight: LINE_H, escapedHeight: LINE_H });
      expect(column.minimap).toEqual({ x: right - 216, y: 44, width: 216, height: 108 });
      expect(column.floor).toEqual({ x: right, y: 158 });
      expect(column.escaped).toEqual({ x: right, y: 158 + LINE_H + 4 });
    },
  );

  it("should close up with no minimap shown: the floor indicator at the column's top, the escaped count under it (§B.11)", () => {
    const column = topRightColumn({ corner: { x: 1070, y: 44 }, minimap: false, floorHeight: LINE_H, escapedHeight: LINE_H });
    expect(column.floor).toEqual({ x: 1070, y: 44 });
    expect(column.escaped).toEqual({ x: 1070, y: 44 + LINE_H + 4 });
    // the minimap stands where it would, so showing it again needs nothing but the lines moved
    expect(column.minimap).toEqual(minimapRect(1070, 44));
  });

  it.each([
    [true, 158],
    [false, 44],
  ])("should stand the escaped count where the floor indicator would while it is hidden (minimap shown: %s)", (minimap, top) => {
    const column = topRightColumn({ corner: { x: 1070, y: 44 }, minimap, floorHeight: null, escapedHeight: LINE_H });
    expect(column.escaped).toEqual({ x: 1070, y: top });
  });

  it("should land every top on a whole logical px", () => {
    const column = topRightColumn({ corner: { x: 1069.6, y: 43.6 }, minimap: true, floorHeight: 20.6, escapedHeight: 20.6 });
    for (const y of [column.minimap.y, column.floor.y, column.escaped.y, column.bottom]) expect(Number.isInteger(y)).toBe(true);
    expect(column.minimap.y).toBe(44);
  });

  it.each([
    [true, true, 158 + LINE_H + 4 + LINE_H],
    [true, false, 158 + LINE_H],
    [false, true, 44 + LINE_H + 4 + LINE_H],
    [false, false, 44 + LINE_H],
  ])(
    "should end at the escaped count's bottom, the column's last line, so the dev readout can stand under it (minimap shown: %s, floor indicator labelled: %s; FS-56CKV §C.18)",
    (minimap, labelled, bottom) => {
      const column = topRightColumn({ corner: { x: 1070, y: 44 }, minimap, floorHeight: labelled ? LINE_H : null, escapedHeight: LINE_H });
      expect(column.bottom).toBe(bottom);
    },
  );
});
