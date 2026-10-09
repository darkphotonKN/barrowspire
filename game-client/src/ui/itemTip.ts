/**
 * The item tip every canvas item view shows on hover (FS-4R9M9 R59): the satchel (container
 * view), the equipment panel's slots and rows, and so the loadout. It draws an {@link ItemView}
 * and decides nothing: the words and the "too high" mark come from the presenter.
 *
 * Rarity colour follows the guideline's rarity ramp: only on the badge and the tip's accent
 * edge, never on the name. The requirement takes the damage channel only while it is above the
 * character's level (FS-BDA7X R45).
 */

import type Phaser from "phaser";
import type { ItemView } from "@/items/itemView";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";

export interface ItemTip {
  container: Phaser.GameObjects.Container;
  width: number;
  height: number;
}

const PAD = 10;
/** The rarity accent edge down the tip's left side. */
const EDGE = 3;
const SECTION_GAP = 5;

/** A tip for one item, drawn with its top-left at (0, 0); the caller places and layers it. */
export function buildItemTip(
  scene: Phaser.Scene,
  view: ItemView,
  width = 220,
): ItemTip {
  const left = PAD + EDGE;
  const inner = width - left - PAD;
  const children: Phaser.GameObjects.GameObject[] = [];
  let y = PAD;

  const style = (size: number, color: number) => ({
    fontFamily: CANVAS_FONT.body,
    fontSize: `${size}px`,
    color: toCss(color),
    wordWrap: { width: inner },
  });
  const line = (
    words: string,
    size: number,
    color: number,
    fontStyle?: string,
  ) => {
    const text = scene.add.text(left, y, words, {
      ...style(size, color),
      ...(fontStyle ? { fontStyle } : {}),
    });
    children.push(text);
    y += text.height + 1;
  };

  line(view.name, 14, palette.hudText, "bold");

  // The badge: the rarity's label in its colour, then the kind of item.
  let badgeX = left;
  const badge = (words: string, color: number) => {
    const text = scene.add.text(badgeX, y, words.toUpperCase(), {
      ...style(10, color),
      letterSpacing: 2,
    });
    children.push(text);
    badgeX += text.width + 8;
    return text.height;
  };
  const badgeH = Math.max(
    view.rarity
      ? badge(view.rarity.label, palette.rarity[view.rarity.token])
      : 0,
    badge(view.kind === "unknown" ? "item" : view.kind, palette.hudLabel),
  );
  y += badgeH + SECTION_GAP;

  for (const stat of view.stats) {
    const label = scene.add.text(left, y, stat.label.toUpperCase(), {
      ...style(10, palette.frameBright),
      letterSpacing: 1,
    });
    const value = scene.add
      .text(width - PAD, y, stat.value, style(12, palette.hudText))
      .setOrigin(1, 0);
    children.push(label, value);
    y += Math.max(label.height, value.height) + 1;
  }
  if (view.stats.length) y += SECTION_GAP;

  const { itemLevel, requirement, affixes, uniqueEffect } = view.lines;
  line(itemLevel, 11, palette.hudLabel);
  line(
    requirement.text,
    11,
    requirement.tooHigh ? palette.damageBright : palette.hudLabel,
  );

  if (affixes.length) y += SECTION_GAP;
  for (const affix of affixes) line(affix, 12, palette.hudText);

  if (uniqueEffect) {
    y += SECTION_GAP;
    line(uniqueEffect, 12, palette.frameBright);
  }
  if (view.lore) {
    y += SECTION_GAP;
    line(view.lore, 11, palette.hudLabel, "italic");
  }

  const height = y + PAD - 1;
  const bg = scene.add.graphics();
  bg.fillStyle(palette.mapEdge, 0.95);
  bg.fillRoundedRect(0, 0, width, height, 6);
  bg.lineStyle(1, palette.frame, 0.5);
  bg.strokeRoundedRect(0, 0, width, height, 6);
  bg.fillStyle(
    view.rarity ? palette.rarity[view.rarity.token] : palette.frame,
    view.rarity ? 0.9 : 0.4,
  );
  bg.fillRect(1, 6, EDGE, height - 12);

  return {
    container: scene.add.container(0, 0, [bg, ...children]),
    width,
    height,
  };
}

/** The rarity accent colour a row or slot edge takes for an item, if it has a rarity. */
export function rarityEdge(view: Pick<ItemView, "rarity">): number | undefined {
  return view.rarity ? palette.rarity[view.rarity.token] : undefined;
}
