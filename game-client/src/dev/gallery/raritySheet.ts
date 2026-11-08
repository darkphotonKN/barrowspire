/**
 * The rarity contact sheet (FS-QE2QW §G R34, R35): every tier side by side, drawn by the game's
 * own code from the real `itemView` of a sample item, so what is approved here is what ships. Its
 * own canvas, because five tips at 1:1 do not fit the effects canvas.
 */

import * as Phaser from "phaser";
import { itemView, type ItemView } from "@/items/itemView";
import type { ArtLibrary } from "@/render/art/library";
import { artSprite, preloadArt, registerArt } from "@/render/art/phaser";
import { RESIDENT_ART } from "@/render/art/sceneArt";
import type { ItemState } from "@/types/gameState";
import { satchelIcon } from "@/ui/ContainerView";
import { UNAVAILABLE_ALPHA } from "@/ui/GearOverlay";
import { itemShine, strokeWellOutline } from "@/ui/itemShine";
import { buildItemTip, rarityEdge, topTier } from "@/ui/itemTip";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";

export const SHEET_WIDTH = 1480;
export const SHEET_HEIGHT = 520;

/** A 280 px tip and a 12 px gap, and the side margin that centres five of them. */
const COLUMN_PITCH = 292;
const MARGIN = 16;
const TIP_TOP = 16;
/** The wells under the tips, a bag cell's look at a size worth judging. */
const WELL = 72;
const WELL_TOP = SHEET_HEIGHT - WELL - 28;
const WELL_INSET = 16;
const WELL_GAP = 24;
const WELL_RADIUS = 4;
const WELL_EDGE = 3;
const ICON_FILL = 0.78;

const sample = (
  rarity: string,
  fields: Pick<ItemState, "name"> & Partial<ItemState>,
): ItemState => ({
  item_id: rarity,
  entity_id: rarity,
  quantity: 1,
  rarity,
  ...fields,
});

const SWORD = {
  item_type: "weapon",
  weapon_type: "sword",
  attack_power: 18,
  critical_rate: 0.05,
  item_level: 12,
  required_level: 10,
};

/** One sample per tier, ascending. Rare and Runed share their content, so their tips must match. */
const SAMPLES: readonly ItemState[] = [
  sample("normal", {
    ...SWORD,
    name: "Grave-Iron Sword",
    attack_power: 9,
    item_level: 3,
    required_level: 1,
  }),
  sample("uncommon", {
    ...SWORD,
    name: "Barrowguard Sword",
    attack_power: 13,
    item_level: 7,
    required_level: 5,
    affixes: [{ stat: "strength", tier: 2, value: 3 }],
  }),
  sample("rare", {
    ...SWORD,
    name: "Oathbound Sword",
    affixes: [
      { stat: "strength", tier: 3, value: 5 },
      { stat: "crit_chance", tier: 3, value: 4 },
    ],
  }),
  sample("runed", {
    ...SWORD,
    name: "Runecut Sword",
    affixes: [
      { stat: "strength", tier: 3, value: 5 },
      { stat: "crit_chance", tier: 3, value: 4 },
    ],
  }),
  // the tallest tip: a unique's fixed affixes, its effect and its lore
  sample("fabled", {
    ...SWORD,
    name: "Lichbane, the Last Oath",
    attack_power: 31,
    item_level: 24,
    required_level: 22,
    affixes: [
      { stat: "strength", tier: 0, value: 9 },
      { stat: "attack_speed", tier: 0, value: 8 },
      { stat: "max_health", tier: 0, value: 40 },
    ],
    unique_effect: "Strikes against the risen dead land twice.",
    description: "Sworn over an open barrow. The barrow kept the oath, and not the man.",
  }),
];

export class RaritySheetScene extends Phaser.Scene {
  private art!: ArtLibrary;

  constructor() {
    super({ key: "RaritySheetScene" });
  }

  preload(): void {
    // the fx and icon sheets are resident art (FS-QE2QW R28)
    preloadArt(this, RESIDENT_ART);
  }

  create(): void {
    this.art = registerArt(this, RESIDENT_ART);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);
    SAMPLES.forEach((item, i) =>
      this.column(item, MARGIN + i * COLUMN_PITCH),
    );
  }

  /** One tier's column, its left edge at `x`: the tip, its icon in a well, and on the top two a faint well. */
  private column(item: ItemState, x: number): void {
    const view = itemView(item);
    buildItemTip(this, view).container.setPosition(x, TIP_TOP);
    const left = x + WELL_INSET;
    this.well(item, view, left, 1);
    if (topTier(view))
      this.well(item, view, left + WELL + WELL_GAP, UNAVAILABLE_ALPHA);
  }

  /** An item in a well, as GearOverlay draws it: in one container, glow, icon, glints. */
  private well(item: ItemState, view: ItemView, x: number, alpha: number): void {
    const box = { x, y: WELL_TOP, w: WELL, h: WELL };
    const g = this.add.graphics();
    g.fillStyle(palette.inkDeep, 0.6);
    g.fillRoundedRect(x, WELL_TOP, WELL, WELL, WELL_RADIUS);
    const top = topTier(view);
    if (top) strokeWellOutline(g, box, WELL_RADIUS, top);
    else {
      g.lineStyle(1, palette.frame, 0.22);
      g.strokeRoundedRect(x, WELL_TOP, WELL, WELL, WELL_RADIUS);
    }
    const edge = rarityEdge(view);
    if (edge !== undefined) {
      g.fillStyle(edge, 0.9);
      g.fillRect(x + 1, WELL_TOP + 5, WELL_EDGE, WELL - 10);
    }

    const centre = { x: x + WELL / 2, y: WELL_TOP + WELL / 2 };
    const side = WELL * ICON_FILL;
    const shine = itemShine(this, this.art, view, { ...centre, side });
    const icon = artSprite(
      this,
      this.art,
      centre.x,
      centre.y,
      satchelIcon(item),
    ).setOrigin(0.5);
    icon.setScale(side / Math.max(icon.frame.width, icon.frame.height));
    icon.setAlpha(alpha);
    const glints = shine?.bind(icon);
    this.add.container(0, 0, [
      g,
      ...(shine ? [shine.glow] : []),
      icon,
      ...(glints ? [glints] : []),
    ]);
  }
}
