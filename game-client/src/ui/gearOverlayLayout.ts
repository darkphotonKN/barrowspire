/**
 * The gear and stats overlay's geometry (FS-HRH2J §A R2, R8; §B R13–14, R23), and the stash grid
 * that stands in for the stats at the hub's stash chest (FS-VPD8Y R35–36). Phaser-free, so
 * where the panels sit and what a press hits are tested without a canvas; `GearOverlay` draws
 * what this says. The bag's rules (capacity, full, the count) are `./bag`.
 *
 * Every rect is in screen px: the overlay is fixed to the screen, so a pointer's `x, y` is
 * compared with these directly.
 */

import type { EquipmentSlot } from "@/types/gameState";
import { BAG_CAPACITY } from "./bag";
import { STASH_CAPACITY } from "./stash";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── The bag grid ──────────────────────────────────────────────────────────

/** The bag grid: 6 columns by 5 rows. Its cell count is the bag's capacity (R14, `./bag`). */
export const BAG_COLUMNS = 6;
export const BAG_ROWS = BAG_CAPACITY / BAG_COLUMNS;

/** The stash grid: 6 columns by 10 rows, its cell count the stash's capacity (FS-VPD8Y R35). */
export const STASH_COLUMNS = 6;
export const STASH_ROWS = STASH_CAPACITY / STASH_COLUMNS;

// ── The two panels ────────────────────────────────────────────────────────

/** How far a panel stands off its side edge: it may touch it, a hair off reads as a panel. */
const EDGE_INSET = 8;
/** The gap above each panel and its height, as fractions of the screen's height. */
const TOP_GAP = 0.04;
const HEIGHT = 0.94;
/** The clear middle band, as a fraction of the screen's width: inside R2's 20–30%. */
const BAND = 0.26;

export interface OverlayLayout {
  /** The stats panel, on the left edge. */
  left: Rect;
  /** The gear and bag panel, on the right edge. */
  right: Rect;
  /** The clear middle band the world shows through. */
  band: { x: number; w: number };
}

/** Where the two mirrored panels sit on a screen of this size (R2). */
export function overlayLayout(width: number, height: number): OverlayLayout {
  const w = Math.floor((width - Math.round(width * BAND)) / 2) - EDGE_INSET;
  const y = Math.round(height * TOP_GAP);
  const h = Math.round(height * HEIGHT);
  const left = { x: EDGE_INSET, y, w, h };
  const right = { x: width - EDGE_INSET - w, y, w, h };
  return { left, right, band: { x: left.x + w, w: right.x - (left.x + w) } };
}

/** Whether a screen point lies over either panel: a press there is the overlay's, never an attack (R8). */
export function overPanel(
  layout: OverlayLayout,
  x: number,
  y: number,
): boolean {
  return inRect(layout.left, x, y) || inRect(layout.right, x, y);
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ── Scrolling ─────────────────────────────────────────────────────────────

/** Which rows of a scrolled list show: from `first`, the next `count` of its `rows`. */
export interface RowWindow {
  first: number;
  count: number;
  rows: number;
}

/**
 * The rows of a list, `heights` tall each, that show in `space` px when scrolled `scroll` rows
 * down: only whole rows, so nothing draws past the space's edge, and scrolling stops once the
 * last row is in view. The bag grid and the stats panel both scroll by it, a row per wheel step
 * (R23, edge state "Small window").
 */
export function rowWindow(
  heights: readonly number[],
  space: number,
  scroll: number,
): RowWindow {
  const rows = heights.length;
  // the furthest first row: the one from which every row to the end fits
  let last = rows;
  let tail = 0;
  while (last > 0 && tail + heights[last - 1] <= space) {
    tail += heights[last - 1];
    last--;
  }
  const first = Math.min(
    Math.max(0, Math.floor(scroll)),
    Math.min(last, Math.max(0, rows - 1)),
  );
  let count = 0;
  let used = 0;
  while (first + count < rows && used + heights[first + count] <= space) {
    used += heights[first + count];
    count++;
  }
  return { first, count, rows };
}

// ── Inside the gear and bag panel ─────────────────────────────────────────

/** Panel padding, and the heights of its text rows, in px. */
export const PANEL_PAD = 14;
const TITLE_H = 26;
const SECTION_GAP = 12;
const BAG_HEAD_H = 24;
const HINT_H = 20;
/** A bag cell's side: as large as the panel allows, within these. */
const MIN_CELL = 26;
const MAX_CELL = 72;
/** A gear slot is a little larger than a bag cell; gaps scale with the cell. */
const SLOT_SCALE = 1.15;
const SLOT_GAP_SCALE = 0.15;
const CELL_GAP_SCALE = 0.08;

/**
 * The paper doll (R13): ten slots on a 3 × 4 grid, weapon and hands to the left of the body,
 * rings to the right, the three consumables across the bottom.
 */
export const GEAR_SLOTS: {
  slot: EquipmentSlot;
  label: string;
  col: number;
  row: number;
}[] = [
  { slot: "weapon", label: "WEAPON", col: 0, row: 0 },
  { slot: "head", label: "HEAD", col: 1, row: 0 },
  { slot: "hands", label: "HANDS", col: 0, row: 1 },
  { slot: "body", label: "BODY", col: 1, row: 1 },
  { slot: "ring_1", label: "RING 1", col: 2, row: 1 },
  { slot: "feet", label: "FEET", col: 1, row: 2 },
  { slot: "ring_2", label: "RING 2", col: 2, row: 2 },
  { slot: "consumable_1", label: "CONS 1", col: 0, row: 3 },
  { slot: "consumable_2", label: "CONS 2", col: 1, row: 3 },
  { slot: "consumable_3", label: "CONS 3", col: 2, row: 3 },
];
const DOLL_COLS = 3;
const DOLL_ROWS = 4;

export interface BagCell {
  /** The bag (or stash) position this cell shows: items fill cells in their order. */
  index: number;
  /** Past the base cells, the grid's capacity (R23). */
  over: boolean;
  rect: Rect;
}

export interface GearPanelLayout extends ItemGrid {
  /** A bag cell's side and a gear slot's side, in px. */
  cell: number;
  slot: number;
  /** Where the panel title and the bag's header line sit (their top). */
  titleY: number;
  bagHeaderY: number;
  /** Where the hint line sits (its top). */
  hintY: number;
  /** The panel's inner left edge and width. */
  innerX: number;
  innerW: number;
  slots: Record<EquipmentSlot, Rect>;
}

/**
 * The gear and bag panel's insides, for a bag of `count` items scrolled `scroll` rows down
 * (clamped). Cells are as large as the panel allows, so the 30 base cells never shrink for an
 * over-capacity bag; rows that do not fit scroll (R23, edge state "Small window").
 */
export function gearPanelLayout(
  panel: Rect,
  count: number,
  scroll = 0,
): GearPanelLayout {
  const innerX = panel.x + PANEL_PAD;
  const innerW = panel.w - 2 * PANEL_PAD;
  const fixed = 2 * PANEL_PAD + TITLE_H + SECTION_GAP + BAG_HEAD_H + HINT_H;
  const perCell =
    DOLL_ROWS * SLOT_SCALE +
    (DOLL_ROWS - 1) * SLOT_GAP_SCALE +
    BAG_ROWS +
    (BAG_ROWS - 1) * CELL_GAP_SCALE;
  const byHeight = (panel.h - fixed) / perCell;
  const byWidth = innerW / (BAG_COLUMNS + (BAG_COLUMNS - 1) * CELL_GAP_SCALE);
  const cell = Math.floor(
    Math.min(MAX_CELL, Math.max(MIN_CELL, Math.min(byHeight, byWidth))),
  );
  const slot = Math.round(cell * SLOT_SCALE);
  const slotGap = Math.round(cell * SLOT_GAP_SCALE);
  const gap = Math.max(3, Math.round(cell * CELL_GAP_SCALE));

  const titleY = panel.y + PANEL_PAD;
  const dollTop = titleY + TITLE_H;
  const dollW = DOLL_COLS * slot + (DOLL_COLS - 1) * slotGap;
  const dollLeft = innerX + Math.round((innerW - dollW) / 2);
  const slots = {} as Record<EquipmentSlot, Rect>;
  for (const g of GEAR_SLOTS) {
    slots[g.slot] = {
      x: dollLeft + g.col * (slot + slotGap),
      y: dollTop + g.row * (slot + slotGap),
      w: slot,
      h: slot,
    };
  }
  const dollBottom = dollTop + DOLL_ROWS * slot + (DOLL_ROWS - 1) * slotGap;

  const bagHeaderY = dollBottom + SECTION_GAP;
  const gridTop = bagHeaderY + BAG_HEAD_H;
  const hintY = panel.y + panel.h - PANEL_PAD - HINT_H;
  const grid = itemGrid({
    innerX,
    innerW,
    top: gridTop,
    bottom: hintY,
    cell,
    gap,
    columns: BAG_COLUMNS,
    capacity: BAG_CAPACITY,
    count,
    scroll,
  });

  return {
    cell,
    slot,
    titleY,
    bagHeaderY,
    hintY,
    innerX,
    innerW,
    slots,
    ...grid,
  };
}

/** A grid of item cells, as the bag and the stash both lay theirs out. */
export interface ItemGrid {
  /** The visible part of the grid: a wheel over it scrolls. */
  grid: Rect;
  /** The cells drawn, in item order, the visible rows only. */
  cells: BagCell[];
  /** Every row the grid has (at least its capacity's), how many show, and the first that shows. */
  rows: number;
  visibleRows: number;
  scroll: number;
}

/**
 * `count` items in rows of `columns` square cells, centred across `innerW` from `top`, the rows
 * past `capacity` marked over (FS-HRH2J R23). Rows that do not fit above `bottom` scroll, a whole
 * row a step; a space too short for one row still shows one, so the grid is never empty.
 */
function itemGrid(g: {
  innerX: number;
  innerW: number;
  top: number;
  bottom: number;
  cell: number;
  gap: number;
  columns: number;
  capacity: number;
  count: number;
  scroll: number;
}): ItemGrid {
  const pitch = g.cell + g.gap;
  const rows = Math.max(g.capacity / g.columns, Math.ceil(g.count / g.columns));
  const win = rowWindow(
    Array.from({ length: rows }, () => pitch),
    g.bottom - g.top + g.gap,
    g.scroll,
  );
  const visibleRows = Math.max(1, win.count);
  const first = win.first;
  const gridW = g.columns * g.cell + (g.columns - 1) * g.gap;
  const gridLeft = g.innerX + Math.round((g.innerW - gridW) / 2);

  const cells: BagCell[] = [];
  for (let r = 0; r < visibleRows; r++) {
    for (let c = 0; c < g.columns; c++) {
      const index = (first + r) * g.columns + c;
      cells.push({
        index,
        over: index >= g.capacity,
        rect: {
          x: gridLeft + c * pitch,
          y: g.top + r * pitch,
          w: g.cell,
          h: g.cell,
        },
      });
    }
  }
  return {
    grid: { x: gridLeft, y: g.top, w: gridW, h: visibleRows * pitch - g.gap },
    cells,
    rows,
    visibleRows,
    scroll: first,
  };
}

// ── Inside the stats panel ────────────────────────────────────────────────

/**
 * Where the stats panel's rows may draw (FS-HRH2J §C): inside its padding, below its title, so
 * its first row stands level with the gear panel's first slot.
 */
export function statsPanelArea(panel: Rect): Rect {
  const top = panel.y + PANEL_PAD + TITLE_H;
  return {
    x: panel.x + PANEL_PAD,
    y: top,
    w: panel.w - 2 * PANEL_PAD,
    h: panel.y + panel.h - PANEL_PAD - top,
  };
}

// ── The stash, in the left panel ──────────────────────────────────────────

export interface StashPanelLayout extends ItemGrid {
  /** A stash cell's side, in px. */
  cell: number;
  /** Where the count line sits (its top), level with the gear panel's first slot. */
  countY: number;
}

/**
 * The left panel in stash mode (FS-VPD8Y R35–36): the count line, then a 6 × 10 grid of cells
 * as large as the panel allows, for a stash of `count` items scrolled `scroll` rows down
 * (clamped). The 60 base cells never shrink for an over-capacity stash; its extra rows scroll.
 */
export function stashPanelLayout(
  panel: Rect,
  count: number,
  scroll = 0,
): StashPanelLayout {
  const area = statsPanelArea(panel);
  const top = area.y + BAG_HEAD_H;
  const bottom = area.y + area.h;
  const byHeight =
    (bottom - top) / (STASH_ROWS + (STASH_ROWS - 1) * CELL_GAP_SCALE);
  const byWidth =
    area.w / (STASH_COLUMNS + (STASH_COLUMNS - 1) * CELL_GAP_SCALE);
  const cell = Math.floor(
    Math.min(MAX_CELL, Math.max(MIN_CELL, Math.min(byHeight, byWidth))),
  );
  const gap = Math.max(3, Math.round(cell * CELL_GAP_SCALE));
  return {
    cell,
    countY: area.y,
    ...itemGrid({
      innerX: area.x,
      innerW: area.w,
      top,
      bottom,
      cell,
      gap,
      columns: STASH_COLUMNS,
      capacity: STASH_CAPACITY,
      count,
      scroll,
    }),
  };
}
