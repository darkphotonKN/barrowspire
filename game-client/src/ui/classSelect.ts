/**
 * The class-select screen's pure parts (FS-MAMHR §G.30): which classes it offers and in what
 * order, where their cards stand, and the stat rows of the lore card. Phaser-free, so the layout
 * and the rows are tested without a canvas; `CharacterCreationScene` draws what this returns.
 */

import type { ClassKey, ClassStats } from "@/data/classLore";
import { palette } from "@/utils/canvasPalette";
import { HUD_BAR_FILL } from "./ResourceHud";
import { RESOURCE_KINDS } from "./resources";

/** The classes the screen offers, top to bottom. */
export const CLASS_ORDER: readonly ClassKey[] = [
  "warrior",
  "mage",
  "archer",
  "mercenary",
];

/** Screen px the class cards may fill: left of the plinth, under the header, above the name. */
export const CLASS_CARD_COLUMN = {
  left: 60,
  right: 280,
  top: 100,
  bottom: 480,
} as const;

const CARD_W = 210;
const CARD_H = 80;
const CARD_GAP = 12;
const FIRST_CARD_Y = 110;

export interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One card per class, stacked down the column from the top. */
export function classCardRects(count: number): CardRect[] {
  return Array.from({ length: count }, (_, i) => ({
    x: CLASS_CARD_COLUMN.left,
    y: FIRST_CARD_Y + i * (CARD_H + CARD_GAP),
    w: CARD_W,
    h: CARD_H,
  }));
}

/** One row of the lore card's stats. */
export interface LoreStatRow {
  label: string;
  value: number;
  /** How full its bar is, 0 to 1. */
  fill: number;
  color: number;
  /** Set only for parry charges: the bar is drawn as this many pips, as on the run's HUD. */
  pips?: number;
}

/** A pooled resource's bar is measured against this, as MP was. */
const POOL_SCALE = 200;

const fillOf = (value: number, max: number) =>
  Math.max(0, Math.min(1, value / max));

/**
 * The lore card's stat rows. The resource row names the class's own resource by its kind, in
 * the HUD's word and colour for it (FS-8AY7S req 21), never "MP"; parry charges are pips.
 */
export function loreStatRows(stats: ClassStats): LoreStatRow[] {
  const { kind, max } = stats.resource;
  const { channel, name } = RESOURCE_KINDS[kind];
  const pips = channel === "parry" ? max : undefined;
  const measure = palette.menu.frameBright;
  return [
    // HP in the HUD's own bar colour; the rest are measures, in bright iron.
    {
      label: "HP",
      value: stats.hp,
      fill: fillOf(stats.hp, 200),
      color: palette.markerHp,
    },
    {
      label: name.toUpperCase(),
      value: max,
      fill: pips === undefined ? fillOf(max, POOL_SCALE) : 1,
      color: HUD_BAR_FILL[channel],
      ...(pips === undefined ? {} : { pips }),
    },
    {
      label: "ATK",
      value: stats.atk,
      fill: fillOf(stats.atk, 20),
      color: measure,
    },
    {
      label: "DEF",
      value: stats.def,
      fill: fillOf(stats.def, 15),
      color: measure,
    },
    {
      label: "RNG",
      value: stats.range,
      fill: fillOf(stats.range, 10),
      color: measure,
    },
    {
      label: "SPD",
      value: stats.speed,
      fill: fillOf(stats.speed, 250),
      color: measure,
    },
  ];
}
