/**
 * The item tip every canvas item view shows on hover (FS-4R9M9 R59): the satchel (container
 * view) and the gear and bag overlay's slots and cells, in every world. It draws an {@link ItemView}
 * and decides nothing: the words and the "too high" mark come from the presenter.
 *
 * Rarity colour follows the guideline's rarity ramp: only on the badge and the tip's accent
 * edge, never on the name. Where the view marks the item's standing (FS-18Z5F §H), its note
 * follows the badge. The requirement takes the damage channel only while it is above the
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

const PAD = 14;
/** The rarity accent edge down the tip's left side. */
const EDGE = 3;
const SECTION_GAP = 8;
const LINE_GAP = 2;

/**
 * Sizes on the guideline's type scale: the name as a lead, values and affixes as body, the
 * smaller lines one step down, badges and stat labels as captions.
 */
const SIZE = { name: 18, body: 15, small: 13, caption: 12 } as const;

/** A tip for one item, drawn with its top-left at (0, 0); the caller places and layers it. */
export function buildItemTip(
  scene: Phaser.Scene,
  view: ItemView,
  width = 280,
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
    // whole-pixel rows: a text drawn between pixels is smeared across two
    const text = scene.add.text(left, Math.round(y), words, {
      ...style(size, color),
      ...(fontStyle ? { fontStyle } : {}),
    });
    children.push(text);
    y += text.height + LINE_GAP;
  };

  line(view.name, SIZE.name, palette.hudText, "bold");

  // The badge: the rarity's label in its colour, then the kind of item.
  let badgeX = left;
  const badge = (words: string, color: number) => {
    const text = scene.add.text(badgeX, Math.round(y), words.toUpperCase(), {
      ...style(SIZE.caption, color),
      letterSpacing: 2,
    });
    children.push(text);
    badgeX = Math.round(badgeX + text.width + 10);
    return text.height;
  };
  const badgeH = Math.max(
    view.rarity
      ? badge(view.rarity.label, palette.rarity[view.rarity.token])
      : 0,
    badge(view.kind === "unknown" ? "item" : view.kind, palette.hudLabel),
  );
  y += badgeH + SECTION_GAP;

  // where the item stands (FS-18Z5F §H): an unsafe find's warning in the danger channel, an
  // in-run item's note in the label tone
  if (view.standing) {
    line(
      view.standing.note,
      SIZE.small,
      view.standing.kind === "unsafeFind"
        ? palette.unsafeFind
        : palette.hudLabel,
    );
    y += SECTION_GAP;
  }

  for (const stat of view.stats) {
    const row = Math.round(y);
    const label = scene.add.text(left, row, stat.label.toUpperCase(), {
      ...style(SIZE.caption, palette.frameBright),
      letterSpacing: 1,
    });
    const value = scene.add
      .text(width - PAD, row, stat.value, style(SIZE.body, palette.hudText))
      .setOrigin(1, 0);
    children.push(label, value);
    y += Math.max(label.height, value.height) + LINE_GAP;
  }
  if (view.stats.length) y += SECTION_GAP;

  const { itemLevel, requirement, affixes, uniqueEffect } = view.lines;
  line(itemLevel, SIZE.small, palette.hudLabel);
  line(
    requirement.text,
    SIZE.small,
    requirement.tooHigh ? palette.damageBright : palette.hudLabel,
  );

  if (affixes.length) y += SECTION_GAP;
  for (const affix of affixes) line(affix, SIZE.body, palette.hudText);

  if (uniqueEffect) {
    y += SECTION_GAP;
    line(uniqueEffect, SIZE.body, palette.frameBright);
  }
  if (view.lore) {
    y += SECTION_GAP;
    line(view.lore, SIZE.small, palette.hudLabel, "italic");
  }

  const height = Math.round(y + PAD - LINE_GAP);
  const bg = scene.add.graphics();
  bg.fillStyle(palette.mapEdge, 0.97);
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
