/**
 * The run's wares panel on the UI scene (FS-9JV5K §F R22, R23; ADR-0084–0086): drawn from the data the
 * run hands ({@link ShownWares}), built on its first show and taken down on its close. The run owns
 * what it means: whose panel is open, the purchase in flight and every line. Its Buy and its close
 * (its ×, Esc) are requests back; the run answers a close by taking it down, and closing it changes
 * nothing on the server.
 *
 * The purse line is the FS-7TGZ3 read on a shelf of its own (a `PurseReader` over the panel), read as
 * the panel opens and again after every purchase answer, and let go with the panel.
 *
 * Phaser-free: the UI scene hands it the builder (`WaresPanel`) and the reader, so the wiring is
 * tested on its own.
 */

import type { PurseRefresh } from "./EquipmentHud";
import type { PurseShelf } from "./purse";
import type { UiBridge, WorldReport } from "./uiBridge";
import type { ShownWares, WaresMessage } from "./wares";

/** The panel as the UI scene keeps it, the purse line's shelf. `WaresPanel` is one. */
export interface WaresPiece extends PurseShelf {
  /** Drawn with the run's data now. */
  set(shown: ShownWares): void;
  /** The logical view changed: back to the centre. */
  relayout(): void;
  destroy(): void;
}

/** What the panel's own inputs do: a ware's Buy, its ×. */
export interface WaresWiring {
  buy(ware: string): void;
  close(): void;
}

/** What of the bridge the slot asks and plays through. */
export type WaresBridge = Pick<UiBridge, "request" | "act" | "play">;

export class UiWaresSlot {
  private piece: WaresPiece | null = null;
  private purse: PurseRefresh | null = null;
  /** Whether the run is the world reported: a show from no run draws nothing. */
  private inRun = false;

  constructor(
    private readonly bridge: WaresBridge,
    private readonly build: (wiring: WaresWiring) => WaresPiece,
    /** The purse line's reader over the panel's shelf (`new PurseReader(apiClient, shelf)`). */
    private readonly reader: (shelf: PurseShelf) => PurseRefresh,
  ) {}

  /** Heard each world report, and none as the world leaves: it stands in the run alone, and goes with it. */
  world(report: WorldReport | null): void {
    this.inRun = report?.world === "run";
    if (!this.inRun) this.takeDown();
  }

  /** The run's data (R22, R23): shown, a purchase answered, or the panel down. */
  hear(message: WaresMessage): void {
    if (message.kind === "close") return this.takeDown();
    if (message.kind === "answered") return void this.purse?.refresh();
    if (!this.inRun) return;
    if (!this.piece) {
      const piece = this.build({
        buy: (ware) => this.played("menu_click", () => this.bridge.request({ kind: "buy", ware })),
        close: () => this.close(),
      });
      this.piece = piece;
      this.purse = this.reader(piece);
      void this.purse.refresh();
    }
    this.piece.set(message.wares);
  }

  isOpen(): boolean {
    return this.piece !== null;
  }

  /** The player's close (its ×, Esc's step): the run is asked to close it, and takes it down. */
  close(): void {
    if (!this.piece) return;
    this.played("dialog_cancel", () => this.bridge.request({ kind: "close", window: "wares" }));
  }

  relayout(): void {
    this.piece?.relayout();
  }

  destroy(): void {
    this.takeDown();
  }

  private played(effect: "menu_click" | "dialog_cancel", run: () => void): void {
    this.bridge.act(() => {
      this.bridge.play(effect);
      run();
    });
  }

  private takeDown(): void {
    this.purse?.forget();
    this.purse = null;
    this.piece?.destroy();
    this.piece = null;
  }
}
