/**
 * The chat window on the UI scene (FS-TQZ5J § Change: Batch 6: the end row and the chat, R125–R132): built as
 * each world is reported and taken down as it leaves, as each world's create built its own and its release
 * destroyed it, so a half-typed line goes with its world as before. Its lines, fold, filter and sent lines
 * are the chat store's, which outlive every switch; a sent line goes on the socket from the piece (ADR-0085).
 *
 * What it reads of the UI scene and the world is its wiring: who owns Enter and Esc (the menu slot, the
 * world's `blockers().chat`), whether the draft is kept (the world's letter panel), the player's typing
 * reported in the UI's state, the UI scene's one player for its sounds. The gear panels are no part of it
 * (FS-KBA4Q R18): with one open, the keys are the field's while it is focused and the overlay's otherwise. Its top edge is the invite
 * stack's floor where the world reports one (`invitesAboveChat`, R132): read by the party's wiring, not here.
 *
 * Phaser-free: the UI scene hands it the builder (`mountChat` on itself), so the wiring is tested on its own.
 */

import type { UiEffect } from "@/audio/uiSounds";
import type { ItemState } from "@/types/gameState";
import type { TipAvoid } from "./gearOverlayLayout";
import type { UiBridge, World, WorldReport } from "./uiBridge";

/** The chat window as the UI scene keeps it. `ChatWindow` is one. */
export interface ChatPiece {
  /** Whether a logical point lies on the window by its place, its open list included (R129). */
  holds(x: number, y: number): boolean;
  /**
   * Whether a press keeps the window's field focused (R131): its own (Phaser's top-most hit, `over[0]`,
   * one of its objects), on its panel or open list, with its field focused.
   */
  keepsField(x: number, y: number, over: readonly unknown[]): boolean;
  /**
   * An item linked from the gear overlay (FS-KBA4Q R3): its token written into the input at the caret,
   * the input opened if it was closed. Nothing where chat may not open (R7).
   */
  link(item: ItemState): void;
  /**
   * Where its text field stands while the row is shown, in logical units; null while hidden. A browser
   * element, above every canvas tip, so the gear overlay's tips keep clear of it (FS-KBA4Q).
   */
  fieldRow(): TipAvoid | null;
  /** The screen y of the panel's top edge as it now sits. */
  topEdge(): number;
  /** Re-reads who owns the keys now, between frames: the world changed its report (R128). */
  sync(): void;
  /** The world leaves: the input closes, its draft dropped, and the keyboards are handed back. */
  destroy(): void;
}

/** What the window is built with in every world (R126, R127, R134). `mountChat` takes it whole. */
export interface ChatWiring {
  /** Whether nothing else owns Enter and Esc now (FS-WJGFJ R27). */
  mayOpen: () => boolean;
  /** Whether what holds the keys now was opened by a press elsewhere, so the draft is kept (FS-1GZGD R40). */
  keepsDraft: () => boolean;
  /** The player began or stopped typing: told to the UI's state, which the world hears. */
  typing: (on: boolean) => void;
  /** The game's one player: the chat's sounds (FS-WDM0X § Pass 2: the chat). */
  play: (effect: UiEffect) => void;
}

/** What of the bridge the window reads, reports and plays through. */
export type ChatBridge = Pick<UiBridge, "world" | "ui" | "reportUi" | "play">;

/**
 * The window's wiring (R126, R127): the keys while a world is reported, the menu slot empty and the world
 * not turning the chat away (the town's dialogue card or letter panel, a run's open container or its end);
 * the draft kept while the world's letter panel holds the keys; typing reported as a part of the UI's state.
 * The inventory and the character panel, stash mode included, keep the chat neither shut nor hidden, so a
 * draft survives their opening and closing (FS-KBA4Q R18, R19, amending R126).
 */
export function chatWiring(bridge: ChatBridge): ChatWiring {
  return {
    mayOpen: () => {
      const report = bridge.world;
      if (!report) return false;
      return !bridge.ui.menuOpen && !report.blockers().chat;
    },
    keepsDraft: () => bridge.world?.windows().letter ?? false,
    typing: (on) => bridge.reportUi({ typing: on }),
    play: (effect) => bridge.play(effect),
  };
}

export class UiChatSlot {
  private piece: ChatPiece | null = null;
  /** The world the standing window was built for; none, no world reported. */
  private builtFor: World | null = null;

  constructor(
    private readonly bridge: ChatBridge,
    private readonly build: (wiring: ChatWiring) => ChatPiece,
  ) {}

  /**
   * Heard each world report, and none as the world leaves (R125, R128): a window built as a world is
   * reported, kept on a report of the same world (which re-reads who owns the keys at once), taken down as
   * it leaves or another world is reported.
   */
  show(report: WorldReport | null): void {
    const world = report?.world ?? null;
    if (world !== null && world === this.builtFor && this.piece) {
      this.piece.sync();
      return;
    }
    this.takeDown();
    this.builtFor = world;
    if (world !== null) this.piece = this.build(chatWiring(this.bridge));
  }

  /** Whether a logical point lies on the standing window (R129): a press there during a world's press is claimed. */
  holds(x: number, y: number): boolean {
    return this.piece?.holds(x, y) ?? false;
  }

  /** Whether a press keeps the window's field (A1 R26; R131). */
  keepsField(x: number, y: number, over: readonly unknown[]): boolean {
    return this.piece?.keepsField(x, y, over) ?? false;
  }

  /** An item linked from the gear overlay, to the standing window; none standing, nothing (FS-KBA4Q R3). */
  link(item: ItemState): void {
    this.piece?.link(item);
  }

  /** The standing window's shown text field; null while it is hidden or no window stands (FS-KBA4Q). */
  fieldRow(): TipAvoid | null {
    return this.piece?.fieldRow() ?? null;
  }

  /** The standing window's top edge, none with none standing: the invite stack's floor where the world reports one (R132). */
  topEdge(): number | undefined {
    return this.piece?.topEdge();
  }

  /** The game's end: the world is left with it. */
  destroy(): void {
    this.takeDown();
    this.builtFor = null;
  }

  private takeDown(): void {
    this.piece?.destroy();
    this.piece = null;
  }
}
