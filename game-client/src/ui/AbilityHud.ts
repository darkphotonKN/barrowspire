/**
 * The class ability card at the bottom right of a run (FS-8AY7S req 29–32). The scene hands it
 * every state's card (`abilityCard` in `./abilityCard`); null takes the card down, so it is up
 * only while the delver is in the delve and the leave button is not holding the corner.
 *
 * Neutral HUD, as `ResourceHud`: the HUD panel in a brass frame, the ability's name in vellum and
 * its line in the label tone, both in the body serif (the blackletter bound). The right-mouse
 * glyph is drawn: a mouse outline with its right button filled. Greyed, the whole card falls to
 * the faint vellum; no cooldown sweep is drawn (req 31).
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { AbilityCardView } from "./abilityCard";

const CARD_W = 280;
const HUD_DEPTH = 1000;
const PAD = 10;
const GLYPH_W = 16;
const GLYPH_H = 24;
/** The mouse's top half, where its buttons are. */
const GLYPH_BUTTON_H = 10;
const GLYPH_RADIUS = 7;
const GLYPH_GAP = 12;
const NAME_H = 20;
/** The line wraps to at most two rows of this height. */
const LINE_ROW_H = 16;
const LINE_ROWS = 2;
const CARD_H = PAD * 2 + NAME_H + LINE_ROW_H * LINE_ROWS;
const TEXT_W = CARD_W - PAD * 2 - GLYPH_W - GLYPH_GAP;

export class AbilityHud {
  private panel?: Phaser.GameObjects.Graphics;
  private name?: Phaser.GameObjects.Text;
  private line?: Phaser.GameObjects.Text;
  /** What the card last drew, so the states that change nothing redraw nothing. */
  private shown: AbilityCardView | null = null;

  /** `right` and `bottom` are the screen x and y of the card's bottom-right corner. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly right: number,
    private readonly bottom: number,
  ) {}

  show(view: AbilityCardView | null): void {
    if (JSON.stringify(view) === JSON.stringify(this.shown)) return;
    this.shown = view;
    if (!view) {
      this.takeDown();
      return;
    }

    const left = this.right - CARD_W;
    const top = this.bottom - CARD_H;
    const g = (this.panel ??= this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH));
    g.clear();
    g.fillStyle(palette.hudPanel, 0.85);
    g.fillRect(left, top, CARD_W, CARD_H);
    g.lineStyle(1, palette.frame, 0.35);
    g.strokeRect(left, top, CARD_W, CARD_H);
    drawRightMouse(g, left + PAD, top + PAD + 2, view.greyed);

    const textX = left + PAD + GLYPH_W + GLYPH_GAP;
    const name = (this.name ??= this.text(textX, top + PAD - 2, 16));
    const line = (this.line ??= this.text(textX, top + PAD + NAME_H, 13));
    name
      .setText(view.name)
      .setColor(toCss(view.greyed ? palette.hudFaint : palette.hudText));
    line
      .setText(view.line)
      .setColor(toCss(view.greyed ? palette.hudFaint : palette.hudLabel));
  }

  private text(x: number, y: number, size: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${size}px`,
        color: toCss(palette.hudText),
        wordWrap: { width: TEXT_W, useAdvancedWrap: true },
        maxLines: LINE_ROWS,
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  private takeDown(): void {
    this.panel?.destroy();
    this.name?.destroy();
    this.line?.destroy();
    this.panel = this.name = this.line = undefined;
  }
}

type GlyphGraphics = Pick<
  Phaser.GameObjects.Graphics,
  "fillStyle" | "fillRoundedRect" | "lineStyle" | "strokeRoundedRect" | "lineBetween"
>;

/** The right-mouse glyph: a mouse outline split into two buttons, the right one filled. */
function drawRightMouse(
  g: GlyphGraphics,
  x: number,
  y: number,
  greyed: boolean,
): void {
  const ink = greyed ? palette.hudFaint : palette.hudText;
  const mid = x + GLYPH_W / 2;
  g.fillStyle(ink, 1);
  g.fillRoundedRect(mid, y, GLYPH_W / 2, GLYPH_BUTTON_H, {
    tl: 0,
    tr: GLYPH_RADIUS,
    bl: 0,
    br: 0,
  });
  g.lineStyle(1, greyed ? palette.hudFaint : palette.hudLabel, 1);
  g.strokeRoundedRect(x, y, GLYPH_W, GLYPH_H, GLYPH_RADIUS);
  g.lineBetween(mid, y, mid, y + GLYPH_BUTTON_H);
  g.lineBetween(x, y + GLYPH_BUTTON_H, x + GLYPH_W, y + GLYPH_BUTTON_H);
}
