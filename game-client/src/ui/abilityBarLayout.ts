/**
 * The ability bar's geometry (FS-Q18Q3 §B R8, R9): three squares in one row, [1 potion] [right-click]
 * [3 tree ability], centred on `W / 2` directly above the XP bar, the cost slots' foot 6 px over the XP
 * piece's top. Each square has its well, its key plaque set into its top edge, its icon's slot, its cost
 * slot under it and the corner its count stands in. Phaser-free, so every width is tested without a
 * scene; `AbilityBar` draws into these rects.
 */

import { ABILITY_ICON_SLOT } from "./abilityIcons";
import type { Rect } from "./hudCornerLayout";
import { XP_NUMERAL_H, xpBarFrame, type Point, type XpBarView } from "./xpBarLayout";

/** The bar's squares, left to right (R8). */
export const ABILITY_BAR_SQUARES = ["potion", "ability", "tree"] as const;
export type AbilityBarSquare = (typeof ABILITY_BAR_SQUARES)[number];

/** A square's side, and the gap between two (R9). */
export const ABILITY_SQUARE = 44;
export const ABILITY_SQUARE_GAP = 10;
/** The row's width: three squares and their two gaps, 152 px. */
const ROW_W = ABILITY_BAR_SQUARES.length * ABILITY_SQUARE + (ABILITY_BAR_SQUARES.length - 1) * ABILITY_SQUARE_GAP;
/** The cost slots' foot stands this far over the XP piece's top: the gap the level-up cue kept (R8). */
const FOOT_GAP = 6;
/** A cost slot: a 12 px numeral with its 2 px stroke, the XP numerals' box (R15). */
const COST_SLOT_H = XP_NUMERAL_H;
/** Between a well's foot and its cost slot. */
const COST_GAP = 2;
/** The key plaque, centred on the well's top edge and straddling it (R14). */
const PLAQUE_W = 20;
const PLAQUE_H = 14;
/** The count's corner: this far inside the potion well's right and bottom edges (R24). */
const CORNER_INSET = 3;

export interface AbilitySquareFrame {
  well: Rect;
  plaque: Rect;
  /** The icon's slot, `ABILITY_ICON_SLOT` square, centred in the well (R13). */
  icon: Rect;
  /** The cost numeral's slot, under the well, as wide as it (R15). */
  cost: Rect;
  /** Where a count's bottom-right corner stands, inside the well (R24). */
  corner: Point;
}

export interface AbilityBarFrame {
  squares: Readonly<Record<AbilityBarSquare, AbilitySquareFrame>>;
  /** The whole bar: the plaques' top to the cost slots' foot. */
  row: Rect;
  /** The bar's top, the plaques' top: the level-up cue rises from over it (R12). */
  top: number;
}

/** The bar's place in `view` (R8, R9): the XP piece's top read from its own layout, never restated. */
export function abilityBarFrame(view: XpBarView): AbilityBarFrame {
  const foot = xpBarFrame(view).piece.y - FOOT_GAP;
  const costY = foot - COST_SLOT_H;
  const wellY = costY - COST_GAP - ABILITY_SQUARE;
  const top = wellY - Math.floor(PLAQUE_H / 2);
  // floored, as the XP piece is: a whole px at an odd width
  const left = Math.floor(view.width / 2 - ROW_W / 2);

  const square = (i: number): AbilitySquareFrame => {
    const x = left + i * (ABILITY_SQUARE + ABILITY_SQUARE_GAP);
    const mid = x + ABILITY_SQUARE / 2;
    const inset = (ABILITY_SQUARE - ABILITY_ICON_SLOT) / 2;
    return {
      well: { x, y: wellY, width: ABILITY_SQUARE, height: ABILITY_SQUARE },
      plaque: { x: mid - PLAQUE_W / 2, y: top, width: PLAQUE_W, height: PLAQUE_H },
      icon: { x: x + inset, y: wellY + inset, width: ABILITY_ICON_SLOT, height: ABILITY_ICON_SLOT },
      cost: { x, y: costY, width: ABILITY_SQUARE, height: COST_SLOT_H },
      corner: { x: x + ABILITY_SQUARE - CORNER_INSET, y: wellY + ABILITY_SQUARE - CORNER_INSET },
    };
  };
  const squares = Object.fromEntries(ABILITY_BAR_SQUARES.map((s, i) => [s, square(i)])) as Record<
    AbilityBarSquare,
    AbilitySquareFrame
  >;
  return { squares, row: { x: left, y: top, width: ROW_W, height: foot - top }, top };
}
