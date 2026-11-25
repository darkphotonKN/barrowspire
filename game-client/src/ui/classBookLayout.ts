/**
 * The class book's geometry (FS-X2CMM §G R36, R39; the open tome, §Change: Illuminated pages and the
 * open tome C3–C5): a two-page spread in a leather binding, standing at the view's right side under the
 * top-right column and over the corner row, so the player in the view's middle, the ability bar, the
 * chat and the corner row stay clear of it and the run goes on beside it.
 *
 * The **left page** holds the book's title over a hairline rule and one row per page in book order: a
 * 28 px roundel, the page's name, its mark right-aligned. The **right page** holds the shown page in
 * full: its 64 px roundel at the top, its words under it, centred, flowed by the panel. The × stands in
 * the right page's top corner. Phaser-free.
 *
 * One of the book's swappable halves with `classBookStyle.ts`: a later look of the book changes these
 * numbers or this function, never the panel's wiring or the casting.
 */

import type { Rect } from "./hudCornerLayout";
import { PAGE_ROUNDEL_SIZE } from "./pageRoundel";
import type { Point, XpBarView } from "./xpBarLayout";

/** The tome's measures, in logical px. Tunable by eye. */
export const TOME_LAYOUT = {
  /** The leather showing round the pages. */
  border: 12,
  /** One page, inside the binding. */
  pageWidth: 216,
  pageHeight: 304,
  /** A page's inner margin: its words never come nearer its edges. */
  pad: 16,
  /** How far the gutter's shadow reaches into each page from the spine. */
  gutter: 18,
  /** The title's middle, the rule, and the first row's top, down from the left page's top. */
  titleY: 24,
  ruleY: 42,
  rowsTop: 52,
  /** One row's height; its roundel's middle is the row's. */
  rowHeight: 36,
  /** The name's start after its roundel. */
  nameGap: 10,
  /** The right page's roundel's top, down from the page's top. */
  leafTop: 24,
  /** The × in the right page's top corner: its box, in from the corner. */
  close: 16,
  closeInset: 6,
  /** From the view's right edge, and the spread's top: under the top-right column (minimap, floor line, escaped count). */
  right: 16,
  top: 188,
} as const;

/** One page's row on the left page (C4). */
export interface TomeRow {
  /** The row itself: the wash's box and the press's. */
  box: Rect;
  /** Its 28 px roundel's box. */
  roundel: Rect;
  /** The name's left middle. */
  name: Point;
  /** The mark's right middle. */
  mark: Point;
}

export interface TomeLayout {
  /** The whole spread, binding and all: the book's ground. */
  panel: Rect;
  left: Rect;
  right: Rect;
  /** The fold's x. */
  spine: number;
  /** The title's middle, and its hairline rule under it. */
  title: Point;
  rule: { x1: number; x2: number; y: number };
  rows: TomeRow[];
  /** An empty book's line, its centre top, under the rule (Edge States). */
  empty: Point;
  /** The right page (C5): its roundel's box, the words' centre x, their first line's top, how wide they wrap. */
  leaf: { roundel: Rect; x: number; top: number; wrap: number };
  /** The ×'s box. */
  close: Rect;
}

/** The tome in `view` for `count` pages (C3–C5). */
export function bookLayout(view: XpBarView, count: number): TomeLayout {
  const L = TOME_LAYOUT;
  const width = 2 * L.pageWidth + 2 * L.border;
  const height = L.pageHeight + 2 * L.border;
  const x = Math.round(view.width - L.right - width);
  const y = L.top;
  const panel = { x, y, width, height };
  const left = { x: x + L.border, y: y + L.border, width: L.pageWidth, height: L.pageHeight };
  const right = { ...left, x: left.x + L.pageWidth };
  const row = PAGE_ROUNDEL_SIZE.tomeRow;
  const rows = Array.from({ length: count }, (_, i): TomeRow => {
    const top = left.y + L.rowsTop + i * L.rowHeight;
    const mid = top + L.rowHeight / 2;
    const roundel = { x: left.x + L.pad, y: Math.round(mid - row / 2), width: row, height: row };
    return {
      box: { x: left.x + L.pad - 6, y: top, width: L.pageWidth - 2 * L.pad + 12 - L.gutter / 2, height: L.rowHeight },
      roundel,
      name: { x: roundel.x + row + L.nameGap, y: mid },
      mark: { x: left.x + L.pageWidth - L.pad - L.gutter / 2, y: mid },
    };
  });
  const textLeft = left.x + L.pad;
  const textRight = left.x + L.pageWidth - L.pad - L.gutter / 2;
  const page = PAGE_ROUNDEL_SIZE.tomePage;
  // the right page's words centred between its gutter's shadow and its outer margin
  const leafLeft = right.x + L.pad + L.gutter / 2;
  const leafRight = right.x + right.width - L.pad;
  const leafX = Math.round((leafLeft + leafRight) / 2);
  const roundel = { x: Math.round(leafX - page / 2), y: right.y + L.leafTop, width: page, height: page };
  return {
    panel,
    left,
    right,
    spine: right.x,
    title: { x: Math.round((textLeft + textRight) / 2), y: left.y + L.titleY },
    rule: { x1: textLeft, x2: textRight, y: left.y + L.ruleY },
    rows,
    empty: { x: Math.round((textLeft + textRight) / 2), y: left.y + L.rowsTop + 8 },
    leaf: { roundel, x: leafX, top: roundel.y + page + 12, wrap: leafRight - leafLeft },
    close: { x: right.x + right.width - L.closeInset - L.close, y: right.y + L.closeInset, width: L.close, height: L.close },
  };
}

/** The row under (x, y), by its page's index in book order; -1 off every row. */
export function rowAt(layout: TomeLayout, x: number, y: number): number {
  return layout.rows.findIndex(({ box }) => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height);
}
