/**
 * The arrival card (FS-PQ2TW §B, §E; ADR-0075 Decision 3): the view goes dark, the place's name
 * rises over a rule and one line, the view comes back up, and the card leaves. One piece plays it
 * for every scene and belongs to none: a scene hands it the card's words and tells it one thing,
 * that its place is built; a scene whose words come later (a run's floor) first puts up the dark
 * alone. The dark, the card, its timing, its leaving and its teardown are here.
 * It leaves as ash, a burn crossing its letters (§Change: Ash), the game's leave by one switch;
 * the dust off its letters (§D) and the smoke (§Change: Smoke) stay as alternates a play may name.
 * Where the leave plays nothing, it fades.
 *
 * Presentation only (R14, Decision 6): state keeps applying under it, it sits below the HUD so
 * the HUD and notices stay readable through it, it takes no input, and nothing waits on it.
 */

import type Phaser from "phaser";
import { CardDust, type CardInk, type DustArt } from "@/render/effects/cardDust";
import { CardSmoke, type CardSmokeScene } from "@/render/effects/cardSmoke";
import { CardAsh, type CardAshScene } from "@/render/effects/cardAsh";
import { crispen, viewport } from "@/render/viewport";
import { onSceneEnd, type EndingScene } from "@/scenes/sceneEnd";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { CardWords } from "./placeCard";

/**
 * The card's depth and its five timings, in ms (R10, R15). The dark sits at `depth`, over the
 * world, its atmosphere (~900) and its markers (950, 951), and under the HUD (1000) and notices
 * (2000), the same in every world scene; the card one above it. Over the markers, not level with
 * them: Phaser draws equal depths in the order they were made, and a name plate made after the
 * dark would stand on it.
 */
export const ARRIVAL_CARD = {
  depth: 960,
  /** How long the view stays dark before the card rises. */
  darkHoldMs: 250,
  /** The card's fade in. */
  cardFadeMs: 300,
  /** The dark lifting off the place. */
  viewReturnMs: 900,
  /** How long the card holds, fully shown, once the view starts back (the owner's 3 s, 2026-11-12). */
  cardHoldMs: 3000,
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
 * The ways the card can leave: as ash (§Change: Ash, the game's), or as dust (§D) or smoke
 * (§Change: Smoke), the alternates. Every value of the switch, in one list.
 */
export const CARD_LEAVES = ["dust", "smoke", "ash"] as const;

export type CardLeave = (typeof CARD_LEAVES)[number];

/**
 * The card's one switch (§Change: Smoke R41, §Change: Ash R53): how it leaves in the game. Ash,
 * the owner's second pick of 2026-11-12 ("幫我把遊戲中的效果換成灰燼"), superseding that day's smoke
 * pick; the dust and the smoke stay as alternates a play may name.
 */
export const CARD_LEAVE: CardLeave = "ash";

/** What a leave is handed: the card's ink, and its three pieces, heading, rule and line. */
export interface CardLeaveInk extends CardInk {
  letters: readonly CardPart[];
}

/**
 * How the card leaves (FS-PQ2TW §D; §Change: Smoke; §Change: Ash). `CardAsh`, `CardDust` and
 * `CardSmoke` are three. `play`
 * says false when it plays nothing (reduced motion, no fx sheet, strokes that cannot be read), and
 * the card fades instead.
 */
export interface CardLeavePlayer {
  play(ink: CardLeaveInk, depth: number, gone: () => void): boolean;
  /** It goes at once. */
  stop(): void;
  /** The scene ended and took it with it. */
  forget(): void;
  /**
   * Whether it takes the card's letters away itself (the ash burns them, the smoke blurs and
   * drifts them off); otherwise the card hides them as it plays (the dust).
   */
  readonly takesLetters?: boolean;
}

/** Every leave the card can take, one player each. */
export type CardLeaves = Record<CardLeave, CardLeavePlayer>;

/** A world scene's leaves for its card: the ash, and the dust and the smoke on its art. */
export function cardLeaves(scene: CardSmokeScene & CardAshScene, art: () => DustArt | undefined): CardLeaves {
  return { dust: new CardDust(scene, art), smoke: new CardSmoke(scene, art), ash: new CardAsh(scene) };
}

/** What of the view the card covers and centres on. The logical view (`viewport`) is one. */
export interface CardView {
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

/**
 * The card's place and type (R10; the owner's tune of 2026-11-12). The card's centre stands
 * `rise` of the view's height above the view's middle: at 0.3, 20% of the height from the top.
 * The heading and the line are body serif at these px.
 */
export const CARD_LAYOUT = {
  rise: 0.3,
  headingPx: 34,
  linePx: 19,
} as const;

type CardPart = Phaser.GameObjects.Text | Phaser.GameObjects.Graphics;

/**
 * The rule's half length and the heading's, rule's and line's offsets from the card's centre,
 * their spacing scaled with the type.
 */
const RULE_HALF = 90;
const HEADING_DY = -18;
const RULE_DY = 10;
const LINE_DY = 33;

export class ArrivalCard {
  /** The dark first, then the heading, the rule and the line; empty when no card is up. */
  private parts: Phaser.GameObjects.GameObject[] = [];
  /** Lifts the dark once the place is built (R12); none when it has lifted or no card is up. */
  private lift?: () => void;
  private cancelSceneEnd?: () => void;
  /** The card's leave, from the end of its hold; none before the lift or once it has started. */
  private leaving?: { remove(dispatchCallback?: boolean): void };
  /** The leave in the air, the card's letters gone to it; none before it or after. */
  private inAir?: CardLeavePlayer;
  /** When the dark went up alone, waiting for its words (R13); none once a card is drawn on it. */
  private darkSince?: number;

  /**
   * @param leaves every way the card can leave; `CARD_LEAVE` picks the one played
   * @param view what the card covers and centres on: the logical view, unless a host draws it
   *   on a canvas of its own (the dev gallery)
   */
  constructor(
    private readonly scene: ArrivalCardScene,
    private readonly leaves: CardLeaves,
    private readonly view: CardView = viewport,
  ) {}

  /** Whether a card is up: from its play until it has left. */
  get up(): boolean {
    return this.parts.length > 0;
  }

  /**
   * The dark alone, before the place's words are known (R11, R13): a run is dark from `create`,
   * and its floor, and so its card, comes with the first broadcast. It holds, whatever is built,
   * until `play` draws the card on it; that card's dark hold is counted from now.
   */
  dark(): void {
    this.remove();
    this.parts = [this.veil()];
    this.cancelSceneEnd = onSceneEnd(this.scene, () => this.forget());
    this.darkSince = this.scene.time.now;
  }

  /**
   * Plays the card with `words`, in place of any card still up (R9), or on the dark that waited
   * for it. The view comes back up only over a built place: with `built` false the dark holds
   * until `built()` is called, then lifts as it would have, less the time already waited (R12,
   * FS-KE075 §H.41). It leaves by the card's switch; only the gallery names a `leave` of its own.
   */
  play(words: CardWords, place: { built: boolean }, leave: CardLeave = CARD_LEAVE): void {
    const shownAt = this.scene.time.now;
    // a dark already up alone counts toward the dark hold (R13); over a card it replaces, the
    // dark starts now
    const darkened = shownAt - (this.darkSince ?? shownAt) || 0;
    const rise = Math.max(0, ARRIVAL_CARD.darkHoldMs - darkened);
    this.remove();
    const { scene } = this;
    const { x, y } = this.centre();

    const veil = this.veil();

    const heading = scene.add.text(x, y + HEADING_DY, words.title, {
      fontFamily: CANVAS_FONT.body,
      fontSize: `${CARD_LAYOUT.headingPx}px`,
      color: toCss(palette.hudText),
      letterSpacing: 4,
    });
    const rule = scene.add.graphics();
    rule.lineStyle(1, palette.frame, 0.6);
    rule.lineBetween(-RULE_HALF, 0, RULE_HALF, 0);
    rule.setPosition(x, y + RULE_DY);
    const subtitle = scene.add.text(x, y + LINE_DY, words.line, {
      fontFamily: CANVAS_FONT.body,
      fontSize: `${CARD_LAYOUT.linePx}px`,
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
      delay: rise,
    });
    this.lift = () => {
      this.lift = undefined;
      // the view comes back once the card is in
      const waited = scene.time.now - shownAt || 0;
      const hold = Math.max(0, rise + ARRIVAL_CARD.cardFadeMs - waited);
      scene.tweens.add({
        targets: veil,
        alpha: 0,
        duration: ARRIVAL_CARD.viewReturnMs,
        delay: hold,
      });
      // a card replaced while it was leaving ends late: it is gone already, and the one up stays
      this.leave(this.leaves[leave], [heading, rule, subtitle], hold + ARRIVAL_CARD.cardHoldMs, () => {
        if (this.parts === parts) this.remove();
      });
    };
    if (place.built) this.lift();
  }

  /** The card's centre in the view now: across its middle, `rise` of its height above it (R10). */
  private centre(): { x: number; y: number } {
    const { view } = this;
    return { x: view.centerX, y: view.centerY - CARD_LAYOUT.rise * view.height };
  }

  /** The dark over the whole view, over the world and under the card and the HUD (R15). */
  private veil(): Phaser.GameObjects.Rectangle {
    const { view } = this;
    const veil = this.scene.add.rectangle(0, 0, view.width, view.height, palette.inkDeep, 1);
    return veil.setOrigin(0, 0).setScrollFactor(0).setDepth(ARRIVAL_CARD.depth);
  }

  /**
   * The scene's place is built: a dark that was holding for it lifts. Nothing otherwise: a dark
   * still waiting for its words holds for them.
   */
  built(): void {
    this.lift?.();
  }

  /**
   * The view changed: the dark covers it again and the card stands at its place in the new view
   * (R10, R16). A leave still in the air (ash, dust or smoke) is taken away, and the card with it:
   * its leaving is over.
   */
  relayout(): void {
    if (this.inAir) return this.remove();
    const [veil, ...card] = this.parts;
    if (!veil?.active) return;
    (veil as Phaser.GameObjects.Rectangle).setSize(this.view.width, this.view.height);
    const { x, y } = this.centre();
    const offsets = [HEADING_DY, RULE_DY, LINE_DY];
    card.forEach((part, i) => (part as CardPart).setPosition(x, y + offsets[i]));
    crispen(card);
  }

  /**
   * How the card leaves by `player`, `delay` ms from now, calling `gone` once it has: a leave that
   * takes the letters itself does (the ash burns them, §Change: Ash R55; the smoke blurs and drifts
   * them, §Change: Smoke R43); otherwise its letters and its rule go to dust together, the text
   * gone as the dust appears (R24); where the leave plays nothing, a fade as before (R31, R35, R50,
   * R60). The one step of the card that is its leaving, and nothing else of the card
   * knows how it is done.
   */
  private leave(
    player: CardLeavePlayer,
    card: [heading: Phaser.GameObjects.Text, rule: Phaser.GameObjects.Graphics, subtitle: Phaser.GameObjects.Text],
    delay: number,
    gone: () => void,
  ): void {
    const [heading, , subtitle] = card;
    this.leaving = this.scene.time.delayedCall(delay, () => {
      this.leaving = undefined;
      // the rule as it is drawn: about the card's centre now, at its height
      const { x, y } = this.centre();
      const ink = {
        texts: [heading, subtitle],
        rule: { x1: x - RULE_HALF, x2: x + RULE_HALF, y: y + RULE_DY },
        letters: card,
      };
      if (player.play(ink, ARRIVAL_CARD.depth + 1, gone)) {
        this.inAir = player;
        if (!player.takesLetters) card.forEach((part) => part.setVisible(false));
        return;
      }
      this.scene.tweens.add({ targets: card, alpha: 0, duration: ARRIVAL_CARD.cardLeaveMs, onComplete: gone });
    });
  }

  /** Takes the card down: its objects destroyed, its leave called off, its ash, dust or smoke gone. */
  private remove(): void {
    this.leaving?.remove(false);
    this.inAir?.stop();
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
    this.inAir?.forget();
    this.parts = [];
    this.lift = undefined;
    this.leaving = undefined;
    this.inAir = undefined;
    this.darkSince = undefined;
  }
}
