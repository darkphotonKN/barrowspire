/**
 * The cast bar (FS-X2CMM §H R43; CONTEXT "Cast bar"): how far along the player's own book cast is, drawn
 * under their feet in the run while `current_player.book.casting` is present, with the page's roundel at
 * cast-bar size on its left. It borrows the countdown's bar (`drawCountdownBar`), as the open bar does
 * (`openBar.ts`), so the canvas keeps one bar look: it fills from the left, carries no number, and follows
 * the player, so it stays in the world (ADR-0086 rule 2.1). Only the owner's is drawn: no other player's
 * state carries a book (R33).
 *
 * The server counts the cast; this only draws what a state said. Between states the fill runs on with
 * real time so it reads smooth, never past full, and the next state corrects it. It clears as `casting`
 * goes, whether the cast completed or broke.
 *
 * Phaser-free: the run hands it its stage (screen-fixed graphics, the roundel), and the feet each frame
 * in logical px once its camera is set up for the frame, so the bar and the roundel stand together.
 */

import { isPageId } from "@/data/classBooks";
import type { BookCastingState } from "@/types/gameState";
import { COUNTDOWN_BAR_H, drawCountdownBar } from "./countdownBar";
import { PAGE_ICONS, type PageId } from "./pageIcons";
import { PAGE_ROUNDEL_SIZE, drawPageLines, type PageState } from "./pageRoundel";
import type { AbilityIconPen } from "./abilityIcons";
import type { Rect } from "./partyPanelLayout";

/** The bar's size (the open bar's), and how far under the feet the whole stands and the roundel's gap to the bar. */
export const CAST_BAR = { width: 44, height: COUNTDOWN_BAR_H, below: 12, gap: 4 } as const;

/** The bar and its roundel under the feet at `feet` (logical px): together centred on them, the roundel left. */
export function castBarRects(feet: { x: number; y: number }): { bar: Rect; roundel: Rect } {
  const size = PAGE_ROUNDEL_SIZE.castBar;
  const whole = size + CAST_BAR.gap + CAST_BAR.width;
  const left = feet.x - whole / 2;
  const top = feet.y + CAST_BAR.below;
  const roundel = { x: left, y: top, width: size, height: size };
  const bar = {
    x: left + size + CAST_BAR.gap,
    y: top + size / 2 - CAST_BAR.height / 2,
    width: CAST_BAR.width,
    height: CAST_BAR.height,
  };
  return { bar, roundel };
}

/**
 * How full the bar is, 0 to 1: the share of the cast's `total` already run (`total - remaining`), run on by
 * the real time since that state arrived. Never past full, never below empty, and empty for a cast with no
 * total, so a bad state never shows a finished bar.
 */
export function castBarFraction(casting: BookCastingState, sinceStateMs = 0): number {
  if (!(casting.total > 0) || !Number.isFinite(casting.remaining)) return 0;
  const since = sinceStateMs > 0 ? sinceStateMs / 1000 : 0;
  return Math.min(1, Math.max(0, (casting.total - casting.remaining + since) / casting.total));
}

/** What the bar draws on: the countdown's slice of a graphics, the fallback's pen, and its own life. */
export type CastBarGraphics = Parameters<typeof drawCountdownBar>[0] &
  AbilityIconPen & {
    clear(): unknown;
    destroy(): void;
  };

/** A page's roundel as the bar shows it (`PageRoundel`): false where it cannot stand, and the bar draws its lines. */
export interface CastBarRoundel {
  show(rect: Rect, state: PageState): boolean;
  destroy(): void;
}

/** What the run builds the bar from. */
export interface CastBarStage {
  /** Screen-fixed graphics at the bar's depth. */
  graphics(): CastBarGraphics;
  /** The page's roundel at cast-bar size, over the bar's graphics. */
  roundel(page: PageId): CastBarRoundel;
}

/** The cast bar's roundel is a ready page's: the cast was taken. */
const SHOWN: PageState = "ready";

export class CastBar {
  private casting?: { state: BookCastingState; page: PageId; seenAt: number };
  private graphics?: CastBarGraphics;
  private roundel?: { page: PageId; piece: CastBarRoundel };

  constructor(private readonly stage: CastBarStage) {}

  /** Each state tick: the owner's `book.casting` (none, none runs), heard at `now` (ms). */
  hear(casting: BookCastingState | undefined, now: number): void {
    if (!casting || !isPageId(casting.page)) return this.clear();
    const page = casting.page;
    this.casting = { state: casting, page, seenAt: now };
    if (this.roundel?.page === page) return;
    this.roundel?.piece.destroy();
    this.roundel = { page, piece: this.stage.roundel(page) };
  }

  /** Each frame, with the feet in logical px: the fill run on from the last state. */
  frame(feet: { x: number; y: number }, now: number): void {
    const casting = this.casting;
    if (!casting || !this.roundel) return;
    const { bar, roundel } = castBarRects(feet);
    this.graphics ??= this.stage.graphics();
    const g = this.graphics;
    g.clear();
    drawCountdownBar(g, bar, castBarFraction(casting.state, now - casting.seenAt));
    if (!this.roundel.piece.show(roundel, SHOWN)) drawPageLines(g, PAGE_ICONS[casting.page], roundel, PAGE_ROUNDEL_SIZE.castBar, SHOWN);
  }

  /** The cast went (completed, broke, or the world left): nothing is left behind. */
  clear(): void {
    this.casting = undefined;
    this.roundel?.piece.destroy();
    this.roundel = undefined;
    this.graphics?.destroy();
    this.graphics = undefined;
  }

  /** The scene's objects are already gone (a teardown): drop the references, touch nothing. */
  forget(): void {
    this.casting = undefined;
    this.roundel = undefined;
    this.graphics = undefined;
  }
}
