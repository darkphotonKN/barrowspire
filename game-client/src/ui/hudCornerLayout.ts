/**
 * The corner row's geometry and words (FS-3EBCA §A R1, R2, R5; §C R13): the panel icons in the
 * bottom-right corner of every world, from the right edge leftward Menu, Inventory, Character,
 * Party and the Mailbox, each the envelope's plate, the same places in every world. Phaser-free, so the
 * row is tested on its own; `HudCorner` and `MailboxEnvelope` draw into these rects.
 */

import { anchorAt, type Placement } from "@/render/viewport";

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

export type CornerIcon = "menu" | "inventory" | "character" | "party" | "mail";

/** The row from the right edge leftward (R1; the owner's row of five, 2026-11-12). */
export const CORNER_ICONS: readonly CornerIcon[] = [
  "menu",
  "inventory",
  "character",
  "party",
  "mail",
];

/**
 * A plate: the icon's press area (R2), 54 wide since FS-QHN87's round 2 drew the row closer (the
 * owner, 2026-11-13: 「icon距離可以稍微靠近一些」): 56 px from one icon's middle to the next.
 */
export const CORNER_ICON_W = 54;
export const CORNER_ICON_H = 46;
/** Between two plates: the plates still never overlap. */
export const CORNER_ICON_GAP = 2;
/** The row's distance from the view's right and bottom edges: the envelope's margin. */
export const CORNER_MARGIN = 16;
/** The gap between the row and what stands above it, the plates' gap before they drew closer. */
const CORNER_ROW_HEADROOM = 8;
/**
 * How far up from the view's bottom what stands above the row ends (R13, R14): the row's margin,
 * its height and the gap it keeps above it.
 */
export const CORNER_ROW_CLEARANCE =
  CORNER_MARGIN + CORNER_ICON_H + CORNER_ROW_HEADROOM;

/**
 * The ability card's place outside the town (R13; owner, "村莊以外會顯示右鍵的技能 就放在icon上方的位置"):
 * its bottom-right corner right-aligned with the row and the row's gap above it, in a run and a
 * field alike.
 */
export const ABILITY_CARD_PLACE: Placement = {
  anchor: "bottom-right",
  dx: -CORNER_MARGIN,
  dy: -CORNER_ROW_CLEARANCE,
};

/**
 * The run's ability card's height (`AbilityHud`: its padding, its name row and its line's two rows), which
 * the controls badge stands over (FS-84N1G R3).
 */
export const ABILITY_CARD_H = 72;

/**
 * The run's controls badge (FS-84N1G R3; the owner, 「幫我做一個徽章 放在 技能上方區塊」): a plate the corner
 * icons' size, its right edge on the ability card's, the row's gap above the card's top.
 */
export function controlsBadgeFrame(view: CornerView): Rect {
  const card = anchorAt(ABILITY_CARD_PLACE, view);
  const bottom = card.y - ABILITY_CARD_H - CORNER_ROW_HEADROOM;
  return { x: card.x - CORNER_ICON_W, y: bottom - CORNER_ICON_H, width: CORNER_ICON_W, height: CORNER_ICON_H };
}

/** The controls badge's name and key under the pointer, as the corner row names its icons (FS-84N1G R7). */
export const CONTROLS_BADGE_LABEL = "Controls (H)";

/** The run's dead-spectator LEAVE button's height (FS-QPDKN req 10), every run button's. */
const LEAVE_BUTTON_H = 38;
/**
 * Its centre, above the row the same way (R14), its right edge on the corner margin: it is as wide as its
 * label (FS-TQZ5J § Change: Batch 6, R122, R124), so its centre is placed from its width.
 */
export function leaveButtonPlace(width: number): Placement {
  return {
    anchor: "bottom-right",
    dx: -CORNER_MARGIN - width / 2,
    dy: -CORNER_ROW_CLEARANCE - LEAVE_BUTTON_H / 2,
  };
}

/** Each icon's name and key under the pointer (R5); the Mailbox has no key. */
export const CORNER_LABEL: Readonly<Record<CornerIcon, string>> = {
  menu: "Menu (Esc)",
  inventory: "Inventory (I)",
  character: "Character (C)",
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
