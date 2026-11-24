/**
 * The class book's geometry (FS-X2CMM §G R36, R37, R39): the window over the ability bar, centred on the
 * view, its foot clear of the bar's top, so the player in the view's middle stays clear of it and walking
 * stays free with it open; under the windows' title band a vellum **leaf**, and on it the page roundels
 * at the book's size (`PAGE_ROUNDEL_SIZE.book`) in rows of five, each row centred, each with a caption
 * slot under it ("Lv N", "spent"). Phaser-free.
 *
 * One of the book's swappable halves with `classBookStyle.ts`: a later look of the book changes these
 * numbers or this function, never the panel's wiring or the casting.
 */

import type { Rect } from "./hudCornerLayout";
import { abilityBarFrame } from "./abilityBarLayout";
import { PANEL_TITLE_BAND } from "./panelFrame";
import { PAGE_ROUNDEL_SIZE } from "./pageRoundel";
import type { Point, XpBarView } from "./xpBarLayout";

/** The book's measures, in logical px. Tunable by eye. */
export const BOOK_LAYOUT = {
  /** Roundels in one row. */
  columns: 5,
  /** Between two roundels in a row. */
  gap: 18,
  /** A caption slot's height under each roundel, and between two rows. */
  caption: 16,
  rowGap: 6,
  /** The leaf's inset from the panel's sides and foot, and its own padding round the roundels. */
  inset: 14,
  leafPad: 12,
  /** The panel at its narrowest, so the title and an empty book's line fit. */
  minWidth: 280,
  /** An empty book's leaf: one line's height. */
  emptyLeaf: 44,
  /** How far the panel's foot stands over the ability bar's top. */
  overBar: 14,
  /** The panel never stands nearer the view's top than this. */
  top: 10,
} as const;

export interface BookLayout {
  panel: Rect;
  /** The vellum leaf the pages lie on. */
  leaf: Rect;
  /** Each page's roundel box, in book order. */
  pages: Rect[];
  /** Each page's caption, its centre top, under its roundel. */
  captions: Point[];
  /** An empty book's line, its centre. */
  empty: Point;
}

/** The book in `view` for `count` pages (R37). */
export function bookLayout(view: XpBarView, count: number): BookLayout {
  const L = BOOK_LAYOUT;
  const size = PAGE_ROUNDEL_SIZE.book;
  const columns = Math.min(Math.max(count, 1), L.columns);
  const rows = Math.ceil(count / L.columns);
  const rowW = columns * size + (columns - 1) * L.gap;
  const width = Math.max(L.minWidth, rowW + 2 * (L.inset + L.leafPad));
  const cell = size + L.caption;
  const leafH = rows === 0 ? L.emptyLeaf : rows * cell + (rows - 1) * L.rowGap + 2 * L.leafPad;
  const height = PANEL_TITLE_BAND + leafH + L.inset;
  const x = Math.floor(view.width / 2 - width / 2);
  const y = Math.max(L.top, abilityBarFrame(view).top - L.overBar - height);
  const panel = { x, y, width, height };
  const leaf = { x: x + L.inset, y: y + PANEL_TITLE_BAND, width: width - 2 * L.inset, height: leafH };
  const pages: Rect[] = [];
  const captions: Point[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / L.columns);
    const inRow = Math.min(L.columns, count - row * L.columns);
    const w = inRow * size + (inRow - 1) * L.gap;
    const left = Math.round(leaf.x + (leaf.width - w) / 2);
    const px = left + (i % L.columns) * (size + L.gap);
    const py = leaf.y + L.leafPad + row * (cell + L.rowGap);
    pages.push({ x: px, y: py, width: size, height: size });
    captions.push({ x: px + size / 2, y: py + size + 2 });
  }
  return { panel, leaf, pages, captions, empty: { x: leaf.x + leaf.width / 2, y: leaf.y + leaf.height / 2 } };
}

/** The page whose roundel lies under (x, y), by its index in book order; -1 off every roundel. */
export function pageAt(layout: BookLayout, x: number, y: number): number {
  return layout.pages.findIndex((p) => Math.hypot(x - (p.x + p.width / 2), y - (p.y + p.height / 2)) <= p.width / 2);
}
