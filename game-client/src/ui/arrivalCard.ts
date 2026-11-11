/**
 * The arrival card (FS-PQ2TW §B, §E; ADR-0073 Decision 3): the view goes dark, the place's name
 * rises over a rule and one line, the view comes back up, and the card leaves. One piece plays it
 * for every scene and belongs to none: a scene hands it the card's words and tells it one thing,
 * that its place is built. The dark, the card, its timing, its leaving and its teardown are here.
 *
 * Presentation only (R14, Decision 6): state keeps applying under it, it sits below the HUD so
 * the HUD and notices stay readable through it, it takes no input, and nothing waits on it.
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import { onSceneEnd, type EndingScene } from "@/scenes/sceneEnd";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { CardWords } from "./placeCard";

/**
 * The card's depth and its five timings, in ms (R10, R15). The dark sits at `depth`, over the
 * world and its atmosphere (~900) and under the HUD (1000) and notices (2000), the same in every
 * world scene; the card one above it.
 */
export const ARRIVAL_CARD = {
  depth: 950,
  /** How long the view stays dark before the card rises. */
  darkHoldMs: 250,
  /** The card's fade in. */
  cardFadeMs: 300,
  /** The dark lifting off the place. */
  viewReturnMs: 900,
  /** How long the card holds once the view starts back. */
  cardHoldMs: 1400,
  /** The card's leaving. */
  cardLeaveMs: 600,
} as const;

/** What of a scene the card is drawn and timed with. A `Phaser.Scene` is one. */
export interface ArrivalCardScene extends EndingScene {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "rectangle" | "text" | "graphics">;
  tweens: Pick<Phaser.Tweens.TweenManager, "add">;
  time: Pick<Phaser.Time.Clock, "now">;
}

type CardPart = Phaser.GameObjects.Text | Phaser.GameObjects.Graphics;

export class ArrivalCard {
  /** The dark first, then the heading, the rule and the line; empty when no card is up. */
  private parts: Phaser.GameObjects.GameObject[] = [];
  /** Lifts the dark once the place is built (R12); none when it has lifted or no card is up. */
  private lift?: () => void;
  private cancelSceneEnd?: () => void;

  constructor(private readonly scene: ArrivalCardScene) {}

  /** Whether a card is up: from its play until it has left. */
  get up(): boolean {
    return this.parts.length > 0;
  }

  /**
   * Plays the card with `words`, in place of any card still up (R9). The view comes back up only
   * over a built place: with `built` false the dark holds until `built()` is called, then lifts
   * as it would have, less the time already waited (R12, FS-KE075 §H.41).
   */
  play(words: CardWords, place: { built: boolean }): void {
    this.remove();
    const { scene } = this;
    const { centerX, centerY } = viewport;

    const veil = scene.add.rectangle(0, 0, viewport.width, viewport.height, palette.inkDeep, 1);
    veil.setOrigin(0, 0).setScrollFactor(0).setDepth(ARRIVAL_CARD.depth);

    const heading = scene.add.text(centerX, centerY - 14, words.title, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "26px",
      color: toCss(palette.hudText),
      letterSpacing: 4,
    });
    const rule = scene.add.graphics();
    rule.lineStyle(1, palette.frame, 0.6);
    rule.lineBetween(-90, centerY + 8, 90, centerY + 8);
    rule.setX(centerX);
    const subtitle = scene.add.text(centerX, centerY + 26, words.line, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "15px",
      fontStyle: "italic",
      color: toCss(palette.hudLabel),
    });
    const card: CardPart[] = [heading, rule, subtitle];
    heading.setOrigin(0.5);
    subtitle.setOrigin(0.5);
    card.forEach((part) => part.setScrollFactor(0).setDepth(ARRIVAL_CARD.depth + 1).setAlpha(0));
    const parts = [veil, ...card];
    this.parts = parts;
    this.cancelSceneEnd = onSceneEnd(scene, () => this.forget());

    scene.tweens.add({
      targets: card,
      alpha: 1,
      duration: ARRIVAL_CARD.cardFadeMs,
      delay: ARRIVAL_CARD.darkHoldMs,
    });
    const shownAt = scene.time.now;
    this.lift = () => {
      this.lift = undefined;
      const waited = scene.time.now - shownAt || 0;
      const hold = Math.max(0, ARRIVAL_CARD.darkHoldMs + ARRIVAL_CARD.cardFadeMs - waited);
      scene.tweens.add({
        targets: veil,
        alpha: 0,
        duration: ARRIVAL_CARD.viewReturnMs,
        delay: hold,
      });
      // a card replaced while it was leaving ends late: it is gone already, and the one up stays
      this.leave(card, hold + ARRIVAL_CARD.cardHoldMs, () => {
        if (this.parts === parts) this.remove();
      });
    };
    if (place.built) this.lift();
  }

  /** The scene's place is built: a dark that was holding for it lifts. Nothing otherwise. */
  built(): void {
    this.lift?.();
  }

  /** The view changed: the dark covers it again and the card is about its centre (R16). */
  relayout(): void {
    const [veil, ...card] = this.parts;
    if (!veil?.active) return;
    (veil as Phaser.GameObjects.Rectangle).setSize(viewport.width, viewport.height);
    for (const part of card) (part as CardPart).setX(viewport.centerX);
    crispen(card);
  }

  /**
   * How the card leaves, `delay` ms from now, calling `gone` once it has: a fade. The one step of
   * the card that is its leaving, and nothing else of the card knows how it is done.
   */
  private leave(card: CardPart[], delay: number, gone: () => void): void {
    this.scene.tweens.add({
      targets: card,
      alpha: 0,
      duration: ARRIVAL_CARD.cardLeaveMs,
      delay,
      onComplete: gone,
    });
  }

  /** Takes the card down: its objects destroyed, nothing of it held. */
  private remove(): void {
    this.parts.forEach((part) => part.destroy());
    this.forget();
  }

  /**
   * Lets go of the card without touching it: at a scene's end its objects have gone with the
   * scene, and a destroyed game's plugins are asked nothing (`sceneEnd.ts`).
   */
  private forget(): void {
    this.cancelSceneEnd?.();
    this.cancelSceneEnd = undefined;
    this.parts = [];
    this.lift = undefined;
  }
}
