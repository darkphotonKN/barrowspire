/**
 * The passive tree overlay's geometry (FS-8RZ51 R34, R35): one carved panel at the screen's centre,
 * above the corner row; under its title band the header (class and unspent points), then the six tiers
 * top to bottom, tier 1 at the top, each a row with its gate stated at the left and its nodes centred
 * across the rest, the two tier-6 nodes with an "or" between them; the footer at the foot. Phaser-free,
 * so it is tested without a canvas; `PassiveTreeOverlay` draws into these rects.
 */

import { CORNER_ROW_CLEARANCE } from "./hudCornerLayout";
import { PANEL_TITLE_BAND } from "./panelFrame";
import type { Rect } from "./partyPanelLayout";

export interface TreeLayoutView {
  width: number;
  height: number;
}

export interface TreeRowLayout {
  /** The row's band across the panel. */
  row: Rect;
  /** Where the gate's words stand: their left edge and their middle. */
  gate: { x: number; y: number };
  /** Each node's plate, in the order handed. */
  nodes: Rect[];
  /** Between two nodes, the middle of the gap: where the tier-6 "or" stands. */
  between?: { x: number; y: number };
}

export interface TreeLayout {
  panel: Rect;
  /** The header's middle: the class and the unspent points (R35). */
  header: { x: number; y: number };
  rows: TreeRowLayout[];
  /** The footer's middle (R38). */
  footer: { x: number; y: number };
  /**
   * The tier-6 ask in the footer band (R38): its words' room at the left (their left edge, the band's
   * middle, the width they wrap to), and its Yes and No at the right.
   */
  answers: { words: { x: number; y: number; width: number }; yes: Rect; no: Rect };
}

export const TREE_PANEL_W = 380;
/** The panel's inner margin, and its least distance from the screen's top. */
const PAD = 16;
const TOP_MARGIN = 16;
const HEADER_H = 26;
/** Tall enough for the tier-6 ask's words on two lines beside its Yes and No (R38). */
const FOOTER_H = 36;
/** The tier-6 ask's Yes and No: each box, and the gap between them and before them. */
const ANSWER_W = 40;
const ANSWER_H = 20;
const ANSWER_GAP = 6;
/** A tier's row: tall enough for a plate and its `r / max` under it; shorter only where the screen is. */
const ROW_H = 58;
const ROW_MIN_H = 46;
/** A node's plate, square. */
export const TREE_NODE = 36;
/** The `r / max` under a plate, this far below it. */
export const TREE_RANK_GAP = 2;
/** The gate's column, left of the nodes: the nodes' span then a multiple of 4, so every centre is a whole px. */
const GATE_W = 112;

/** The panel's height for `rows` rows of `rowH`. */
const heightFor = (rows: number, rowH: number) => PANEL_TITLE_BAND + HEADER_H + rows * rowH + FOOTER_H + PAD / 2;

/**
 * The overlay's layout in `view` for tiers of `counts[i]` nodes each (R35): centred across the view,
 * and between the top margin and the corner row's clearance, its rows shrinking to `ROW_MIN_H` where
 * the screen is short.
 */
export function treeLayout(view: TreeLayoutView, counts: readonly number[]): TreeLayout {
  const room = view.height - CORNER_ROW_CLEARANCE - TOP_MARGIN;
  const fixed = heightFor(counts.length, 0);
  const rowH = counts.length === 0 ? ROW_H : Math.max(ROW_MIN_H, Math.min(ROW_H, Math.floor((room - fixed) / counts.length)));
  const height = heightFor(counts.length, rowH) + (counts.length === 0 ? ROW_H : 0);
  const x = Math.round((view.width - TREE_PANEL_W) / 2);
  const y = Math.max(TOP_MARGIN, Math.round(TOP_MARGIN + (room - height) / 2));
  const panel = { x, y, width: TREE_PANEL_W, height };
  const nodesLeft = x + PAD + GATE_W;
  const nodesW = x + TREE_PANEL_W - PAD - nodesLeft;
  const rowsTop = y + PANEL_TITLE_BAND + HEADER_H;
  const rows = counts.map((count, i): TreeRowLayout => {
    const row = { x: x + PAD, y: rowsTop + i * rowH, width: TREE_PANEL_W - 2 * PAD, height: rowH };
    const plateY = row.y + Math.round((rowH - TREE_NODE - 12) / 2);
    const centres = Array.from({ length: count }, (_, k) => nodesLeft + (nodesW * (2 * k + 1)) / (2 * count));
    const nodes = centres.map((cx) => ({ x: Math.round(cx - TREE_NODE / 2), y: plateY, width: TREE_NODE, height: TREE_NODE }));
    const mid = plateY + TREE_NODE / 2;
    return {
      row,
      gate: { x: x + PAD, y: mid },
      nodes,
      between: count === 2 ? { x: Math.round((centres[0] + centres[1]) / 2), y: mid } : undefined,
    };
  });
  const footer = { x: x + TREE_PANEL_W / 2, y: y + height - PAD / 2 - FOOTER_H / 2 };
  const answerY = Math.round(footer.y - ANSWER_H / 2);
  const no = { x: x + TREE_PANEL_W - PAD - ANSWER_W, y: answerY, width: ANSWER_W, height: ANSWER_H };
  const yes = { ...no, x: no.x - ANSWER_GAP - ANSWER_W };
  return {
    panel,
    header: { x: x + TREE_PANEL_W / 2, y: y + PANEL_TITLE_BAND + HEADER_H / 2 },
    rows,
    footer,
    answers: { words: { x: x + PAD, y: footer.y, width: yes.x - ANSWER_GAP - (x + PAD) }, yes, no },
  };
}

/** The node whose plate lies under a screen point, as [row, node]; none off every plate. */
export function nodeAt(layout: TreeLayout, x: number, y: number): [number, number] | undefined {
  for (const [r, row] of layout.rows.entries()) {
    const n = row.nodes.findIndex((p) => x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height);
    if (n >= 0) return [r, n];
  }
  return undefined;
}
