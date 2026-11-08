/**
 * The item tip every canvas item view shows on hover (FS-4R9M9 R59): the satchel (container
 * view) and the gear and bag overlay's slots and cells, in every world. It draws an {@link ItemView}
 * and decides nothing: the words and the "too high" mark come from the presenter.
 *
 * Rarity colour follows the guideline's canvas item tip rule (FS-QE2QW §A): the name, the badge
 * and the accent edge at every tier and, on Runed and Fabled, a full border and a faint halo too;
 * never a fill. Where the view marks the item's standing (FS-18Z5F §H), its note follows the
 * badge. The requirement takes the damage channel only while it is above the character's level
 * (FS-BDA7X R45).
 */

import type Phaser from "phaser";
import type { ItemStanding, ItemView } from "@/items/itemView";
import type { RarityToken } from "@/marketplace/rarity";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";

export interface ItemTip {
  container: Phaser.GameObjects.Container;
  width: number;
  height: number;
}

const PAD = 14;
/** The rarity accent edge down the tip's left side; the top two tiers widen it, the inset stays. */
const EDGE = 3;
const SECTION_GAP = 8;
const LINE_GAP = 2;
const CORNER = 6;

/** How much louder a top-tier item says its rarity (FS-QE2QW R10). */
export interface TopTierLook {
  /** The tip's border, in px. */
  border: number;
  /** The tip's left accent edge, in px. */
  edge: number;
  /** The rings of the tip's outer halo, and the innermost one's alpha. */
  haloRings: number;
  haloAlpha: number;
  /** The icon's still glow: its side against the icon's, and its alpha (FS-QE2QW R8). */
  glowSide: number;
  glowAlpha: number;
  /** The well's rarity outline, in px, and its alpha (FS-QE2QW R9). */
  outline: number;
  outlineAlpha: number;
  /** Whether its icon carries the glints as well as the glow (FS-QE2QW R12). */
  glitters: boolean;
}

/** A top tier's look and the rarity colour it is drawn in. */
export type TopTier = TopTierLook & { color: number };

/** The one place a top tier's numbers live: Runed (`epic`) and Fabled (`legendary`). */
const TOP_TIERS: Readonly<Partial<Record<RarityToken, TopTierLook>>> = {
  epic: {
    border: 2,
    edge: 5,
    haloRings: 3,
    haloAlpha: 0.16,
    glowSide: 1.3,
    glowAlpha: 0.28,
    outline: 1,
    outlineAlpha: 0.9,
    glitters: false,
  },
  legendary: {
    border: 3,
    edge: 6,
    haloRings: 4,
    haloAlpha: 0.28,
    glowSide: 1.4,
    glowAlpha: 0.5,
    outline: 1.5,
    outlineAlpha: 0.9,
    glitters: true,
  },
};

/** An item's top-tier look; undefined below Runed, and for an unknown or absent rarity. */
export function topTier(view: Pick<ItemView, "rarity">): TopTier | undefined {
  if (!view.rarity) return undefined;
  const look = TOP_TIERS[view.rarity.token];
  return look && { ...look, color: palette.rarity[view.rarity.token] };
}

/**
 * Sizes on the guideline's type scale: the name as a lead, values and affixes as body, the
 * smaller lines one step down, badges and stat labels as captions.
 */
const SIZE = { name: 18, body: 15, small: 13, caption: 12 } as const;

/**
 * The tone of each standing's note: the danger channel for an unsafe find (FS-18Z5F R36) and for
 * an item on the Bazaar (FS-GTNP8 R4); the label tone for an item still in a delve (R38).
 */
const STANDING_TONE: Readonly<Record<ItemStanding["kind"], number>> = {
  unsafeFind: palette.unsafeFind,
  listed: palette.listed,
  settling: palette.listed,
  inRun: palette.hudLabel,
};

export interface ItemTipOptions {
  width?: number;
  /**
   * A line above the name in the badge's caption style, as a worn tip's "Worn" (FS-NV54P R14);
   * none, and the tip is drawn as ever.
   */
  caption?: string;
}

/** A tip for one item, drawn with its top-left at (0, 0); the caller places and layers it. */
export function buildItemTip(
  scene: Phaser.Scene,
  view: ItemView,
  { width = 280, caption }: ItemTipOptions = {},
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

  /** Caption-size words, upper-cased and letter-spaced: the badge's style, and a caption's. */
  const captionText = (x: number, words: string, color: number) => {
    const text = scene.add.text(x, Math.round(y), words.toUpperCase(), {
      ...style(SIZE.caption, color),
      letterSpacing: 2,
    });
    children.push(text);
    return text;
  };

  if (caption)
    y += captionText(left, caption, palette.hudLabel).height + LINE_GAP;

  line(view.name, SIZE.name, rarityEdge(view) ?? palette.hudText, "bold");

  // The badge: the rarity's label in its colour, then the kind of item.
  let badgeX = left;
  const badge = (words: string, color: number) => {
    const text = captionText(badgeX, words, color);
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

  // where the item stands (FS-18Z5F §H): an unsafe find's warning and a Bazaar item's note in the
  // danger channel (FS-GTNP8 R4), an in-run item's note in the label tone
  if (view.standing) {
    line(view.standing.note, SIZE.small, STANDING_TONE[view.standing.kind]);
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
  const top = topTier(view);
  const bg = tipGround(scene, width, height, top);
  bg.fillStyle(
    view.rarity ? palette.rarity[view.rarity.token] : palette.frame,
    view.rarity ? 0.9 : 0.4,
  );
  bg.fillRect(1, 6, top?.edge ?? EDGE, height - 12);

  return {
    container: scene.add.container(0, 0, [bg, ...children]),
    width,
    height,
  };
}

/**
 * A tip's ground: the item tip's dark fill and faint brass border, `width × height` from 0, 0.
 * A top tier gets a full border in its colour instead, inside those bounds, and a halo outside them.
 */
export function tipGround(
  scene: Phaser.Scene,
  width: number,
  height: number,
  top?: TopTier,
): Phaser.GameObjects.Graphics {
  const bg = scene.add.graphics();
  if (top) strokeHalo(bg, width, height, top);
  bg.fillStyle(palette.mapEdge, 0.97);
  bg.fillRoundedRect(0, 0, width, height, CORNER);
  if (top) {
    // inset by half its width, so the whole stroke lands on whole pixels inside the tip
    const inset = top.border / 2;
    bg.lineStyle(top.border, top.color, 1);
    bg.strokeRoundedRect(
      inset,
      inset,
      width - top.border,
      height - top.border,
      CORNER - inset,
    );
  } else {
    bg.lineStyle(1, palette.frame, 0.5);
    bg.strokeRoundedRect(0, 0, width, height, CORNER);
  }
  return bg;
}

/** Concentric 2 px rounded strokes outside the tip's bounds, abutting and fading outward. */
function strokeHalo(
  bg: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  { color, haloRings, haloAlpha }: TopTier,
): void {
  const RING = 2;
  for (let ring = 0; ring < haloRings; ring++) {
    const out = RING * ring + RING / 2;
    bg.lineStyle(RING, color, haloAlpha * (1 - ring / haloRings));
    bg.strokeRoundedRect(
      -out,
      -out,
      width + 2 * out,
      height + 2 * out,
      CORNER + out,
    );
  }
}

/** The rarity accent colour a row or slot edge takes for an item, if it has a rarity. */
export function rarityEdge(view: Pick<ItemView, "rarity">): number | undefined {
  return view.rarity ? palette.rarity[view.rarity.token] : undefined;
}
