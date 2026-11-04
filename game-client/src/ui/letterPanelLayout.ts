/**
 * Where the mailbox's pieces sit on the screen (FS-1GZGD R33, R36, R37; D11, D14): the envelope at
 * the bottom-right of the town HUD, and the letter panel centred, the list left and the open
 * letter right, its Enclosed row under the body. Phaser-free, so the geometry is tested on its
 * own; `MailboxEnvelope` and `LetterPanel` draw into these rects.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Screen {
  width: number;
  height: number;
}

/** The envelope's plate, and its distance from the screen's bottom and right edges. */
export const ENVELOPE_W = 58;
export const ENVELOPE_H = 46;
export const ENVELOPE_MARGIN = 16;

export function envelopeFrame(screen: Screen): Rect {
  return {
    x: screen.width - ENVELOPE_MARGIN - ENVELOPE_W,
    y: screen.height - ENVELOPE_MARGIN - ENVELOPE_H,
    width: ENVELOPE_W,
    height: ENVELOPE_H,
  };
}

export const PANEL_W = 840;
export const PANEL_H = 500;
const PAD = 20;
/** The header band: the panel's caption and its ×. */
const HEADER_H = 30;
const CLOSE_SIZE = 24;
const LIST_W = 260;
/** The gap between the list and the letter, a faint rule down its middle. */
const GUTTER = 28;
export const ROW_H = 46;
/** The letter's title, sender and dates over its body, then a rule. */
export const DETAIL_HEAD_H = 76;

/** The Enclosed row: its caption, bag-sized slots, and room under each for a gold amount. */
export const SLOT = 46;
const SLOT_GAP = 8;
const CAPTION_H = 18;
const AMOUNT_H = 18;
const ENCLOSED_GAP = 12;
/** The place the Take button takes at the right end of the Enclosed row (R39). */
export const TAKE_W = 112;
export const TAKE_H = 32;
/** Room left of a refused Take's warning line for the row's "ENCLOSED" caption. */
const CAPTION_W = 100;
/** The Taken wax stamp's radius: a little under a slot, so it reads as pressed over them. */
const STAMP_R = 22;

export interface EnclosedFrame {
  caption: Rect;
  /** One per enclosure, in the letter's order, wrapping onto another row when they do not fit. */
  slots: Rect[];
  /** The Take button, at the right end of the first slot row (R39). */
  take: Rect;
  /** A refused Take's warning line: the caption row, right-aligned over the Take button. */
  warning: Rect;
  /** The Taken wax stamp, centred over the slots (A5). */
  stamp: { x: number; y: number; radius: number };
}

export interface LetterPanelFrame {
  panel: Rect;
  /** The caption band over the list. */
  header: Rect;
  close: Rect;
  list: Rect;
  /** As many list rows as fit, top to bottom. */
  rows: Rect[];
  /** The open letter's whole column; its head sits at the top of it. */
  detail: Rect;
  /** The body under the letter's head, scrolled within this rect. */
  body: Rect;
  /** Null on a letter without enclosures: no Enclosed row is drawn. */
  enclosed: EnclosedFrame | null;
}

export function letterPanelFrame(
  screen: Screen,
  enclosures: number,
): LetterPanelFrame {
  const panel: Rect = {
    x: (screen.width - PANEL_W) / 2,
    y: (screen.height - PANEL_H) / 2,
    width: PANEL_W,
    height: PANEL_H,
  };
  const top = panel.y + PAD;
  const header: Rect = {
    x: panel.x + PAD,
    y: top,
    width: PANEL_W - PAD * 2,
    height: HEADER_H,
  };
  const close: Rect = {
    x: panel.x + PANEL_W - PAD - CLOSE_SIZE,
    y: top,
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
  };
  const contentY = top + HEADER_H + 8;
  const contentH = panel.y + PANEL_H - PAD - contentY;
  const list: Rect = {
    x: panel.x + PAD,
    y: contentY,
    width: LIST_W,
    height: contentH,
  };
  const rows: Rect[] = [];
  for (let y = list.y; y + ROW_H <= list.y + list.height; y += ROW_H)
    rows.push({ x: list.x, y, width: list.width, height: ROW_H });

  const detailX = list.x + LIST_W + GUTTER;
  const detail: Rect = {
    x: detailX,
    y: contentY,
    width: panel.x + PANEL_W - PAD - detailX,
    height: contentH,
  };
  const enclosed = enclosures > 0 ? enclosedFrame(detail, enclosures) : null;
  const bodyY = detail.y + DETAIL_HEAD_H;
  const bodyBottom = enclosed
    ? enclosed.caption.y - ENCLOSED_GAP
    : detail.y + detail.height;
  const body: Rect = {
    x: detail.x,
    y: bodyY,
    width: detail.width,
    height: bodyBottom - bodyY,
  };

  return { panel, header, close, list, rows, detail, body, enclosed };
}

/** The Enclosed row at the foot of the letter: slots left, the Take button's place right. */
function enclosedFrame(detail: Rect, count: number): EnclosedFrame {
  const room = detail.width - TAKE_W - SLOT_GAP * 2;
  const perRow = Math.max(1, Math.floor((room + SLOT_GAP) / (SLOT + SLOT_GAP)));
  const rowCount = Math.ceil(count / perRow);
  const rowH = SLOT + AMOUNT_H;
  const bottom = detail.y + detail.height;
  const slotsTop = bottom - rowCount * rowH;
  const caption: Rect = {
    x: detail.x,
    y: slotsTop - CAPTION_H,
    width: detail.width,
    height: CAPTION_H,
  };
  const slots: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    slots.push({
      x: detail.x + col * (SLOT + SLOT_GAP),
      y: slotsTop + row * rowH,
      width: SLOT,
      height: SLOT,
    });
  }
  const take: Rect = {
    x: detail.x + detail.width - TAKE_W,
    y: slotsTop + (SLOT - TAKE_H) / 2,
    width: TAKE_W,
    height: TAKE_H,
  };
  const warning: Rect = {
    x: detail.x + CAPTION_W,
    y: caption.y,
    width: detail.width - CAPTION_W,
    height: CAPTION_H,
  };
  const cols = Math.min(count, perRow);
  const stamp = {
    x: detail.x + (cols * (SLOT + SLOT_GAP) - SLOT_GAP) / 2,
    y: slotsTop + ((rowCount - 1) * rowH + SLOT) / 2,
    radius: STAMP_R,
  };
  return { caption, slots, take, warning, stamp };
}

/** Which letters the list shows: `visible` rows from `offset`, kept inside the list. */
export function listWindow(
  letters: number,
  offset: number,
  visible: number,
): { first: number; count: number } {
  const first = Math.min(Math.max(0, offset), Math.max(0, letters - visible));
  return { first, count: Math.min(visible, letters - first) };
}

/** The list's offset after one wheel step (`step` is +1 down, -1 up), never past either end. */
export function scrolledList(
  offset: number,
  step: number,
  letters: number,
  visible: number,
): number {
  return listWindow(letters, offset + step, visible).first;
}
