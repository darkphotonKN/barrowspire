/**
 * The wares panel, drawn on the UI scene (FS-9JV5K §F R22, R23): every window's frame and title, a row
 * per ware (its icon, its name, its price in gold and count left, and Buy, or "Paying…" while it is
 * paid for, dimmed when it cannot be pressed), the last refusal's line in plain words, and the purse
 * line under them as the gear overlay's (the FS-7TGZ3 read): the coin icon and the total, with
 * "Available X · Held in bids Y" in a tip while the pointer is over it.
 *
 * It draws only what the run hands it (`ShownWares`) and the purse its reader hands it; its Buy and its
 * × are the wiring's (`UiWaresSlot`). Over the gear overlay (1100) and the party panel (1110), under the
 * controls panel (1200), with a ground over its rect so a press on it never reaches the world.
 */

import type Phaser from "phaser";
import { iconSheet } from "@/render/art/itemIcons";
import { artSprite } from "@/render/art/phaser";
import type { ArtLibrary } from "@/render/art/library";
import { crispen, viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { drawPanelFrame, drawPanelTitle, lightClose } from "./panelFrame";
import { PURSE_UNKNOWN, type PurseView } from "./purse";
import { buildPurseTip, type PurseTip } from "./purseTip";
import { uiGround } from "./uiGround";
import type { WaresPiece, WaresWiring } from "./uiSceneWares";
import type { ShownWares } from "./wares";
import { waresLayout } from "./waresLayout";

/** Over the gear overlay (1100) and the party panel (1110), under the controls panel (1200). */
export const WARES_PANEL_DEPTH = 1150;

/** The purse line's split, as every UI tip stands (UI depth 2200). */
const PURSE_TIP_DEPTH = 2200;
/** The gap between the coin and the total, and between the line and its tip over it. */
const PURSE_ICON_GAP = 6;
const PURSE_TIP_GAP = 4;

const text = (size: number, colour: number) => ({ fontFamily: CANVAS_FONT.body, fontSize: `${size}px`, color: toCss(colour) });

export class WaresPanel implements WaresPiece {
  private shown?: ShownWares;
  private purse: PurseView = { amount: PURSE_UNKNOWN };
  /** What is drawn now, taken down whole on a redraw. */
  private parts: { destroy(): void }[] = [];
  /** The purse line's total, set again as the reader answers. */
  private purseAmount?: Phaser.GameObjects.Text;
  /** Where the purse line stands, while drawn: its tip stands over it. */
  private purseAt?: { x: number; y: number };
  /** Whether the pointer is over the purse line, and the split shown there meanwhile. */
  private overPurse = false;
  private purseTip?: PurseTip;
  /** The data last drawn, as a key: a show that changes nothing draws nothing. */
  private drawnKey = "";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: () => ArtLibrary,
    private readonly wiring: WaresWiring,
  ) {}

  set(shown: ShownWares): void {
    this.shown = shown;
    const key = JSON.stringify(shown);
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    this.draw();
  }

  setPurse(view: PurseView): void {
    this.purse = { ...view };
    this.purseAmount?.setText(view.amount);
    // the pointer over the line: the new split, or none with the dash
    if (this.overPurse) this.showPurseTip();
  }

  relayout(): void {
    this.draw();
  }

  destroy(): void {
    this.takeDown();
    this.shown = undefined;
    this.drawnKey = "";
  }

  private draw(): void {
    this.takeDown();
    const shown = this.shown;
    if (!shown) return;
    const scene = this.scene;
    const layout = waresLayout({ x: viewport.centerX, y: viewport.centerY }, shown.rows.length);
    const { panel } = layout;
    const fixed = <T extends Phaser.GameObjects.GameObject & { setDepth(d: number): T; setScrollFactor(f: number): T }>(o: T) =>
      o.setDepth(WARES_PANEL_DEPTH).setScrollFactor(0);
    const keep = <T extends { destroy(): void }>(o: T) => (this.parts.push(o), o);

    // the ground first, so the buttons' hits made after it at the same depth take their presses
    keep(uiGround(scene, WARES_PANEL_DEPTH)(panel));
    const bg = keep(fixed(scene.add.graphics()));
    const frame = drawPanelFrame(scene, bg, panel);
    keep(fixed(frame.glyph));
    keep(fixed(drawPanelTitle(scene, panel, "Wares")));
    const words: Phaser.GameObjects.Text[] = [frame.glyph];

    shown.rows.forEach((row, i) => {
      const at = layout.rows[i];
      const icon = keep(fixed(artSprite(scene, this.art(), at.icon.x + at.icon.width / 2, at.icon.y + at.icon.height / 2, row.icon)));
      icon.setOrigin(0.5).setScale(at.icon.width / (Math.max(icon.width, icon.height) || 1));
      const name = keep(fixed(scene.add.text(at.textX, at.y + 6, row.name, text(13, palette.hudText))));
      const price = keep(fixed(scene.add.text(at.textX, at.y + 24, row.price, text(11, palette.waresPrice))));
      const left = keep(fixed(scene.add.text(at.textX + price.width + 10, at.y + 24, row.left, text(11, palette.hudLabel))));
      // Buy: amber to press, the HUD's faint tone while it cannot be (sold out, or a purchase in flight)
      const tone = row.enabled ? palette.interactable : palette.hudFaint;
      const button = keep(fixed(scene.add.graphics()));
      button.lineStyle(1, tone, 1).strokeRoundedRect(at.buy.x, at.buy.y, at.buy.width, at.buy.height, 4);
      const label = keep(fixed(scene.add.text(at.buy.x + at.buy.width / 2, at.buy.y + at.buy.height / 2, row.action, text(12, tone))));
      label.setOrigin(0.5);
      words.push(name, price, left, label);
      if (!row.enabled) return;
      keep(
        fixed(scene.add.zone(at.buy.x, at.buy.y, at.buy.width, at.buy.height))
          .setOrigin(0, 0)
          .setInteractive()
          .on("pointerover", () => label.setColor(toCss(palette.interactableBright)))
          .on("pointerout", () => label.setColor(toCss(tone)))
          .on("pointerup", () => this.wiring.buy(row.ware)),
      );
    });

    if (shown.line) {
      const line = keep(fixed(scene.add.text(layout.line.x, layout.line.y, shown.line, text(12, palette.waresRefused))));
      line.setOrigin(0.5);
      words.push(line);
    }
    words.push(this.purseLine(layout.purse, fixed, keep));

    const close = frame.close;
    keep(
      fixed(scene.add.zone(close.x, close.y, close.width, close.height))
        .setOrigin(0, 0)
        .setInteractive()
        .on("pointerover", () => lightClose(frame.glyph, true))
        .on("pointerout", () => lightClose(frame.glyph, false))
        .on("pointerup", () => this.wiring.close()),
    );
    // the words rasterised at the render scale of now (FS-ZAJMH R5)
    crispen(words);
  }

  /**
   * The purse line in `r`, as the gear overlay's: the coin icon, the total beside it, and a hover over
   * the line that shows the split in a tip (FS-7TGZ3 R3, R5). Returns the total, to crispen.
   */
  private purseLine(
    r: { x: number; y: number; width: number; height: number },
    fixed: <T extends Phaser.GameObjects.GameObject & { setDepth(d: number): T; setScrollFactor(f: number): T }>(o: T) => T,
    keep: <T extends { destroy(): void }>(o: T) => T,
  ): Phaser.GameObjects.Text {
    const scene = this.scene;
    const coin = keep(fixed(artSprite(scene, this.art(), r.x + r.height / 2, r.y + r.height / 2, iconSheet("coins"))));
    coin.setOrigin(0.5).setScale(r.height / (Math.max(coin.width, coin.height) || 1));
    const amount = keep(fixed(scene.add.text(r.x + r.height + PURSE_ICON_GAP, r.y + r.height / 2, this.purse.amount, text(12, palette.hudText))));
    amount.setOrigin(0, 0.5);
    this.purseAmount = amount;
    this.purseAt = { x: r.x, y: r.y };
    keep(
      fixed(scene.add.zone(r.x, r.y, r.width, r.height))
        .setOrigin(0, 0)
        .setInteractive()
        .on("pointerover", () => {
          this.overPurse = true;
          this.showPurseTip();
        })
        .on("pointerout", () => {
          this.overPurse = false;
          this.hidePurseTip();
        }),
    );
    return amount;
  }

  /** The split over the purse line; none while the purse is not read (the dash has no tip). */
  private showPurseTip(): void {
    this.hidePurseTip();
    const at = this.purseAt;
    if (!at || this.purse.tip === undefined) return;
    const tip = buildPurseTip(this.scene, this.purse.tip);
    tip.container.setPosition(at.x, at.y - tip.height - PURSE_TIP_GAP).setDepth(PURSE_TIP_DEPTH).setScrollFactor(0);
    this.purseTip = tip;
  }

  private hidePurseTip(): void {
    this.purseTip?.container.destroy();
    this.purseTip = undefined;
  }

  private takeDown(): void {
    this.hidePurseTip();
    this.overPurse = false;
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.purseAmount = undefined;
    this.purseAt = undefined;
  }
}
