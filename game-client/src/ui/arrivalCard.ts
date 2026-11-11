/**
 * The arrival card (FS-PQ2TW §B, §E; ADR-0073 Decision 3): the view goes dark, the place's name
 * rises over a rule and one line, the view comes back up, and the card leaves. One piece plays it
 * for every scene and belongs to none: a scene hands it the card's words and tells it one thing,
 * that its place is built. The dark, the card, its timing, its leaving and its teardown are here.
 * It leaves as dust off its letters (§D), or, where the dust plays nothing, fades.
 *
 * Presentation only (R14, Decision 6): state keeps applying under it, it sits below the HUD so
 * the HUD and notices stay readable through it, it takes no input, and nothing waits on it.
 */

import type Phaser from "phaser";
import type { CardInk } from "@/render/effects/cardDust";
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
  time: Pick<Phaser.Time.Clock, "now" | "delayedCall">;
}

/**
 * How the card breaks to dust (FS-PQ2TW §D). `CardDust` is one. `play` says false when it plays
 * nothing (reduced motion, no fx sheet, strokes that cannot be read), and the card fades instead.
 */
export interface CardDustPlayer {
  play(ink: CardInk, depth: number, gone: () => void): boolean;
  /** The dust goes at once. */
  stop(): void;
  /** The scene ended and took the dust with it. */
  forget(): void;
}

/** What of the view the card covers and centres on. The logical view (`viewport`) is one. */
export interface CardView {
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

type CardPart = Phaser.GameObjects.Text | Phaser.GameObjects.Graphics;

/** The rule's half length and the heading's, rule's and line's offsets from the view's middle. */
const RULE_HALF = 90;
const HEADING_DY = -14;
const RULE_DY = 8;
const LINE_DY = 26;

export class ArrivalCard {
  /** The dark first, then the heading, the rule and the line; empty when no card is up. */
  private parts: Phaser.GameObjects.GameObject[] = [];
  /** Lifts the dark once the place is built (R12); none when it has lifted or no card is up. */
  private lift?: () => void;
  private cancelSceneEnd?: () => void;
  /** The card's leave, from the end of its hold; none before the lift or once it has started. */
  private leaving?: { remove(dispatchCallback?: boolean): void };
  /** Whether the card is in the air as dust. */
  private dusting = false;

  /**
   * @param dust how the card breaks to dust as it leaves
   * @param view what the card covers and centres on: the logical view, unless a host draws it
   *   on a canvas of its own (the dev gallery)
   */
  constructor(
    private readonly scene: ArrivalCardScene,
    private readonly dust: CardDustPlayer,
    private readonly view: CardView = viewport,
  ) {}

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
    const { scene, view } = this;
    const { centerX, centerY } = view;

    const veil = scene.add.rectangle(0, 0, view.width, view.height, palette.inkDeep, 1);
    veil.setOrigin(0, 0).setScrollFactor(0).setDepth(ARRIVAL_CARD.depth);

    const heading = scene.add.text(centerX, centerY + HEADING_DY, words.title, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "26px",
      color: toCss(palette.hudText),
      letterSpacing: 4,
    });
    const rule = scene.add.graphics();
    rule.lineStyle(1, palette.frame, 0.6);
    rule.lineBetween(-RULE_HALF, centerY + RULE_DY, RULE_HALF, centerY + RULE_DY);
    rule.setX(centerX);
    const subtitle = scene.add.text(centerX, centerY + LINE_DY, words.line, {
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
      this.leave([heading, rule, subtitle], hold + ARRIVAL_CARD.cardHoldMs, () => {
        if (this.parts === parts) this.remove();
      });
    };
    if (place.built) this.lift();
  }

  /** The scene's place is built: a dark that was holding for it lifts. Nothing otherwise. */
  built(): void {
    this.lift?.();
  }

  /**
   * The view changed: the dark covers it again and the card is about its centre (R16). Dust in
   * the air is taken away, and the card with it: its leaving is over.
   */
  relayout(): void {
    if (this.dusting) return this.remove();
    const [veil, ...card] = this.parts;
    if (!veil?.active) return;
    (veil as Phaser.GameObjects.Rectangle).setSize(this.view.width, this.view.height);
    for (const part of card) (part as CardPart).setX(this.view.centerX);
    crispen(card);
  }

  /**
   * How the card leaves, `delay` ms from now, calling `gone` once it has: its letters and its
   * rule break to dust together, the text gone as the dust appears (R24); where the dust plays
   * nothing, a fade as before (R31, R35). The one step of the card that is its leaving, and
   * nothing else of the card knows how it is done.
   */
  private leave(
    card: [heading: Phaser.GameObjects.Text, rule: Phaser.GameObjects.Graphics, subtitle: Phaser.GameObjects.Text],
    delay: number,
    gone: () => void,
  ): void {
    const [heading, , subtitle] = card;
    this.leaving = this.scene.time.delayedCall(delay, () => {
      this.leaving = undefined;
      // the rule as it is drawn: about the card's centre now, at its height
      const x = this.view.centerX;
      const y = this.view.centerY + RULE_DY;
      const ink = { texts: [heading, subtitle], rule: { x1: x - RULE_HALF, x2: x + RULE_HALF, y } };
      if (this.dust.play(ink, ARRIVAL_CARD.depth + 1, gone)) {
        this.dusting = true;
        card.forEach((part) => part.setVisible(false));
        return;
      }
      this.scene.tweens.add({ targets: card, alpha: 0, duration: ARRIVAL_CARD.cardLeaveMs, onComplete: gone });
    });
  }

  /** Takes the card down: its objects destroyed, its leave called off, its dust gone. */
  private remove(): void {
    this.leaving?.remove(false);
    if (this.dusting) this.dust.stop();
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
    if (this.dusting) this.dust.forget();
    this.parts = [];
    this.lift = undefined;
    this.leaving = undefined;
    this.dusting = false;
  }
}
