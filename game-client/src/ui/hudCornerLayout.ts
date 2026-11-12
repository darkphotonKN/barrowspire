/**
 * The corner row's geometry and words (FS-3EBCA §A R1, R2, R5; §C R13): the panel icons in the
 * bottom-right corner of every world, from the right edge leftward Menu, Character, Party and
 * the Mailbox, each the envelope's plate, the same places in every world. Phaser-free, so the
 * row is tested on its own; `HudCorner` and `MailboxEnvelope` draw into these rects.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CornerView {
  width: number;
  height: number;
}

export type CornerIcon = "menu" | "character" | "party" | "mail";

/** The row from the right edge leftward (R1). */
export const CORNER_ICONS: readonly CornerIcon[] = [
  "menu",
  "character",
  "party",
  "mail",
];

/** A plate: the envelope's size (R2). */
export const CORNER_ICON_W = 58;
export const CORNER_ICON_H = 46;
/** Between two plates. */
export const CORNER_ICON_GAP = 8;
/** The row's distance from the view's right and bottom edges: the envelope's margin. */
export const CORNER_MARGIN = 16;
/**
 * How far up from the view's bottom what stands above the row ends (R13, R14): the row's margin,
 * its height and the gap the row keeps between plates.
 */
export const CORNER_ROW_CLEARANCE =
  CORNER_MARGIN + CORNER_ICON_H + CORNER_ICON_GAP;

/** Each icon's name and key under the pointer (R5); the Mailbox has no key. */
export const CORNER_LABEL: Readonly<Record<CornerIcon, string>> = {
  menu: "Menu (Esc)",
  character: "Character (I)",
  party: "Party (T)",
  mail: "Mailbox",
};
/** The greyed Mailbox outside the town (R9). */
export const CORNER_LABEL_GREYED_MAIL = "Mailbox · town only";

/** The label's bottom stands this far over its plate, and at least this far inside the right edge. */
const LABEL_GAP = 6;
const LABEL_EDGE = 8;

/** Where `icon`'s plate stands in `view` (R2). */
export function cornerIconFrame(icon: CornerIcon, view: CornerView): Rect {
  const slot = CORNER_ICONS.indexOf(icon);
  const right = view.width - CORNER_MARGIN - slot * (CORNER_ICON_W + CORNER_ICON_GAP);
  return {
    x: right - CORNER_ICON_W,
    y: view.height - CORNER_MARGIN - CORNER_ICON_H,
    width: CORNER_ICON_W,
    height: CORNER_ICON_H,
  };
}

/**
 * Where a label `width` wide stands over `plate` (R5): its centre x and its bottom, centred on the
 * plate but never nearer the view's right edge than `LABEL_EDGE`.
 */
export function cornerLabelAt(
  plate: Rect,
  width: number,
  view: CornerView,
): { x: number; bottom: number } {
  const centred = plate.x + plate.width / 2;
  return {
    x: Math.min(centred, view.width - LABEL_EDGE - width / 2),
    bottom: plate.y - LABEL_GAP,
  };
}
