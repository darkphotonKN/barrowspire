/**
 * The town's mailbox on the UI scene (FS-TQZ5J § Change: Batch 4: the mailbox, R101–R110): the envelope
 * and the letter panel (`MailboxHud`), built as the town is reported and taken down as it leaves, as the
 * town's create mounted it and its release destroyed it. Building it is entering the town (the summary
 * fetched), taking it down leaving it (the panel closed, `mail_arrived` dropped). Only the town has one.
 *
 * It reads the mailbox store and makes its REST calls itself, as before (app state: ADR-0082 D3, R102).
 * Its open state stays the store's `panelOpen`, which the town reports as `windows().letter` and closes
 * on `close: letter` (R103), so every path that reads or closes it through the bridge is unchanged. What
 * it reads of the UI scene is its wiring (R104): the envelope refused by the town's dialogue and the menu
 * slot, its opening closing the UI scene's gear overlay and party panel, the gear's last level for the
 * tips, the UI scene's act and player for its own inputs.
 *
 * Phaser-free: the UI scene hands it the builder (`mountMailbox` on itself), so the wiring is tested on
 * its own.
 */

import type { MailboxWiring } from "./mailboxHud";
import type { UiBridge, World, WorldReport } from "./uiBridge";

export type { MailboxWiring };

/** The mailbox as the UI scene keeps it. `MailboxHud` is one. */
export interface MailboxPiece {
  /** The logical view changed: the envelope to its corner, an open panel to the centre. */
  relayout(): void;
  /** Leaving the town: the panel closes, and `mail_arrived` fetches nothing until the next entry. */
  destroy(): void;
}

/** The UI scene's own windows the envelope's opening closes, and the level the gear was last handed. */
export interface MailboxNeighbours {
  gear: { close(): unknown };
  party: { close(): unknown };
  level(): number | undefined;
}

/** What of the bridge the mailbox reads and plays through. */
export type MailboxBridge = Pick<UiBridge, "world" | "ui" | "act" | "play">;

/** The world the mailbox stands in: the town alone. */
const MAILBOX_WORLD: World = "hub";

/**
 * The mailbox's wiring (R104): refused as the town's `refusesLetter` was (its dialogue, the menu slot,
 * or no world reported); its opening closes the gear overlay and the party panel, as the town's
 * `clearForLetter` did, inside the envelope's act, so `mailbox_open` plays alone (FS-WDM0X S3).
 */
export function mailboxWiring(bridge: MailboxBridge, neighbours: MailboxNeighbours): MailboxWiring {
  return {
    blocked: () => {
      const report = bridge.world;
      return !report || bridge.ui.menuOpen || report.blockers().dialogue;
    },
    opening: () => {
      neighbours.gear.close();
      neighbours.party.close();
    },
    level: () => neighbours.level(),
    wrapper: { act: (run) => bridge.act(run) },
    play: (effect) => bridge.play(effect),
  };
}

export class UiMailboxSlot {
  private piece: MailboxPiece | null = null;

  constructor(
    private readonly bridge: MailboxBridge,
    private readonly neighbours: MailboxNeighbours,
    private readonly build: (wiring: MailboxWiring) => MailboxPiece,
  ) {}

  /**
   * Heard each world report, and none as the world leaves (R101, R110): the mailbox built as the town is
   * reported, kept while it stands, taken down as it leaves or another world is reported.
   */
  show(report: WorldReport | null): void {
    const town = report?.world === MAILBOX_WORLD;
    if (town && this.piece) return;
    this.takeDown();
    if (town) this.piece = this.build(mailboxWiring(this.bridge, this.neighbours));
  }

  /** The logical view changed (FS-ZAJMH R13). */
  relayout(): void {
    this.piece?.relayout();
  }

  /** The game's end: the town is left with it. */
  destroy(): void {
    this.takeDown();
  }

  private takeDown(): void {
    this.piece?.destroy();
    this.piece = null;
  }
}
