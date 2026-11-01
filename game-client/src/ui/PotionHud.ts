/**
 * The potion cell beside the run's Health and resource bars (FS-P9G8R R24, R25). The scene hands
 * it every state's cell (`potionCell` in `./potions`); null takes it down, so it is up exactly
 * while the bars are.
 *
 * Neutral HUD, as `ResourceHud`: the HUD panel in a brass frame, the baked `potion_health` icon
 * the gear overlay draws, the count in vellum and the drink key in the label tone, both in the
 * body serif. At 0 the cell stays: the icon fades and the text falls to the faint vellum, as the
 * ability card does when greyed.
 */

import type Phaser from "phaser";
import { artSprite } from "@/render/art/phaser";
import type { ArtLibrary } from "@/render/art/library";
import { iconSheet } from "@/render/art/itemIcons";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { PotionCellView } from "./potions";
import { resourceHudHeight } from "./ResourceHud";

const HUD_DEPTH = 1000;
const CELL_W = 72;
/** The resource panel's height with Health and a class resource, so the two read as one row. */
const CELL_H = resourceHudHeight(2);
const PAD = 8;
const ICON_SIZE = 32;
const TEXT_GAP = 6;
/** How far the icon fades with no health potion worn. */
const DIMMED_ALPHA = 0.35;

export class PotionHud {
  private panel?: Phaser.GameObjects.Graphics;
  private icon?: Phaser.GameObjects.Sprite;
  private count?: Phaser.GameObjects.Text;
  private key?: Phaser.GameObjects.Text;
  /** What the cell last drew, so the states that change nothing redraw nothing. */
  private shown: PotionCellView | null = null;

  /** `left` and `bottom` are the screen x and y of the cell's bottom-left corner. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly left: number,
    private readonly bottom: number,
  ) {}

  show(view: PotionCellView | null): void {
    if (JSON.stringify(view) === JSON.stringify(this.shown)) return;
    this.shown = view;
    if (!view) {
      this.takeDown();
      return;
    }
    if (!this.panel) this.build();

    this.icon?.setAlpha(view.dimmed ? DIMMED_ALPHA : 1);
    this.count
      ?.setText(String(view.count))
      .setColor(toCss(view.dimmed ? palette.hudFaint : palette.hudText));
    this.key
      ?.setText(view.keyLabel)
      .setColor(toCss(view.dimmed ? palette.hudFaint : palette.hudLabel));
  }

  /** The panel, icon and text, made once while the cell is up; only their content changes. */
  private build(): void {
    const top = this.bottom - CELL_H;
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    g.fillStyle(palette.hudPanel, 0.85);
    g.fillRect(this.left, top, CELL_W, CELL_H);
    g.lineStyle(1, palette.frame, 0.35);
    g.strokeRect(this.left, top, CELL_W, CELL_H);
    this.panel = g;

    const icon = artSprite(
      this.scene,
      this.art,
      this.left + PAD + ICON_SIZE / 2,
      top + CELL_H / 2,
      iconSheet("potion_health"),
    );
    const size = Math.max(icon.frame?.width ?? 0, icon.frame?.height ?? 0) || 1;
    this.icon = icon
      .setOrigin(0.5)
      .setScale(ICON_SIZE / size)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);

    const textX = this.left + PAD + ICON_SIZE + TEXT_GAP;
    this.count = this.text(textX, top + 6, 18);
    this.key = this.text(textX, top + 28, 13);
  }

  private text(x: number, y: number, size: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${size}px`,
        color: toCss(palette.hudText),
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  private takeDown(): void {
    this.panel?.destroy();
    this.icon?.destroy();
    this.count?.destroy();
    this.key?.destroy();
    this.panel = this.icon = undefined;
    this.count = this.key = undefined;
  }
}
