/**
 * Where the wares panel's pieces stand (FS-9JV5K §F R22): centred on the view, the windows' title band
 * at its top, a row per ware (icon, name, price and count left, Buy at the right), then the last
 * refusal's line and the purse line. Pure, so the layout is tested without a canvas.
 */

import { PANEL_TITLE_BAND, type FrameRect } from "./panelFrame";

export const WARES_PANEL_WIDTH = 380;
/** A row's pitch, the icon's side, and the Buy button's size. */
const ROW_H = 44;
const ICON = 30;
const BUY_W = 86;
const BUY_H = 26;
const SIDE = 20;
/** The refusal line's band, the purse line's band (its coin and total; its split is its hover's tip), and the foot. */
const LINE_H = 22;
const PURSE_H = 26;
/** The purse line's height in its band. */
const PURSE_LINE = 18;
const FOOT = 12;

/** One ware's row: its top, its icon's square, where its words start, its Buy. */
export interface WareRowLayout {
  y: number;
  icon: FrameRect;
  textX: number;
  buy: FrameRect;
}

export interface WaresLayout {
  panel: FrameRect;
  rows: WareRowLayout[];
  /** The refusal line's centre. */
  line: { x: number; y: number };
  /** The purse line: its coin at the left, its total beside it; the whole rect is its hover. */
  purse: FrameRect;
}

/** The panel about `centre` for `count` wares. */
export function waresLayout(centre: { x: number; y: number }, count: number): WaresLayout {
  const height = PANEL_TITLE_BAND + 8 + count * ROW_H + LINE_H + PURSE_H + FOOT;
  const panel = { x: centre.x - WARES_PANEL_WIDTH / 2, y: centre.y - height / 2, width: WARES_PANEL_WIDTH, height };
  const top = panel.y + PANEL_TITLE_BAND + 8;
  const rows = Array.from({ length: count }, (_, i) => {
    const y = top + i * ROW_H;
    return {
      y,
      icon: { x: panel.x + SIDE, y: y + (ROW_H - ICON) / 2, width: ICON, height: ICON },
      textX: panel.x + SIDE + ICON + 12,
      buy: { x: panel.x + panel.width - SIDE - BUY_W, y: y + (ROW_H - BUY_H) / 2, width: BUY_W, height: BUY_H },
    };
  });
  const after = top + count * ROW_H;
  return {
    panel,
    rows,
    line: { x: centre.x, y: after + LINE_H / 2 },
    purse: { x: panel.x + SIDE, y: after + LINE_H + (PURSE_H - PURSE_LINE) / 2, width: panel.width - SIDE * 2, height: PURSE_LINE },
  };
}
