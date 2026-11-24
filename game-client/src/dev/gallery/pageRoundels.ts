/**
 * The Page roundels contact sheet's content and layout (FS-X2CMM §I R46, the art gate): all 14 pages,
 * each in its four looks side by side (ready, locked, recovering under a sweep at 40 %, hovered), at
 * the book's 44 px and the cast bar's 28 px, in two blocks of seven on the windows' panel. Pure, no
 * Phaser: the sheet (`pageRoundelsSheet.ts`) draws it through the real renderer (`PageRoundel`), so
 * what is approved is what ships.
 */

import type { Rect } from "@/ui/hudCornerLayout";
import type { FrameRect } from "@/ui/panelFrame";
import { PAGE_IDS, type PageId } from "@/ui/pageIcons";
import { PAGE_ROUNDEL_SIZE, type PageState } from "@/ui/pageRoundel";

/** The four looks the art gate asks for (R46). */
export const SHEET_LOOKS = ["ready", "locked", "recovering", "hovered"] as const;
export type SheetLook = (typeof SHEET_LOOKS)[number];

/** How a look is shown: the state, the pointer, and the sweep a recovering page wears (R46: 40 %). */
export function lookOf(look: SheetLook): { state: PageState; hovered: boolean; swept: number } {
  if (look === "hovered") return { state: "ready", hovered: true, swept: 0 };
  if (look === "recovering") return { state: "recovering", hovered: false, swept: 0.4 };
  return { state: look, hovered: false, swept: 0 };
}

/** The two sizes each look is shown at: the book's and the cast bar's. */
export const SHEET_SIZES = [PAGE_ROUNDEL_SIZE.book, PAGE_ROUNDEL_SIZE.castBar] as const;

export interface SheetCell {
  look: SheetLook;
  size: number;
  box: Rect;
}
export interface SheetRow {
  id: PageId;
  /** The page's id, at the row's left, and the pigment under it. */
  label: { x: number; y: number };
  cells: SheetCell[];
}
export interface SheetBlock {
  panel: FrameRect;
  /** Each size's heading, over its four columns. */
  groups: { size: number; x: number; y: number }[];
  /** Each column's look, over its first row, at each size. */
  heads: { look: SheetLook; size: number; x: number; y: number }[];
  rows: SheetRow[];
}
export interface SheetLayout {
  width: number;
  height: number;
  blocks: SheetBlock[];
}

const MARGIN = 16;
const PAD = 18;
const LABEL_W = 120;
const HEAD_H = 46;
const ROW_H = 58;
/** The gap after each cell, by size: wide enough under the cast bar's size for its look's name. */
const GAP: Readonly<Record<number, number>> = { 44: 14, 28: 26 };
const SIZE_GAP = 22;
const BLOCK_GAP = 20;
const PER_BLOCK = 7;

/** The sheet: two panels side by side, the first seven pages and the last seven. */
export function sheetLayout(): SheetLayout {
  const cellsW = SHEET_SIZES.reduce((w, size) => w + SHEET_LOOKS.length * (size + GAP[size]), 0) + SIZE_GAP;
  const panelW = PAD * 2 + LABEL_W + cellsW;
  const panelH = PAD * 2 + HEAD_H + PER_BLOCK * ROW_H;
  const blocks = [0, 1].map((b): SheetBlock => {
    const panel = { x: MARGIN + b * (panelW + BLOCK_GAP), y: MARGIN, width: panelW, height: panelH };
    const columns: { look: SheetLook; size: number; x: number }[] = [];
    const groups: SheetBlock["groups"] = [];
    const top = panel.y + PAD + HEAD_H;
    let x = panel.x + PAD + LABEL_W;
    for (const size of SHEET_SIZES) {
      const from = x;
      for (const look of SHEET_LOOKS) {
        columns.push({ look, size, x });
        x += size + GAP[size];
      }
      groups.push({ size, x: (from + x - GAP[size]) / 2, y: top - 28 });
      x += SIZE_GAP;
    }
    const rows = PAGE_IDS.slice(b * PER_BLOCK, (b + 1) * PER_BLOCK).map((id, r): SheetRow => {
      const mid = top + r * ROW_H + ROW_H / 2;
      return {
        id,
        label: { x: panel.x + PAD, y: mid },
        cells: columns.map(({ look, size, x: cx }) => ({ look, size, box: { x: cx, y: mid - size / 2, width: size, height: size } })),
      };
    });
    const heads = columns.map(({ look, size, x: cx }) => ({ look, size, x: cx + size / 2, y: top - 10 }));
    return { panel, groups, heads, rows };
  });
  return { width: MARGIN * 2 + 2 * panelW + BLOCK_GAP, height: MARGIN * 2 + panelH, blocks };
}
